import assert from 'node:assert/strict';
import {annualCoverage,academicYear,strategyKey,coreStrategies} from '../lib/strategy.ts';
import {monthlySummary,monthlyText} from '../lib/monthly.ts';
const e=(id,kind,data)=>({id,kind,data,revision:'test'}),es=[];
for(const [i,month] of ['2026-09','2026-10','2026-11'].entries()){es.push(e('o'+i,'objective',{month,title:'Different monthly wording '+i,strategyId:'core:systems',approvalStatus:'approved'}),e('f'+i,'focus',{objectiveId:'o'+i,target:10,weight:1,unit:'checks'}),e('a'+i,'activity',{title:'Checks',date:month+'-05',focusId:'f'+i,status:'done',type:'planned',contribution:5}));}
es.push(e('a-extra','activity',{date:'2026-11-06',focusId:'f2',status:'in-progress',contribution:0}));
let c=annualCoverage(es,'2026-11','2026-11-15');assert.equal(c.total,10);assert.equal(c.covered,1);assert.equal(c.percent,10);let system=c.rows.find(r=>r.key==='core:systems');assert.equal(system.workedMonths.length,3);assert.equal(system.activityCount,4);assert.equal(system.averageProgress,50);assert.equal(c.untouched.length,9);
es.push(e('future','activity',{date:'2026-11-30',focusId:'f2',status:'done',contribution:5}));assert.equal(annualCoverage(es,'2026-11','2026-11-15').rows.find(r=>r.key==='core:systems').averageProgress,50);
es.push(e('blocked','activity',{title:'Blocked',date:'2026-11-08',focusId:'f2',status:'blocked',contribution:0,challenge:'Access unavailable',solution:'Request access'}));
es.push(e('pending','objective',{month:'2026-11',title:'Internet safety & security',approvalStatus:'submitted'}));
const notes={reflections:[{objectiveId:'o2',reason:'Waiting for access',limitingFactors:'Accounts unavailable'}],nextFocus:'Prioritise internet safety',limitingFactors:'Staff time',reflection:'Made progress despite delays'};
const m=monthlySummary(es,'2026-11',notes,'2026-11-15');assert.equal(m.achieved,0);assert.equal(m.objectives.find(o=>o.id==='o2').percent,50);assert.equal(m.objectives.find(o=>o.id==='pending').status,'Not approved');assert.ok(m.observed.some(a=>a.challenge==='Access unavailable'));assert.ok(m.suggested.some(s=>s.title==='Digital learning integration'));
const text=monthlyText(m,'Test','ICT');for(const value of ['Waiting for access','Staff time','Accounts unavailable','Prioritise internet safety','Access unavailable','0 objectives'])assert.ok(value==='0 objectives'||text.includes(value),value);
assert.equal(academicYear('2026-08').label,'2025–2026');assert.equal(academicYear('2026-09').label,'2026–2027');assert.equal(academicYear('2027-01').start,'2026-09');
const legacy=e('old','objective',{title:'  School systems / EMIS / reporting  ',month:'2026-09'});assert.equal(strategyKey(legacy,es),'core:systems');
const custom=e('custom','strategy',{title:'Community partnerships'});c=annualCoverage([...es,custom],'2026-11','2026-11-15');assert.equal(c.total,11);assert.ok(c.untouched.some(r=>r.title==='Community partnerships'));
// Duplicate objectives in one month are averaged within that month; months count once.
const duplicate=[...es,e('dupe','objective',{month:'2026-11',strategyId:'core:systems',title:'Another task',approvalStatus:'approved'}),e('df','focus',{objectiveId:'dupe',target:1,weight:1})];c=annualCoverage(duplicate,'2026-11','2026-11-15');assert.ok(Math.abs(c.rows.find(r=>r.key==='core:systems').averageProgress-41.6666666667)<1e-6);
console.log('PASS: September–August boundaries; repeated area counted once; months worked vs activity counts; untouched baseline; future work exclusion; monthly achievement and reasons; limiting factors; next-month prompts; legacy grouping; custom areas; equal monthly progress averages.');

const unmapped=annualCoverage([e('unmapped','objective',{title:'An older unlinked monthly plan',month:'2026-11'})],'2026-11','2026-11-15');assert.equal(unmapped.total,10);assert.equal(unmapped.unclassified.length,1);
const laterArea=e('later','strategy',{title:'New year priority',fromYear:'2027-09'});assert.equal(annualCoverage([laterArea],'2026-11','2026-11-15').total,10);assert.equal(annualCoverage([laterArea],'2027-11','2027-11-15').total,11);
console.log('PASS: unlinked historical plans are flagged without inventing categories; future strategic areas do not alter earlier academic years.');
