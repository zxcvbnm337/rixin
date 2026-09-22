'use strict';
/* Step 11 · 游戏娱乐：游戏库（卡片/表格 + 状态分组 + 1-10 评分）
   + 时长记录（快速记录 / +30 连加）+ 本周本月排行。
   对应 PRD 验收：D9（新增 1 款游戏，记 30 分钟 → 统计页本周排行里它排第一）。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot, APP_FILES, ROOT, plain } = require('./harness');

async function startGame(seed) {
  const ctx = await boot({ files: APP_FILES, seed: seed });
  await ctx.App.start();
  ctx.App.router.go('game');
  return ctx;
}
function g(ctx) { return ctx.App.actions.game; }
function click(ctx, sel) {
  const el = ctx.document.querySelector(sel);
  assert.ok(el, '找不到可点元素 ' + sel);
  el.click();
  return el;
}
function enter(win, el) {
  el.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}
function pageText(ctx) { return ctx.document.getElementById('page-host').textContent; }
function quickSubmit(ctx, gameId, mins, note) {
  ctx.document.getElementById('quick-game').value = gameId;
  ctx.document.getElementById('quick-min').value = mins;
  ctx.document.getElementById('quick-note').value = note || '';
  click(ctx, '[data-act="quickSubmit"]');
}

/* ---------- 结构 ---------- */

test('游戏娱乐：三个页签 + 空态引导', async () => {
  const ctx = await startGame();
  const tabs = Array.prototype.slice.call(ctx.document.querySelectorAll('#game-tabs .tab')).map(t => t.textContent);
  assert.deepStrictEqual(plain(tabs), ['游戏库', '时长记录', '统计']);
  assert.strictEqual(ctx.document.querySelector('#game-tabs .tab.on').textContent, '游戏库');
  assert.ok(pageText(ctx).indexOf('还没有游戏') >= 0, '空态应有引导');
  assert.strictEqual(ctx.document.querySelector('.page-head h2').textContent, '游戏娱乐');
});

test('游戏库：默认卡片视图，可切表格视图', async () => {
  const ctx = await startGame();
  g(ctx).addGame({ name: '空洞骑士', platform: 'pc', status: 'playing' });
  ctx.App.pages.game._renderAll();

  assert.ok(ctx.document.querySelector('.game-grid'), '默认应是卡片视图');
  assert.strictEqual(ctx.document.querySelectorAll('.game-grid .card').length, 1);

  click(ctx, '[data-act="viewMode"][data-view="table"]');
  assert.strictEqual(ctx.App.pages.game._state.view, 'table');
  assert.ok(ctx.document.querySelector('table.tbl'), '应切到表格视图');
  assert.strictEqual(ctx.document.querySelectorAll('.game-grid').length, 0);
  assert.ok(ctx.document.querySelector('table.tbl tbody tr td.tbl-name').textContent.indexOf('空洞骑士') >= 0);

  click(ctx, '[data-act="viewMode"][data-view="card"]');
  assert.ok(ctx.document.querySelector('.game-grid'), '应切回卡片视图');
});

/* ---------- D9 ---------- */

test('D9：新增 1 款游戏记 30 分钟 → 本周排行它第一，总时长 30 分钟', async () => {
  const ctx = await startGame();
  const util = ctx.App.util;
  const gm = g(ctx).addGame({ name: '艾尔登法环', platform: 'pc', status: 'playing' });
  assert.ok(gm, '应新增成功');

  /* 用页面上的快速记录条记 30 分钟 */
  click(ctx, '[data-act="tab"][data-tab="logs"]');
  quickSubmit(ctx, gm.id, '30', '第一天');

  assert.strictEqual(g(ctx).logs().length, 1, '应有一条记录');
  assert.strictEqual(g(ctx).logs()[0].minutes, 30);

  click(ctx, '[data-act="tab"][data-tab="stats"]');
  const rank = g(ctx).ranking('week', util.today());
  assert.strictEqual(rank.length, 1);
  assert.strictEqual(rank[0].label, '艾尔登法环', '本周排行第一应是它');
  assert.strictEqual(rank[0].value, 30);
  assert.strictEqual(g(ctx).totalMinutes('week', util.today()), 30, '本周总时长应是 30 分钟');

  /* 页面上：第一条柱状条就是它，总时长文案同步 */
  const firstBar = ctx.document.querySelector('.bars .bar-row .bar-lb');
  assert.strictEqual(firstBar.textContent, '艾尔登法环');
  assert.ok(pageText(ctx).indexOf('总时长 ' + util.fmtDurationCN(30)) >= 0, '总时长文案应显示 30 分钟');
  assert.strictEqual(ctx.document.querySelector('#game-tabs .tab.on').textContent, '统计');
});

