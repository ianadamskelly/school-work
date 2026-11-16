import { getAuth,appOrigin } from '../../../../lib/auth';
import { clientKey,digest,limit } from '../../../../lib/security';
export const dynamic='force-dynamic';
async function handler(req:Request){
 const path=new URL(req.url).pathname.replace('/api/auth','');
 if(path.includes('sign-up'))return Response.json({error:'Accounts are created by a line manager or system administrator.'},{status:403});
 if(!((req.method==='GET'&&path==='/get-session')||(req.method==='POST'&&['/sign-in/email','/sign-out'].includes(path))))return Response.json({error:'Not found.'},{status:404});
 if(req.method==='POST'&&req.headers.get('origin')!==appOrigin())return Response.json({error:'Request origin is not allowed.'},{status:403});
 if(path==='/sign-in/email'){
  let input;const raw=await req.clone().text();if(raw.length>5000)return Response.json({error:'Invalid request.'},{status:400});try{input=JSON.parse(raw);}catch{return Response.json({error:'Invalid request.'},{status:400});}
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  if(!await limit('login:'+await digest(email),10,15*60*1000)||!await limit('login-ip:'+clientKey(req),100,15*60*1000))return Response.json({message:'Too many login attempts. Please try again in 15 minutes.'},{status:429});
 }
 return getAuth().handler(req);
}
export const GET=handler;export const POST=handler;
