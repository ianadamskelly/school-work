/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness loads transpiled real server modules. */
// Executes the real TypeScript data layer and actions against disposable data.
// Only Next's request cookie/cache/redirect adapters are replaced; auth, SQL,
// ownership checks, transactions and file handling remain the application code.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(require('os').tmpdir(), 'school-work-regression-'));
process.chdir(fixture);
const cache = new Map();
const cookieValues = new Map();
const jar = { get: name => cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined, set: (name, value) => cookieValues.set(name, value), delete: name => cookieValues.delete(name) };
function load(name) {
  const filename = path.join(root, 'src/lib', name + '.ts');
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(root); cache.set(filename, m);
  const original = m.require.bind(m);
  m.require = request => {
    if (request === 'next/headers') return { cookies: async () => jar };
    if (request === 'next/cache') return { revalidatePath() {} };
    if (request === 'next/navigation') return { redirect(url) { throw Object.assign(new Error('Redirect ' + url), { redirect: url }); } };
    if (request.startsWith('./') && fs.existsSync(path.resolve(path.dirname(filename), request + '.ts'))) return load(request.slice(2));
    return original(request);
  };
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
  return m.exports;
}
const results = [];
async function test(name, fn) { try { await fn(); results.push({ name, status: 'PASS' }); console.log('PASS', name); } catch (e) { results.push({ name, status: 'FAIL', error: e.message }); console.error('FAIL', name, e); } }
async function action(name, fields) {
  const form = new FormData(); for (const [key, value] of Object.entries(fields)) form.set(key, value instanceof File ? value : String(value));
  try { await load('actions')[name](form); return ''; } catch (e) { if (e.redirect) return e.redirect; throw e; }
}
async function run() {
  let db = load('db').getDb();
  const strategy = db.prepare('SELECT id FROM objectives WHERE manager_id=2 LIMIT 1').get().id;
  const plan = Number(db.prepare('INSERT INTO monthly_plans(user_id,year,month,objective_id,status) VALUES(3,2026,10,?,?)').run(strategy, 'approved').lastInsertRowid);
  db.prepare('INSERT INTO monthly_plan_objectives(plan_id,objective_id) VALUES(?,?)').run(plan, strategy);
  for (const title of ['Audit 40 devices', 'Train 12 teachers']) {
    const id = Number(db.prepare('INSERT INTO monthly_objectives(plan_id,title,intended_outcome) VALUES(?,?,?)').run(plan, title, 'QA target').lastInsertRowid);
    db.prepare('INSERT INTO monthly_objective_strategic_links VALUES(?,?)').run(id, strategy);
    db.prepare('INSERT INTO monthly_focus_areas(monthly_objective_id,title) VALUES(?,?)').run(id, 'QA focus');
  }
  await test('QA-01 modern objectives survive restart without duplicates', async () => {
    db.close(); cache.clear(); db = load('db').getDb();
    assert.equal(db.prepare('SELECT COUNT(*) n FROM monthly_objectives WHERE plan_id=? AND archived=0').get(plan).n, 2);
  });
  await test('QA-01 legacy objectives retained and untouched generated duplicates archived', async () => {
    const o = db.prepare('SELECT * FROM objectives WHERE id=?').get(strategy);
    db.prepare('INSERT INTO monthly_objectives(plan_id,legacy_strategic_objective_id,title,intended_outcome) VALUES(?,?,?,?)').run(plan, strategy, o.title, o.description);
    db.close(); cache.clear(); db = load('db').getDb();
    assert.equal(db.prepare('SELECT archived FROM monthly_objectives WHERE legacy_strategic_objective_id=?').get(strategy).archived, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM monthly_objectives WHERE plan_id=? AND archived=0').get(plan).n, 2);
  });
  await load('auth').createSession(3);
  await test('QA-02 create objective-linked work', async () => {
    const focus = db.prepare('SELECT id FROM monthly_focus_areas LIMIT 1').get().id;
    await action('createWorkItem', { title: 'Audit classroom C3', work_type: 'planned', status: 'in_progress', monthly_focus_area_id: focus });
    assert.ok(db.prepare('SELECT id FROM work_items WHERE title=? AND monthly_focus_area_id=?').get('Audit classroom C3', focus));
  });
  const item = db.prepare('SELECT id FROM work_items WHERE title=?').get('Audit classroom C3').id;
  const fields = {year:2026,month:10,week_of_month:1,intent:'draft',tasks_completed:'Significant progress'};
  await test('QA-03 weekly objective progress persists across draft saves', async () => {
    await action('saveWeeklySummary', {...fields, ['objective_progress_'+strategy]:37});
    await action('saveWeeklySummary', fields);
    assert.equal(db.prepare('SELECT progress_percent FROM weekly_objective_progress LIMIT 1').get().progress_percent,37);
  });
  await action('addWorkUpdate',{work_item_id:item,text:'Audited 10 of 40 devices',status:'completed',update_date:'2026-10-05'});
  let summary;
  await test('QA-04 and QA-05 submitted reports are locked and frozen', async () => {
    await action('saveWeeklySummary',{...fields,intent:'submit'});
    summary=db.prepare('SELECT * FROM weekly_summaries WHERE user_id=3 LIMIT 1').get();
    assert.match(await action('saveWeeklySummary',{...fields,tasks_completed:'Tampered'}),/error=locked/);
    assert.equal(db.prepare('SELECT tasks_completed FROM weekly_summaries WHERE id=?').get(summary.id).tasks_completed,'Significant progress');
    const before=JSON.stringify(load('work').reportData(3,2026,10,1));
    await action('addWorkUpdate',{work_item_id:item,text:'Later revision',status:'blocked',update_date:'2026-10-06'});
    assert.equal(JSON.stringify(load('work').reportData(3,2026,10,1)),before);
    assert.match(before,/Audited 10 of 40 devices/);
  });
  await test('QA-08 quick work updates appear in unified daily history', async () => {
    assert.ok(load('work').dailyUpdates(3,'2026-10-01','2026-10-31').some(x=>x.outcome==='Later revision'));
  });
  await test('QA-11 explicit focus progress does not count tasks as whole outcomes', async () => {
    const focus=db.prepare('SELECT id FROM monthly_focus_areas LIMIT 1').get().id;
    await action('updateFocusProgress',{focus_id:focus,progress_percent:25});
    assert.equal(load('planning').objectiveProgress(load('planning').getMonthlyWorkObjectives(plan)[0]),25);
    await action('updateFocusProgress',{focus_id:focus,progress_percent:101});
    assert.equal(db.prepare('SELECT progress_percent FROM monthly_focus_areas WHERE id=?').get(focus).progress_percent,25);
  });
  await test('QA-14 invalid evidence never creates a partial daily update', async () => {
    const count=db.prepare('SELECT COUNT(*) n FROM work_updates').get().n;
    assert.match(await action('addDailyLog',{activity:'Invalid evidence',log_date:'2026-10-06',evidence:new File(['bad'],'bad.exe',{type:'application/octet-stream'})}),/file_type/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM work_updates').get().n,count);
    assert.match(await action('addWorkUpdate',{text:'Too big',evidence:new File([new Uint8Array(10*1024*1024+1)],'big.pdf',{type:'application/pdf'})}),/file_size/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM work_updates').get().n,count);
  });
  await action('addDailyLog',{activity:'Evidence audit',log_date:'2026-10-15',status:'In Progress',hours:1,evidence:new File(['QA PDF'],'audit.pdf',{type:'application/pdf'})});
  const daily=db.prepare('SELECT wu.id,wu.work_item_id,wu.legacy_daily_log_id FROM work_updates wu JOIN daily_logs dl ON dl.id=wu.legacy_daily_log_id WHERE dl.activity=?').get('Evidence audit');
  await test('QA-10 daily and work status changes synchronize in both directions', async () => {
    await action('setWorkStatus',{id:daily.work_item_id,status:'completed'});
    assert.equal(db.prepare('SELECT status FROM daily_logs WHERE id=?').get(daily.legacy_daily_log_id).status,'Completed');
    await action('setDailyStatus',{update_id:daily.id,status:'In Progress'});
    assert.equal(db.prepare('SELECT status,completed_at FROM work_items WHERE id=?').get(daily.work_item_id).status,'in_progress');
    assert.equal(db.prepare('SELECT completed_at FROM work_items WHERE id=?').get(daily.work_item_id).completed_at,null);
  });
  await test('QA-15 unused evidence files are removed and report history is protected', async () => {
    const evidence=db.prepare('SELECT stored_name FROM work_evidence WHERE work_update_id=?').get(daily.id);
    const target=path.join(fixture,'data/evidence',evidence.stored_name);
    assert.ok(fs.existsSync(target));
    await action('deleteDailyLog',{update_id:daily.id});
    assert.ok(!fs.existsSync(target));
    assert.ok(!db.prepare('SELECT 1 FROM work_evidence WHERE work_update_id=?').get(daily.id));
    const recorded=JSON.parse(summary.activity_snapshot)[0].items[0].id;
    assert.match(await action('deleteDailyLog',{update_id:recorded}),/error=reported/);
    assert.ok(db.prepare('SELECT id FROM work_updates WHERE id=?').get(recorded));
  });
  await test('QA-18 recurring schedules generate independent idempotent occurrences',async()=>{
    await action('createWorkItem',{title:'Weekly network review',work_type:'recurring',recurrence:'weekly',due_date:'2026-10-05',status:'completed'});
    load('work').ensureRecurringWork(3,'2026-10-06');load('work').ensureRecurringWork(3,'2026-10-06');
    const rows=db.prepare('SELECT due_date,status FROM work_items WHERE title=? ORDER BY due_date').all('Weekly network review');
    assert.deepEqual(rows,[{due_date:'2026-10-05',status:'completed'},{due_date:'2026-10-12',status:'planned'}]);
  });
  await test('QA-19 report period ends respect month length and leap years',async()=>{
    assert.equal(load('work').reportingPeriod(2026,2,4).end,'2026-02-28');
    assert.equal(load('work').reportingPeriod(2028,2,4).end,'2028-02-29');
    assert.equal(load('work').reportingPeriod(2026,4,4).end,'2026-04-30');
    assert.throws(()=>load('work').reportingPeriod(2026,13,4));
  });
  await test('Carry-forward copies agreed focus outcomes into an approval-required draft once',async()=>{
    const source=db.prepare('SELECT id FROM monthly_objectives WHERE plan_id=? AND archived=0 ORDER BY id').get(plan).id;
    await action('carryMonthlyObjective',{source_id:source,year:2026,month:11});
    await action('carryMonthlyObjective',{source_id:source,year:2026,month:11});
    const rows=db.prepare('SELECT mo.id,mp.status,mp.submitted_at FROM monthly_objectives mo JOIN monthly_plans mp ON mp.id=mo.plan_id WHERE mo.carried_from_id=?').all(source);
    assert.equal(rows.length,1);assert.equal(rows[0].status,'proposed');assert.equal(rows[0].submitted_at,null);
    assert.equal(db.prepare('SELECT progress_percent FROM monthly_focus_areas WHERE monthly_objective_id=?').get(rows[0].id).progress_percent,25);
  });
  await load('auth').createSession(2);
  await test('QA-04 manager approval locks report and changes cannot reopen approved reports',async()=>{
    await action('approveWeeklySummary',{summary_id:summary.id,manager_comment:'Verified devices audited'});
    assert.equal(db.prepare('SELECT status FROM weekly_summaries WHERE id=?').get(summary.id).status,'seen');
    assert.match(await action('requestWeeklySummaryChanges',{summary_id:summary.id,manager_comment:'Overwrite approved'}),/error=status/);
  });
  await load('auth').createSession(1);
  await test('Template rename and description update are persisted',async()=>{
    const template=db.prepare('SELECT id FROM templates LIMIT 1').get().id;
    await action('updateTemplate',{template_id:template,name:'ICT operations QA',description:'Maintain reliable devices and classroom support'});
    assert.equal(db.prepare('SELECT name FROM templates WHERE id=?').get(template).name,'ICT operations QA');
  });
  await test('QA-06 last active administrator cannot be demoted or deactivated',async()=>{
    assert.match(await action('updateUser',{id:1,role:'employee',active:'on'}),/last_admin/);
    assert.match(await action('updateUser',{id:1,role:'admin'}),/last_admin/);
    assert.deepEqual(db.prepare('SELECT role,active FROM users WHERE id=1').get(),{role:'admin',active:1});
  });
  await test('QA-13 active reports must be reassigned before manager demotion',async()=>{
    assert.match(await action('updateUser',{id:2,role:'employee',active:'on'}),/error=reports/);
    assert.equal(db.prepare('SELECT role FROM users WHERE id=2').get().role,'manager');
  });
  await test('QA-12 resetting a password revokes old sessions',async()=>{
    await load('auth').createSession(3);const previous=new Map(cookieValues);
    await load('auth').createSession(1);
    await action('updateUser',{id:3,role:'employee',manager_id:2,active:'on',new_password:'RegressionReset42!'});
    cookieValues.clear();for(const [k,v] of previous)cookieValues.set(k,v);
    assert.equal(await load('auth').getSessionUser(),null);
    await load('auth').createSession(3);assert.equal((await load('auth').getSessionUser()).id,3);
  });
  db.close();
  fs.writeFileSync(path.join(fixture, 'results.json'), JSON.stringify(results, null, 2));
  console.log('Fixture:', fixture); if (results.some(x => x.status === 'FAIL')) process.exitCode = 1;
}
run().catch(e => { console.error(e); process.exitCode = 1; });
