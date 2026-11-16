// Explicit local-only seed. Never uploads data, emails people, or resets passwords.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),manifest=JSON.parse(await fs.readFile('seed-data/coordinators-2026-27.json','utf8'));
const hosting=JSON.parse(await fs.readFile('.openai/hosting.json','utf8'));if(hosting.project_id!=='appgprj_6af95df885f081918df8f513447c3495')throw Error('Run this seed from the Work Journal checkout.');
const out='outputs/coordinator-seeding';await fs.mkdir(out,{recursive:true});
const q=v=>v==null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
const digest=s=>createHash('sha256').update(s).digest('hex');
const key=(owner,kind,slug)=>'coordinator-seed-'+digest(owner+'|'+kind+'|'+slug).slice(0,28);
const cli=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--json'];
function query(sql){const r=spawnSync(process.execPath,[...cli,'--command',sql],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);const j=JSON.parse(r.stdout);return j.flatMap(x=>x.results||[]);}
function execute(file){const r=spawnSync(process.execPath,[...cli,'--file',file],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);}
const principal=query(`SELECT p.id,p.name,p.email,a.role,a.state FROM journal_people p JOIN journal_access a ON a.user_id=p.id WHERE p.id=${q(manifest.managerId)}`)[0];
if(!principal||principal.role!=='manager'||principal.state==='disabled')throw Error('The confirmed existing principal account is unavailable. No accounts were changed.');
let privateState={};try{privateState=JSON.parse(await fs.readFile(out+'/private-state.json','utf8'));}catch{}
const sql=[],summary=[],now=Date.now(),seedActor='local-seed:coordinators-2026-27';
function record(owner,kind,slug,data){sql.push(`INSERT INTO journal_records (id,owner,kind,data,revision) VALUES (${[key(owner,kind,slug),owner,kind,JSON.stringify(data),randomUUID()].map(q).join(',')}) ON CONFLICT(id) DO NOTHING;`);}
for(const p of manifest.people){
 const existing=query(`SELECT u.id,u.name,u.email,a.role,a.state,p.manager_id FROM auth_user u JOIN journal_access a ON a.user_id=u.id LEFT JOIN journal_people p ON p.id=u.id WHERE u.email=${q(p.email)}`)[0];
 if(existing&&(existing.role!=='manager'||existing.state==='disabled'||existing.manager_id&&existing.manager_id!==principal.id))throw Error(`Account ${p.email} already has a different role, disabled state, or reporting assignment. Review it in Administration; this seed will not overwrite it.`);
 const id=existing?.id||privateState[p.email]?.id||randomUUID();
 if(!existing){
  sql.push(`INSERT INTO auth_user (id,name,email,email_verified,created_at,updated_at) VALUES (${[id,p.name,p.email,0,now,now].map(q).join(',')}) ON CONFLICT(id) DO NOTHING;`);
  sql.push(`INSERT INTO auth_account (id,account_id,provider_id,user_id,created_at,updated_at) VALUES (${[key(id,'credential','password'),id,'credential',id,now,now].map(q).join(',')}) ON CONFLICT(id) DO NOTHING;`);
  sql.push(`INSERT INTO journal_access (user_id,role,state,created_by,created_at,revision) VALUES (${[id,'manager','invited',seedActor,now,randomUUID()].map(q).join(',')}) ON CONFLICT(user_id) DO NOTHING;`);
  sql.push(`INSERT INTO journal_people (id,name,email,department,manager_id) VALUES (${[id,p.name,p.email,p.department,principal.id].map(q).join(',')}) ON CONFLICT(id) DO NOTHING;`);
  const previous=privateState[p.email];const token=previous?.id===id&&previous.expiresAt>now?previous.token:randomBytes(32).toString('hex');
  const inviteId=previous?.id===id&&previous.token===token?previous.inviteId:randomUUID();const expiresAt=previous?.token===token?previous.expiresAt:now+24*60*60*1000;
  privateState[p.email]={id,token,inviteId,expiresAt};
  sql.push(`INSERT INTO journal_invitations (id,user_id,token_hash,expires_at,created_by) VALUES (${[inviteId,id,digest(token),expiresAt,seedActor].map(q).join(',')}) ON CONFLICT(id) DO NOTHING;`);
 }else if(!existing.manager_id){sql.push(`UPDATE journal_people SET manager_id=${q(principal.id)} WHERE id=${q(id)} AND manager_id IS NULL;`);}
 // Coordinator-specific catalogues replace the ICT default only for these people.
 const settings=query(`SELECT id FROM journal_records WHERE owner=${q(id)} AND kind='strategy-settings'`);
 if(!settings.length)record(id,'strategy-settings','catalogue',{includeCore:false,programme:p.key.toUpperCase(),sourceDocument:p.sourceDocument,seedVersion:manifest.version});
 let objectives=0,focuses=0;
 for(const s of p.strategies){const strategyId=key(id,'strategy',s.key);record(id,'strategy',s.key,{title:s.title,description:s.description,fromYear:manifest.academicYear,source:{document:p.sourceDocument,section:p.key==='pyp'?'Annual Objectives':'Strategic Objectives',period:p.sourcePeriod},seedVersion:manifest.version});
  if(!s.novemberFocus.length)continue;objectives++;
  const objectiveId=key(id,'objective',s.key+'|'+manifest.draftMonth);
  const lines=[s.description,'','November focus and source evidence:',...s.novemberFocus.map(f=>`• ${f.title}\n  Evidence: ${f.sourceDeliverable}\n  Source window: ${f.sourceWindow}`),'',`Source: ${p.sourceDocument}. Dates and draft targets must be reviewed before approval.`];
  record(id,'objective',s.key+'|'+manifest.draftMonth,{title:s.title+' — November 2026',month:manifest.draftMonth,description:lines.join('\n'),strategyId,approvalStatus:'draft',source:{document:p.sourceDocument,section:'November 2026',period:p.sourcePeriod},seedVersion:manifest.version});
  for(const f of s.novemberFocus){focuses++;record(id,'focus',s.key+'|'+manifest.draftMonth+'|'+f.key,{title:f.title,objectiveId,target:f.target,unit:f.unit,weight:f.weight,sourceDeliverable:f.sourceDeliverable,sourceWindow:f.sourceWindow,source:{document:p.sourceDocument},seedVersion:manifest.version});}
 }
 sql.push(`INSERT INTO journal_account_audit (id,actor_id,action,target_id,detail,at) VALUES (${[key(id,'audit','seed-v1'),seedActor,'coordinator-seeded',id,JSON.stringify({sourceDocument:p.sourceDocument,strategicAreas:p.strategies.length,monthlyDrafts:objectives,focusAreas:focuses,managerId:principal.id}),now].map(q).join(',')}) ON CONFLICT(id) DO NOTHING;`);
 summary.push({...p,id,strategicAreas:p.strategies.length,monthlyDrafts:objectives,focusAreas:focuses,isNew:!existing});
}
// Save recovery tokens privately before applying the idempotent seed.
await fs.writeFile(out+'/private-state.json',JSON.stringify(privateState,null,2),{mode:0o600});
await fs.writeFile(out+'/seed.sql',sql.join('\n'),{mode:0o600});execute(out+'/seed.sql');
const verification=[];
for(const p of summary){const a=query(`SELECT u.id,u.name,u.email,a.role,a.state,p.manager_id,c.password IS NOT NULL AS has_password FROM auth_user u JOIN journal_access a ON a.user_id=u.id JOIN journal_people p ON p.id=u.id JOIN auth_account c ON c.user_id=u.id AND c.provider_id='credential' WHERE u.id=${q(p.id)}`)[0];
 if(!a||a.email!==p.email||a.role!=='manager'||a.manager_id!==principal.id)throw Error('Account verification failed for '+p.email);
 const records=query(`SELECT id,kind,data FROM journal_records WHERE owner=${q(p.id)}`).map(r=>({...r,data:JSON.parse(r.data)}));
 const seeded=records.filter(r=>r.id.startsWith('coordinator-seed-'));
 if(seeded.filter(r=>r.kind==='strategy').length!==p.strategicAreas||seeded.filter(r=>r.kind==='objective').length!==p.monthlyDrafts||seeded.filter(r=>r.kind==='focus').length!==p.focusAreas)throw Error('Seed record counts did not match for '+p.email);
 if(p.isNew&&(a.has_password||a.state!=='invited'||records.some(r=>r.kind==='activity')||seeded.some(r=>r.kind==='objective'&&r.data.approvalStatus!=='draft')))throw Error('A new account was seeded with unexpected credentials, work or approval.');
 verification.push({name:a.name,email:a.email,role:a.role,state:a.state,manager:principal.name,strategicAreas:p.strategicAreas,novemberDrafts:p.monthlyDrafts,focusAreas:p.focusAreas});
 const state=privateState[p.email];let linkText='This existing account was preserved. Use Administration if a new setup link is needed.';
 if(state?.id===p.id){const invite=query(`SELECT used_at,expires_at FROM journal_invitations WHERE id=${q(state.inviteId)} AND token_hash=${q(digest(state.token))}`)[0];if(invite&&!invite.used_at&&invite.expires_at>now)linkText=`[Set up ${p.name}’s password](http://127.0.0.1:5190/setup#${state.token})\n\nExpires: ${new Date(invite.expires_at).toISOString()} (24-hour setup link).`;}
 await fs.writeFile(out+'/'+p.key+'-setup.md',`# ${p.name}\n\nEmail: ${p.email}\n\n${linkText}\n\nThis is a local-app account. No invitation email has been sent.\n`,{mode:0o600});
}
await fs.writeFile(out+'/verification.json',JSON.stringify(verification,null,2)+'\n',{mode:0o600});
const lines=['# Coordinator seed report','',`Local import: ${new Date(now).toISOString()}`,`Reporting to: ${principal.name} (${principal.email}); existing account preserved.`,'','| Person | Strategic areas | November drafts | Focus areas |','|---|---:|---:|---:|',...verification.map(p=>`| ${p.name} | ${p.strategicAreas} | ${p.novemberDrafts} | ${p.focusAreas} |`),'','## Seed decisions','',...manifest.notes.map(n=>'- '+n),'','## Source documents','',...manifest.people.map(p=>`- ${p.name}: [${p.sourceDocument}](${encodeURI('/Users/apple/Downloads/'+p.sourceDocument)})`),'','## Account setup','',...manifest.people.map(p=>`- [${p.name} — local setup instructions](${p.key}-setup.md)`),'','No live data, email messages, approvals, completed activities or progress were created. Re-running preserves existing passwords, records and edits.'];
await fs.writeFile(out+'/seed-report.md',lines.join('\n')+'\n',{mode:0o600});
console.log(JSON.stringify({localOnly:true,manager:principal.name,people:verification},null,2));
