import { z } from 'zod';
import { body, database, fail, json, ownRecords, staffAccess, workflowState } from '../../../lib/server';
import { annualCoverage,strategyKey } from '../../../lib/strategy';
import { monthlySummary,monthlyText } from '../../../lib/monthly';
import { approval, canEditPlan, principalAccountId } from '../../../lib/workflow';
import { addDays, objectiveProgress, weeklyText, weekStart } from '../../../lib/journal';
export const dynamic='force-dynamic';
const short=z.string().trim().min(1).max(300), note=z.string().trim().max(10000).default('');
const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('profile'),name:short,department:z.string().trim().max(300)}),
 z.object({action:z.literal('connect'),email:z.string().trim().email().max(300).transform(s=>s.toLowerCase()),direction:z.enum(['manager','employee'])}),
 z.object({action:z.literal('connection'),id:short,decision:z.enum(['accept','decline','cancel'])}),
 z.object({action:z.literal('disconnect'),employeeId:short}),
 z.object({action:z.literal('submit-objective'),id:short,revision:short}),
 z.object({action:z.literal('revise-objective'),id:short,revision:short}),
 z.object({action:z.literal('decide-objective'),id:short,revision:short,decision:z.enum(['approved','changes-requested','rejected']),reason:note}),
 z.object({action:z.literal('submit-report'),start:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}),
 z.object({action:z.literal('review-report'),id:short}),
 z.object({action:z.literal('report-feedback'),id:short,message:z.string().trim().min(1).max(10000)}),
 z.object({action:z.literal('submit-monthly'),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}),
]);
export async function GET(){const me=await staffAccess();if(me instanceof Response)return me;return json(await workflowState(me));}
export async function POST(req:Request){
 const me=await staffAccess();if(me instanceof Response)return me;
 let parsed;try{parsed=actionSchema.safeParse(await body(req));}catch{return fail('Invalid request or origin.');}if(!parsed.success)return fail(parsed.error.issues.map(i=>i.message).join('; '));
 const d=parsed.data,db=database(),now=new Date().toISOString();
 if(['decide-objective','review-report','report-feedback'].includes(d.action)&&me.role!=='manager')return fail('Only line managers can review team work.',403);
 if(d.action==='profile'){await db.batch([db.prepare('UPDATE journal_people SET name=?,department=? WHERE id=?').bind(d.name,d.department,me.id),db.prepare('UPDATE auth_user SET name=?,updated_at=? WHERE id=?').bind(d.name,Date.now(),me.id)]);return json({ok:true});}
 if(d.action==='connect'){
  const target=await db.prepare("SELECT u.id,a.role FROM auth_user u JOIN journal_access a ON a.user_id=u.id WHERE u.email=? AND a.state!='disabled'").bind(d.email).first<any>();
  if(!target||target.role==='admin')return fail('Choose an existing staff account. New accounts must be created by a line manager or administrator.');
  if(d.direction==='manager'&&me.role!=='manager')return fail('Only a line manager can add direct reports.',403);
  if(d.direction==='employee'&&target.role!=='manager')return fail('Choose an account with the line manager role.');
  if(d.email===me.email)return fail('You cannot be your own line manager.');
  if(d.direction==='employee'&&me.manager_id)return fail('You already have a line manager. End that connection before choosing another.');
  const exists=await db.prepare('SELECT id FROM journal_connections WHERE from_id=? AND to_email=? AND direction=? AND state=?').bind(me.id,d.email,d.direction,'pending').first();
  if(exists)return fail('A pending request already exists.');
  await db.prepare('INSERT INTO journal_connections (id,from_id,to_email,direction,state,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),me.id,d.email,d.direction,'pending',now).run();return json({ok:true});
 }
 if(d.action==='connection'){
  const c=await db.prepare('SELECT * FROM journal_connections WHERE id=? AND state=?').bind(d.id,'pending').first<any>();
  if(!c||!(d.decision==='cancel'?c.from_id===me.id:c.to_email===me.email))return fail('Connection request not found.',404);
  if(d.decision!=='accept'){await db.prepare('UPDATE journal_connections SET state=? WHERE id=? AND state=?').bind(d.decision==='cancel'?'cancelled':'declined',d.id,'pending').run();return json({ok:true});}
  const employee=c.direction==='manager'?me.id:c.from_id, manager=c.direction==='manager'?c.from_id:me.id;
  if(employee===manager)return fail('You cannot manage yourself.');
  const validManager=await db.prepare("SELECT user_id FROM journal_access WHERE user_id=? AND role='manager' AND state='active'").bind(manager).first();if(!validManager)return fail('The selected line manager is not available.');
  const results=await db.batch([
   db.prepare(`UPDATE journal_people SET manager_id=? WHERE id=? AND manager_id IS NULL
    AND EXISTS(SELECT 1 FROM journal_connections WHERE id=? AND state='pending')
    AND NOT EXISTS(WITH RECURSIVE chain(id) AS (SELECT ? UNION SELECT p.manager_id FROM journal_people p JOIN chain c ON p.id=c.id WHERE p.manager_id IS NOT NULL) SELECT 1 FROM chain WHERE id=?) RETURNING id`).bind(manager,employee,c.id,manager,employee),
   db.prepare(`UPDATE journal_connections SET state='accepted' WHERE id=? AND state='pending' AND EXISTS(SELECT 1 FROM journal_people WHERE id=? AND manager_id=?)`).bind(c.id,employee,manager),
  ]);
  if(!results[0].results.length)return fail('This connection would create a reporting loop, or the employee already has a manager.');return json({ok:true});
 }
 if(d.action==='disconnect'){
  if(d.employeeId!==me.id){const p=await db.prepare('SELECT id FROM journal_people WHERE id=? AND manager_id=?').bind(d.employeeId,me.id).first();if(!p)return fail('Team member not found.',404);}
  await db.prepare('UPDATE journal_people SET manager_id=NULL WHERE id=? AND (id=? OR manager_id=?)').bind(d.employeeId,me.id,me.id).run();return json({ok:true});
 }
 if(d.action==='review-report'){
  const r=await db.prepare(`UPDATE journal_submissions SET reviewed_at=? WHERE id=? AND manager_id=? AND EXISTS(SELECT 1 FROM journal_people p WHERE p.id=journal_submissions.employee_id AND p.manager_id=?) RETURNING id`).bind(now,d.id,me.id,me.id).all();if(!r.results.length)return fail('Submitted report not found.',404);return json({ok:true});
 }
 if(d.action==='report-feedback'){
  const id=crypto.randomUUID();const result=await db.batch([
   db.prepare(`INSERT INTO journal_report_feedback (id,submission_id,manager_id,employee_id,message,created_at) SELECT ?,s.id,?,s.employee_id,?,? FROM journal_submissions s JOIN journal_people p ON p.id=s.employee_id WHERE s.id=? AND s.manager_id=? AND p.manager_id=? RETURNING id`).bind(id,me.id,d.message,now,d.id,me.id,me.id),
   db.prepare('UPDATE journal_submissions SET reviewed_at=? WHERE id=? AND EXISTS(SELECT 1 FROM journal_report_feedback WHERE id=?)').bind(now,d.id,id),
  ]);if(!result[0].results.length)return fail('This report is not available for your feedback.',404);return json({ok:true});
 }
 if(d.action==='submit-monthly'){
  if(!me.manager_id)return fail('A line manager must be assigned before submitting a monthly review.');
  const es=await ownRecords(me.id),notes=es.find(e=>e.kind==='monthly'&&e.data.month===d.month)?.data||{},summary=monthlySummary(es,d.month,notes);
  if(summary.objectives.some(o=>o.status!=='Achieved'&&!o.reason.trim()))return fail('Explain why each unachieved objective was not completed before submitting.');if(!notes.nextFocus?.trim())return fail('Add your proposed focus for next month before submitting.');
  const metrics={completed:summary.achieved,total:summary.total,issues:summary.observed.length+(notes.limitingFactors?.trim()?1:0)+summary.objectives.filter(o=>o.limitingFactors.trim()).length,highlights:[`${summary.achieved} of ${summary.total} objectives achieved.`,notes.reflection||''].filter(Boolean),objectives:summary.objectives.map(o=>({title:o.title,month:d.month,percent:o.percent,status:o.status})),monthly:summary};
  const saved=await db.prepare("INSERT INTO journal_submissions (id,employee_id,manager_id,start,snapshot,metrics,submitted_at,period_type) SELECT ?,?,?,?,?,?,?,'monthly' WHERE EXISTS(SELECT 1 FROM journal_people WHERE id=? AND manager_id=?)").bind(crypto.randomUUID(),me.id,me.manager_id,d.month+'-01',monthlyText(summary,me.name,me.department),JSON.stringify(metrics),now,me.id,me.manager_id).run();if(!saved.meta.changes)return fail('Your reporting connection changed. Refresh and try again.',409);return json({ok:true});
 }
 if(d.action==='submit-report'){
  const valid=!isNaN(Date.parse(d.start))&&new Date(d.start).toISOString().slice(0,10)===d.start;if(!valid||weekStart(d.start)!==d.start)return fail('Choose a Saturday–Friday week.');
  if(!me.manager_id)return fail('Connect with your line manager before submitting a report.');
  const es=await ownRecords(me.id),notes=es.find(e=>e.kind==='report'&&e.data.start===d.start)?.data||{reportedBy:me.name,department:me.department||'Department not specified'};
  const acts=es.filter(e=>e.kind==='activity'&&e.data.date>=d.start&&e.data.date<=addDays(d.start,6));
  const objectives=es.filter(e=>e.kind==='objective'&&[d.start.slice(0,7),addDays(d.start,6).slice(0,7)].includes(e.data.month));
  const metrics={completed:acts.filter(a=>a.data.status==='done').length,total:acts.length,issues:acts.filter(a=>a.data.challenge||a.data.status==='blocked').length+(notes.challenges?.trim()?1:0),highlights:acts.filter(a=>a.data.outcome&&a.data.status!=='planned').slice(0,2).map(a=>a.data.outcome),objectives:objectives.map(o=>({title:o.data.title,month:o.data.month,percent:Math.round(objectiveProgress(o,es))}))};
  const saved=await db.prepare('INSERT INTO journal_submissions (id,employee_id,manager_id,start,snapshot,metrics,submitted_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM journal_people WHERE id=? AND manager_id=?)').bind(crypto.randomUUID(),me.id,me.manager_id,d.start,weeklyText(es,d.start,notes),JSON.stringify(metrics),now,me.id,me.manager_id).run();
  if(!saved.meta.changes)return fail('Your reporting connection changed. Refresh before submitting.',409);return json({ok:true});
 }
 const raw=await db.prepare('SELECT * FROM journal_records WHERE id=? AND kind=?').bind(d.id,'objective').first<any>();
 if(!raw)return fail('Objective not found.',404);const o={...raw,data:JSON.parse(raw.data)};
 if(o.revision!==d.revision)return fail('This plan changed. Refresh before continuing.',409);
 const employee=await db.prepare('SELECT * FROM journal_people WHERE id=?').bind(o.owner).first<any>();
 if(d.action==='decide-objective'){
  if(o.owner===principalAccountId||employee?.manager_id!==me.id||o.data.submittedTo!==me.id||approval(o)!=='submitted')return fail('This plan is not awaiting your approval.',403);
  if(d.decision!=='approved'&&!d.reason.trim())return fail('Add a reason or suggestions so the employee knows what to improve.');
 } else {
  if(o.owner!==me.id)return fail('Objective not found.',404);
  if(me.id===principalAccountId)return fail('Your objectives are ready to work on without approval.');
  if(d.action==='submit-objective'){
   if(!canEditPlan(o)&&approval(o)!=='legacy')return fail('This objective cannot be submitted in its current state.');
   if(!me.manager_id)return fail('Connect with your line manager before submitting a plan.');
   const es=await ownRecords(me.id);if(!es.some(e=>e.kind==='focus'&&e.data.objectiveId===o.id))return fail('Add at least one focus area and target before submitting.');
  } else if(!['submitted','approved','legacy'].includes(approval(o)))return fail('This plan is already editable.');
 }
 const next={...o.data};let type='';
 if(d.action==='submit-objective'){next.approvalStatus='submitted';next.submittedTo=me.manager_id;next.submittedAt=now;next.feedback='';const history=await ownRecords(me.id);next.approvalCoverage={...annualCoverage(history,o.data.month),selectedKey:strategyKey(o,history)};type='submitted';}
 if(d.action==='revise-objective'){next.approvalStatus='draft';next.feedback='';type='withdrawn';}
 if(d.action==='decide-objective'){next.approvalStatus=d.decision;next.feedback=d.reason;next.decidedAt=now;next.decidedBy=me.id;type=d.decision;}
 const es=await ownRecords(o.owner),snapshot={objective:next,focusAreas:es.filter(e=>e.kind==='focus'&&e.data.objectiveId===o.id).map(e=>e.data),reason:'reason'in d?d.reason:''};
 const authManager=d.action==='decide-objective'?me.id:me.manager_id;
 const authGuard=d.action==='revise-objective'?'':' AND EXISTS(SELECT 1 FROM journal_people WHERE id=? AND manager_id=?)';
 const authArgs=d.action==='revise-objective'?[]:[o.owner,authManager];
 const rev=crypto.randomUUID();const result=await db.batch([
  db.prepare('UPDATE journal_records SET data=?,revision=? WHERE id=? AND revision=?'+authGuard+' RETURNING id').bind(JSON.stringify(next),rev,o.id,o.revision,...authArgs),
  db.prepare('INSERT INTO journal_events (id,owner,manager_id,objective_id,type,payload,at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM journal_records WHERE id=? AND revision=?)').bind(crypto.randomUUID(),o.owner,d.action==='decide-objective'?me.id:(me.manager_id||o.data.submittedTo||''),o.id,type,JSON.stringify(snapshot),now,o.id,rev),
 ]);if(!result[0].results.length)return fail('This plan changed. Refresh before continuing.',409);return json({ok:true});
}
