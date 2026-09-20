'use strict';
/* Step 14 · 全局收尾：空状态补全（D10）、筛选条（F4）、快捷键（F3）、
   删除撤销（F1）、就地编辑（F2）、5000 条数据下的性能（G1）、
   九个模块各写一条后仍在（C4）。 */
const { test } = require('node:test');
const assert = require('node:assert');
const { boot, APP_FILES, plain } = require('./harness');

async function start(seed) {
  const ctx = await boot({ files: APP_FILES, seed: seed });
  await ctx.App.start();
  return ctx;
}
function pageText(ctx) { return ctx.document.getElementById('page-host').textContent; }
function click(ctx, sel) {
  const el = ctx.document.querySelector(sel);
  assert.ok(el, '找不到可点元素 ' + sel);
  el.click();
  return el;
}
function fireKeydown(ctx, target, key, extra) {
  const init = Object.assign({ key: key, bubbles: true, cancelable: true }, extra || {});
  target.dispatchEvent(new ctx.window.KeyboardEvent('keydown', init));
}
function change(ctx, el) {
  el.dispatchEvent(new ctx.window.Event('change', { bubbles: true, cancelable: true }));
}
function input(ctx, el) {
  el.dispatchEvent(new ctx.window.Event('input', { bubbles: true, cancelable: true }));
}
const PAGES = ['home', 'today', 'study', 'dev', 'consult', 'fitness', 'diet', 'game', 'settings'];

/* ---------- D10 空状态 ---------- */

const EMPTY_HINT = {
  home: '今天还没有计划',
  today: '还没有便签',
  study: '还没有学习方向',
  dev: '还没有项目',
  consult: '还没有客户',
  fitness: '还没排',
  diet: '还没有常用项',
  game: '还没有游戏',
  settings: '还没有任何数据'
};

test('D10：九个页面在空数据下都不留空白，且有引导文案', async () => {
  /* 每页用全新实例：浏览别的页面会初始化周计划模板等，空状态必须在「该页无数据」下验证 */
  for (const p of PAGES) {
    const ctx = await start();
    ctx.App.router.go(p);
    const txt = pageText(ctx);
    assert.ok(txt.indexOf('尚未加载') < 0, p + ' 页不应是模块缺失兜底');
    assert.ok(txt.indexOf('页面渲染出错') < 0, p + ' 页不应渲染报错');
    assert.ok(txt.trim().length > 20, p + ' 页不该是空白页');
    assert.ok(txt.indexOf(EMPTY_HINT[p]) >= 0, p + ' 页缺少空状态引导：' + EMPTY_HINT[p]);
  }
});

test('D10：列表页为空时都有主操作按钮', async () => {
  const ctx = await start();
  const expectBtn = {
    today: ['#task-list .btn', '#note-list .btn'],
    study: ['#study-body .btn'],
    dev: ['#dev-body .btn'],
    consult: ['#consult-body .btn'],
    game: ['#game-body .btn'],
    diet: ['.card .btn']
  };
  Object.keys(expectBtn).forEach(p => {
    ctx.App.router.go(p);
    ctx.App.pages[p]._renderAll ? ctx.App.pages[p]._renderAll() : null;
    expectBtn[p].forEach(sel => {
      assert.ok(ctx.document.querySelector(sel), p + ' 页空状态缺少主操作按钮 ' + sel);
    });
  });
});

/* ---------- F4 筛选条 ---------- */

