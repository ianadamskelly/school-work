import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
const file=process.env.DATABASE_PATH||'/app/data/work-journal.sqlite',dir=dirname(file);
mkdirSync(dir,{recursive:true});
if(!process.env.APP_ORIGIN)throw Error('APP_ORIGIN must be configured.');
const origin=new URL(process.env.APP_ORIGIN).origin;
if(!process.env.BETTER_AUTH_SECRET){const secretFile=resolve(dir,'work-journal-secret');if(!existsSync(secretFile))writeFileSync(secretFile,randomBytes(48).toString('hex'),{mode:0o600,flag:'wx'});process.env.BETTER_AUTH_SECRET=readFileSync(secretFile,'utf8').trim();}
const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
db.exec('CREATE TABLE IF NOT EXISTS _journal_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()){
 if(db.prepare('SELECT 1 FROM _journal_migrations WHERE name=?').get(name))continue;
 db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync('drizzle/'+name,'utf8'));db.prepare('INSERT INTO _journal_migrations VALUES (?,?)').run(name,Date.now());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
}
// Fresh production installs contain no demo credentials, sessions or invented work.
// Existing users, passwords and journal entries are never overwritten.
const manifest=JSON.parse(readFileSync('seed-data/coordinators-2026-27.json','utf8'));
const links=[],now=Date.now();
const digest=s=>createHash('sha256').update(s).digest('hex');
function account(id,name,email,role,manager,department,state='invited'){
 const existing=db.prepare('SELECT id FROM auth_user WHERE email=?').get(email);if(existing)return existing.id;
 db.prepare('INSERT INTO auth_user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,0,?,?)').run(id,name,email,now,now);
 db.prepare("INSERT INTO auth_account (id,account_id,provider_id,user_id,created_at,updated_at) VALUES (?,?,'credential',?,?,?)").run(randomUUID(),id,id,now,now);
 db.prepare('INSERT INTO journal_access (user_id,role,state,created_by,created_at,revision) VALUES (?,?,?,?,?,?)').run(id,role,state,'vps-bootstrap',now,randomUUID());
 if(role!=='admin')db.prepare('INSERT INTO journal_people (id,name,email,department,manager_id) VALUES (?,?,?,?,?)').run(id,name,email,department,manager);
 if(state==='invited'){const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO journal_invitations (id,user_id,token_hash,expires_at,created_by) VALUES (?,?,?,?,?)').run(randomUUID(),id,digest(token),now+86400000,'vps-bootstrap');links.push({name,email,url:origin+'/setup#'+token,expiresAt:new Date(now+86400000).toISOString()});}
 return id;
}
function record(owner,kind,slug,data){const id='vps-seed-'+digest(owner+'|'+kind+'|'+slug).slice(0,28);db.prepare('INSERT INTO journal_records (id,owner,kind,data,revision) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,owner,kind,JSON.stringify(data),randomUUID());return id;}
db.exec('CREATE TABLE IF NOT EXISTS _journal_bootstraps (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
if(!db.prepare("SELECT 1 FROM _journal_bootstraps WHERE name='coordinators-v1'").get()){
db.exec('BEGIN IMMEDIATE');try{
 account('system_admin','System Administrator','smithinitianix@gmail.com','admin',null,'');
 const principal=account('principal_pending','Principal (pending setup)','principal@journal.test','manager',null,'School Leadership','disabled');
 account('ian','Ian','ict@hia.edu.so','manager',principal,'ICT Department');
 for(const p of manifest.people){const owner=account('coordinator_'+p.key,p.name,p.email,'manager',principal,p.department);record(owner,'strategy-settings','catalogue',{includeCore:false,programme:p.key.toUpperCase()});
  for(const s of p.strategies){const strategyId=record(owner,'strategy',s.key,{title:s.title,description:s.description,fromYear:manifest.academicYear,sourceDocument:p.sourceDocument});if(!s.novemberFocus.length)continue;
   const objectiveId=record(owner,'objective',s.key,{title:s.title+' — November 2026',month:manifest.draftMonth,description:s.description+'\n\nSource: '+p.sourceDocument+'. Dates and draft targets require review before approval.',strategyId,approvalStatus:'draft'});
   for(const f of s.novemberFocus)record(owner,'focus',s.key+'|'+f.key,{title:f.title,objectiveId,target:f.target,unit:f.unit,weight:f.weight,sourceDeliverable:f.sourceDeliverable,sourceWindow:f.sourceWindow});
  }
 }
 db.prepare('INSERT INTO _journal_bootstraps VALUES (?,?)').run('coordinators-v1',now);
 db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error;}
}
if(links.length){const linkFile=resolve(dir,'work-journal-setup-links.json');const previous=existsSync(linkFile)?JSON.parse(readFileSync(linkFile,'utf8')):[];writeFileSync(linkFile,JSON.stringify([...previous,...links],null,2)+'\n',{mode:0o600});}
db.close();
console.log('Work Journal migrations and initial account checks complete. Private setup instructions are in the persistent data directory.');
await import(resolve(process.env.STANDALONE_SERVER||'server.js'));
