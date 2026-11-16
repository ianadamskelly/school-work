import assert from 'node:assert/strict';
import {fixtures} from './auth-fixtures.mjs';
const context=await fixtures({manager:'manager',employee:'employee',other:'manager'}),call=context.call,users=context.users;
const wf=(a,p,s)=>call(a,'/api/workflow',p,s),records=a=>call(a,'/api/records');
const save=(kind,data,e)=>call('employee','/api/records',{action:'save',kind,data,id:e?.id,revision:e?.revision});
try{
 await wf('employee',{action:'connect',direction:'employee',email:users.manager.email});const req=(await wf('manager')).connections.find(c=>c.from_id===users.employee.id);await wf('manager',{action:'connection',id:req.id,decision:'accept'});
 let o=await save('objective',{title:'QA concurrency test',month:'2026-11'}),f=await save('focus',{title:'Checks',objectiveId:o.id,target:10,unit:'accounts',weight:1});
 o=(await records('employee')).find(e=>e.id===o.id);await wf('employee',{action:'submit-objective',id:o.id,revision:o.revision});o=(await records('employee')).find(e=>e.id===o.id);await wf('manager',{action:'decide-objective',id:o.id,revision:o.revision,decision:'approved',reason:''});o=(await records('employee')).find(e=>e.id===o.id);
 await wf('employee',{action:'revise-objective',id:o.id,revision:o.revision});o=(await records('employee')).find(e=>e.id===o.id);
 await call('employee','/api/records',{action:'save',kind:'activity',data:{title:'Blocked before approval',date:'2026-11-15',type:'planned',status:'done',focusId:f.id,contribution:1}},400);
 o=await save('objective',{...o.data,approvalStatus:'approved'},o);assert.equal(o.data.approvalStatus,'draft');
 const attempts=await Promise.allSettled([save('focus',{...f.data,target:12},f),wf('employee',{action:'submit-objective',id:o.id,revision:o.revision})]);assert.ok(attempts.some(r=>r.status==='fulfilled'));assert.ok(attempts.some(r=>r.status==='rejected'));
 await wf('other',{action:'connect',direction:'manager',email:users.employee.email});const other=(await wf('employee')).connections.find(c=>c.from_id===users.other.id);await wf('employee',{action:'connection',id:other.id,decision:'accept'},400);assert.equal((await wf('employee')).manager.id,users.manager.id);
 console.log('PASS: authenticated withdrawal pauses work; forged approval denied; concurrent target edit/submission protected; second-manager takeover denied.');
}finally{await context.cleanup();}
