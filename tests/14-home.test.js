'use strict';
/* Step 13 · 首页总览：七张摘要卡、就地勾选与便签、卡片菜单、备份提醒。
   对应 PRD 验收：D11（改数据回首页看卡片变化）/ E6（备份提醒）。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot, APP_FILES, ROOT, plain } = require('./harness');

async function startHome(seed) {
  const ctx = await boot({ files: APP_FILES, seed: seed });
  await ctx.App.start();
  ctx.App.router.go('home');
  return ctx;
}
function h(ctx) { return ctx.App.actions.home; }
function keys(ctx) { return ctx.App.schema.KEYS; }
function pageText(ctx) { return ctx.document.getElementById('page-host').textContent; }
function card(ctx, id) { return ctx.document.querySelector('.home-card[data-card="' + id + '"]'); }
function cardText(ctx, id) {
  const el = card(ctx, id);
  return el ? el.textContent : '';
}
function click(ctx, sel) {
  const el = ctx.document.querySelector(sel);
  assert.ok(el, '找不到可点元素 ' + sel);
  el.click();
  return el;
}
function enter(win, el) {
  el.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}
function blur(win, el) {
  el.dispatchEvent(new win.FocusEvent('blur', { bubbles: false }));
}

/* ---------- 结构 ---------- */

test('首页总览：七张摘要卡按三行排布', async () => {
  const ctx = await startHome();
  assert.strictEqual(ctx.document.querySelector('.page-head h2').textContent, '首页总览');
  const ids = Array.prototype.slice.call(ctx.document.querySelectorAll('.home-card')).map(c => c.dataset.card);
  assert.deepStrictEqual(plain(ids), ['todayPlan', 'checkin', 'study', 'projects', 'consultWeek', 'game', 'notes']);

  const grids = ctx.document.querySelectorAll('.stack .grid');
  assert.strictEqual(grids.length, 3, '应分成三行');
  assert.strictEqual(grids[0].querySelectorAll('.home-card').length, 3, '第一行三张');
  assert.strictEqual(grids[1].querySelectorAll('.home-card').length, 2, '第二行两张');
  assert.strictEqual(grids[2].querySelectorAll('.home-card').length, 2, '第三行两张');
});

test('D10：七张卡在空数据下都有引导，不留空白', async () => {
  const ctx = await startHome();
  const txt = pageText(ctx);
  assert.ok(txt.indexOf('今天还没有计划') >= 0);
  assert.ok(txt.indexOf('还没有进行中的学习项') >= 0);
  assert.ok(txt.indexOf('还没有进行中的项目') >= 0);
  assert.ok(txt.indexOf('本周还没有工时记录') >= 0);
  assert.ok(txt.indexOf('最近没有在玩的游戏') >= 0);
  assert.ok(txt.indexOf('还没有便签') >= 0);
  /* 打卡卡两行始终在 */
  assert.ok(cardText(ctx, 'checkin').indexOf('健身') >= 0);
  assert.ok(cardText(ctx, 'checkin').indexOf('饮食') >= 0);
});

/* ---------- 今日计划 ---------- */

test('今日计划卡：只列未完成、最多 5 条，就地勾选即完成', async () => {
  const ctx = await startHome();
  const t = ctx.App.actions.today;
  for (let i = 1; i <= 7; i++) t.add('任务' + i);
  t.add('已完成的');
  t.toggle(t.list(ctx.App.util.today()).filter(x => x.title === '已完成的')[0].id);
  ctx.App.pages.home._renderAll();

  const rows = ctx.document.querySelectorAll('.home-card[data-card="todayPlan"] .row');
  assert.strictEqual(rows.length, 5, '未完成最多列 5 条');
  assert.ok(cardText(ctx, 'todayPlan').indexOf('已完成的') < 0, '已完成的不该出现');
  assert.ok(cardText(ctx, 'todayPlan').indexOf('未完成 7') >= 0);

  /* 就地勾选第一条 */
  const first = h(ctx).plan().items[0];
  click(ctx, '.home-card[data-card="todayPlan"] [data-act="toggleTask"][data-id="' + first.id + '"]');
  assert.strictEqual(t.get(first.id).done, true, '勾选应落库');
  assert.ok(cardText(ctx, 'todayPlan').indexOf('未完成 6') >= 0, '数字应立刻变');
});

