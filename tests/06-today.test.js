'use strict';
/* Step 5 · 今日：三栏布局、计划增删改拖、快速备忘、打卡、今日记录、日期切换补记。
   对应 PRD 验收：D1（今日计划）、D7 前半（健身打卡）、D8 前半（饮食打卡）、D11（首页联动取数）。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot, APP_FILES, ROOT, plain } = require('./harness');

async function startToday(seed) {
  const ctx = await boot({ files: APP_FILES, seed: seed });
  await ctx.App.start();
  ctx.App.router.go('today');
  return ctx;
}

/* 只取列表里的一级行，避免命中行内的勾选/操作小图标（它们也带 data-id） */
function rowIds(ctx) {
  return Array.prototype.slice.call(ctx.document.querySelectorAll('#task-list > .row[data-id]'))
    .map(r => r.dataset.id);
}
function fire(win, el, type, opts) {
  el.dispatchEvent(new win.Event(type, Object.assign({ bubbles: true, cancelable: true }, opts || {})));
}
function enter(win, el) {
  el.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

/* ---------- 布局 ---------- */

test('今日：三栏结构 + 日期导航 + 两个输入口就位（Step 5 布局）', async () => {
  const ctx = await startToday();
  const cols = ctx.document.querySelector('.cols-today');
  assert.ok(cols, '应存在三栏容器 .cols-today');
  assert.strictEqual(cols.children.length, 3, '今日应为三栏');
  assert.ok(ctx.document.querySelector('.datenav'), '应有日期导航');
  assert.ok(ctx.document.getElementById('task-input'), '应有计划输入框');
  assert.ok(ctx.document.getElementById('note-input'), '应有备忘输入框');
  assert.ok(ctx.document.getElementById('checkin-box'), '应有打卡区');
  assert.ok(ctx.document.querySelector('.page-head h2').textContent.indexOf('今日') >= 0);
});

/* ---------- D1 今日计划 ---------- */

test('D1：敲回车新增一条，标题去空白并落库（含输入框清空）', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const inp = ctx.document.getElementById('task-input');
  inp.value = '  写完 Step 5 测试  ';
  enter(ctx.window, inp);

  const list = App.actions.today.list(App.util.today());
  assert.strictEqual(list.length, 1, '应新增 1 条');
  assert.strictEqual(list[0].title, '写完 Step 5 测试', '标题应去掉首尾空白');
  assert.strictEqual(list[0].done, false);
  assert.strictEqual(list[0].priority, 'mid', '默认优先级为中');
  assert.strictEqual(inp.value, '', '回车后输入框应清空');
  assert.ok(ctx.document.querySelector('#task-list').textContent.indexOf('写完 Step 5 测试') >= 0);
  assert.ok(ctx.document.getElementById('task-count').textContent.indexOf('已完成 0 / 1') >= 0);
});

test('D1：空标题（含纯空格）不新增', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  assert.strictEqual(App.actions.today.add(''), null);
  assert.strictEqual(App.actions.today.add('    '), null);
  assert.strictEqual(App.actions.today.add(null), null);
  assert.strictEqual(App.actions.today.list(App.util.today()).length, 0);
});

test('D1：勾选后置为已完成并记录完成时间，行加 done 样式，再点可取消', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const t = App.actions.today.add('背单词 30 分钟');
  ctx.App.pages.today.refresh();

  let row = ctx.document.querySelector('#task-list > .row[data-id="' + t.id + '"]');
  assert.ok(row, '任务行应已渲染');
  assert.ok(!row.classList.contains('done'), '未完成不应有 done');

  row.querySelector('[data-act="toggle"]').click();
  const after = App.actions.today.get(t.id);
  assert.strictEqual(after.done, true, '勾选后 done 应为 true');
  assert.ok(after.doneAt, '应记录完成时间');
  assert.ok(ctx.document.querySelector('#task-list > .row[data-id="' + t.id + '"]').classList.contains('done'));
  assert.ok(ctx.document.getElementById('task-count').textContent.indexOf('已完成 1 / 1') >= 0);

  ctx.document.querySelector('#task-list > .row[data-id="' + t.id + '"] [data-act="toggle"]').click();
  assert.strictEqual(App.actions.today.get(t.id).done, false, '再点应取消');
  assert.strictEqual(App.actions.today.get(t.id).doneAt, null, '取消后完成时间应清空');
});

