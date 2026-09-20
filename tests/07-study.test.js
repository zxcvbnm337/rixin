'use strict';
/* Step 6 · 学习计划：三个页签、方向卡片、学习项表格、学习记录、笔记聚合、时长解析。
   对应 PRD 验收：D2（方向 + 学习项 + 进度联动 + 90 分钟入库）。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot, APP_FILES, ROOT, plain } = require('./harness');

async function startStudy(seed) {
  const ctx = await boot({ files: APP_FILES, seed: seed });
  await ctx.App.start();
  ctx.App.router.go('study');
  return ctx;
}
function fire(win, el, type) {
  el.dispatchEvent(new win.Event(type, { bubbles: true, cancelable: true }));
}
function view(ctx) { return ctx.App.actions.study; }

/* ---------- 结构 ---------- */

test('学习计划：顶部三个页签，默认停在方向总览', async () => {
  const ctx = await startStudy();
  const tabs = ctx.document.querySelectorAll('#study-tabs .tab');
  assert.strictEqual(tabs.length, 3, '应有 3 个页签');
  assert.deepStrictEqual(plain(Array.prototype.slice.call(tabs).map(t => t.textContent)),
    ['方向总览', '学习项', '学习记录']);
  assert.ok(ctx.document.querySelector('#study-tabs .tab.on').textContent.indexOf('方向总览') >= 0,
    '默认应选中方向总览');
});

test('学习计划：点页签切换内容区', async () => {
  const ctx = await startStudy();
  ctx.document.querySelector('[data-act="tab"][data-tab="items"]').click();
  assert.strictEqual(ctx.App.pages.study._state.tab, 'items');
  assert.ok(ctx.document.getElementById('item-table'), '学习项页签应渲染内容容器');
  assert.ok(ctx.document.querySelector('.filterbar'), '学习项页签应有筛选条');
  assert.ok(ctx.document.querySelector('#study-tabs .tab.on').textContent.indexOf('学习项') >= 0,
    '页签应高亮到学习项');
  ctx.document.querySelector('[data-act="tab"][data-tab="logs"]').click();
  assert.strictEqual(ctx.App.pages.study._state.tab, 'logs');
  assert.ok(ctx.document.getElementById('study-body').textContent.indexOf('记一笔') >= 0);
});

/* ---------- D10 空状态（学习计划部分） ---------- */

test('D10：三个页签在无数据时都有引导，不空白', async () => {
  const ctx = await startStudy();
  let body = ctx.document.getElementById('study-body');
  assert.ok(body.querySelector('.empty'), '方向总览应有空状态');
  assert.ok(body.textContent.indexOf('新建方向') >= 0, '应给出主操作');

  ctx.document.querySelector('[data-act="tab"][data-tab="items"]').click();
  body = ctx.document.getElementById('study-body');
  assert.ok(body.querySelector('.empty'), '学习项应有空状态');
  assert.ok(body.textContent.indexOf('新增学习项') >= 0);

  ctx.document.querySelector('[data-act="tab"][data-tab="logs"]').click();
  body = ctx.document.getElementById('study-body');
  assert.ok(body.querySelector('.empty'), '学习记录应有空状态');
});

/* ---------- 方向 ---------- */

test('方向：新增 / 编辑 / 状态流转 / 名称必填 / 目标日期校验', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  assert.strictEqual(s.addDirection({ name: '   ' }), null, '空名称不应创建');

  const d = s.addDirection({ name: 'LLM 应用工程', goal: '能上线一个 Agent', targetDate: '2026-12-31' });
  assert.ok(d && d.id);
  assert.strictEqual(d.status, 'active');
  assert.strictEqual(s.directions().length, 1);

  const d2 = s.addDirection({ name: '前端复习', targetDate: '乱写的日期' });
  assert.strictEqual(d2.targetDate, '', '非法日期应被丢弃');

  s.updateDirection(d.id, { goal: '换个目标' });
  assert.strictEqual(s.getDirection(d.id).goal, '换个目标');

  s.setDirectionStatus(d.id, 'done');
  assert.strictEqual(s.getDirection(d.id).status, 'done');
  assert.strictEqual(s.setDirectionStatus(d.id, '不存在的状态'), null, '非法状态应拒绝');
  s.archiveDirection(d.id);
  assert.strictEqual(s.getDirection(d.id).status, 'archived');
});

