import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const base='http://127.0.0.1:5190',password='LocalJournal2026!',ids=[],run=Date.now();
async function request(path,body,cookie='',expected=200,origin=base){const r=await fetch(base+path,{redirect:'manual',method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();assert.equal(r.status,expected,`${path}: ${text.slice(0,400)}`);let data;try{data=JSON.parse(text);}catch{data=text;}return {data,cookie:r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '),headers:r.headers};}
const login=async(email,pass=password,status=200)=>(await request('/api/auth/sign-in/email',{email,password:pass},'',status)).cookie;
const account=async(cookie,id)=>(await request('/api/accounts',undefined,cookie)).data.users.find(u=>u.id===id);
let admin,manager,employee,newId;
async function create(payload,cookie=admin){const r=await request('/api/accounts',{action:'create',name:'QA Account '+run,email:`qa-${ids.length}-${run}@journal.test`,department:'QA only',role:'employee',managerId:'local_ian',...payload},cookie);const token=r.data.setupUrl.split('#')[1];const all=(await request('/api/accounts',undefined,cookie)).data.users;const u=all.find(u=>u.email===r.data.email);ids.push(u.id);return {user:u,token};}
try{
 await request('/api/accounts',undefined,'',401);await request('/api/records',undefined,'__sites_local_auth=1; __journal_demo=ian',401);
 await request('/api/auth/sign-up/email',{email:`self-${run}@journal.test`,password,name:'Should not exist'},'',403);
 admin=await login('qa-admin@journal.test');manager=await login('ict@hia.edu.so');employee=await login('faiza@journal.test');
 for(const path of ['/api/records','/api/workflow','/api/team?week=2026-11-14'])await request(path,undefined,admin,403);
 await request('/api/accounts',undefined,employee,403);await request('/api/accounts',{action:'create',email:'forged@journal.test',name:'Bad',role:'admin'},manager,403);
 await request('/api/accounts',{action:'create',email:'admin-report@journal.test',name:'Bad',role:'admin',managerId:'local_ian'},admin,400);
 let c=await create({},manager);newId=c.user.id;assert.equal(c.user.manager_id,'local_ian');assert.equal(c.user.state,'invited');
 await request('/api/setup',{action:'inspect',token:c.token},'',200);await request('/api/setup',{action:'activate',token:c.token,password:'short'},'',400);
 await request('/api/setup',{action:'activate',token:c.token,password},'',200);
 await request('/api/setup',{action:'activate',token:c.token,password},'',400);
 let staff=await login(c.user.email);assert.equal((await request('/api/session',undefined,staff)).data.role,'employee');
 await request('/api/auth/sign-out',{},staff);await request('/api/session',undefined,staff,401);staff=await login(c.user.email);
 let u=await account(manager,newId);await request('/api/accounts',{action:'status',id:u.id,revision:u.revision,state:'disabled'},manager);await request('/api/session',undefined,staff,401);
 await login(c.user.email,password,403);
 u=await account(manager,newId);await request('/api/accounts',{action:'status',id:u.id,revision:u.revision,state:'active'},manager);staff=await login(c.user.email);
 const principal=await account(admin,'local_principal');await request('/api/accounts',{action:'reset',id:principal.id,revision:principal.revision},manager,404);
 u=await account(manager,newId);const reset=await request('/api/accounts',{action:'reset',id:u.id,revision:u.revision},manager);await request('/api/session',undefined,staff,401);
 const resetToken=reset.data.setupUrl.split('#')[1],newPassword='ChangedLocalPassword2026!';await request('/api/setup',{action:'activate',token:resetToken,password:newPassword});await login(c.user.email,password,401);staff=await login(c.user.email,newPassword);
 u=await account(admin,newId);await request('/api/accounts',{action:'edit',id:u.id,revision:u.revision,name:u.name,department:'QA',role:'admin',managerId:''},admin,400);
 await request('/api/accounts',{action:'edit',id:principal.id,revision:principal.revision,name:principal.name,department:'QA',role:'manager',managerId:'local_ian'},admin,409);
 u=await account(admin,newId);await request('/api/accounts',{action:'edit',id:u.id,revision:u.revision,name:u.name,department:'QA',role:'manager',managerId:'local_ian'},admin);
 assert.equal((await request('/api/session',undefined,staff)).data.role,'manager');
 let a=await create({name:'QA Dedicated Admin',role:'admin',managerId:'',department:''});await request('/api/setup',{action:'activate',token:a.token,password});const newAdmin=await login(a.user.email);
 await request('/api/records',undefined,newAdmin,403);await request('/api/workflow',{action:'submit-report',start:'2026-11-14'},newAdmin,403);
 const self=await account(newAdmin,a.user.id);await request('/api/accounts',{action:'status',id:self.id,revision:self.revision,state:'disabled'},newAdmin,400);
 const audit=(await request('/api/accounts',undefined,admin)).data.audit;assert.ok(audit.some(e=>e.action==='account-created'));assert.ok(!JSON.stringify(audit).includes(password));assert.ok(!JSON.stringify(audit).includes(c.token));
 await request('/api/accounts',{action:'create',email:`cross-${run}@journal.test`,name:'Bad',role:'employee'},manager,403,'https://other.example');
 for(let i=0;i<10;i++)await login(`rate-${run}@journal.test`,'incorrect-password-2026',401);await login(`rate-${run}@journal.test`,'incorrect-password-2026',429);
 console.log('PASS: email/password login; no public signup or old-cookie bypass; manager-only provisioning; one-time setup; logout; role separation; suspension and session revocation; reset; reporting-cycle guard; no staff-to-admin conversion; audit without credentials; origin checks; throttling.');
}finally{
 if(ids.length){const quoted=ids.map(id=>"'"+id.replaceAll("'","''")+"'").join(',');const sql=`DELETE FROM journal_connections WHERE from_id IN (${quoted});DELETE FROM journal_events WHERE owner IN (${quoted});DELETE FROM journal_report_feedback WHERE employee_id IN (${quoted}) OR manager_id IN (${quoted});DELETE FROM journal_submissions WHERE employee_id IN (${quoted});DELETE FROM journal_records WHERE owner IN (${quoted});DELETE FROM journal_people WHERE id IN (${quoted});DELETE FROM journal_account_audit WHERE actor_id IN (${quoted}) OR target_id IN (${quoted});DELETE FROM auth_user WHERE id IN (${quoted});`;
 await mkdir('outputs',{recursive:true});await writeFile('outputs/auth-test-cleanup.sql',sql);const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file','outputs/auth-test-cleanup.sql'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);console.log('Removed only the temporary local auth-test accounts.');}
}