test('D1：拖拽排序生效，DOM 与存储顺序一致', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const a = App.actions.today.add('第一');
  const b = App.actions.today.add('第二');
  const c = App.actions.today.add('第三');
  ctx.App.pages.today.refresh();
  assert.deepStrictEqual(plain(rowIds(ctx)), [a.id, b.id, c.id], '初始按新增顺序');

  const rowC = ctx.document.querySelector('#task-list > .row[data-id="' + c.id + '"]');
  const rowA = ctx.document.querySelector('#task-list > .row[data-id="' + a.id + '"]');
  assert.ok(rowC.getAttribute('draggable') === 'true', '任务行应可拖拽');
  fire(ctx.window, rowC, 'dragstart');
  fire(ctx.window, rowA, 'dragover');
  fire(ctx.window, rowA, 'drop');

  assert.deepStrictEqual(plain(rowIds(ctx)), [c.id, a.id, b.id], 'DOM 顺序应变为 第三/第一/第二');
  const sortedIds = App.actions.today.sorted(App.util.today()).map(t => t.id);
  assert.deepStrictEqual(plain(sortedIds), [c.id, a.id, b.id], '落库顺序应与 DOM 一致');
});

test('D1：优先级高的排在前面（同一天内）', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const low = App.actions.today.add('低优先级', { priority: 'low' });
  const high = App.actions.today.add('高优先级', { priority: 'high' });
  const mid = App.actions.today.add('中优先级', { priority: 'mid' });
  const ids = App.actions.today.sorted(App.util.today()).map(t => t.id);
  assert.deepStrictEqual(plain(ids), [high.id, mid.id, low.id]);
});

test('D1：顺延到明天 —— 今天消失、明天的列表里出现', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const d = App.util.today();
  const d2 = App.util.addDays(d, 1);
  const t = App.actions.today.add('今天没做完', { date: d });
  ctx.App.pages.today.refresh();

  ctx.document.querySelector('#task-list > .row[data-id="' + t.id + '"] [data-act="tomorrow"]').click();
  assert.strictEqual(App.actions.today.get(t.id).date, d2, '日期应变成明天');
  assert.strictEqual(App.actions.today.list(d).length, 0, '今天应消失');
  assert.strictEqual(App.actions.today.list(d2).length, 1, '明天应出现');
  assert.ok(ctx.document.getElementById('task-list').textContent.indexOf('今天没做完') < 0,
    '当前（今天）视图不应再显示它');
});

test('D1：日期切换（补记）—— 标题跟随变化并能看到别的日期内容', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const d = App.util.today();
  const d1 = App.util.addDays(d, -1);
  App.actions.today.add('昨天的事', { date: d1 });
  ctx.App.pages.today.refresh();

  const before = ctx.document.querySelector('.dn-txt').textContent;
  ctx.document.querySelector('[data-act="prevDay"]').click();
  const after = ctx.document.querySelector('.dn-txt').textContent;
  assert.notStrictEqual(after, before, '切日期后标题应变化');
  assert.ok(after.indexOf('补记') >= 0, '非今天应标记「补记」');
  assert.ok(ctx.document.getElementById('task-list').textContent.indexOf('昨天的事') >= 0,
    '应显示昨天的任务');
  assert.strictEqual(App.pages.today._state.date, d1, '内部日期应回退一天');

  ctx.document.querySelector('[data-act="nextDay"]').click();
  assert.strictEqual(App.pages.today._state.date, d, '再点应回到今天');
});

test('D1：把任务移到别的日期（moveToDate）', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const d = App.util.today();
  const t = App.actions.today.add('换个日子做', { date: d });
  const target = App.util.addDays(d, 3);
  App.actions.today.moveToDate(t.id, target);
  assert.strictEqual(App.actions.today.get(t.id).date, target);
  assert.strictEqual(App.actions.today.list(d).length, 0);
});