test('方向：删除时级联清掉它的学习项与学习记录', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const d = s.addDirection({ name: '会被删的方向' });
  const it = s.addItem({ name: '跟着走的学习项', directionId: d.id });
  s.addLog({ itemId: it.id, minutes: 30 });
  assert.strictEqual(s.logs().length, 1);

  assert.strictEqual(s.removeDirection(d.id), true);
  assert.strictEqual(s.directions().length, 0);
  assert.strictEqual(s.items().length, 0, '学习项应被连带删除');
  assert.strictEqual(s.logs().length, 0, '学习记录应被连带删除');
  assert.strictEqual(s.removeDirection('不存在'), false);
});

/* ---------- D2 ---------- */

test('D2：两个学习项进度都改成 50%，方向进度同步变成 50%', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const d = s.addDirection({ name: 'RAG 工程' });
  const a = s.addItem({ name: '切片策略', directionId: d.id });
  const b = s.addItem({ name: '向量库选型', directionId: d.id });
  assert.strictEqual(s.directionProgress(d.id), 0, '一开始没进度');

  s.setItemProgress(a.id, 50);
  assert.strictEqual(s.directionProgress(d.id), 25, '一个 50 一个 0 → 平均 25');
  s.setItemProgress(b.id, 50);
  assert.strictEqual(s.directionProgress(d.id), 50, '两个都 50 → 平均 50');

  /* 方向总览卡片上的进度条宽度应等于 50% */
  ctx.App.pages.study._renderAll();
  const bar = ctx.document.querySelector('.grid .prog-bar');
  assert.ok(bar, '方向卡片应有进度条');
  assert.strictEqual(bar.style.width, '50%', '进度条宽度应与数值一致');
});

test('D2：记一笔 90 分钟，方向累计时长增加 1.5 小时', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const d = s.addDirection({ name: 'RAG 工程' });
  const a = s.addItem({ name: '切片策略', directionId: d.id });
  assert.strictEqual(s.directionMinutes(d.id), 0);

  const r = s.logFromInput(a.id, ctx.App.util.today(), '90', '读了官方文档');
  assert.strictEqual(r.ok, true, '应记录成功');
  assert.strictEqual(r.minutes, 90);
  assert.strictEqual(s.directionMinutes(d.id), 90);
  assert.strictEqual(ctx.App.util.fmtDurationCN(s.directionMinutes(d.id)), '1.5 小时');
  assert.strictEqual(s.itemMinutes(a.id), 90);
  assert.strictEqual(s.minutesTotal(), 90);

  ctx.App.pages.study._renderAll();
  const card = ctx.document.querySelector('.grid .card');
  assert.ok(card.textContent.indexOf('累计 1.5 小时') >= 0, '卡片应显示累计 1.5 小时');
});

test('D2：时长三种写法都解析成同一分钟数', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const a = s.addItem({ name: '教程' });
  ['90', '1.5h', '1h30m'].forEach(function (txt) {
    const r = s.logFromInput(a.id, ctx.App.util.today(), txt, 'x');
    assert.strictEqual(r.ok, true, txt + ' 应解析成功');
    assert.strictEqual(r.minutes, 90, txt + ' 应等于 90 分钟');
  });
  assert.strictEqual(s.minutesTotal(), 270);
});

test('D2：时长写错时给出可读错误，且不落库', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const a = s.addItem({ name: '教程' });
  ['h30', 'abc', '', '0', '-5'].forEach(function (txt) {
    const r = s.logFromInput(a.id, ctx.App.util.today(), txt, '');
    assert.strictEqual(r.ok, false, '「' + txt + '」应被拒绝');
    assert.ok(r.error, '应带上错误说明');
  });
  assert.strictEqual(s.logs().length, 0, '失败的解析不应落库');

  const r2 = s.logFromInput('不存在的学习项', ctx.App.util.today(), '90', '');
  assert.strictEqual(r2.ok, false);
  assert.ok(r2.error.indexOf('学习项') >= 0);
});