test('今日计划卡：全部完成时给一句收尾话', async () => {
  const ctx = await startHome();
  const t = ctx.App.actions.today;
  const a = t.add('唯一一条');
  h(ctx).toggleTask(a.id);
  ctx.App.pages.home._renderAll();
  assert.ok(cardText(ctx, 'todayPlan').indexOf('都完成了') >= 0);
});

/* ---------- 今日打卡 ---------- */

test('今日打卡卡：一键补打健身卡，饮食显示已勾进度', async () => {
  const ctx = await startHome();
  const t = ctx.App.util.today();
  ctx.App.actions.checkin.setMealContent(t, 'breakfast', '鸡蛋');
  ctx.App.actions.checkin.setMealContent(t, 'lunch', '面');
  ctx.App.pages.home._renderAll();

  assert.ok(cardText(ctx, 'checkin').indexOf('已勾 2 / 4') >= 0);
  const d = h(ctx).checkin();
  assert.strictEqual(d.fitness.done, false);
  assert.strictEqual(d.diet.done, 2);

  /* 一键补打 */
  click(ctx, '.home-card[data-card="checkin"] [data-act="toggleFitness"]');
  assert.strictEqual(ctx.App.actions.fitness.todayDone(t), true, '应打卡成功');
  assert.ok(cardText(ctx, 'checkin').indexOf('已打卡') >= 0);
  assert.strictEqual(h(ctx).checkin().fitness.streak, 1, '连续天数应变成 1');

  /* 再点一次应取消 */
  click(ctx, '.home-card[data-card="checkin"] [data-act="toggleFitness"]');
  assert.strictEqual(ctx.App.actions.fitness.todayDone(t), false);
  assert.strictEqual(h(ctx).checkin().fitness.streak, 0);
});

/* ---------- 学习进度 ---------- */

test('学习进度卡：进行中的学习项最多 3 条，带进度条', async () => {
  const ctx = await startHome();
  const st = ctx.App.actions.study;
  const dir = st.addDirection({ name: 'LLM 工程' });
  for (let i = 1; i <= 4; i++) {
    st.addItem({ name: '学习项' + i, directionId: dir.id, status: 'doing', progress: i * 20 });
  }
  st.addItem({ name: '还没开始的', directionId: dir.id, status: 'todo', progress: 0 });
  ctx.App.pages.home._renderAll();

  const txt = cardText(ctx, 'study');
  assert.strictEqual(h(ctx).study().doing.length, 3, '最多 3 条');
  assert.strictEqual(h(ctx).study().doingTotal, 4);
  /* 进度高的排前面 */
  assert.strictEqual(h(ctx).study().doing[0].name, '学习项4');
  assert.strictEqual(h(ctx).study().doing[0].progress, 80);
  assert.ok(txt.indexOf('LLM 工程') >= 0, '应带上方向名');
  assert.strictEqual(ctx.document.querySelectorAll('.home-card[data-card="study"] .prog').length, 3, '每条一个进度条');
  assert.ok(txt.indexOf('进行中 4 项') >= 0);
});

/* ---------- 项目进展 ---------- */