test('D1：删除任务并把状态恢复（撤销栈可用）', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const K = App.schema.KEYS;
  const t = App.actions.today.add('删掉我');
  assert.strictEqual(App.actions.today.remove(t.id), true);
  assert.strictEqual(App.actions.today.list(App.util.today()).length, 0);
  assert.strictEqual(App.actions.today.remove('不存在'), false);
  assert.ok(App.store.undo(), '删除应可撤销（undo 返回被还原的快照）');
  assert.strictEqual(App.actions.today.list(App.util.today()).length, 1, '撤销后应恢复');
});

test('D1：可把任务关联到某个模块，并显示来源标签', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const t = App.actions.today.add('复习 RAG 笔记');
  App.actions.today.linkModule(t.id, 'study', 'item1');
  assert.deepStrictEqual(plain(App.actions.today.get(t.id).moduleRef), { module: 'study', id: 'item1' });
  ctx.App.pages.today.refresh();
  assert.ok(ctx.document.querySelector('#task-list').textContent.indexOf('来自 学习计划') >= 0,
    '应显示「来自 学习计划」标签');
});

test('D1：先用下拉选好模块再回车，新任务自动带上关联', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const md = ctx.document.getElementById('task-module');
  md.value = 'dev';
  const inp = ctx.document.getElementById('task-input');
  inp.value = '修登录态过期';
  enter(ctx.window, inp);
  const list = App.actions.today.list(App.util.today());
  assert.strictEqual(list.length, 1);
  assert.deepStrictEqual(plain(list[0].moduleRef), { module: 'dev', id: '' });
});

test('D1：隐藏已完成只影响显示，不删除数据', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const a = App.actions.today.add('已完成的');
  App.actions.today.add('还没做的');
  App.actions.today.toggle(a.id);
  ctx.App.pages.today.refresh();
  assert.strictEqual(ctx.document.querySelectorAll('#task-list > .row[data-id]').length, 2);

  const cb = ctx.document.getElementById('hide-done');
  cb.checked = true;
  fire(ctx.window, cb, 'change');
  assert.strictEqual(ctx.document.querySelectorAll('#task-list > .row[data-id]').length, 1,
    '隐藏后只剩未完成的');
  assert.strictEqual(App.actions.today.list(App.util.today()).length, 2, '数据不应被删除');

  cb.checked = false;
  fire(ctx.window, cb, 'change');
  assert.strictEqual(ctx.document.querySelectorAll('#task-list > .row[data-id]').length, 2);
});

test('D1：counts / visible 统计正确', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const d = App.util.today();
  const a = App.actions.today.add('A', { date: d });
  App.actions.today.add('B', { date: d });
  App.actions.today.toggle(a.id);
  assert.deepStrictEqual(plain(App.actions.today.counts(d)), { total: 2, done: 1 });
  assert.strictEqual(App.actions.today.visible(d, true).length, 1);
  assert.strictEqual(App.actions.today.visible(d, false).length, 2);
});

test('D1：把其它模块的条目一键加进今日计划（pushToToday）', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const d = App.util.today();
  const t = App.actions.today.pushToToday('读 30 分钟书', d, 'study', 'item9');
  assert.strictEqual(t.date, d);
  assert.deepStrictEqual(plain(t.moduleRef), { module: 'study', id: 'item9' });
});

test('D1：新任务默认排在已有任务之后（order 递增）', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const d = App.util.today();
  const a = App.actions.today.add('A', { date: d });
  const b = App.actions.today.add('B', { date: d });
  assert.ok(b.order > a.order, '后加的 order 应更大');
});

/* ---------- D10 空状态（今日部分） ---------- */

