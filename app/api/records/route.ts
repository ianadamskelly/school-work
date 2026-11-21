import { z } from 'zod';
import { body, database, fail, json, ownRecords, staffAccess } from '../../../lib/server';
import { canEditPlan, canWork, noApprovalRequired, principalAccountId } from '../../../lib/workflow';
import { catalogue,normalized,academicYear } from '../../../lib/strategy';
import { weekStart,localDay } from '../../../lib/journal';
export const dynamic='force-dynamic';
const short=z.string().trim().min(1).max(300);
const note=z.string().max(10000).default('');
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'Enter a valid date');
const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const reference=z.string().max(200).default('');
const schemas={
 strategy:z.object({title:short,fromYear:z.string().regex(/^\d{4}-09$/).optional()}),
 monthly:z.object({month,reflections:z.array(z.object({objectiveId:short,reason:note,limitingFactors:note})).max(100),limitingFactors:note,reflection:note,nextFocus:note}),
 objective:z.object({title:short,month,description:note,strategyId:z.string().max(400).default('')}),
 focus:z.object({title:short,objectiveId:short,target:z.number().finite().positive().max(1000000),unit:short,weight:z.number().finite().positive().max(10000)}),
 activity:z.object({title:short,date,type:z.enum(['planned','recurring','unplanned']),status:z.enum(['planned','in-progress','done','blocked']),focusId:reference,contribution:z.number().finite().min(0).max(1000000).default(0),outcome:note,evidence:note,challenge:note,solution:note,minutes:z.number().int().min(0).max(1440).default(0),routineId:reference}),
 routine:z.object({title:short,frequency:z.enum(['Daily','Weekly','As needed']),focusId:reference}),
 report:z.object({start:date,department:short,reportedBy:short,updates:note,challenges:note,solutions:note,nextPlan:note}),
};

