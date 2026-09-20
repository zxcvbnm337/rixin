'use strict';
/* Step 10 · 饮食计划：四餐记录与勾选、常用项、日期切换、历史查看。
   对应 PRD 验收：D8（四格填完自动勾上、切到昨天能看到昨天的记录）。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot, APP_FILES, ROOT, plain } = require('./harness');

async function startDiet(seed) {
  const ctx = await boot({ files: APP_FILES, seed: seed });
  await ctx.App.start();
  ctx.App.router.go('diet');
  return ctx;
}
function d(ctx) { return ctx.App.actions.diet; }
function fire(win, el, type) {
  el.dispatchEvent(new win.Event(type, { bubbles: true, cancelable: true }));
}
function enter(win, el) {
  el.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}
function mealInput(ctx, meal) {
  return ctx.document.querySelector('input[data-act="mealInp"][data-id2="' + meal + '"]');
}

/* ---------- 结构 ---------- */

test('饮食计划：日期切换 + 四格 + 常用项 + 历史四块齐备', async () => {
  const ctx = await startDiet();
  assert.ok(ctx.document.querySelector('.datenav'), '应有日期切换');
  assert.strictEqual(ctx.document.querySelectorAll('.meal-row').length, 4, '应有四格');
  const labels = Array.prototype.slice.call(ctx.document.querySelectorAll('.meal-lb')).map(x => x.textContent);
  assert.deepStrictEqual(plain(labels), ['早餐', '午餐', '晚餐', '加餐']);
  const heads = Array.prototype.slice.call(ctx.document.querySelectorAll('.card-hd h3')).map(h => h.textContent);
  assert.ok(heads.some(h => h.indexOf('常用项') >= 0), '应有常用项面板');
  assert.ok(heads.some(h => h.indexOf('历史') >= 0), '应有历史');
});

test('D10：无数据时不空白，四处都有引导', async () => {
  const ctx = await startDiet();
  assert.strictEqual(ctx.document.querySelectorAll('.meal-row').length, 4, '四格应始终在');
  const txt = ctx.document.getElementById('page-host').textContent;
  assert.ok(txt.indexOf('还没有常用项') >= 0);
  assert.ok(txt.indexOf('还没有记录') >= 0);
});

/* ---------- D8 ---------- */

test('D8：四格各填内容后自动勾上，已填/已勾计数同步', async () => {
  const ctx = await startDiet();
  const t = ctx.App.util.today();
  ['breakfast', 'lunch', 'dinner', 'snack'].forEach(function (m) {
    const inp = mealInput(ctx, m);
    inp.value = '吃了-' + m;
    fire(ctx.window, inp, 'change');
  });
  const s = d(ctx).summaryOf(t);
  assert.strictEqual(s.filled, 4, '四格都应填了内容');
  assert.strictEqual(s.done, 4, '填完应自动勾上');
  const txt = ctx.document.getElementById('page-host').textContent;
  assert.ok(txt.indexOf('已填 4 / 4') >= 0);
  assert.ok(txt.indexOf('已勾 4 / 4') >= 0);
  assert.strictEqual(ctx.document.querySelectorAll('.ck.on').length, 4, '四格勾选框都应是选中态');
});

test('D8：清空内容自动取消勾选；也能手动勾选/取消', async () => {
  const ctx = await startDiet();
  const t = ctx.App.util.today();
  const inp = mealInput(ctx, 'lunch');
  inp.value = '面条';
  fire(ctx.window, inp, 'change');
  assert.strictEqual(d(ctx).mealsOn(t).lunch.done, true);

  const inp2 = mealInput(ctx, 'lunch');
  inp2.value = '';
  fire(ctx.window, inp2, 'change');
  assert.strictEqual(d(ctx).mealsOn(t).lunch.done, false, '清空应取消勾选');

  /* 手动勾上（内容还在时） */
  mealInput(ctx, 'lunch').value = '面条';
  fire(ctx.window, mealInput(ctx, 'lunch'), 'change');
  ctx.document.querySelector('[data-act="toggleMeal"][data-id2="lunch"]').click();
  assert.strictEqual(d(ctx).mealsOn(t).lunch.done, false, '手动取消应生效');
  assert.strictEqual(d(ctx).mealsOn(t).lunch.content, '面条', '取消勾不应清空内容');
});