test('D10：无数据时今日不空白，空状态有引导与主操作', async () => {
  const ctx = await startToday();
  const tl = ctx.document.getElementById('task-list');
  assert.ok(tl.querySelector('.empty'), '计划区应显示空状态');
  assert.ok(tl.textContent.indexOf('回车') >= 0, '空状态应引导「敲回车」');
  const nl = ctx.document.getElementById('note-list');
  assert.ok(nl.querySelector('.empty'), '备忘区应显示空状态');
  assert.ok(ctx.document.getElementById('checkin-box').textContent.length > 0, '打卡区不应空白');
});

/* ---------- 快速备忘 ---------- */

test('备忘：敲回车新增便签，空内容不建', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const inp = ctx.document.getElementById('note-input');
  inp.value = '买咖啡豆';
  enter(ctx.window, inp);
  assert.strictEqual(App.actions.today.notes().length, 1);
  assert.strictEqual(inp.value, '', '回车后应清空');

  inp.value = '   ';
  enter(ctx.window, inp);
  assert.strictEqual(App.actions.today.notes().length, 1, '空内容不应新增');
});

test('备忘：编辑内容生效并刷新更新时间', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const n = App.actions.today.addNote('草稿');
  const before = App.actions.today.getNote(n.id).updatedAt;
  App.actions.today.updateNote(n.id, '改好了');
  const after = App.actions.today.getNote(n.id);
  assert.strictEqual(after.content, '改好了');
  assert.ok(after.updatedAt >= before);
  assert.strictEqual(App.actions.today.updateNote('不存在', 'x'), null);
});

test('备忘：置顶后排最前，取消置顶恢复按时间排序', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const K = App.schema.KEYS;
  App.store.set(K.notes, [
    { id: 'x', content: '旧', pinned: false, createdAt: 1, updatedAt: 1 },
    { id: 'y', content: '新', pinned: false, createdAt: 2, updatedAt: 2 }
  ]);
  assert.deepStrictEqual(plain(App.actions.today.notes().map(n => n.id)), ['y', 'x'],
    '默认按更新时间倒序');

  App.actions.today.togglePinNote('x');
  assert.strictEqual(App.actions.today.getNote('x').pinned, true);
  assert.deepStrictEqual(plain(App.actions.today.notes().map(n => n.id)), ['x', 'y'],
    '置顶应排最前');

  App.actions.today.togglePinNote('x');
  assert.deepStrictEqual(plain(App.actions.today.notes().map(n => n.id)), ['y', 'x'],
    '取消置顶后按时间排序');
  assert.strictEqual(App.actions.today.togglePinNote('不存在'), null);
});

test('备忘：点击置顶/删除按钮（DOM 事件委托）', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const n = App.actions.today.addNote('给王工回电话');
  ctx.App.pages.today.refresh();
  assert.ok(ctx.document.getElementById('note-list').textContent.indexOf('给王工回电话') >= 0);

  ctx.document.querySelector('#note-list [data-act="pinNote"][data-id="' + n.id + '"]').click();
  assert.strictEqual(App.actions.today.getNote(n.id).pinned, true);

  ctx.document.querySelector('#note-list [data-act="delNote"][data-id="' + n.id + '"]').click();
  assert.strictEqual(App.actions.today.getNote(n.id), null, '删除后应查不到');
  assert.ok(ctx.document.getElementById('note-list').querySelector('.empty'), '空了应显示空状态');
});

/* ---------- D11 首页联动的数据来源：今日记录 ---------- */

test('D11：今日记录跨模块聚合学习/工时/游戏，并按日期过滤', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const K = App.schema.KEYS;
  const d = App.util.today();
  App.store.set(K.studyLogs, [{ id: 's1', date: d, minutes: 90, note: 'RAG 复盘' }]);
  App.store.set(K.consultWorklogs, [{ id: 'w1', date: d, minutes: 60, content: '客户沟通' }]);
  App.store.set(K.gameGames, [{ id: 'g1', name: '艾尔登法环' }]);
  App.store.set(K.gameLogs, [{ id: 'gl1', date: d, gameId: 'g1', minutes: 30, note: '' }]);

  const recs = App.actions.today.recordsOn(d);
  assert.strictEqual(recs.length, 3, '应聚合 3 条');
  assert.deepStrictEqual(plain(recs.map(r => r.module)), ['study', 'consult', 'game']);
  assert.deepStrictEqual(plain(recs.map(r => r.minutes)), [90, 60, 30]);
  assert.ok(recs[2].text.indexOf('艾尔登法环') >= 0, '游戏记录应带游戏名');

  assert.strictEqual(App.actions.today.recordsOn('2000-01-01').length, 0, '别的日期不应混入');

  ctx.App.pages.today.refresh();
  const box = ctx.document.getElementById('checkin-box').textContent;
  assert.ok(box.indexOf('RAG 复盘') >= 0);
  assert.ok(box.indexOf('客户沟通') >= 0);
  assert.ok(box.indexOf('今日记录') >= 0);
});