test('项目进展卡：开发项目带任务完成比，咨询项目列在下面', async () => {
  const ctx = await startHome();
  const dv = ctx.App.actions.dev, cs = ctx.App.actions.consult;
  const proj = dv.addProject({ name: '个人管理 App', status: 'doing' });
  const a = dv.addTask({ projectId: proj.id, title: '任务A' });
  dv.addTask({ projectId: proj.id, title: '任务B' });
  dv.setTaskStatus(a.id, 'done');

  const cli = cs.addClient({ name: '某客户', status: 'doing' });
  cs.addProject({ clientId: cli.id, name: '品牌咨询', stage: '需求梳理' });
  ctx.App.pages.home._renderAll();

  const txt = cardText(ctx, 'projects');
  assert.ok(txt.indexOf('个人管理 App') >= 0);
  assert.ok(txt.indexOf('任务 1/2') >= 0, '应显示任务完成比');
  assert.ok(txt.indexOf('品牌咨询') >= 0);
  assert.ok(txt.indexOf('需求梳理') >= 0);
  assert.ok(txt.indexOf('待修 Bug 0 个') >= 0);
  assert.strictEqual(h(ctx).projects().dev[0].ratio, 50);
});

/* ---------- 本周工时 / 游戏时长 ---------- */

test('本周工时卡：本周累计 + 按项目分条', async () => {
  const ctx = await startHome();
  const cs = ctx.App.actions.consult;
  const t = ctx.App.util.today();
  const cli = cs.addClient({ name: '客户A' });
  const p1 = cs.addProject({ clientId: cli.id, name: '项目一' });
  const p2 = cs.addProject({ clientId: cli.id, name: '项目二' });
  cs.addWorklog({ projectId: p1.id, minutes: 120, date: t });
  cs.addWorklog({ projectId: p2.id, minutes: 60, date: t });
  /* 上周的工时不该算进本周 */
  cs.addWorklog({ projectId: p1.id, minutes: 300, date: ctx.App.util.addDays(t, -20) });
  ctx.App.pages.home._renderAll();

  const d = h(ctx).consultWeek();
  assert.strictEqual(d.minutes, 180, '本周应只有 180 分钟');
  assert.deepStrictEqual(plain(d.items.map(i => i.label)), ['项目一', '项目二']);
  assert.ok(cardText(ctx, 'consultWeek').indexOf('3 小时') >= 0);
  assert.strictEqual(ctx.document.querySelectorAll('.home-card[data-card="consultWeek"] .bar-row').length, 2);
});

test('游戏时长卡：本周累计 + 最近在玩', async () => {
  const ctx = await startHome();
  const gm = ctx.App.actions.game;
  const g1 = gm.addGame({ name: '在玩的', status: 'playing' });
  gm.addGame({ name: '想玩的', status: 'wish' });
  gm.addLog({ gameId: g1.id, minutes: 90 });
  ctx.App.pages.home._renderAll();

  const d = h(ctx).game();
  assert.strictEqual(d.weekMinutes, 90);
  assert.deepStrictEqual(plain(d.playing.map(x => x.name)), ['在玩的']);
  assert.ok(cardText(ctx, 'game').indexOf('1.5 小时') >= 0);
});

/* ---------- 快速备忘 ---------- */

test('快速备忘卡：新增、就地编辑、置顶、删除', async () => {
  const ctx = await startHome();
  const t = ctx.App.actions.today;

  /* 新增 */
  const inp = ctx.document.getElementById('home-note-input');
  inp.value = '买牛奶';
  enter(ctx.window, inp);
  assert.strictEqual(t.notes().length, 1);
  assert.strictEqual(ctx.document.getElementById('home-note-input').value, '', '新增后清空输入框');
  assert.ok(cardText(ctx, 'notes').indexOf('买牛奶') >= 0);

  /* 再来一条，并置顶第一条 */
  const inp2 = ctx.document.getElementById('home-note-input');
  inp2.value = '交房租';
  enter(ctx.window, inp2);
  const first = t.notes()[0];
  click(ctx, '.home-card[data-card="notes"] [data-act="notePin"][data-id="' + first.id + '"]');
  assert.strictEqual(t.getNote(first.id).pinned, true);
  assert.strictEqual(t.notes()[0].id, first.id, '置顶后排最前');
  assert.ok(ctx.document.querySelector('.home-card[data-card="notes"] .row-title.pin'), '置顶应加粗');

  /* 就地编辑 */
  click(ctx, '.home-card[data-card="notes"] [data-act="noteEdit"][data-id="' + first.id + '"]');
  const edit = ctx.document.querySelector('.home-card[data-card="notes"] .inline-edit');
  assert.ok(edit, '应变成输入框');
  edit.value = '买牛奶和鸡蛋';
  blur(ctx.window, edit);
  assert.strictEqual(t.getNote(first.id).content, '买牛奶和鸡蛋');

  /* 删除 */
  click(ctx, '.home-card[data-card="notes"] [data-act="noteDel"][data-id="' + first.id + '"]');
  assert.strictEqual(t.notes().length, 1);
  assert.strictEqual(t.getNote(first.id), null);
});