test('D8：切到昨天能看到昨天的记录，标题标「补记」', async () => {
  const ctx = await startDiet();
  const util = ctx.App.util;
  const t = util.today();
  const y = util.addDays(t, -1);

  d(ctx).setMealContent(y, 'dinner', '昨天的晚饭');
  d(ctx).setMealContent(t, 'breakfast', '今天的早饭');
  ctx.App.pages.diet._renderAll();
  assert.strictEqual(mealInput(ctx, 'dinner').value, '', '今天不该看到昨天的记录');

  ctx.document.querySelector('[data-act="prevDay"]').click();
  assert.strictEqual(ctx.App.pages.diet._state.date, y);
  assert.strictEqual(mealInput(ctx, 'dinner').value, '昨天的晚饭', '切到昨天应看到昨天记录');
  assert.strictEqual(mealInput(ctx, 'breakfast').value, '', '昨天的早餐是空的');
  assert.ok(ctx.document.querySelector('.dn-txt').textContent.indexOf('补记') >= 0);

  ctx.document.querySelector('[data-act="nextDay"]').click();
  assert.strictEqual(ctx.App.pages.diet._state.date, t, '再点应回到今天');
  assert.strictEqual(mealInput(ctx, 'breakfast').value, '今天的早饭');
});

/* ---------- 常用项 ---------- */

test('常用项：回车新增、去重、删除', async () => {
  const ctx = await startDiet();
  const inp = ctx.document.getElementById('fav-input');
  inp.value = '鸡蛋 + 牛奶';
  enter(ctx.window, inp);
  assert.strictEqual(d(ctx).favorites().length, 1);
  assert.strictEqual(inp.value, '', '添加后应清空输入框');

  const inp2 = ctx.document.getElementById('fav-input');
  inp2.value = '鸡蛋 + 牛奶';
  enter(ctx.window, inp2);
  assert.strictEqual(d(ctx).favorites().length, 1, '重复项不应加入');

  const inp3 = ctx.document.getElementById('fav-input');
  inp3.value = '   ';
  enter(ctx.window, inp3);
  assert.strictEqual(d(ctx).favorites().length, 1, '空项不应加入');

  const fav = d(ctx).favorites()[0];
  ctx.document.querySelector('[data-act="delFav"][data-id="' + fav.id + '"]').click();
  assert.strictEqual(d(ctx).favorites().length, 0);
});

test('常用项：支持上下排序，常用排前面', async () => {
  const ctx = await startDiet();
  const a = d(ctx).addFavorite('A');
  const b = d(ctx).addFavorite('B');
  assert.deepStrictEqual(plain(d(ctx).favorites().map(f => f.content)), ['A', 'B']);
  ctx.App.pages.diet._renderAll();

  ctx.document.querySelector('[data-act="favDown"][data-id="' + a.id + '"]').click();
  assert.deepStrictEqual(plain(d(ctx).favorites().map(f => f.content)), ['B', 'A']);
  ctx.document.querySelector('[data-act="favUp"][data-id="' + a.id + '"]').click();
  assert.deepStrictEqual(plain(d(ctx).favorites().map(f => f.content)), ['A', 'B']);
  /* 已在最前不能再上移 */
  assert.strictEqual(d(ctx).moveFavorite(a.id, -1), false);
});