/* ---------- D7 前半：健身打卡 ---------- */

test('D7：健身计划默认补齐 7 天，可改内容与休息日', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const ck = App.actions.checkin;
  const plan = ck.fitnessPlan();
  assert.strictEqual(plan.length, 7);
  assert.deepStrictEqual(plain(plan.map(p => p.weekday)), [1, 2, 3, 4, 5, 6, 7]);

  ck.updatePlanRow(3, { content: '胸 + 三头', rest: false });
  assert.strictEqual(ck.planContent('2026-09-16'), '胸 + 三头', '2026-09-16 是周三');
  assert.strictEqual(ck.isRestDay('2026-09-16'), false);

  ck.updatePlanRow(7, { rest: true });
  assert.strictEqual(ck.isRestDay('2026-09-20'), true, '2026-09-20 是周日');
});

test('D7：点一次打卡连续天数 0→1，再点回落 0', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const ck = App.actions.checkin;
  const d = App.util.today();
  assert.strictEqual(ck.streak(d), 0);

  ck.toggleFitness(d);
  assert.strictEqual(ck.fitnessLog(d).done, true);
  assert.strictEqual(ck.streak(d), 1);

  ck.toggleFitness(d);
  assert.strictEqual(ck.fitnessLog(d).done, false);
  assert.strictEqual(ck.streak(d), 0);
});

test('D7：连续多天打卡累计正确，休息日跳过不中断', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const ck = App.actions.checkin;
  const d = App.util.today();
  ck.setFitnessDone(App.util.addDays(d, -1), true);
  ck.setFitnessDone(App.util.addDays(d, -2), true);
  assert.strictEqual(ck.streak(App.util.addDays(d, -1)), 2);

  /* 把 d-1 设为休息日：d 与 d-2 打卡，d-1 跳过，仍算 2 天 */
  const wd = App.util.weekdayIndexMon(App.util.addDays(d, -1));
  ck.updatePlanRow(wd, { rest: true });
  ck.setFitnessDone(d, true);
  assert.strictEqual(ck.streak(d), 2, '休息日不应中断连续天数');
});

test('D7：点击「立刻打卡」按钮（DOM）', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const ck = App.actions.checkin;
  const d = App.util.today();
  ctx.App.pages.today.refresh();
  const btn = ctx.document.querySelector('#checkin-box [data-act="toggleFitness"]');
  assert.ok(btn, '应有打卡按钮');
  btn.click();
  assert.strictEqual(ck.fitnessLog(d).done, true, '点一下应打卡');
  assert.ok(ctx.document.querySelector('#checkin-box').textContent.indexOf('连续 1 天') >= 0,
    '应显示连续 1 天');
  ctx.document.querySelector('#checkin-box [data-act="toggleFitness"]').click();
  assert.strictEqual(ck.fitnessLog(d).done, false, '再点应取消');
});

/* ---------- D8 前半：饮食打卡 ---------- */

test('D8：四餐填内容后自动勾选，清空后取消勾选', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const ck = App.actions.checkin;
  const d = App.util.today();
  App.schema.LABELS.mealOrder.forEach(function (m) {
    ck.setMealContent(d, m, '内容-' + m);
  });
  const sum = ck.mealSummary(d);
  assert.strictEqual(sum.filled, 4, '四格都应填了内容');
  assert.strictEqual(sum.done, 4, '填完应自动勾选');
  assert.strictEqual(sum.total, 4);

  ck.setMealContent(d, 'lunch', '');
  assert.strictEqual(ck.mealsOn(d).lunch.done, false, '空内容应取消勾选');
  assert.strictEqual(ck.mealSummary(d).done, 3);
});

