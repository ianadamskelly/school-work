export type Kind = 'objective'|'focus'|'activity'|'routine'|'report'|'strategy'|'monthly'|'strategy-settings';
export type Entry = { id:string; kind:Kind; revision:string; data:Record<string,any> };
export function localDay() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Mogadishu',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function addDays(day:string,n:number) { const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10); }
export function weekStart(day:string) {const d=new Date(day+'T12:00:00Z');return addDays(day,-((d.getUTCDay()+1)%7));}
export function pretty(day:string) {return new Date(day+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});}
export function focusProgress(f:Entry,entries:Entry[]) { const value=entries.filter(e=>e.kind==='activity'&&e.data.focusId===f.id&&e.data.status!=='planned'&&e.data.status!=='blocked').reduce((n,e)=>n+Number(e.data.contribution||0),0);return {value,percent:Math.min(100,100*value/Number(f.data.target))}; }
export function objectiveProgress(o:Entry,entries:Entry[]) {const fs=entries.filter(e=>e.kind==='focus'&&e.data.objectiveId===o.id);const weights=fs.reduce((n,f)=>n+Number(f.data.weight),0);return weights?fs.reduce((n,f)=>n+focusProgress(f,entries).percent*Number(f.data.weight),0)/weights:0;}
export function weeklyText(entries:Entry[],start:string,notes:Record<string,any>={}) {
 const end=addDays(start,6), nextEnd=addDays(start,13);
 const acts=entries.filter(e=>e.kind==='activity'&&e.data.date>=start&&e.data.date<=end).sort((a,b)=>a.data.date.localeCompare(b.data.date));
 const title=(a:Entry)=>{const f=entries.find(f=>f.id===a.data.focusId);const o=f&&entries.find(o=>o.id===f.data.objectiveId);return o?` [${o.data.title} / ${f!.data.title}]`:'';};
 const updates=acts.filter(e=>e.data.status==='done'||e.data.status==='in-progress').map(e=>`- ${pretty(e.data.date)}: ${e.data.title}${e.data.outcome?` — ${e.data.outcome}`:''} (${e.data.type}; ${e.data.status==='done'?'completed':'in progress'})${title(e)}${e.data.evidence?`\n  Evidence: ${e.data.evidence}`:''}`);
 const issues=acts.filter(e=>e.data.challenge||e.data.status==='blocked');
 const challenges=issues.map((e,i)=>`${i+1}. ${e.data.title}: ${e.data.challenge||'Blocked; add the cause and who is affected.'}`);
 const solutions=issues.map((e,i)=>`${i+1}. ${e.data.solution||'No solution recorded yet.'}`);
 const plans=entries.filter(e=>e.kind==='activity'&&e.data.date>end&&e.data.date<=nextEnd&&e.data.status!=='done').sort((a,b)=>a.data.date.localeCompare(b.data.date)).map(e=>`- ${e.data.title} — ${notes.reportedBy||'Ian'}; ${pretty(e.data.date)}`);
 const block=(items:string[],extra:string,empty:string)=>[items.join('\n'),extra||''].filter(Boolean).join('\n\n')||empty;
 return `HIA Weekly Report\nDepartment / campus: ${notes.department||'ICT Department'}\nReported by: ${notes.reportedBy||'Ian'}\nWeek: ${pretty(start)} – ${pretty(end)}\n\nA. Updates\n${block(updates,notes.updates,'No completed or in-progress activities recorded for this week.')}\n\nB. Challenges\n${block(challenges,notes.challenges,'No challenges recorded.')}\n\nC. Recommended solutions\n${block(solutions,notes.solutions,'No recommended solutions recorded.')}\n\nD. Plan for next week\n${block(plans,notes.nextPlan,'No priorities recorded for next week.')}\n\nWork recorded: ${acts.length} activities; ${acts.filter(a=>a.data.status==='done').length} completed.\nPlanned: ${acts.filter(a=>a.data.type==='planned').length} | Recurring: ${acts.filter(a=>a.data.type==='recurring').length} | Unplanned: ${acts.filter(a=>a.data.type==='unplanned').length}\n`;
}
