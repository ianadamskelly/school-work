import assert from 'node:assert/strict';
import {fixtures,request} from './auth-fixtures.mjs';
const context=await fixtures({outsider:'employee'}),cookie=context.users.outsider.cookie;
const post=async(p,expected=200,extra={})=>{if(extra.Origin){const r=await fetch('http://127.0.0.1:5190/api/records',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:extra.Origin},body:JSON.stringify(p)});assert.equal(r.status,expected);return;}return (await request('/api/records',p,cookie,expected)).data;};
const save=(kind,data,e,status)=>post({action:'save',kind,data,id:e?.id,revision:e?.revision},status);
let o,f,a;
try{
 await request('/api/records',undefined,'',401);
 await post({action:'save',kind:'objective',data:{}},403,{Origin:'https://other.example'});
 await post({action:'save',kind:'objective',data:{}},400);
 o=await save('objective',{title:'API validation only',month:'2026-11',approvalStatus:'approved'});assert.equal(o.data.approvalStatus,'draft');
 f=await save('focus',{title:'Checks',objectiveId:o.id,target:10,unit:'accounts',weight:1});
 const general={title:'API general work only',date:'2026-11-15',type:'unplanned',status:'done',focusId:'',contribution:0};
 await save('activity',{...general,date:'2026-02-30'},undefined,400);
 await save('activity',{...general,contribution:4},undefined,400);
 await save('activity',{...general,focusId:f.id,contribution:4},undefined,400);
 a=await save('activity',general);const updated=await save('activity',{...general,outcome:'Corrected outcome'},a);await save('activity',general,a,409);a=updated;
 const es=(await request('/api/records',undefined,cookie)).data;o=es.find(e=>e.id===o.id);await post({action:'delete',kind:'objective',id:o.id,revision:o.revision},400);
 console.log('PASS: sign-in, origin, input/date validation, approval forgery prevention, new-plan work gate, general work, stale edits and linked-record deletion protection.');
}finally{await context.cleanup();}