/* ---------- 状态流转 ---------- */

test('状态流转：想玩 → 开始玩 → 通关（自动记通关日期）→ 再玩（清掉日期）', async () => {
  const ctx = await startGame();
  const util = ctx.App.util;
  const gm = g(ctx).addGame({ name: '塞尔达', status: 'wish' });
  assert.strictEqual(gm.status, 'wish');
  assert.strictEqual(gm.clearedAt, '', '想玩不该有通关日期');

  const l1 = g(ctx).setGameStatus(gm.id, 'playing');
  assert.strictEqual(l1.status, 'playing');
  assert.strictEqual(l1.clearedAt, '');

  const l2 = g(ctx).setGameStatus(gm.id, 'cleared');
  assert.strictEqual(l2.status, 'cleared');
  assert.strictEqual(l2.clearedAt, util.today(), '改成已通关应自动记日期');

  const l3 = g(ctx).setGameStatus(gm.id, 'playing');
  assert.strictEqual(l3.status, 'playing');
  assert.strictEqual(l3.clearedAt, '', '改成别的状态应清掉通关日期');

  /* 非法状态不生效 */
  assert.strictEqual(g(ctx).setGameStatus(gm.id, 'nope'), null);
  assert.strictEqual(g(ctx).getGame(gm.id).status, 'playing');

  /* 新建时就选「已通关」应直接带上日期 */
  const gm2 = g(ctx).addGame({ name: '只狼', status: 'cleared' });
  assert.strictEqual(gm2.clearedAt, util.today());
});

test('状态流转：页面上点「通关」按钮生效', async () => {
  const ctx = await startGame();
  const gm = g(ctx).addGame({ name: '黑神话', status: 'playing' });
  ctx.App.pages.game._renderAll();
  click(ctx, '[data-act="gameStatus"][data-id="' + gm.id + '"][data-status="cleared"]');
  assert.strictEqual(g(ctx).getGame(gm.id).status, 'cleared');
});

/* ---------- 分组与排序 ---------- */

test('游戏库：按状态分组，在玩置顶，空组不返回', async () => {
  const ctx = await startGame();
  g(ctx).addGame({ name: '想玩的', status: 'wish' });
  g(ctx).addGame({ name: '在玩的', status: 'playing' });
  g(ctx).addGame({ name: '通关的', status: 'cleared' });

  const labels = plain(g(ctx).grouped().map(x => x.label));
  assert.deepStrictEqual(labels, ['在玩', '想玩', '已通关'], '分组顺序：在玩 > 想玩 > 已通关');

  const names = plain(g(ctx).games().map(x => x.name));
  assert.strictEqual(names[0], '在玩的', '在玩应排最前');

  /* 只有一种状态时只返回一组 */
  const solo = await startGame();
  g(solo).addGame({ name: '唯一', status: 'wish' });
  assert.strictEqual(g(solo).grouped().length, 1);

  /* 搜索过滤 */
  assert.strictEqual(g(ctx).games({ q: '在玩' }).length, 1);
  assert.strictEqual(g(ctx).games({ q: '不存在的词' }).length, 0);
  assert.strictEqual(g(ctx).games({ status: 'wish' }).length, 1);
});

/* ---------- 评分 ---------- */