/* ---------- 学习项 ---------- */

test('学习项：新增默认值、进度边界、状态自动推导', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  assert.strictEqual(s.addItem({ name: '  ' }), null, '空名称不应创建');

  const it = s.addItem({ name: 'LangGraph 教程' });
  assert.strictEqual(it.type, 'course', '默认类型为课程');
  assert.strictEqual(it.status, 'todo');
  assert.strictEqual(it.progress, 0);

  s.setItemProgress(it.id, 150);
  assert.strictEqual(s.getItem(it.id).progress, 100, '超过 100 应截断');
  assert.strictEqual(s.getItem(it.id).status, 'done', '满进度应自动已完成');

  s.setItemProgress(it.id, -20);
  assert.strictEqual(s.getItem(it.id).progress, 0, '负数应归零');
  assert.strictEqual(s.getItem(it.id).status, 'doing', '从已完成退回应变成进行中');

  s.setItemProgress(it.id, 40);
  assert.strictEqual(s.getItem(it.id).status, 'doing', '0-100 之间应保持进行中');

  s.updateItem(it.id, { status: 'paused' });
  s.setItemProgress(it.id, 60);
  assert.strictEqual(s.getItem(it.id).status, 'paused', '搁置状态不应被进度覆盖');
});

test('学习项：标记已完成会把进度补到 100', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const it = s.addItem({ name: '一本书', progress: 30 });
  s.setItemStatus(it.id, 'done');
  assert.strictEqual(s.getItem(it.id).status, 'done');
  assert.strictEqual(s.getItem(it.id).progress, 100);
  assert.strictEqual(s.setItemStatus(it.id, '乱写'), null);
});

test('学习项：删除时级联清掉它的学习记录', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const a = s.addItem({ name: 'A' });
  const b = s.addItem({ name: 'B' });
  s.addLog({ itemId: a.id, minutes: 30 });
  s.addLog({ itemId: b.id, minutes: 45 });
  assert.strictEqual(s.removeItem(a.id), true);
  assert.strictEqual(s.logs().length, 1, '只应删掉 A 的记录');
  assert.strictEqual(s.logs()[0].itemId, b.id);
  assert.strictEqual(s.removeItem('不存在'), false);
});

test('学习项：按方向 / 状态 / 关键词筛选', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const d1 = s.addDirection({ name: '方向一' });
  const d2 = s.addDirection({ name: '方向二' });
  const a = s.addItem({ name: 'RAG 入门', directionId: d1.id });
  const b = s.addItem({ name: 'React 复习', directionId: d2.id });
  s.setItemProgress(a.id, 100);

  assert.strictEqual(s.items({ directionId: d1.id }).length, 1);
  assert.strictEqual(s.items({ directionId: d1.id })[0].id, a.id);
  assert.strictEqual(s.items({ status: 'done' }).length, 1);
  assert.strictEqual(s.items({ q: 'react' }).length, 1);
  assert.strictEqual(s.items({ q: 'react' })[0].id, b.id);
  assert.strictEqual(s.items({ q: '不存在' }).length, 0);
});

/* ---------- 学习记录 ---------- */

test('学习记录：按日期倒序，同一天按创建先后倒序', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const it = s.addItem({ name: '教程' });
  const t = ctx.App.util.today();
  s.addLog({ itemId: it.id, minutes: 30, date: ctx.App.util.addDays(t, -2) });
  s.addLog({ itemId: it.id, minutes: 40, date: t });
  s.addLog({ itemId: it.id, minutes: 50, date: ctx.App.util.addDays(t, -1) });
  const dates = s.logs().map(l => l.date);
  assert.deepStrictEqual(plain(dates),
    plain([t, ctx.App.util.addDays(t, -1), ctx.App.util.addDays(t, -2)]), '应按日期倒序');
});

test('学习记录：删除一条记录', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const it = s.addItem({ name: '教程' });
  const l = s.addLog({ itemId: it.id, minutes: 30 });
  assert.strictEqual(s.removeLog(l.id), true);
  assert.strictEqual(s.logs().length, 0);
  assert.strictEqual(s.removeLog('不存在'), false);
});