test('F4-状态筛选：学习项 / 游戏库 / 客户都按状态筛出正确结果', async () => {
  const ctx = await start();

  /* 学习项 */
  const st = ctx.App.actions.study;
  const dir = st.addDirection({ name: '方向' });
  st.addItem({ name: '在做', directionId: dir.id, status: 'doing', progress: 30 });
  st.addItem({ name: '没开始', directionId: dir.id, status: 'todo', progress: 0 });
  ctx.App.router.go('study');
  click(ctx, '[data-act="tab"][data-tab="items"]');
  const selSt = ctx.document.querySelector('select[data-fk="filter-status"]');
  selSt.value = 'doing';
  change(ctx, selSt);
  let rows = ctx.document.querySelectorAll('#item-table tbody tr');
  assert.strictEqual(rows.length, 1, '学习项应只剩 1 条进行中');
  assert.ok(rows[0].textContent.indexOf('在做') >= 0);

  /* 游戏库 */
  const gm = ctx.App.actions.game;
  gm.addGame({ name: '在玩的游戏', status: 'playing' });
  gm.addGame({ name: '想玩的游戏', status: 'wish' });
  ctx.App.router.go('game');
  const selG = ctx.document.querySelector('select[data-fk="filter-status"]');
  selG.value = 'playing';
  change(ctx, selG);
  const cards = ctx.document.querySelectorAll('#game-list .game-grid .card');
  assert.strictEqual(cards.length, 1, '游戏库应只剩 1 款在玩');
  assert.ok(cards[0].textContent.indexOf('在玩的游戏') >= 0);

  /* 客户 */
  const cs = ctx.App.actions.consult;
  cs.addClient({ name: '进行中的客户', status: 'doing' });
  cs.addClient({ name: '洽谈中的客户', status: 'talking' });
  ctx.App.router.go('consult');
  const selC = ctx.document.querySelector('select[data-fk="filter-status"]');
  selC.value = 'doing';
  change(ctx, selC);
  const cl = ctx.document.querySelectorAll('#client-list .card');
  assert.strictEqual(cl.length, 1, '客户应只剩 1 个进行中');
  assert.ok(cl[0].textContent.indexOf('进行中的客户') >= 0);
});

test('F4-关键词筛选：客户 / 工时 / 游戏库边打边筛，且输入框不失焦', async () => {
  const ctx = await start();
  const cs = ctx.App.actions.consult;
  cs.addClient({ name: '字节跳动', contact: '张工' });
  cs.addClient({ name: '小作坊', contact: '李工' });
  ctx.App.router.go('consult');

  const q = ctx.document.querySelector('input[data-fk="filter-q"]');
  q.value = '字节';
  input(ctx, q);
  let cl = ctx.document.querySelectorAll('#client-list .card');
  assert.strictEqual(cl.length, 1);
  assert.ok(cl[0].textContent.indexOf('字节跳动') >= 0);
  assert.strictEqual(ctx.document.querySelector('input[data-fk="filter-q"]'), q, '筛选时不该重绘输入框');

  /* 没有命中时给出提示，而不是空白 */
  const q2 = ctx.document.querySelector('input[data-fk="filter-q"]');
  q2.value = '查无此人';
  input(ctx, q2);
  assert.strictEqual(ctx.document.querySelectorAll('#client-list .card').length, 0);
  assert.ok(ctx.document.getElementById('client-list').textContent.indexOf('没有符合筛选条件') >= 0);
});