export async function GET(){const me=await staffAccess();if(me instanceof Response)return me;return json(await ownRecords(me.id));}
export async function POST(req:Request){
 const me=await staffAccess();if(me instanceof Response)return me;
 const envelope=z.object({action:z.enum(['save','delete']),id:z.string().max(200).optional(),kind:z.enum(['objective','focus','activity','routine','report','strategy','monthly']),revision:z.string().max(200).optional(),data:z.unknown()});
 let payload;try{payload=envelope.safeParse(await body(req));}catch{return fail('Invalid request or origin.');}
 if(!payload.success)return fail('Invalid operation.');const {action,id,kind,revision,data}=payload.data;
 const db=database(),es=await ownRecords(me.id),old=es.find(r=>r.id===id);
 if(id&&!old)return fail('This entry no longer exists. Refresh and try again.',404);
 if(old&&(old.kind!==kind||old.revision!==revision))return fail('This entry changed in another tab. Refresh before editing again.',409);
 let d:Record<string,any>={};
 if(action==='save'){const p=schemas[kind].safeParse(data);if(!p.success)return fail(p.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));d=p.data;}
 if(kind==='focus'&&action==='save'&&old)d={...old.data,...d};
 const find=(ref:string,k:string)=>es.find(r=>r.id===ref&&r.kind===k);
 let parent:typeof old;
 if(kind==='objective'&&old&&!canEditPlan(old))return fail('Choose Revise plan before changing a submitted, approved, or existing objective.');
 if(kind==='objective'&&action==='save'&&d.strategyId&&!catalogue(es,d.month).some(s=>s.key===d.strategyId))return fail('Choose one of your strategic areas.');
 if(kind==='strategy'){if(action==='save')d.fromYear=old?.data.fromYear||d.fromYear||academicYear(localDay().slice(0,7)).start;if(action==='delete')return fail('Strategic areas are retained so annual coverage stays consistent.');if(catalogue(es).some(s=>s.key!==id&&normalized(s.title)===normalized(d.title)))return fail('This strategic area is already in your list.');}
 if(kind==='monthly'&&action==='save'){if(es.some(r=>r.kind==='monthly'&&r.id!==id&&r.data.month===d.month))return fail('A monthly review already exists. Refresh to load it.',409);if(d.reflections.some((r:any)=>!es.some(o=>o.id===r.objectiveId&&o.kind==='objective'&&o.data.month===d.month)))return fail('Monthly reflections must refer to your objectives in that month.');}
 if(kind==='objective'&&action==='save')d={...old?.data,...d,approvalStatus:me.id===principalAccountId?noApprovalRequired:old?.data.approvalStatus||'draft'};
 if(kind==='focus'){
  const objectiveId=action==='delete'?old?.data.objectiveId:d.objectiveId;parent=find(objectiveId,'objective');
  if(!parent)return fail('Choose an objective you own.');if(!canEditPlan(parent))return fail('Revise the objective before changing its focus areas.');
  if(old&&action==='save'&&old.data.objectiveId!==d.objectiveId)return fail('Create a new focus area instead of moving one between objectives.');
 }
 if(action==='delete'){
  if(!old)return fail('Entry not found.',404);
  if(es.some(r=>r.data.objectiveId===id||r.data.focusId===id||r.data.routineId===id))return fail('This entry has linked records. Remove or reassign those records first.');
 }else{
  if((kind==='activity'||kind==='routine')&&d.focusId){const f=find(d.focusId,'focus');if(!f)return fail('Choose a focus area you own.');parent=find(f.data.objectiveId,'objective');if(!canWork(parent))return fail('Your line manager must approve this objective before you can record work against it.');}
  if(kind==='activity'){
   if(d.routineId&&!find(d.routineId,'routine'))return fail('Recurring template not found.');
   if(d.contribution>0&&(!d.focusId||['planned','blocked'].includes(d.status)))return fail('Progress needs a focus area and work marked in progress or completed.');
   if(parent&&parent.data.month!==d.date.slice(0,7))return fail('The activity date must fall in the linked objective’s month.');
  }
  if(kind==='report'){
   if(weekStart(d.start)!==d.start)return fail('The report week must start on Saturday.');
   if(es.some(r=>r.kind==='report'&&r.id!==id&&r.data.start===d.start))return fail('A report for this week already exists. Refresh to load it.',409);
  }
  if(old&&kind==='objective'&&old.data.month!==d.month&&es.some(r=>r.kind==='focus'&&r.data.objectiveId===id))return fail('The month cannot change while this objective has focus areas.');
 }
 const next={id:old?.id||crypto.randomUUID(),kind,data:d,revision:crypto.randomUUID()};
 const statements:D1PreparedStatement[]=[];
 // Focus edits and plan submissions share the parent revision, so a concurrent
 // submission cannot approve a target that changed while it was being submitted.
 let guard='',guardArgs:string[]=[];
 if(parent){
  if(kind==='focus'){
   const token=crypto.randomUUID();statements.push(db.prepare('UPDATE journal_records SET revision=? WHERE id=? AND owner=? AND revision=?').bind(token,parent.id,me.id,parent.revision));
   guard=' AND EXISTS(SELECT 1 FROM journal_records WHERE id=? AND owner=? AND revision=?)';guardArgs=[parent.id,me.id,token];
  }else{guard=' AND EXISTS(SELECT 1 FROM journal_records WHERE id=? AND owner=? AND revision=?)';guardArgs=[parent.id,me.id,parent.revision];}
 }
 if(kind==='monthly'&&action==='save'){guard+=" AND NOT EXISTS(SELECT 1 FROM journal_records WHERE owner=? AND kind='monthly' AND json_extract(data,'$.month')=? AND id!=?)";guardArgs.push(me.id,d.month,next.id);}
 if(action==='delete')statements.push(db.prepare('DELETE FROM journal_records WHERE id=? AND owner=? AND revision=?'+guard+' RETURNING id').bind(old!.id,me.id,old!.revision,...guardArgs));
 else if(old)statements.push(db.prepare('UPDATE journal_records SET data=?,revision=? WHERE id=? AND owner=? AND revision=?'+guard+' RETURNING id').bind(JSON.stringify(d),next.revision,old.id,me.id,old.revision,...guardArgs));
 else statements.push(db.prepare('INSERT INTO journal_records (id,owner,kind,data,revision) SELECT ?,?,?,?,? WHERE 1=1'+guard+' RETURNING id').bind(next.id,me.id,kind,JSON.stringify(d),next.revision,...guardArgs));
 const result=await db.batch(statements);if(!result[result.length-1].results.length)return fail('This entry or plan changed. Refresh and try again.',409);
 return json(action==='delete'?{ok:true}:next);
}