test('学习记录：非法时长与缺失学习项的 addLog 直接拒绝', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const it = s.addItem({ name: '教程' });
  assert.strictEqual(s.addLog({ itemId: it.id, minutes: 0 }), null);
  assert.strictEqual(s.addLog({ itemId: it.id, minutes: -10 }), null);
  assert.strictEqual(s.addLog({ itemId: '', minutes: 30 }), null);
  assert.strictEqual(s.addLog({ itemId: it.id, minutes: 30 }).date, ctx.App.util.today(), '默认日期为今天');
});

test('笔记聚合：只取 note 非空的记录，按学习项隔离', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const a = s.addItem({ name: 'A' });
  const b = s.addItem({ name: 'B' });
  s.addLog({ itemId: a.id, minutes: 30, note: '第一个心得' });
  s.addLog({ itemId: a.id, minutes: 20, note: '  ' });
  s.addLog({ itemId: b.id, minutes: 60, note: 'B 的笔记' });

  const notesA = s.notesForItem(a.id);
  assert.strictEqual(notesA.length, 1, '空白笔记不算');
  assert.strictEqual(notesA[0].note, '第一个心得');
  assert.strictEqual(s.notesForItem(b.id).length, 1);
  assert.strictEqual(s.notesForItem('不存在').length, 0);
});

/* ---------- 统计 ---------- */

test('统计：summary 与本周时长', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const util = ctx.App.util;
  const d = s.addDirection({ name: '方向' });
  const a = s.addItem({ name: 'A', directionId: d.id });
  const b = s.addItem({ name: 'B', directionId: d.id });
  s.setItemProgress(a.id, 100);
  s.setItemProgress(b.id, 50);

  const t = util.today();
  const wkStart = util.startOfWeek(t, 1);
  s.addLog({ itemId: a.id, minutes: 60, date: util.addDays(wkStart, 2) });
  s.addLog({ itemId: b.id, minutes: 30, date: util.addDays(wkStart, -1) });

  const sm = s.summary();
  assert.strictEqual(sm.directions, 1);
  assert.strictEqual(sm.items, 2);
  assert.strictEqual(sm.progress, 75, '(100+50)/2 = 75');
  assert.strictEqual(sm.minutes, 90);
  assert.strictEqual(s.minutesInWeek(t, 1), 60, '只统计本周内的');
  assert.strictEqual(s.minutesOn(util.addDays(wkStart, 2)), 60);
});

/* ---------- DOM 交互 ---------- */

test('DOM：学习项表格渲染 + 点「＋」把进度加 10', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const it = s.addItem({ name: 'LangGraph 教程' });
  ctx.document.querySelector('[data-act="tab"][data-tab="items"]').click();
  assert.strictEqual(ctx.document.querySelectorAll('.tbl tbody tr').length, 1);
  assert.ok(ctx.document.querySelector('.tbl').textContent.indexOf('LangGraph 教程') >= 0);

  ctx.document.querySelector('[data-act="progUp"][data-id="' + it.id + '"]').click();
  assert.strictEqual(s.getItem(it.id).progress, 10);
  ctx.document.querySelector('[data-act="progUp"][data-id="' + it.id + '"]').click();
  assert.strictEqual(s.getItem(it.id).progress, 20);
  ctx.document.querySelector('[data-act="progDown"][data-id="' + it.id + '"]').click();
  assert.strictEqual(s.getItem(it.id).progress, 10);
});

test('DOM：筛选下拉切换方向，表格只剩该方向', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const d1 = s.addDirection({ name: '方向一' });
  const d2 = s.addDirection({ name: '方向二' });
  s.addItem({ name: '甲的项', directionId: d1.id });
  s.addItem({ name: '乙的项', directionId: d2.id });
  ctx.document.querySelector('[data-act="tab"][data-tab="items"]').click();
  assert.strictEqual(ctx.document.querySelectorAll('.tbl tbody tr').length, 2);

  const sel = ctx.document.querySelector('[data-act="filter"][data-fkey="directionId"]');
  sel.value = d1.id;
  fire(ctx.window, sel, 'change');
  assert.strictEqual(ctx.document.querySelectorAll('.tbl tbody tr').length, 1);
  assert.ok(ctx.document.querySelector('.tbl tbody').textContent.indexOf('甲的项') >= 0);
});