/* ---------- 跳转与卡片菜单 ---------- */

test('点卡片标题区跳到对应模块，勾选框不会跳页', async () => {
  const ctx = await startHome();
  const a = ctx.App.actions.today.add('一条任务');
  ctx.App.pages.home._renderAll();

  click(ctx, '.home-card[data-card="todayPlan"] .hc-link');
  assert.strictEqual(ctx.App.router.current.page, 'today', '应跳到今日');

  ctx.App.router.go('home');
  click(ctx, '.home-card[data-card="todayPlan"] [data-act="toggleTask"][data-id="' + a.id + '"]');
  assert.strictEqual(ctx.App.router.current.page, 'home', '就地勾选不该跳页');
  assert.strictEqual(ctx.App.actions.today.get(a.id).done, true);
});

test('卡片菜单：「…」出菜单，可进入模块，也可隐藏与恢复', async () => {
  const ctx = await startHome();

  click(ctx, '[data-act="cardMenu"][data-card="game"]');
  const menu = ctx.document.querySelector('.card-menu[data-menu="game"]');
  assert.ok(menu.classList.contains('on'), '菜单应展开');
  assert.ok(menu.textContent.indexOf('进入模块') >= 0);
  assert.ok(menu.textContent.indexOf('隐藏此卡') >= 0);

  /* 再点一次收起 */
  click(ctx, '[data-act="cardMenu"][data-card="game"]');
  assert.strictEqual(ctx.document.querySelector('.card-menu[data-menu="game"]').classList.contains('on'), false);

  /* 隐藏 */
  click(ctx, '[data-act="cardMenu"][data-card="game"]');
  click(ctx, '.card-menu[data-menu="game"] [data-act="hideCard"]');
  assert.strictEqual(card(ctx, 'game'), null, '隐藏后卡片不该在');
  assert.deepStrictEqual(plain(h(ctx).hiddenCards()), ['game']);
  assert.ok(pageText(ctx).indexOf('已隐藏 1 张卡片') >= 0);
  assert.strictEqual(h(ctx).visibleCards().length, 6);

  /* 隐藏只影响首页，不影响模块本身 */
  assert.strictEqual(ctx.document.querySelectorAll('.home-card').length, 6);

  /* 恢复 */
  click(ctx, '[data-act="showAllCards"]');
  assert.ok(card(ctx, 'game'), '应恢复显示');
  assert.strictEqual(h(ctx).hiddenCards().length, 0);
});

/* ---------- D11 联动 ---------- */