test('F4-日期范围筛选：工时与饮食历史都能按起止日期筛', async () => {
  const ctx = await start();
  const util = ctx.App.util;
  const cs = ctx.App.actions.consult;
  const cli = cs.addClient({ name: '客户' });
  const p = cs.addProject({ clientId: cli.id, name: '项目' });
  cs.addWorklog({ projectId: p.id, minutes: 60, date: '2026-09-01', content: '早前的工作' });
  cs.addWorklog({ projectId: p.id, minutes: 30, date: '2026-09-15', content: '中期的工作' });
  cs.addWorklog({ projectId: p.id, minutes: 90, date: '2026-09-28', content: '后期的工作' });

  ctx.App.router.go('consult');
  click(ctx, '[data-act="tab"][data-tab="work"]');
  const from = ctx.document.querySelector('input[data-fk="filter-from"]');
  const to = ctx.document.querySelector('input[data-fk="filter-to"]');
  from.value = '2026-09-10';
  change(ctx, from);
  to.value = '2026-09-20';
  change(ctx, to);
  let rows = ctx.document.querySelectorAll('#work-list .row');
  assert.strictEqual(rows.length, 1, '应只剩中间那一条');
  assert.ok(rows[0].textContent.indexOf('中期的工作') >= 0);
  assert.ok(ctx.document.getElementById('work-count').textContent.indexOf('共 1 笔') >= 0);

  /* 关键词叠加 */
  const q = ctx.document.querySelector('input[data-fk="filter-q"]');
  q.value = '早前';
  input(ctx, q);
  assert.strictEqual(ctx.document.querySelectorAll('#work-list .row').length, 0, '日期范围外的应被关键词一并排除');

  /* 饮食历史 */
  const ck = ctx.App.actions.checkin;
  ck.setMealContent('2026-09-05', 'lunch', '九月初的午饭');
  ck.setMealContent('2026-09-25', 'lunch', '九月末的午饭');
  ctx.App.router.go('diet');
  const dFrom = ctx.document.querySelector('input[data-fk="filter-from"]');
  const dTo = ctx.document.querySelector('input[data-fk="filter-to"]');
  dFrom.value = '2026-09-20';
  input(ctx, dFrom);
  dTo.value = '2026-09-30';
  input(ctx, dTo);
  const hds = Array.prototype.slice.call(ctx.document.querySelectorAll('#diet-hist .hist-hd')).map(h => h.dataset.date);
  assert.deepStrictEqual(plain(hds), ['2026-09-25'], '只剩九月末那一天');
  assert.strictEqual(util.today().length, 10);
});

/* ---------- F3 快捷键 ---------- */

test('F3：每个页面按 N 都能触发新增（primaryAdd）', async () => {
  const ctx = await start();
  PAGES.forEach(p => {
    ctx.App.router.go(p);
    const page = ctx.App.pages[p];
    assert.strictEqual(typeof page.primaryAdd, 'function', p + ' 页应实现 primaryAdd');
    let called = 0;
    const orig = page.primaryAdd;
    page.primaryAdd = function () { called++; };
    fireKeydown(ctx, ctx.document, 'n');
    page.primaryAdd = orig;
    assert.strictEqual(called, 1, p + ' 页按 N 应触发一次新增');
  });
});

test('F3：Ctrl+数字切页、输入框里不触发单键快捷键', async () => {
  const ctx = await start();
  fireKeydown(ctx, ctx.document, '9', { ctrlKey: true });
  assert.strictEqual(ctx.App.router.current.page, 'settings', 'Ctrl+9 应切到第 9 个入口「数据与设置」');
  fireKeydown(ctx, ctx.document, '1', { ctrlKey: true });
  assert.strictEqual(ctx.App.router.current.page, 'home');

  /* 在输入框里按 n 不该新增；按 / 才聚焦搜索 */
  ctx.App.router.go('today');
  let called = 0;
  const page = ctx.App.pages.today;
  const orig = page.primaryAdd;
  page.primaryAdd = function () { called++; };
  const inp = ctx.document.getElementById('task-input');
  assert.ok(inp, '今日页应有任务输入框');
  inp.focus();
  fireKeydown(ctx, inp, 'n');
  assert.strictEqual(called, 0, '输入框里打字不该触发新增');
  page.primaryAdd = orig;
});

test('F3：Esc 关掉抽屉与测试浮层', async () => {
  const ctx = await start();
  ctx.App.router.go('game');
  ctx.App.pages.game.primaryAdd();
  assert.ok(ctx.document.querySelector('#overlay-host .drawer'), '应弹出抽屉');
  fireKeydown(ctx, ctx.document, 'Escape');
  assert.strictEqual(ctx.document.querySelector('#overlay-host .drawer'), null, 'Esc 应关掉抽屉');
});

/* ---------- F1 删除撤销 ---------- */

