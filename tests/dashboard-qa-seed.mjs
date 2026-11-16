// Visual QA fixture: only the isolated loopback server and its ignored SQLite file.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const base='http://127.0.0.1:5203',out='outputs/dashboard-qa';
async function request(path,payload,cookie='',expected=200){const r=await fetch(base+path,{method:payload?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:payload?JSON.stringify(payload):undefined});const text=await r.text();assert.equal(r.status,expected,path+': '+text.slice(0,400));return {data:JSON.parse(text),cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};}
const password=randomBytes(24).toString('hex'),links=JSON.parse(await readFile(out+'/work-journal-setup-links.json','utf8'));
const administrator=links.find(x=>x.email==='smithinitianix@gmail.com');
await request('/api/setup',{action:'activate',token:administrator.url.split('#')[1],password});
const admin=(await request('/api/auth/sign-in/email',{email:administrator.email,password})).cookie;
const users={admin:{email:administrator.email,password,cookie:admin,name:'System Administrator'}};
for(const [key,name,role,manager] of [['empty','QA empty workspace','manager',''],['manager','QA dashboard manager','manager','empty'],['contributor','QA contributor with a deliberately long name for mobile review','employee','manager'],['missing','QA report not submitted','employee','manager']]){
 const email=`qa-dashboard-${key}@journal.test`;const invitation=(await request('/api/accounts',{action:'create',name,email,role,department:'Visual QA fixture',managerId:manager?users[manager].id:''},admin)).data;
 const account=(await request('/api/accounts',undefined,admin)).data.users.find(u=>u.email===email);
 await request('/api/setup',{action:'activate',token:invitation.setupUrl.split('#')[1],password});
 users[key]={...account,password,cookie:(await request('/api/auth/sign-in/email',{email,password})).cookie};
}
async function save(as,kind,data){return (await request('/api/records',{action:'save',kind,data},users[as].cookie)).data;}
async function records(as){return (await request('/api/records',undefined,users[as].cookie)).data;}
async function workflow(as,data){return (await request('/api/workflow',data,users[as].cookie)).data;}
const o1=await save('manager','objective',{title:'QA Improve school systems and infrastructure',month:'2026-11',description:'Visual QA only: weighted target example.',strategyId:'core:systems'});
const f1=await save('manager','focus',{title:'QA access checks',objectiveId:o1.id,target:4,weight:3,unit:'accounts verified'}),f2=await save('manager','focus',{title:'QA documentation',objectiveId:o1.id,target:2,weight:1,unit:'documents reviewed'});
async function submit(as,id){const o=(await records(as)).find(e=>e.id===id);return workflow(as,{action:'submit-objective',id,revision:o.revision});}
async function decide(id,decision){const plans=(await request('/api/team?week=2026-11-14&period=weekly',undefined,users.empty.cookie)).data.plans;const o=plans.find(p=>p.id===id);return workflow('empty',{action:'decide-objective',id,revision:o.revision,decision,reason:decision==='approved'?'':'QA: Make the evidence target more specific.'});}
await submit('manager',o1.id);await decide(o1.id,'approved');
for(const [title,status] of [['QA Teacher learning support','draft'],['QA Student assessment and feedback','changes-requested'],['QA Evidence review awaiting approval','submitted']]){
 const o=await save('manager','objective',{title,month:'2026-11',description:'Visual QA only.',strategyId:'core:training'});await save('manager','focus',{title:'QA measurable milestone',objectiveId:o.id,target:1,weight:1,unit:'milestones'});
 if(status!=='draft')await submit('manager',o.id);if(status==='changes-requested')await decide(o.id,status);
}
const activity=(title,type,status,minutes,focusId='',contribution=0,challenge='')=>({title,date:'2026-11-16',type,status,minutes,focusId,contribution,challenge,outcome:status==='done'?'QA fixture achievement':'',evidence:'',solution:'',routineId:''});
await save('manager','activity',activity('QA Verify staff access','planned','done',60,f1.id,2));
await save('manager','activity',activity('QA Update guidance documents','recurring','done',30,f2.id,2));
await save('manager','activity',activity('QA Network equipment delivery','unplanned','blocked',15,'',0,'QA: Waiting for a replacement device.'));
await save('manager','activity',activity('QA Plan next support session','planned','planned',0));
await save('contributor','activity',activity('QA Classroom support','planned','done',20));
await save('contributor','activity',activity('QA Waiting for resources','unplanned','blocked',5,'',0,'QA: Materials awaiting approval.'));
await workflow('contributor',{action:'submit-report',start:'2026-11-14'});
const pending=await save('missing','objective',{title:'QA A direct report’s plan for review',month:'2026-11',description:'QA only.',strategyId:'core:systems'});await save('missing','focus',{title:'QA Draft deliverable',objectiveId:pending.id,target:1,unit:'milestones',weight:1});await submit('missing',pending.id);
const own=await records('manager');assert.equal(own.filter(e=>e.kind==='objective').length,4);assert.equal(own.filter(e=>e.kind==='activity').length,4);
const expected={month:'2026-11',objectiveProgress:16,completed:2,recorded:4,hours:'1.8',awaitingApproval:1,attention:3,team:{received:1,unread:1,missing:1,issues:1,people:2,approvals:1},admin:{all:10,active:5,invited:4,disabled:1}};
await mkdir(out,{recursive:true});await writeFile(out+'/private.json',JSON.stringify({base,users},null,2),{mode:0o600});await writeFile(out+'/expected.json',JSON.stringify(expected,null,2));
console.log('Seeded isolated dashboard QA accounts via invitation, plan approval, activity and report APIs. Known totals saved without exposing credentials.');