test('评分：1-10 取整并夹在区间内', async () => {
  const ctx = await startGame();
  assert.strictEqual(g(ctx).addGame({ name: 'A', rating: 7 }).rating, 7);
  assert.strictEqual(g(ctx).addGame({ name: 'B', rating: 15 }).rating, 10, '超过 10 夹到 10');
  assert.strictEqual(g(ctx).addGame({ name: 'C', rating: -3 }).rating, 0, '负数夹到 0');
  assert.strictEqual(g(ctx).addGame({ name: 'D', rating: '8.6' }).rating, 9, '应四舍五入取整');
  assert.strictEqual(g(ctx).addGame({ name: 'E' }).rating, 0);

  const gm = g(ctx).addGame({ name: 'F', rating: 3 });
  assert.strictEqual(g(ctx).updateGame(gm.id, { rating: 11 }).rating, 10);
  assert.strictEqual(g(ctx).updateGame(gm.id, { rating: 4 }).rating, 4);
});

test('评分：抽屉里点数字刻度即可选分，保存后写进数据', async () => {
  const ctx = await startGame();
  ctx.App.pages.game.primaryAdd();
  const rt = ctx.document.querySelector('#overlay-host .rating .rt[data-v="8"]');
  assert.ok(rt, '抽屉里应有 1-10 刻度');
  assert.strictEqual(ctx.document.querySelectorAll('#overlay-host .rating .rt').length, 10);

  rt.click();
  assert.strictEqual(ctx.document.querySelector('#overlay-host [data-fk="rating"]').value, '8',
    '点一下应把分值写进隐藏域');
  assert.strictEqual(ctx.document.querySelectorAll('#overlay-host .rating .rt.on').length, 8,
    '1-8 应点亮');

  ctx.document.querySelector('#overlay-host [data-fk="name"]').value = '星际拓荒';
  click(ctx, '#overlay-host [data-act="formSave"]');
  const list = g(ctx).games();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, '星际拓荒');
  assert.strictEqual(list[0].rating, 8);
});

/* ---------- 时长记录 ---------- */

test('快速记录：填 30 新增一条；填 +30 累加到最近一条', async () => {
  const ctx = await startGame();
  const gm = g(ctx).addGame({ name: '死亡搁浅', status: 'playing' });
  click(ctx, '[data-act="tab"][data-tab="logs"]');

  quickSubmit(ctx, gm.id, '30', '');
  assert.strictEqual(g(ctx).logs().length, 1);
  assert.strictEqual(g(ctx).logs()[0].minutes, 30);

  quickSubmit(ctx, gm.id, '+30', '');
  assert.strictEqual(g(ctx).logs().length, 1, '+30 不应新增记录');
  assert.strictEqual(g(ctx).logs()[0].minutes, 60, '应累加到 60 分钟');

  quickSubmit(ctx, gm.id, '40', '');
  assert.strictEqual(g(ctx).logs().length, 2, '不带 + 应新增一条');
  assert.strictEqual(g(ctx).gameMinutes(gm.id), 100);
});

test('快速记录：没有历史时 +30 等同于新记一条；看不懂的输入被拒绝', async () => {
  const ctx = await startGame();
  const gm = g(ctx).addGame({ name: '传送门', status: 'wish' });

  const r1 = g(ctx).quickLog(gm.id, '+30', '');
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.mode, 'new', '没有历史时 +30 按新记');
  assert.strictEqual(g(ctx).logs().length, 1);

  const r2 = g(ctx).quickLog(gm.id, 'abc', '');
  assert.strictEqual(r2.ok, false);
  assert.ok(r2.error.indexOf('分钟数') >= 0);
  assert.strictEqual(g(ctx).logs().length, 1, '非法输入不应落库');

  const r3 = g(ctx).quickLog('不存在的游戏', '30', '');
  assert.strictEqual(r3.ok, false);

  /* 支持 1.5h / 1h30m 这类写法 */
  const r4 = g(ctx).quickLog(gm.id, '1.5h', '');
  assert.strictEqual(r4.ok, true);
  assert.strictEqual(r4.log.minutes, 90);
});

