import type { Entry } from './journal';
import { localDay,objectiveProgress } from './journal';
export type StrategicArea={key:string;title:string;description?:string};
export function includesCoreStrategies(entries:Entry[]){return !entries.some(e=>e.kind==='strategy-settings'&&e.data.includeCore===false);}
export const coreStrategies=[
 ['systems','School systems / EMIS / reporting'],['learning','Digital learning integration'],['infrastructure','ICT infrastructure development'],['security','Internet safety & security'],['training','ICT staff training / eLearning CPD'],['families','Family engagement through technology'],['media','Website, media & marketing'],['curriculum','IB/international curriculum ICT support'],['library','Digital library / research technology'],['monitoring','ICT monitoring & reporting'],
].map(([id,title])=>({key:'core:'+id,title}));
export function normalized(s:string){return s.trim().toLowerCase().replace(/\s+/g,' ');}
export function strategyKey(o:Entry,entries:Entry[]){if(o.data.strategyId)return o.data.strategyId;const title=normalized(o.data.title);const known=[...(includesCoreStrategies(entries)?coreStrategies:[]),...entries.filter(e=>e.kind==='strategy').map(e=>({key:e.id,title:e.data.title}))].find(s=>normalized(s.title)===title);return known?.key||'legacy:'+title;}
export function catalogue(entries:Entry[],month?:string):StrategicArea[]{return [...(includesCoreStrategies(entries)?coreStrategies:[]),...entries.filter(e=>e.kind==='strategy'&&(!month||!e.data.fromYear||e.data.fromYear<=academicYear(month).start)).map(e=>({key:e.id,title:e.data.title,description:e.data.description}))];}
export function academicYear(month:string){const y=Number(month.slice(0,4))-(Number(month.slice(5,7))<9?1:0);return {start:`${y}-09`,end:`${y+1}-08`,label:`${y}–${y+1}`};}
export function monthEnd(month:string){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);}
export function annualCoverage(entries:Entry[],month:string,today=localDay()){
 const year=academicYear(month),asOf=[today,monthEnd(month)].sort()[0];
 const objective=entries.filter(e=>e.kind==='objective'&&e.data.month>=year.start&&e.data.month<=year.end);
 const dated=entries.filter(e=>e.kind!=='activity'||e.data.date<=asOf);
 const rows=catalogue(entries,month).map(s=>{const plans=objective.filter(o=>strategyKey(o,entries)===s.key);const focusIds=new Set(entries.filter(e=>e.kind==='focus'&&plans.some(o=>o.id===e.data.objectiveId)).map(e=>e.id));const work=entries.filter(e=>e.kind==='activity'&&focusIds.has(e.data.focusId)&&['done','in-progress'].includes(e.data.status)&&e.data.date>=year.start+'-01'&&e.data.date<=asOf&&e.data.date<=monthEnd(year.end));const months=[...new Set(work.map(e=>e.data.date.slice(0,7)))].sort();const approved=plans.filter(o=>o.data.month<=month&&['approved','legacy'].includes(o.data.approvalStatus||'legacy'));
 const progressByMonth=new Map<string,number[]>();for(const o of approved){const values=progressByMonth.get(o.data.month)||[];values.push(objectiveProgress(o,dated));progressByMonth.set(o.data.month,values);}const monthlyProgress=[...progressByMonth.values()].map(v=>v.reduce((a,b)=>a+b,0)/v.length);
 return {...s,plannedMonths:[...new Set(approved.filter(o=>o.data.month<=month).map(o=>o.data.month))].sort(),workedMonths:months,activityCount:work.length,lastWorked:work.map(e=>e.data.date).sort().at(-1)||null,averageProgress:monthlyProgress.length?monthlyProgress.reduce((a,b)=>a+b,0)/monthlyProgress.length:0};});
 const covered=rows.filter(r=>r.workedMonths.length>0).length;
 const unclassified=objective.filter(o=>!rows.some(r=>r.key===strategyKey(o,entries))).map(o=>({id:o.id,title:o.data.title,month:o.data.month}));
 return {year,asOf,unclassified,rows,covered,total:rows.length,percent:rows.length?Math.round(covered/rows.length*100):0,untouched:rows.filter(r=>!r.workedMonths.length),leastCovered:rows.filter(r=>r.workedMonths.length).sort((a,b)=>a.workedMonths.length-b.workedMonths.length||a.lastWorked!.localeCompare(b.lastWorked!))};
}
export function coverageText(c:ReturnType<typeof annualCoverage>){return `Academic year ${c.year.label}; as of ${c.asOf}\nStrategic areas worked on: ${c.covered}/${c.total} (${c.percent}%). This measures attention, not completion.\n${c.rows.map(r=>`- ${r.title}: ${r.workedMonths.length} month(s) worked; ${r.plannedMonths.length} month(s) planned; ${Math.round(r.averageProgress)}% average monthly target progress`).join('\n')}\nNot yet worked: ${c.untouched.map(r=>r.title).join('; ')||'None'}`;}
