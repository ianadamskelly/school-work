import { z } from 'zod';
import { hashPassword } from 'better-auth/crypto';
import { body,database,fail,json } from '../../../lib/server';
import { digest,limit,clientKey } from '../../../lib/security';
export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('inspect'),token:z.string().regex(/^[a-f0-9]{64}$/)}),
 z.object({action:z.literal('activate'),token:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().min(12).max(128)}),
]);
export async function POST(req:Request){if(!await limit('setup:'+clientKey(req),30,15*60*1000))return fail('Too many attempts. Try again later.',429);let p;try{p=schema.safeParse(await body(req));}catch{return fail('Invalid request.');}if(!p.success)return fail('Use a valid setup link and a password of at least 12 characters.');const d=p.data,db=database(),hash=await digest(d.token),now=Date.now();const row=await db.prepare("SELECT i.user_id,u.name,u.email,a.role FROM journal_invitations i JOIN auth_user u ON u.id=i.user_id JOIN journal_access a ON a.user_id=i.user_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>? AND a.state!='disabled'").bind(hash,now).first<any>();if(!row)return fail('This setup link is invalid, expired, or already used. Ask your line manager or administrator for a new one.',400);
 if(d.action==='inspect')return json({name:row.name,email:row.email,role:row.role});
 const password=await hashPassword(d.password),claim=crypto.randomUUID(),rev=crypto.randomUUID();
 const r=await db.batch([
  db.prepare("UPDATE journal_invitations SET used_at=?,claim=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM journal_access WHERE user_id=journal_invitations.user_id AND state!='disabled') RETURNING user_id").bind(now,claim,hash,now),
  db.prepare("UPDATE auth_account SET password=?,updated_at=? WHERE user_id=? AND provider_id='credential' AND EXISTS(SELECT 1 FROM journal_invitations WHERE token_hash=? AND claim=?)").bind(password,now,row.user_id,hash,claim),
  db.prepare('UPDATE auth_user SET email_verified=1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM journal_invitations WHERE token_hash=? AND claim=?)').bind(now,row.user_id,hash,claim),
  db.prepare("UPDATE journal_access SET state='active',revision=? WHERE user_id=? AND EXISTS(SELECT 1 FROM journal_invitations WHERE token_hash=? AND claim=?)").bind(rev,row.user_id,hash,claim),
  db.prepare('UPDATE journal_invitations SET used_at=? WHERE user_id=? AND token_hash!=? AND used_at IS NULL AND EXISTS(SELECT 1 FROM journal_invitations WHERE token_hash=? AND claim=?)').bind(now,row.user_id,hash,hash,claim),
  db.prepare('DELETE FROM auth_session WHERE user_id=? AND EXISTS(SELECT 1 FROM journal_invitations WHERE token_hash=? AND claim=?)').bind(row.user_id,hash,claim),
  db.prepare('INSERT INTO journal_account_audit (id,actor_id,action,target_id,detail,at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM journal_invitations WHERE token_hash=? AND claim=?)').bind(crypto.randomUUID(),row.user_id,'password-set',row.user_id,'{}',now,hash,claim),
 ]);if(!r[0].results.length)return fail('This setup link has already been used.',409);return json({ok:true});
}