test('D8：通过输入框的改值事件记录某一餐（DOM）', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const ck = App.actions.checkin;
  const d = App.util.today();
  ctx.App.pages.today.refresh();
  const inp = ctx.document.querySelector('#checkin-box input[data-act="mealInp"][data-id2="breakfast"]');
  assert.ok(inp, '应有早餐输入框且带餐次标识');
  inp.value = '牛奶 + 鸡蛋';
  fire(ctx.window, inp, 'change');
  assert.strictEqual(ck.mealsOn(d).breakfast.content, '牛奶 + 鸡蛋');
  assert.strictEqual(ck.mealsOn(d).breakfast.done, true, '填了内容就应勾上');
});

test('D8：勾选按钮可切换某一餐的完成状态', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const ck = App.actions.checkin;
  const d = App.util.today();
  ck.setMealContent(d, 'dinner', '吃了面');
  ctx.App.pages.today.refresh();
  const ckEl = ctx.document.querySelector('#checkin-box [data-act="toggleMeal"][data-id2="dinner"]');
  assert.ok(ckEl, '应有晚餐勾选');
  ckEl.click();
  assert.strictEqual(ck.mealsOn(d).dinner.done, false, '再点应取消勾选');
  assert.strictEqual(ck.mealsOn(d).dinner.content, '吃了面', '取消勾选不应清空内容');
});

test('D8：切到昨天能看到昨天的饮食记录', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const ck = App.actions.checkin;
  const d = App.util.today();
  const d1 = App.util.addDays(d, -1);
  ck.setMealContent(d1, 'lunch', '昨天的午饭');
  ctx.App.pages.today.refresh();
  ctx.document.querySelector('[data-act="prevDay"]').click();
  const inp = ctx.document.querySelector('#checkin-box input[data-id2="lunch"]');
  assert.strictEqual(inp.value, '昨天的午饭', '切到昨天应显示昨天的记录');
});

test('饮食：常用项新增/去重/上下移/删除', async () => {
  const ctx = await startToday();
  const App = ctx.App;
  const ck = App.actions.checkin;
  const f1 = ck.addFavorite('鸡蛋');
  const f2 = ck.addFavorite('牛奶');
  assert.ok(f1 && f2);
  assert.strictEqual(ck.addFavorite('鸡蛋'), null, '重复项不应加入');
  assert.strictEqual(ck.addFavorite('   '), null, '空项不应加入');
  assert.strictEqual(ck.favorites().length, 2);

  assert.strictEqual(ck.moveFavorite(f1.id, 1), true);
  assert.strictEqual(ck.favorites()[0].id, f2.id, '下移后牛奶应在前');
  assert.strictEqual(ck.moveFavorite(f2.id, -1), false, '已在最前不能再上移');

  assert.strictEqual(ck.removeFavorite(f1.id), true);
  assert.strictEqual(ck.favorites().length, 1);
  assert.strictEqual(ck.removeFavorite('不存在'), false);
});

/* ---------- 静态检查 ---------- */

test('今日：样式定义了三栏栅格与关键组件类', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(css.indexOf('.cols-today') >= 0, '缺少 .cols-today');
  assert.ok(css.indexOf('5fr 3.5fr 3fr') >= 0, '三栏比例应为 5fr 3.5fr 3fr');
  ['.note-item', '.meal-row', '.kick'].forEach(cls => {
    assert.ok(css.indexOf(cls) >= 0, '缺少样式 ' + cls);
  });
});

test('今日：模块文件已接入 index.html 且不依赖 ES Module', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/modules/today.js') >= 0, 'index.html 应加载 today.js');
  assert.ok(html.indexOf('type="module"') < 0);
});
