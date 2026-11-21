import { database, fail, json, staffAccess } from '../../../lib/server';
import { weekStart } from '../../../lib/journal';
import { principalAccountId } from '../../../lib/workflow';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const me=await staffAccess();if(me instanceof Response)return me;
 const query=new URL(req.url).searchParams,period=query.get('period')==='monthly'?'monthly':'weekly';
 const start=period==='monthly'?(query.get('month')||'')+'-01':query.get('week')||'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||isNaN(Date.parse(start))||(period==='weekly'&&weekStart(start)!==start)||new Date(start).toISOString().slice(0,10)!==start)return fail('Choose a report week.');
 const db=database();if(me.role!=='manager')return json({people:[],reports:[],plans:[]});
 const people=await db.prepare("SELECT p.id,p.name,p.email,p.department,a.state AS account_state FROM journal_people p JOIN journal_access a ON a.user_id=p.id WHERE p.manager_id=? AND a.state!='disabled' ORDER BY p.name").bind(me.id).all<any>();
 const reports=await db.prepare(`SELECT s.* FROM journal_submissions s JOIN journal_people p ON p.id=s.employee_id WHERE s.manager_id=? AND s.start=? AND s.period_type=? AND p.manager_id=? ORDER BY s.submitted_at DESC,s.rowid DESC`).bind(me.id,start,period,me.id).all<any>();
 const plans=await db.prepare(`SELECT r.*,p.name AS employee_name FROM journal_records r JOIN journal_people p ON p.id=r.owner WHERE p.manager_id=? AND r.kind='objective' AND json_extract(r.data,'$.approvalStatus')='submitted' AND json_extract(r.data,'$.submittedTo')=? AND r.owner!=?`).bind(me.id,me.id,principalAccountId).all<any>();
 const planIds=plans.results.map(p=>p.id);const focus=planIds.length?await db.prepare(`SELECT r.* FROM journal_records r JOIN journal_people p ON p.id=r.owner WHERE p.manager_id=? AND r.kind='focus'`).bind(me.id).all<any>():{results:[]};
 const feedback=await db.prepare('SELECT f.*,m.name AS manager_name FROM journal_report_feedback f JOIN journal_submissions s ON s.id=f.submission_id JOIN journal_people p ON p.id=f.employee_id LEFT JOIN journal_people m ON m.id=f.manager_id WHERE f.manager_id=? AND p.manager_id=? AND s.start=? AND s.period_type=? ORDER BY f.created_at DESC,f.rowid DESC').bind(me.id,me.id,start,period).all();
 return json({feedback:feedback.results,people:people.results,reports:reports.results.map(r=>({...r,metrics:JSON.parse(r.metrics)})),plans:plans.results.map(p=>({...p,data:JSON.parse(p.data),focusAreas:focus.results.filter(f=>JSON.parse(f.data).objectiveId===p.id).map(f=>({...f,data:JSON.parse(f.data)}))}))});
}