test('时长记录：列表可渲染、可删除单条；「记时长」按钮带出所选游戏', async () => {
  const ctx = await startGame();
  const gm = g(ctx).addGame({ name: '哈迪斯', status: 'playing' });
  const log = g(ctx).addLog({ gameId: gm.id, minutes: 45 });
  ctx.App.pages.game._renderAll();

  click(ctx, '[data-act="quickFor"][data-id="' + gm.id + '"]');
  assert.strictEqual(ctx.App.pages.game._state.tab, 'logs', '应自动切到记录页');
  assert.strictEqual(ctx.document.getElementById('quick-game').value, gm.id, '应带出该游戏');
  assert.ok(pageText(ctx).indexOf('45m') >= 0, '应看到这条记录');

  click(ctx, '[data-act="delLog"][data-id="' + log.id + '"]');
  assert.strictEqual(g(ctx).logs().length, 0);
});

/* ---------- 删除游戏级联 ---------- */

test('删除游戏：二次确认后游戏与它的时长记录一并删除', async () => {
  const ctx = await startGame();
  const gm = g(ctx).addGame({ name: '待删', status: 'playing' });
  g(ctx).addLog({ gameId: gm.id, minutes: 20 });
  ctx.App.pages.game._renderAll();

  click(ctx, '[data-act="delGame"][data-id="' + gm.id + '"]');
  assert.ok(ctx.document.querySelector('#overlay-host .modal'), '应弹出确认框');
  assert.ok(ctx.document.querySelector('#overlay-host .modal-msg').textContent.indexOf('待删') >= 0);
  click(ctx, '#overlay-host [data-act="cfYes"]');

  assert.strictEqual(g(ctx).games().length, 0);
  assert.strictEqual(g(ctx).logs().length, 0, '时长记录应级联删除');
  assert.ok(pageText(ctx).indexOf('还没有游戏') >= 0, '应回到空态');
});

test('删除游戏：取消则什么都不动', async () => {
  const ctx = await startGame();
  const gm = g(ctx).addGame({ name: '别删我', status: 'playing' });
  g(ctx).addLog({ gameId: gm.id, minutes: 20 });
  ctx.App.pages.game._renderAll();

  click(ctx, '[data-act="delGame"][data-id="' + gm.id + '"]');
  click(ctx, '#overlay-host [data-act="cfNo"]');
  assert.strictEqual(g(ctx).games().length, 1);
  assert.strictEqual(g(ctx).logs().length, 1);
});

/* ---------- 排行 ---------- */

test('排行：本周 / 本月口径不同，按分钟倒序', async () => {
  const ctx = await startGame();
  const a = g(ctx).addGame({ name: '本周多', status: 'playing' });
  const b = g(ctx).addGame({ name: '本月早前', status: 'playing' });

  /* 固定参照日，避免跨月/跨周边界带来的随机性 */
  const ref = '2026-09-20';           /* 周日，本周 = 09-14 ~ 09-20 */
  g(ctx).addLog({ gameId: a.id, minutes: 30, date: '2026-09-16' }); /* 本周 + 本月 */
  g(ctx).addLog({ gameId: b.id, minutes: 50, date: '2026-09-02' }); /* 本月、非本周 */
  g(ctx).addLog({ gameId: a.id, minutes: 99, date: '2026-08-20' }); /* 都不是 */

  const week = plain(g(ctx).ranking('week', ref));
  assert.deepStrictEqual(week, [{ label: '本周多', value: 30 }]);

  const month = plain(g(ctx).ranking('month', ref));
  assert.deepStrictEqual(month, [{ label: '本月早前', value: 50 }, { label: '本周多', value: 30 }],
    '本月应按分钟倒序，50 在前');
  assert.strictEqual(g(ctx).totalMinutes('month', ref), 80);
});

/* 渲染部分单独测：页面默认按「今天所在的周」取数，无法接受固定参照日，
   所以数据锚定今天来造，保证任何运行日期下结果都一样。
   口径差异本身由上一个测试在数据层验证，这里只验证「切页签 → 视图跟着变」。 */