test('D11：各模块数据变化，切回首页卡片立刻重算', async () => {
  const ctx = await startHome();
  const txt0 = cardText(ctx, 'game');
  assert.ok(txt0.indexOf('本周 0 分钟') >= 0);

  const gm = ctx.App.actions.game;
  const g1 = gm.addGame({ name: '新游戏', status: 'playing' });
  gm.addLog({ gameId: g1.id, minutes: 150 });

  /* 先去别的页面再回来，卡片应重算 */
  ctx.App.router.go('study');
  ctx.App.router.go('home');
  assert.ok(cardText(ctx, 'game').indexOf('2.5 小时') >= 0, '回首页应看到新数据');
  assert.ok(cardText(ctx, 'game').indexOf('新游戏') >= 0);

  /* 再加一条，刷新即变 */
  const t = ctx.App.actions.today.add('临时任务');
  ctx.App.pages.home.refresh();
  assert.ok(cardText(ctx, 'todayPlan').indexOf('临时任务') >= 0);
  ctx.App.actions.today.toggle(t.id);
  ctx.App.pages.home.refresh();
  assert.ok(cardText(ctx, 'todayPlan').indexOf('都完成了') >= 0);
});

/* ---------- E6 备份提醒 ---------- */

test('E6：首页顶部出现备份提示条，关掉当天不再出现', async () => {
  const ctx = await startHome();
  const K = keys(ctx);
  assert.strictEqual(h(ctx).backupReminder(), false, '刚用过不该提醒');

  ctx.App.store.set(K.meta, Object.assign({}, ctx.App.store.get(K.meta), {
    lastBackupAt: Date.now() - 9 * 86400000, backupTipClosedAt: null
  }));
  assert.strictEqual(h(ctx).backupReminder(), true);
  ctx.App.renderReminder();
  const host = ctx.document.getElementById('reminder-host');
  assert.ok(host.textContent.indexOf('备份') >= 0);
  assert.ok(host.querySelector('[data-act="goSettings"]'), '提示条应有「去导出」');
  assert.ok(host.querySelector('[data-act="closeReminder"]'), '提示条可关闭');

  host.querySelector('[data-act="closeReminder"]').click();
  assert.strictEqual(ctx.document.getElementById('reminder-host').innerHTML, '');
  assert.strictEqual(h(ctx).backupReminder(), false, '当天不该再提醒');

  /* 数据变化不会把提示条又顶出来 */
  ctx.App.actions.today.add('随便一条');
  ctx.App.pages.home.refresh();
  ctx.App.renderReminder();
  assert.strictEqual(ctx.document.getElementById('reminder-host').innerHTML, '');
});

/* ---------- 落库 / 静态 ---------- */

test('首页唯一的两处写入都落库（勾选 + 便签）', async () => {
  const ctx = await startHome();
  const K = keys(ctx);
  const a = ctx.App.actions.today.add('任务');
  h(ctx).toggleTask(a.id);
  h(ctx).addNote('一条便签');
  assert.strictEqual(plain(ctx.App.store.get(K.tasks))[0].done, true);
  assert.strictEqual(plain(ctx.App.store.get(K.notes))[0].content, '一条便签');

  const dump = plain(ctx.App.store.exportJSON());
  assert.strictEqual(dump.data[K.notes].length, 1);
  /* 首页不该额外产生别的数据 */
  assert.strictEqual(h(ctx).data().notes.length, 1);
});

test('首页总览：模块已接入 index.html，样式类齐备', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/modules/home.js') >= 0, 'index.html 应加载 home.js');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ['.home-card', '.hc-link', '.card-menu', '.hc-prog', '.hc-line'].forEach(cls => {
    assert.ok(css.indexOf(cls) >= 0, '缺少样式 ' + cls);
  });
});

test('首页只读：光渲染一遍不会往库里写任何数据', async () => {
  const ctx = await startHome();
  const before = ctx.App.store.usage().count;
  assert.strictEqual(before, 0, '刚打开时一条数据都不该有');
  ctx.App.pages.home.refresh();
  ctx.App.router.go('study');
  ctx.App.router.go('home');
  ctx.App.pages.home.refresh();
  assert.strictEqual(ctx.App.store.usage().count, 0, '首页不能因为看一眼就落库（含周计划模板）');
  assert.strictEqual(ctx.App.store.get(keys(ctx).fitnessPlan).length, 0, '默认周计划模板不该被首页建出来');
});
