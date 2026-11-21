import { NextResponse } from 'next/server';
import { identity,appOrigin } from './auth';
import { database } from './database';
export { database } from './database';
import type { Entry } from './journal';
import { noApprovalRequired, principalAccountId } from './workflow';
export function fail(error:string,status=400){return NextResponse.json({error},{status});}
export function json(data:unknown){return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});}
export async function person(){const a=await identity();if(!a||a.state!=='active'||a.role==='admin')return null;const p=await database().prepare('SELECT * FROM journal_people WHERE id=?').bind(a.id).first<any>();return p?{...p,role:a.role}:null;}
export async function staffAccess(){const a=await identity();if(!a)return fail('Please log in.',401);if(a.state!=='active')return fail('This account is not active. Contact your line manager or administrator.',403);if(a.role==='admin')return fail('System administrators do not have work journals or line-management access.',403);const p=await database().prepare('SELECT * FROM journal_people WHERE id=?').bind(a.id).first<any>();return p?{...p,role:a.role}:fail('Account profile is unavailable.',403);}
export async function ownRecords(id:string):Promise<Entry[]>{
 const rows=await database().prepare('SELECT id,kind,data,revision FROM journal_records WHERE owner=?').bind(id).all<any>();
 return rows.results.map(row=>{
  const data=JSON.parse(row.data);
  if(id===principalAccountId&&row.kind==='objective')data.approvalStatus=noApprovalRequired;
  return {...row,data};
 });
}
export async function body(req:Request){if(req.headers.get('origin')!==appOrigin())throw Error('Request origin is not allowed.');const raw=await req.text();if(raw.length>100000)throw Error('Request is too large.');return JSON.parse(raw);}
export async function workflowState(me:any){const db=database();const manager=me.manager_id?await db.prepare('SELECT id,name,email,department FROM journal_people WHERE id=?').bind(me.manager_id).first():null;const inbox=await db.prepare('SELECT c.*,p.name AS from_name,p.email AS from_email FROM journal_connections c JOIN journal_people p ON p.id=c.from_id WHERE (c.to_email=? OR c.from_id=?) AND c.state=? ORDER BY c.created_at DESC').bind(me.email,me.id,'pending').all();const history=await db.prepare('SELECT e.*,p.name AS manager_name FROM journal_events e LEFT JOIN journal_people p ON p.id=e.manager_id WHERE e.owner=? ORDER BY e.at DESC').bind(me.id).all<any>();const reports=await db.prepare('SELECT s.*,p.name AS recipient_name FROM journal_submissions s LEFT JOIN journal_people p ON p.id=s.manager_id WHERE s.employee_id=? ORDER BY s.submitted_at DESC').bind(me.id).all<any>();const feedback=await db.prepare('SELECT f.*,p.name AS manager_name,s.start,s.period_type,s.submitted_at FROM journal_report_feedback f JOIN journal_submissions s ON s.id=f.submission_id LEFT JOIN journal_people p ON p.id=f.manager_id WHERE f.employee_id=? ORDER BY f.created_at DESC,f.rowid DESC').bind(me.id).all();return {reportFeedback:feedback.results,me,manager,connections:inbox.results,history:history.results.map(e=>({...e,payload:JSON.parse(e.payload)})),submissions:reports.results.map(r=>({...r,metrics:JSON.parse(r.metrics)}))};}