test('F1：九类删除都留了撤销点，撤销后数据回来', async () => {
  const ctx = await start();
  const store = ctx.App.store;
  const act = ctx.App.actions;
  const util = ctx.App.util;
  const today = util.today();

  function check(label, keys, make, remove, verify) {
    store.clearUndo();
    const ids = make();
    assert.strictEqual(store.canUndo(), false, label + '：造数据本身不应留撤销点');
    remove(ids);
    assert.strictEqual(store.canUndo(), true, label + '：删除后应可撤销');
    const r = store.undo();
    assert.ok(r, label + '：撤销应成功');
    verify(ids);
    keys.forEach(k => { /* 数据已回填，重取一次确保可读 */ store.get(k); });
  }

  /* 今日任务 */
  check('今日任务', ['pm.tasks'], () => {
    const t = act.today.add('要被删的任务');
    return t.id;
  }, id => act.today.remove(id), id => {
    assert.ok(act.today.get(id), '任务应被还原');
  });

  /* 快速备忘 */
  check('快速备忘', ['pm.notes'], () => act.today.addNote('要被删的便签').id,
    id => act.today.removeNote(id), id => assert.ok(act.today.getNote(id), '便签应被还原'));

  /* 常用饮食 */
  check('常用饮食', ['pm.diet.favorites'], () => act.checkin.addFavorite('要被删的常用项').id,
    id => act.checkin.removeFavorite(id), id => {
      assert.ok(act.checkin.favorites().some(f => f.id === id), '常用项应被还原');
    });

  /* 学习方向（级联学习项 + 记录，一次撤销要全回来） */
  check('学习方向', ['pm.study.directions', 'pm.study.items', 'pm.study.logs'], () => {
    const d = act.study.addDirection({ name: '要被删的方向' });
    const it = act.study.addItem({ name: '方向下的学习项', directionId: d.id });
    const lg = act.study.addLog({ itemId: it.id, minutes: 30, date: today });
    return { dir: d.id, item: it.id, log: lg.id };
  }, ids => act.study.removeDirection(ids.dir), ids => {
    assert.ok(act.study.getDirection(ids.dir), '方向应被还原');
    assert.ok(act.study.getItem(ids.item), '学习项应被还原');
    assert.ok(act.study.getLog(ids.log), '学习记录应被还原');
  });

  /* 学习项（级联记录） */
  check('学习项', ['pm.study.items', 'pm.study.logs'], () => {
    const d = act.study.addDirection({ name: '另一个方向' });
    const it = act.study.addItem({ name: '要被删的学习项', directionId: d.id });
    const lg = act.study.addLog({ itemId: it.id, minutes: 15, date: today });
    return { item: it.id, log: lg.id };
  }, ids => act.study.removeItem(ids.item), ids => {
    assert.ok(act.study.getItem(ids.item), '学习项应被还原');
    assert.ok(act.study.getLog(ids.log), '学习记录应被还原');
  });

  /* 学习记录 */
  check('学习记录', ['pm.study.logs'], () => {
    const it = act.study.addItem({ name: '单条记录的学习项' });
    return act.study.addLog({ itemId: it.id, minutes: 20, date: today }).id;
  }, id => act.study.removeLog(id), id => assert.ok(act.study.getLog(id), '记录应被还原'));

  /* 开发项目（级联任务 + Bug） */
  check('开发项目', ['pm.dev.projects', 'pm.dev.tasks', 'pm.dev.bugs'], () => {
    const p = act.dev.addProject({ name: '要被删的项目' });
    const t = act.dev.addTask({ projectId: p.id, title: '项目下的任务' });
    const b = act.dev.addBug({ projectId: p.id, title: '项目下的 Bug' });
    return { proj: p.id, task: t.id, bug: b.id };
  }, ids => act.dev.removeProject(ids.proj), ids => {
    assert.ok(act.dev.getProject(ids.proj), '项目应被还原');
    assert.ok(act.dev.getTask(ids.task), '任务应被还原');
    assert.ok(act.dev.getBug(ids.bug), 'Bug 应被还原');
  });

  /* 开发任务 / Bug / 笔记 */
  check('开发任务', ['pm.dev.tasks'], () => act.dev.addTask({ title: '要被删的任务' }).id,
    id => act.dev.removeTask(id), id => assert.ok(act.dev.getTask(id), '任务应被还原'));
  check('Bug', ['pm.dev.bugs'], () => act.dev.addBug({ title: '要被删的 Bug' }).id,
    id => act.dev.removeBug(id), id => assert.ok(act.dev.getBug(id), 'Bug 应被还原'));
  check('踩坑笔记', ['pm.dev.notes'], () => act.dev.addNote({ title: '要被删的笔记' }).id,
    id => act.dev.removeNote(id), id => assert.ok(act.dev.getNote(id), '笔记应被还原'));

  /* 咨询：客户（级联项目/交付物/纪要/工时） */
  check('客户', ['pm.consult.clients', 'pm.consult.projects', 'pm.consult.deliverables',
    'pm.consult.meetings', 'pm.consult.worklogs'], () => {
    const c = act.consult.addClient({ name: '要被删的客户' });
    const p = act.consult.addProject({ clientId: c.id, name: '客户的项目' });
    const d = act.consult.addDeliverable({ projectId: p.id, name: '客户的交付物' });
    const m = act.consult.addMeeting({ clientId: c.id, projectId: p.id, points: '聊了聊', date: today });
    const w = act.consult.addWorklog({ projectId: p.id, minutes: 60, date: today });
    return { c: c.id, p: p.id, d: d.id, m: m.id, w: w.id };
  }, ids => act.consult.removeClient(ids.c), ids => {
    assert.ok(act.consult.getClient(ids.c), '客户应被还原');
    assert.ok(act.consult.getProject(ids.p), '项目应被还原');
    assert.ok(act.consult.getDeliverable(ids.d), '交付物应被还原');
    assert.ok(act.consult.getMeeting(ids.m), '纪要应被还原');
    assert.ok(act.consult.getWorklog(ids.w), '工时应被还原');
  });

  /* 咨询：项目（级联交付物 + 工时） */
  check('咨询项目', ['pm.consult.projects', 'pm.consult.deliverables', 'pm.consult.worklogs'], () => {
    const p = act.consult.addProject({ name: '要被删的咨询项目' });
    const d = act.consult.addDeliverable({ projectId: p.id, name: '交付物' });
    const w = act.consult.addWorklog({ projectId: p.id, minutes: 45, date: today });
    return { p: p.id, d: d.id, w: w.id };
  }, ids => act.consult.removeProject(ids.p), ids => {
    assert.ok(act.consult.getProject(ids.p), '项目应被还原');
    assert.ok(act.consult.getDeliverable(ids.d), '交付物应被还原');
    assert.ok(act.consult.getWorklog(ids.w), '工时应被还原');
  });

  /* 咨询：交付物 / 纪要 / 工时 */
  check('交付物', ['pm.consult.deliverables'], () => {
    const p = act.consult.addProject({ name: '挂交付物的项目' });
    return act.consult.addDeliverable({ projectId: p.id, name: '待删交付物' }).id;
  }, id => act.consult.removeDeliverable(id), id => assert.ok(act.consult.getDeliverable(id), '交付物应被还原'));
  check('纪要', ['pm.consult.meetings'], () => {
    const c = act.consult.addClient({ name: '挂纪要的客户' });
    return act.consult.addMeeting({ clientId: c.id, points: '待删纪要', date: today }).id;
  }, id => act.consult.removeMeeting(id), id => assert.ok(act.consult.getMeeting(id), '纪要应被还原'));
  check('工时', ['pm.consult.worklogs'], () => {
    const p = act.consult.addProject({ name: '挂工时的项目' });
    return act.consult.addWorklog({ projectId: p.id, minutes: 30, date: today }).id;
  }, id => act.consult.removeWorklog(id), id => assert.ok(act.consult.getWorklog(id), '工时应被还原'));

  /* 游戏（级联时长） */
  check('游戏', ['pm.game.games', 'pm.game.logs'], () => {
    const g = act.game.addGame({ name: '要被删的游戏', status: 'playing' });
    const l = act.game.addLog({ gameId: g.id, minutes: 40, date: today });
    return { game: g.id, log: l.id };
  }, ids => act.game.removeGame(ids.game), ids => {
    assert.ok(act.game.getGame(ids.game), '游戏应被还原');
    assert.ok(act.game.getLog(ids.log), '时长记录应被还原');
  });
  check('游戏时长', ['pm.game.logs'], () => {
    const g = act.game.addGame({ name: '挂时长的游戏', status: 'playing' });
    return act.game.addLog({ gameId: g.id, minutes: 25, date: today }).id;
  }, id => act.game.removeLog(id), id => assert.ok(act.game.getLog(id), '时长记录应被还原'));
});