test('常用项：点名字就填进最后碰过的那一格', async () => {
  const ctx = await startDiet();
  const t = ctx.App.util.today();
  const fav = d(ctx).addFavorite('鸡胸肉沙拉');
  ctx.App.pages.diet._renderAll();

  /* 默认填早餐 */
  ctx.document.querySelector('[data-act="useFav"][data-id="' + fav.id + '"]').click();
  assert.strictEqual(d(ctx).mealsOn(t).breakfast.content, '鸡胸肉沙拉');
  assert.strictEqual(d(ctx).mealsOn(t).breakfast.done, true, '填了内容应自动勾上');

  /* 先点进晚餐那一格，再点常用项 → 应填晚餐 */
  mealInput(ctx, 'dinner').click();
  assert.strictEqual(ctx.App.pages.diet._state.lastMeal, 'dinner');
  ctx.document.querySelector('[data-act="useFav"][data-id="' + fav.id + '"]').click();
  assert.strictEqual(d(ctx).mealsOn(t).dinner.content, '鸡胸肉沙拉');
  assert.ok(ctx.document.getElementById('page-host').textContent.indexOf('「晚餐」') >= 0,
    '提示文案应跟着当前格变化');
});

test('常用项：「从常用选」下拉选一项也能填进对应格', async () => {
  const ctx = await startDiet();
  const t = ctx.App.util.today();
  const fav = d(ctx).addFavorite('水煮蛋');
  ctx.App.pages.diet._renderAll();

  const sel = ctx.document.querySelector('select[data-act="pickFav"][data-key="lunch"]');
  assert.ok(sel, '午餐格应有常用项下拉');
  sel.value = fav.id;
  fire(ctx.window, sel, 'change');
  assert.strictEqual(d(ctx).mealsOn(t).lunch.content, '水煮蛋');
});

/* ---------- 历史 ---------- */

test('历史：按日期倒序，默认折叠，点开看当天四格', async () => {
  const ctx = await startDiet();
  const util = ctx.App.util;
  const t = util.today();
  d(ctx).setMealContent(t, 'lunch', '今天的午饭');
  d(ctx).setMealContent(util.addDays(t, -1), 'lunch', '昨天的午饭');
  ctx.App.pages.diet._renderAll();

  const hds = Array.prototype.slice.call(ctx.document.querySelectorAll('.hist-hd')).map(h => h.dataset.date);
  assert.deepStrictEqual(plain(hds), plain([t, util.addDays(t, -1)]), '应按日期倒序');
  assert.strictEqual(ctx.document.querySelectorAll('.hist-bd').length, 0, '默认应折叠');

  ctx.document.querySelector('[data-act="toggleHist"][data-date="' + util.addDays(t, -1) + '"]').click();
  const bd = ctx.document.querySelector('.hist-bd');
  assert.ok(bd, '应展开');
  assert.ok(bd.textContent.indexOf('昨天的午饭') >= 0);

  ctx.document.querySelector('[data-act="toggleHist"][data-date="' + util.addDays(t, -1) + '"]').click();
  assert.strictEqual(ctx.document.querySelectorAll('.hist-bd').length, 0, '再点应收起');
});

test('历史：只列有记录的日期', async () => {
  const ctx = await startDiet();
  const util = ctx.App.util;
  assert.strictEqual(d(ctx).history().length, 0, '没有记录时应为空');
  d(ctx).setMealContent(util.today(), 'lunch', 'x');
  const h = d(ctx).history();
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].date, util.today());
  assert.strictEqual(h[0].summary.filled, 1);
});

/* ---------- 落库 / 静态 ---------- */

test('落库：饮食记录与常用项写进存储层（C4）', async () => {
  const ctx = await startDiet();
  const K = ctx.App.schema.KEYS;
  d(ctx).setMealContent(ctx.App.util.today(), 'breakfast', '豆浆油条');
  d(ctx).addFavorite('豆浆油条');
  assert.strictEqual(ctx.App.store.get(K.dietRecords).length, 1);
  assert.strictEqual(ctx.App.store.get(K.dietFavorites).length, 1);
  const dump = ctx.App.store.exportJSON();
  assert.strictEqual(dump.data[K.dietRecords][0].content, '豆浆油条');
});

test('饮食计划：模块文件已接入 index.html，样式类齐备', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/modules/diet.js') >= 0, 'index.html 应加载 diet.js');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ['.meal-row', '.meal-grid', '.fav-list', '.hist-hd', '.hist-bd'].forEach(cls => {
    assert.ok(css.indexOf(cls) >= 0, '缺少样式 ' + cls);
  });
});