test('DOM：搜索框边打边筛，且不重建输入框（保持焦点）', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  s.addItem({ name: 'RAG 入门' });
  s.addItem({ name: 'React 复习' });
  ctx.document.querySelector('[data-act="tab"][data-tab="items"]').click();

  const inp = ctx.document.querySelector('[data-act="filter"][data-fk="filter-q"]');
  const before = inp;
  inp.value = 'react';
  fire(ctx.window, inp, 'input');
  assert.strictEqual(ctx.document.querySelectorAll('.tbl tbody tr').length, 1);
  assert.ok(ctx.document.querySelector('.tbl tbody').textContent.indexOf('React 复习') >= 0);
  assert.strictEqual(ctx.document.querySelector('[data-act="filter"][data-fk="filter-q"]'), before,
    '筛选输入框不应被重建');
});

test('DOM：从方向卡片点「看学习项」跳到学习项页签并预筛该方向', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const d = s.addDirection({ name: '方向甲' });
  s.addItem({ name: '甲的项', directionId: d.id });
  ctx.App.pages.study._renderAll();
  ctx.document.querySelector('[data-act="dirItems"][data-id="' + d.id + '"]').click();
  assert.strictEqual(ctx.App.pages.study._state.tab, 'items');
  assert.strictEqual(ctx.App.pages.study._state.itemFilter.directionId, d.id);
  assert.strictEqual(ctx.document.querySelectorAll('.tbl tbody tr').length, 1);
});

test('DOM：抽屉表单新建方向', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  ctx.document.querySelector('[data-act="newDirection"]').click();
  const name = ctx.document.querySelector('#overlay-host [data-fk="name"]');
  assert.ok(name, '抽屉里应有名称输入框');
  name.value = 'LLM 应用工程';
  ctx.document.querySelector('#overlay-host [data-fk="goal"]').value = '上线一个 Agent';
  ctx.document.querySelector('#overlay-host [data-act="formSave"]').click();

  assert.strictEqual(s.directions().length, 1, '应新增 1 个方向');
  assert.strictEqual(s.directions()[0].name, 'LLM 应用工程');
  assert.strictEqual(ctx.document.getElementById('overlay-host').innerHTML, '', '保存后抽屉应关闭');
});

test('DOM：记一笔 → 落库 → 弹出「进度 +2%」确认条，默认不改动', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const it = s.addItem({ name: '教程', progress: 10 });
  ctx.document.querySelector('[data-act="tab"][data-tab="logs"]').click();
  ctx.document.querySelector('[data-act="newLog"]').click();

  const dur = ctx.document.querySelector('#overlay-host [data-fk="duration"]');
  dur.value = '1h30m';
  ctx.document.querySelector('#overlay-host [data-fk="note"]').value = '今天看完了第 3 章';
  ctx.document.querySelector('#overlay-host [data-act="formSave"]').click();

  assert.strictEqual(s.logs().length, 1, '应记录一笔');
  assert.strictEqual(s.logs()[0].minutes, 90);
  assert.strictEqual(s.logs()[0].note, '今天看完了第 3 章');

  const modal = ctx.document.querySelector('#overlay-host .modal');
  assert.ok(modal, '应弹出进度确认条');
  assert.ok(modal.textContent.indexOf('+2%') >= 0, '应提示进度 +2%');

  /* 点「先不改」→ 进度不变 */
  ctx.document.querySelector('#overlay-host [data-act="cfNo"]').click();
  assert.strictEqual(s.getItem(it.id).progress, 10, '取消后进度不应变');
});

test('DOM：进度确认条点「进度 +2%」才真的改进度', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const it = s.addItem({ name: '教程', progress: 10 });
  ctx.document.querySelector('[data-act="tab"][data-tab="logs"]').click();
  ctx.document.querySelector('[data-act="newLog"]').click();
  ctx.document.querySelector('#overlay-host [data-fk="duration"]').value = '30';
  ctx.document.querySelector('#overlay-host [data-act="formSave"]').click();
  ctx.document.querySelector('#overlay-host [data-act="cfYes"]').click();
  assert.strictEqual(s.getItem(it.id).progress, 12, '确认后进度应 +2');
});