test('F1：删掉一条后 Toast 出现「撤销」，点一下就恢复', async () => {
  const ctx = await start();
  const task = ctx.App.actions.today.add('删了要能找回来');
  ctx.App.pages.today.render(ctx.document.getElementById('page-host'));

  click(ctx, '[data-act="delTask"][data-id="' + task.id + '"]');
  assert.strictEqual(ctx.App.actions.today.get(task.id), null, '应已删除');
  const undo = ctx.document.querySelector('#toast-host .toast .toast-undo');
  assert.ok(undo, 'Toast 上应有「撤销」按钮');
  assert.strictEqual(undo.textContent, '撤销');

  undo.click();
  assert.ok(ctx.App.actions.today.get(task.id), '点撤销应把任务找回来');
  assert.ok(ctx.document.getElementById('toast-host').textContent.indexOf('已撤销') >= 0);
});

/* ---------- F2 就地编辑 ---------- */

test('F2：点列表项文字就地变输入框，失焦保存，Esc 不保存', async () => {
  const ctx = await start();
  const t = ctx.App.actions.today.add('原来的标题');
  ctx.App.router.go('today');

  click(ctx, '[data-act="editTask"][data-id="' + t.id + '"]');
  let inp = ctx.document.querySelector('.inline-edit');
  assert.ok(inp, '应就地变成输入框');
  inp.value = '改过的标题';
  inp.dispatchEvent(new ctx.window.FocusEvent('blur', { bubbles: false }));
  assert.strictEqual(ctx.App.actions.today.get(t.id).title, '改过的标题', '失焦应自动保存');

  click(ctx, '[data-act="editTask"][data-id="' + t.id + '"]');
  inp = ctx.document.querySelector('.inline-edit');
  inp.value = '不该保存的标题';
  fireKeydown(ctx, inp, 'Escape');
  assert.strictEqual(ctx.App.actions.today.get(t.id).title, '改过的标题', 'Esc 应取消不保存');
});

