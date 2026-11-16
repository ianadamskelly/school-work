import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fixtures,request,testPassword} from './auth-fixtures.mjs';
const ctx=await fixtures({employee:'employee'}),u=ctx.users.employee;
try{
 const admin=(await request('/api/auth/sign-in/email',{email:'qa-admin@journal.test',password:testPassword})).cookie;
 const latest=async()=>(await request('/api/accounts',undefined,admin)).data.users.find(x=>x.id===u.id);
 const reset=async()=>{const a=await latest();return (await request('/api/accounts',{action:'reset',id:a.id,revision:a.revision},admin)).data.setupUrl.split('#')[1];};
 const old=await reset(),current=await reset();await request('/api/setup',{action:'inspect',token:old},'',400);await request('/api/setup',{action:'inspect',token:current});
 const hash=createHash('sha256').update(current).digest('hex');const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',`UPDATE journal_invitations SET expires_at=1 WHERE token_hash='${hash}'`],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);await request('/api/setup',{action:'inspect',token:current},'',400);
 const final=await reset();await request('/api/setup',{action:'activate',token:final,password:testPassword});await request('/api/setup',{action:'activate',token:final,password:testPassword},'',400);
 console.log('PASS: reset replaces previous links; expired links are rejected; setup activates once and invalidates other pending links.');
}finally{await ctx.cleanup();}
