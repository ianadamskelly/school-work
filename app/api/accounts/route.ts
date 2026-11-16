import { z } from 'zod';
import { identity } from '../../../lib/auth';
import { body,database,fail,json } from '../../../lib/server';
import { auditStatement,guardedAudit,canManageAccount,newInvitation,setupUrl } from '../../../lib/accounts';
export const dynamic='force-dynamic';
const short=z.string().trim().min(1).max(300),ref=z.string().max(200).default('');
const actions=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),email:z.string().trim().email().max(300).transform(s=>s.toLowerCase()),name:short,department:z.string().trim().max(300).default(''),role:z.enum(['employee','manager','admin']),managerId:ref}),
 z.object({action:z.literal('reset'),id:short,revision:short}),
 z.object({action:z.literal('status'),id:short,revision:short,state:z.enum(['active','disabled'])}),
 z.object({action:z.literal('edit'),id:short,revision:short,name:short,department:z.string().trim().max(300),role:z.enum(['employee','manager','admin']),managerId:ref}),
]);
async function actor(){const a=await identity();if(!a)return fail('Please log in.',401);if(a.state!=='active'||!['admin','manager'].includes(a.role))return fail('Only a system administrator or line manager can manage accounts.',403);return a;}
export async function GET(){const a=await actor();if(a instanceof Response)return a;const db=database();const where=a.role==='admin'?'':' WHERE p.manager_id=?';const rows=await db.prepare(`SELECT u.id,u.email,u.name,a.role,a.state,a.revision,p.department,p.manager_id,m.name AS manager_name FROM auth_user u JOIN journal_access a ON a.user_id=u.id LEFT JOIN journal_people p ON p.id=u.id LEFT JOIN auth_user m ON m.id=p.manager_id${where} ORDER BY a.created_at DESC,u.name`).bind(...(a.role==='admin'?[]:[a.id])).all();const managers=a.role==='admin'?await db.prepare("SELECT u.id,u.name,u.email FROM auth_user u JOIN journal_access a ON a.user_id=u.id WHERE a.role='manager' AND a.state!='disabled' ORDER BY u.name").all():{results:[]};const audit=a.role==='admin'?await db.prepare('SELECT e.id,e.action,e.detail,e.at,u.name AS actor_name,t.name AS target_name FROM journal_account_audit e LEFT JOIN auth_user u ON u.id=e.actor_id LEFT JOIN auth_user t ON t.id=e.target_id ORDER BY e.at DESC LIMIT 30').all():{results:[]};return json({me:a,users:rows.results,managers:managers.results,audit:audit.results});}
export async function POST(req:Request){const a=await actor();if(a instanceof Response)return a;let parsed;try{parsed=actions.safeParse(await body(req));}catch{return fail('Invalid request or origin.');}if(!parsed.success)return fail(parsed.error.issues.map(i=>i.message).join('; '));const d=parsed.data,db=database(),now=Date.now();
 if(d.action==='create'){
  if(a.role==='manager'&&(d.role!=='employee'||(d.managerId&&d.managerId!==a.id)))return fail('Line managers can create employee accounts for their own team only.',403);
  const existing=await db.prepare('SELECT id FROM auth_user WHERE email=?').bind(d.email).first();if(existing)return fail('This email already has an account. Ask the system administrator to check it.',409);
  if(d.role==='admin'&&d.managerId)return fail('A system administrator cannot have a line manager.');
  const managerId=a.role==='manager'?a.id:d.managerId;
  if(managerId){const m=await db.prepare("SELECT user_id FROM journal_access WHERE user_id=? AND role='manager' AND state!='disabled'").bind(managerId).first();if(!m)return fail('Choose an available line manager.');}
  const id=crypto.randomUUID(),invite=await newInvitation(id,a.id);const statements=[
   db.prepare('INSERT INTO auth_user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,0,?,?)').bind(id,d.name,d.email,now,now),
   db.prepare("INSERT INTO auth_account (id,account_id,provider_id,user_id,created_at,updated_at) VALUES (?,?,'credential',?,?,?)").bind(crypto.randomUUID(),id,id,now,now),
   db.prepare("INSERT INTO journal_access (user_id,role,state,created_by,created_at,revision) VALUES (?,?,'invited',?,?,?)").bind(id,d.role,a.id,now,crypto.randomUUID()),
  ];
  if(d.role!=='admin')statements.push(db.prepare('INSERT INTO journal_people (id,name,email,department,manager_id) VALUES (?,?,?,?,?)').bind(id,d.name,d.email,d.department,managerId||null));
  statements.push(invite.statement,auditStatement(a.id,'account-created',id,{role:d.role,managerId:managerId||null}));
  try{await db.batch(statements);}catch(e){if(String(e).includes('UNIQUE'))return fail('This email already has an account.',409);throw e;}
  return json({ok:true,setupUrl:setupUrl(invite.secret),expiresAt:invite.expires,email:d.email});
 }
 const target=await db.prepare('SELECT a.*,u.name,u.email,p.manager_id FROM journal_access a JOIN auth_user u ON u.id=a.user_id LEFT JOIN journal_people p ON p.id=a.user_id WHERE a.user_id=?').bind(d.id).first<any>();
 if(!target||!await canManageAccount(a,d.id))return fail('Account not found.',404);
 if(target.revision!==d.revision)return fail('This account changed. Refresh before continuing.',409);
 if(d.action==='edit'){
  if(a.role!=='admin')return fail('Only the administrator can change roles and reporting assignments.',403);
  if((target.role==='admin')!==(d.role==='admin'))return fail('Keep system administrator and staff accounts separate. Create a separate account for the other role.');
  if(d.role==='admin'&&(d.managerId||d.department))return fail('System administrators have no department or reporting assignment.');
  if(d.role==='employee'&&await db.prepare('SELECT id FROM journal_people WHERE manager_id=? LIMIT 1').bind(d.id).first())return fail('Reassign this manager’s team before changing them to an employee.');
  if(d.managerId){const m=await db.prepare("SELECT user_id FROM journal_access WHERE user_id=? AND role='manager' AND state!='disabled'").bind(d.managerId).first();if(!m)return fail('Choose an available line manager.');}
  const rev=crypto.randomUUID();
  const results=await db.batch([
   db.prepare(`UPDATE journal_access SET role=?,revision=? WHERE user_id=? AND revision=? AND NOT EXISTS(WITH RECURSIVE chain(id) AS (SELECT ? UNION SELECT p.manager_id FROM journal_people p JOIN chain c ON p.id=c.id WHERE p.manager_id IS NOT NULL) SELECT 1 FROM chain WHERE id=?) RETURNING user_id`).bind(d.role,rev,d.id,d.revision,d.managerId||null,d.id),
   db.prepare('UPDATE auth_user SET name=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM journal_access WHERE user_id=? AND revision=?)').bind(d.name,now,d.id,d.id,rev),
   db.prepare('UPDATE journal_people SET name=?,department=?,manager_id=? WHERE id=? AND EXISTS(SELECT 1 FROM journal_access WHERE user_id=? AND revision=?)').bind(d.name,d.department,d.managerId||null,d.id,d.id,rev),
   db.prepare('INSERT INTO journal_account_audit (id,actor_id,action,target_id,detail,at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM journal_access WHERE user_id=? AND revision=?)').bind(crypto.randomUUID(),a.id,'account-updated',d.id,JSON.stringify({role:d.role,managerId:d.managerId||null}),now,d.id,rev),
  ]);if(!results[0].results.length)return fail('This assignment would create a reporting loop, or the account changed.',409);return json({ok:true});
 }
 if(d.id===a.id)return fail('Use a separate administrator account to change your own account access.');
 if(target.role==='admin'&&target.state==='active'&&await db.prepare("SELECT count(*) AS n FROM journal_access WHERE role='admin' AND state='active'").first<{n:number}>().then(r=>(r?.n||0)<=1))return fail('Keep at least one active system administrator.');
 if(d.action==='reset'){
  if(target.state==='disabled')return fail('Enable this account before issuing a setup link.');
  const invite=await newInvitation(d.id,a.id),rev=crypto.randomUUID();
  const r=await db.batch([
   db.prepare("UPDATE journal_access SET state='invited',revision=? WHERE user_id=? AND revision=? AND (role!='admin' OR state!='active' OR (SELECT count(*) FROM journal_access WHERE role='admin' AND state='active')>1) RETURNING user_id").bind(rev,d.id,d.revision),
   db.prepare('UPDATE journal_invitations SET used_at=? WHERE user_id=? AND used_at IS NULL AND EXISTS(SELECT 1 FROM journal_access WHERE user_id=? AND revision=?)').bind(now,d.id,d.id,rev),
   db.prepare('DELETE FROM auth_session WHERE user_id=? AND EXISTS(SELECT 1 FROM journal_access WHERE user_id=? AND revision=?)').bind(d.id,d.id,rev),
   db.prepare('INSERT INTO journal_invitations (id,user_id,token_hash,expires_at,created_by) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM journal_access WHERE user_id=? AND revision=?)').bind(crypto.randomUUID(),d.id,invite.hash,invite.expires,a.id,d.id,rev),
   guardedAudit(a.id,'setup-link-issued',d.id,rev),
  ]);if(!r[0].results.length)return fail('This account changed. Refresh and try again.',409);return json({ok:true,setupUrl:setupUrl(invite.secret),email:target.email,expiresAt:invite.expires});
 }
 const credential=await db.prepare("SELECT password FROM auth_account WHERE user_id=? AND provider_id='credential'").bind(d.id).first<any>();
 const state=d.state==='disabled'?'disabled':credential?.password?'active':'invited';const rev=crypto.randomUUID();
 const r=await db.batch([
  db.prepare("UPDATE journal_access SET state=?,revision=? WHERE user_id=? AND revision=? AND (role!='admin' OR state!='active' OR ?!='disabled' OR (SELECT count(*) FROM journal_access WHERE role='admin' AND state='active')>1) RETURNING user_id").bind(state,rev,d.id,d.revision,state),
  db.prepare('DELETE FROM auth_session WHERE user_id=? AND EXISTS(SELECT 1 FROM journal_access WHERE user_id=? AND revision=?)').bind(d.id,d.id,rev),
  db.prepare('UPDATE journal_invitations SET used_at=? WHERE user_id=? AND used_at IS NULL AND EXISTS(SELECT 1 FROM journal_access WHERE user_id=? AND revision=?)').bind(now,d.id,d.id,rev),
  guardedAudit(a.id,'account-'+state,d.id,rev),
 ]);if(!r[0].results.length)return fail('This account changed. Refresh and try again.',409);return json({ok:true});
}