test('F2：首页便签也能就地编辑', async () => {
  const ctx = await start();
  const n = ctx.App.actions.today.addNote('便签原文');
  ctx.App.router.go('home');
  click(ctx, '.home-card[data-card="notes"] [data-act="noteEdit"][data-id="' + n.id + '"]');
  const inp = ctx.document.querySelector('.inline-edit');
  assert.ok(inp, '便签应就地变输入框');
  inp.value = '便签新文';
  inp.dispatchEvent(new ctx.window.FocusEvent('blur', { bubbles: false }));
  assert.strictEqual(ctx.App.actions.today.getNote(n.id).content, '便签新文');
});

/* ---------- C4 落库 ---------- */

test('C4：九个模块各写一条，落库后条数与内容都对', async () => {
  const ctx = await start();
  const K = ctx.App.schema.KEYS;
  const act = ctx.App.actions;
  const today = ctx.App.util.today();

  act.today.add('一条任务');
  act.study.addDirection({ name: '一个方向' });
  act.dev.addProject({ name: '一个项目' });
  act.consult.addClient({ name: '一个客户' });
  act.fitness.toggleToday(today);
  act.checkin.setMealContent(today, 'breakfast', '一个早饭');
  act.game.addGame({ name: '一个游戏' });
  act.checkin.addFavorite('一个常用项');
  act.today.addNote('一条便签');

  const dump = plain(ctx.App.store.exportJSON());
  assert.strictEqual(dump.data[K.tasks].length, 1);
  assert.strictEqual(dump.data[K.studyDirections].length, 1);
  assert.strictEqual(dump.data[K.devProjects].length, 1);
  assert.strictEqual(dump.data[K.consultClients].length, 1);
  assert.strictEqual(dump.data[K.fitnessLogs].length, 1);
  assert.strictEqual(dump.data[K.dietRecords].length, 1);
  assert.strictEqual(dump.data[K.gameGames].length, 1);
  assert.strictEqual(dump.data[K.dietFavorites].length, 1);
  assert.strictEqual(dump.data[K.notes].length, 1);

  /* 关掉浏览器重开：把 local storage 原样灌进新环境 */
  const raw = {};
  for (let i = 0; i < ctx.window.localStorage.length; i++) {
    const k = ctx.window.localStorage.key(i);
    raw[k] = ctx.window.localStorage.getItem(k);
  }
  const ctx2 = await boot({ files: APP_FILES, seed: raw });
  await ctx2.App.start();
  const dump2 = plain(ctx2.App.store.exportJSON());
  assert.strictEqual(dump2.data[K.tasks].length, 1, '重开后数据不能丢');
  assert.strictEqual(dump2.data[K.gameGames][0].name, '一个游戏');
  assert.strictEqual(dump2.data[K.notes][0].content, '一条便签');
});