test('排行：切换周 / 月，柱子跟着变', async () => {
  const ctx = await startGame();
  const a = g(ctx).addGame({ name: '少的', status: 'playing' });
  const b = g(ctx).addGame({ name: '多的', status: 'playing' });

  const today = ctx.App.util.today();
  g(ctx).addLog({ gameId: a.id, minutes: 30, date: today });
  g(ctx).addLog({ gameId: b.id, minutes: 50, date: today });

  const labels = () => plain(
    Array.prototype.slice.call(ctx.document.querySelectorAll('.bars .bar-lb')).map(x => x.textContent)
  );

  click(ctx, '[data-act="tab"][data-tab="stats"]');
  assert.strictEqual(ctx.document.querySelectorAll('.bars .bar-row').length, 2, '默认本周：两笔都在本周');
  assert.deepStrictEqual(labels(), ['多的', '少的'], '本周按分钟倒序');

  click(ctx, '[data-act="rankKind"][data-kind="month"]');
  assert.strictEqual(ctx.App.pages.game._state.rankKind, 'month');
  assert.strictEqual(ctx.document.querySelectorAll('.bars .bar-row').length, 2, '本月同样是这两笔');
  assert.deepStrictEqual(labels(), ['多的', '少的'], '本月按分钟倒序');
});

test('排行：时长记录的游戏被删掉后不影响统计口径的健壮性', async () => {
  const ctx = await startGame();
  const gm = g(ctx).addGame({ name: '将被删', status: 'playing' });
  g(ctx).addLog({ gameId: gm.id, minutes: 25 });
  /* 直接删掉游戏对象但留下记录（模拟脏数据） */
  ctx.App.store.set(ctx.App.schema.KEYS.gameGames, []);
  const rank = plain(g(ctx).ranking('all'));
  assert.strictEqual(rank[0].label, '已删除的游戏');
  assert.strictEqual(rank[0].value, 25);
});

/* ---------- 摘要与落库 ---------- */

test('summary：供首页取数，字段齐全', async () => {
  const ctx = await startGame();
  const util = ctx.App.util;
  const p = g(ctx).addGame({ name: '在玩1', status: 'playing' });
  g(ctx).addGame({ name: '想玩1', status: 'wish' });
  g(ctx).addGame({ name: '想玩2', status: 'wish' });
  g(ctx).addGame({ name: '通关1', status: 'cleared' });
  g(ctx).addLog({ gameId: p.id, minutes: 90 });

  const s = plain(g(ctx).summary());
  assert.strictEqual(s.games, 4);
  assert.strictEqual(s.playing, 1);
  assert.strictEqual(s.wish, 2);
  assert.strictEqual(s.cleared, 1);
  assert.strictEqual(s.minutesTotal, 90);
  assert.strictEqual(s.weekMinutes, 90, '今天记的时长应算进本周');
  assert.ok(util.fmtDurationCN(s.weekMinutes).indexOf('小时') >= 0);
});

test('落库：游戏与时长记录写进存储层（C4）', async () => {
  const ctx = await startGame();
  const K = ctx.App.schema.KEYS;
  const gm = g(ctx).addGame({ name: '落库游戏', status: 'playing' });
  g(ctx).addLog({ gameId: gm.id, minutes: 30 });
  assert.strictEqual(ctx.App.store.get(K.gameGames).length, 1);
  assert.strictEqual(ctx.App.store.get(K.gameLogs).length, 1);

  const dump = plain(ctx.App.store.exportJSON());
  assert.strictEqual(dump.data[K.gameGames][0].name, '落库游戏');
  assert.strictEqual(dump.data[K.gameLogs][0].minutes, 30);
});

test('游戏娱乐：模块已接入 index.html，样式类齐备', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/modules/game.js') >= 0, 'index.html 应加载 game.js');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ['.game-grid', '.rating', '.rating .rt', '.quick-bar'].forEach(cls => {
    assert.ok(css.indexOf(cls) >= 0, '缺少样式 ' + cls);
  });
});
