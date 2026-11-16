// This script can only use Wrangler's local D1. It never deploys or seeds live data.
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {hashPassword} from 'better-auth/crypto';
await mkdir('outputs',{recursive:true});
let vars='';try{vars=await readFile('.dev.vars','utf8');}catch{}
if(!vars.includes('BETTER_AUTH_SECRET='))vars+='\nBETTER_AUTH_SECRET='+randomBytes(48).toString('hex')+'\n';
if(!vars.includes('APP_ORIGIN='))vars+='APP_ORIGIN=http://127.0.0.1:5190\n';
await writeFile('.dev.vars',vars,{mode:0o600});
const q=v=>v==null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
const now=Date.now(),sql=[],demoPassword='LocalJournal2026!',hash=await hashPassword(demoPassword);
const staff=[['local_ian','ict@hia.edu.so','Ian','manager','local_principal'],['local_principal','principal@journal.test','Principal (demo)','manager',null],['local_faiza','faiza@journal.test','Faiza (demo)','employee','local_ian'],['local_nur','nur@journal.test','Nur (demo)','employee','local_ian']];
for(const [id,email,name,role,manager] of staff){
 sql.push(`INSERT OR IGNORE INTO auth_user (id,name,email,email_verified,created_at,updated_at) VALUES (${[id,name,email,1,now,now].map(q)});`);
 sql.push(`INSERT OR IGNORE INTO auth_account (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES (${[id+'_credential',id,'credential',id,hash,now,now].map(q)});`);
 sql.push(`INSERT OR IGNORE INTO journal_access (user_id,role,state,created_at,revision) VALUES (${[id,role,'active',now,randomBytes(16).toString('hex')].map(q)});`);
 sql.push(`INSERT INTO journal_people (id,name,email,department,manager_id) VALUES (${[id,name,email,'ICT Department',manager].map(q)}) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name;`);
}
const admin='local_system_admin',email='smithinitianix@gmail.com',secret=randomBytes(32).toString('hex'),tokenHash=createHash('sha256').update(secret).digest('hex');
sql.push(`INSERT OR IGNORE INTO auth_user (id,name,email,email_verified,created_at,updated_at) VALUES (${[admin,'System Administrator',email,0,now,now].map(q)});`);
sql.push(`INSERT OR IGNORE INTO auth_account (id,account_id,provider_id,user_id,created_at,updated_at) VALUES (${[admin+'_credential',admin,'credential',admin,now,now].map(q)});`);
sql.push(`INSERT OR IGNORE INTO journal_access (user_id,role,state,created_at,revision) VALUES (${[admin,'admin','invited',now,randomBytes(16).toString('hex')].map(q)});`);
// Re-running never replaces an administrator password or creates an activation link after setup.
sql.push(`UPDATE journal_invitations SET used_at=${now} WHERE user_id=${q(admin)} AND used_at IS NULL AND EXISTS(SELECT 1 FROM journal_access WHERE user_id=${q(admin)} AND state='invited');`);
sql.push(`INSERT INTO journal_invitations (id,user_id,token_hash,expires_at,created_by) SELECT ${[randomBytes(16).toString('hex'),admin,tokenHash,now+86400000,'local-bootstrap'].map(q)} WHERE EXISTS(SELECT 1 FROM journal_access WHERE user_id=${q(admin)} AND state='invited');`);
const testAdmin='local_test_admin';sql.push(`INSERT OR IGNORE INTO auth_user (id,name,email,email_verified,created_at,updated_at) VALUES (${[testAdmin,'QA Administrator','qa-admin@journal.test',1,now,now].map(q)});`);sql.push(`INSERT OR IGNORE INTO auth_account (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES (${[testAdmin+'_credential',testAdmin,'credential',testAdmin,hash,now,now].map(q)});`);sql.push(`INSERT OR IGNORE INTO journal_access (user_id,role,state,created_at,revision) VALUES (${[testAdmin,'admin','active',now,randomBytes(16).toString('hex')].map(q)});`);
await writeFile('outputs/local-auth-seed.sql',sql.join('\n'),{mode:0o600});
const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file','outputs/local-auth-seed.sql'],{encoding:'utf8'});
if(r.status!==0){process.stderr.write(r.stderr||r.stdout);process.exit(r.status||1);}
await writeFile('outputs/admin-setup-link.txt','Open this one-time local setup link to choose the system administrator password:\n\nhttp://127.0.0.1:5190/setup#'+secret+'\n\nAccount: '+email+'\nExpires in 24 hours. Never share this link with other users.\n',{mode:0o600});
await writeFile('outputs/local-demo-accounts.txt','Local development only. These credentials are never deployed.\n\nIan: ict@hia.edu.so\nPrincipal: principal@journal.test\nFaiza: faiza@journal.test\nNur: nur@journal.test\nQA admin: qa-admin@journal.test\n\nDemo password: '+demoPassword+'\n\nThe separate real-email administrator has no default password; use admin-setup-link.txt.\n',{mode:0o600});
console.log('Seeded local invitation-only admin and staff accounts. Setup link saved privately in outputs/admin-setup-link.txt. No admin password was assigned.');