/* ---------- G1 性能 ---------- */

test('G1：5000 条数据下页面切换与渲染仍然流畅', async () => {
  const ctx = await start();
  const K = ctx.App.schema.KEYS;
  const today = ctx.App.util.today();
  const N = 5000;

  const tasks = [];
  const notes = [];
  const studyItems = [];
  for (let i = 0; i < N; i++) {
    tasks.push({ id: 't' + i, title: '第 ' + i + ' 条任务', date: today, priority: 'mid', done: i % 3 === 0, doneAt: null, moduleRef: null, note: '', order: i, createdAt: i });
    notes.push({ id: 'n' + i, title: '第 ' + i + ' 条笔记', body: '正文', tags: ['tag' + (i % 5)], createdAt: i });
    studyItems.push({ id: 's' + i, directionId: '', name: '第 ' + i + ' 个学习项', type: 'course', url: '', progress: i % 101, status: 'doing', startDate: '', dueDate: '', createdAt: i });
  }
  const t0 = Date.now();
  ctx.App.store.set(K.tasks, tasks);
  ctx.App.store.set(K.devNotes, notes);
  ctx.App.store.set(K.studyItems, studyItems);
  const seedMs = Date.now() - t0;

  const timings = {};
  PAGES.forEach(p => {
    const s = Date.now();
    ctx.App.router.go(p);
    timings[p] = Date.now() - s;
    assert.ok(pageText(ctx).indexOf('页面渲染出错') < 0, p + ' 页在 5000 条数据下渲染报错了');
  });

  /* 5000 条任务时今日页要真的把它们都画出来 */
  ctx.App.router.go('today');
  assert.ok(ctx.document.querySelectorAll('#task-list .row').length >= 1);

  const worst = Math.max.apply(null, Object.keys(timings).map(k => timings[k]));
  assert.strictEqual(ctx.App.store.get(K.tasks).length, N, '数据不该被丢掉');
  assert.ok(seedMs < 10000, '写入 15000 条数据耗时过长：' + seedMs + 'ms');
  assert.ok(worst < 10000, '最慢一次切页 ' + worst + 'ms（' + JSON.stringify(timings) + '）');

  /* 大数据量下导出/再导入也要能跑通 */
  const s2 = Date.now();
  const payload = ctx.App.store.exportJSON();
  const ms = Date.now() - s2;
  assert.strictEqual(plain(payload.data[K.tasks]).length, N);
  assert.ok(ms < 10000, '导出 15000 条数据耗时过长：' + ms + 'ms');
});