test('DOM：记一笔时长写错时提示错误且不落库', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  s.addItem({ name: '教程' });
  ctx.document.querySelector('[data-act="tab"][data-tab="logs"]').click();
  ctx.document.querySelector('[data-act="newLog"]').click();
  ctx.document.querySelector('#overlay-host [data-fk="duration"]').value = 'h30';
  ctx.document.querySelector('#overlay-host [data-act="formSave"]').click();
  assert.strictEqual(s.logs().length, 0, '非法时长不应落库');
  assert.ok(ctx.document.querySelector('#overlay-host .drawer'), '出错时抽屉应保持打开');
});

test('DOM：学习记录流水显示日期、学习项、时长与笔记', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const it = s.addItem({ name: 'LangGraph 教程' });
  s.addLog({ itemId: it.id, minutes: 90, note: '读完第 3 章' });
  ctx.document.querySelector('[data-act="tab"][data-tab="logs"]').click();
  const txt = ctx.document.getElementById('study-body').textContent;
  assert.ok(txt.indexOf('LangGraph 教程') >= 0);
  assert.ok(txt.indexOf('1h30m') >= 0, '时长应显示为 1h30m');
  assert.ok(txt.indexOf('读完第 3 章') >= 0, '笔记应显示');
  assert.ok(txt.indexOf('共 1 笔') >= 0);
});

test('DOM：学习项「笔记」按钮把该学习项的笔记聚到抽屉里', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const it = s.addItem({ name: '教程' });
  s.addLog({ itemId: it.id, minutes: 30, note: '第一条心得' });
  s.addLog({ itemId: it.id, minutes: 40, note: '第二条心得' });
  ctx.document.querySelector('[data-act="tab"][data-tab="items"]').click();
  ctx.document.querySelector('[data-act="itemNotes"][data-id="' + it.id + '"]').click();
  const drawer = ctx.document.querySelector('#overlay-host .drawer');
  assert.ok(drawer, '应弹出笔记抽屉');
  assert.ok(drawer.textContent.indexOf('第一条心得') >= 0);
  assert.ok(drawer.textContent.indexOf('第二条心得') >= 0);
  assert.ok(drawer.textContent.indexOf('共 2 条') >= 0);
});

test('DOM：删除学习项需要二次确认，确认后才删', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const it = s.addItem({ name: '要删的项' });
  ctx.document.querySelector('[data-act="tab"][data-tab="items"]').click();
  ctx.document.querySelector('[data-act="delItem"][data-id="' + it.id + '"]').click();
  assert.ok(ctx.document.querySelector('#overlay-host .modal'), '应先弹确认框');
  assert.strictEqual(s.items().length, 1, '确认前不应删除');
  ctx.document.querySelector('#overlay-host [data-act="cfYes"]').click();
  assert.strictEqual(s.items().length, 0, '确认后应删除');
});

/* ---------- 落库 / 静态 ---------- */

test('落库：学习数据写进存储层，导出备份里能看到（C4）', async () => {
  const ctx = await startStudy();
  const s = view(ctx);
  const K = ctx.App.schema.KEYS;
  const d = s.addDirection({ name: '持久化方向' });
  const it = s.addItem({ name: '持久化项', directionId: d.id });
  s.addLog({ itemId: it.id, minutes: 45 });

  assert.strictEqual(ctx.App.store.get(K.studyDirections).length, 1);
  assert.strictEqual(ctx.App.store.get(K.studyItems).length, 1);
  assert.strictEqual(ctx.App.store.get(K.studyLogs).length, 1);
  const dump = ctx.App.store.exportJSON();
  assert.strictEqual(dump.data[K.studyDirections].length, 1);
  assert.strictEqual(dump.data[K.studyLogs][0].minutes, 45);
});

test('学习计划：模块文件已接入 index.html，且样式类齐备', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/modules/study.js') >= 0, 'index.html 应加载 study.js');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ['.tbl', '.grid-3', '.tabs', '.prog-cell', '.form'].forEach(cls => {
    assert.ok(css.indexOf(cls) >= 0, '缺少样式 ' + cls);
  });
});
