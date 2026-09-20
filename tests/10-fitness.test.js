'use strict';
/* Step 9 · 健身计划：周计划模板、今日打卡、连续天数、月历热力图、补记。
   对应 PRD 验收：D7（打卡 0→1、热力图变色、再点回落）。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot, APP_FILES, ROOT, plain } = require('./harness');

async function startFitness(seed) {
  const ctx = await boot({ files: APP_FILES, seed: seed });
  await ctx.App.start();
  ctx.App.router.go('fitness');
  return ctx;
}
function f(ctx) { return ctx.App.actions.fitness; }
function fire(win, el, type) {
  el.dispatchEvent(new win.Event(type, { bubbles: true, cancelable: true }));
}

/* ---------- 结构 ---------- */

test('健身计划：三块结构（周计划模板 / 今日打卡 / 打卡历史）', async () => {
  const ctx = await startFitness();
  const heads = Array.prototype.slice.call(ctx.document.querySelectorAll('.card-hd h3')).map(h => h.textContent);
  assert.ok(heads.some(h => h.indexOf('本周计划模板') >= 0), '应有周计划模板');
  assert.ok(heads.some(h => h.indexOf('今天') >= 0), '应有今日打卡');
  assert.ok(heads.some(h => h.indexOf('打卡历史') >= 0), '应有打卡历史');
  assert.ok(ctx.document.querySelector('.hm'), '应有热力图');
});

test('健身计划：周计划默认补齐 7 行，星期一到日', async () => {
  const ctx = await startFitness();
  const plan = f(ctx).plan();
  assert.strictEqual(plan.length, 7);
  const wds = Array.prototype.slice.call(ctx.document.querySelectorAll('.plan-wd')).map(x => x.textContent);
  assert.deepStrictEqual(plain(wds), ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']);
});

/* ---------- 周计划模板 ---------- */

test('周计划：改内容与标记休息日，写库且不影响历史打卡', async () => {
  const ctx = await startFitness();
  const fit = f(ctx);
  const K = ctx.App.schema.KEYS;
  fit.updatePlanRow(3, { content: '胸 + 三头' });
  assert.strictEqual(fit.planRow(3).content, '胸 + 三头');
  fit.toggleRest(7);
  assert.strictEqual(fit.planRow(7).rest, true);

  /* 先有一笔历史打卡，再改周计划，历史不应受影响 */
  const t = ctx.App.util.today();
  fit.toggleToday(ctx.App.util.addDays(t, -1));
  const before = ctx.App.store.get(K.fitnessLogs).length;
  fit.updatePlanRow(3, { content: '改成背' });
  assert.strictEqual(ctx.App.store.get(K.fitnessLogs).length, before, '改模板不应动到打卡记录');
});

test('周计划：DOM 里勾休息日开关生效', async () => {
  const ctx = await startFitness();
  const fit = f(ctx);
  const cb = ctx.document.querySelector('[data-act="toggleRest"][data-id="4"]');
  assert.ok(cb, '应有星期四的休息日开关');
  assert.strictEqual(cb.checked, false);
  cb.click();
  assert.strictEqual(fit.planRow(4).rest, true);
  assert.strictEqual(ctx.document.querySelector('[data-act="toggleRest"][data-id="4"]').checked, true);
});

test('周计划：「把上周套用到本周」能整份还原上周保存的计划', async () => {
  const ctx = await startFitness();
  const fit = f(ctx);
  const K = ctx.App.schema.KEYS;
  const util = ctx.App.util;

  const thisMon = fit.weekKeyOf(util.today());
  const lastMon = util.addDays(thisMon, -7);

  /* 上周保存过一份计划 */
  const lastWeekPlan = [];
  for (var i = 1; i <= 7; i++) lastWeekPlan.push({ id: 'fp_' + i, weekday: i, content: i === 3 ? '上周是背' : '', rest: false });
  const meta = ctx.App.store.get(K.meta);
  meta.fitnessPlanByWeek = {};
  meta.fitnessPlanByWeek[lastMon] = lastWeekPlan;
  ctx.App.store.set(K.meta, meta);

  const r = fit.copyLastWeekToThisWeek();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(fit.planRow(3).content, '上周是背');

  /* 没有上周记录时应给出提示而不是静默失败 */
  const meta2 = ctx.App.store.get(K.meta);
  meta2.fitnessPlanByWeek = {};
  ctx.App.store.set(K.meta, meta2);
  const r2 = fit.copyLastWeekToThisWeek();
  assert.strictEqual(r2.ok, false);
  assert.ok(r2.error);
});

test('周计划：编辑后会把这一周的计划记进 meta（供下周套用）', async () => {
  const ctx = await startFitness();
  const fit = f(ctx);
  const K = ctx.App.schema.KEYS;
  fit.updatePlanRow(2, { content: '跑步 5km' });
  const meta = ctx.App.store.get(K.meta);
  const key = fit.weekKeyOf(ctx.App.util.today());
  assert.ok(meta.fitnessPlanByWeek && meta.fitnessPlanByWeek[key], '应记录本周计划');
  assert.strictEqual(meta.fitnessPlanByWeek[key].filter(p => p.weekday === 2)[0].content, '跑步 5km');
});

/* ---------- D7 打卡与连续天数 ---------- */

test('D7：点一次打卡连续天数 0→1，热力图当天变色；再点回落', async () => {
  const ctx = await startFitness();
  const fit = f(ctx);
  const t = ctx.App.util.today();
  assert.strictEqual(fit.streak(t), 0);
  assert.strictEqual(fit.todayDone(t), false);

  const cellSel = '.hm-cell[data-date="' + t + '"]';
  assert.ok(ctx.document.querySelector(cellSel).classList.contains('lv1'), '没练时是浅色');

  ctx.document.querySelector('[data-act="toggleFitness"]').click();
  assert.strictEqual(fit.todayDone(t), true);
  assert.strictEqual(fit.streak(t), 1);
  assert.ok(ctx.document.querySelector(cellSel).classList.contains('lv2'), '练了应变成深色');

  ctx.document.querySelector('[data-act="toggleFitness"]').click();
  assert.strictEqual(fit.todayDone(t), false);
  assert.strictEqual(fit.streak(t), 0, '再点一次应回落');
  assert.ok(ctx.document.querySelector(cellSel).classList.contains('lv1'));
});

test('D7：连续天数跨天累计，休息日不断连', async () => {
  const ctx = await startFitness();
  const fit = f(ctx);
  const util = ctx.App.util;
  const t = util.today();
  fit.toggleToday(util.addDays(t, -1));
  fit.toggleToday(util.addDays(t, -2));
  assert.strictEqual(fit.streak(util.addDays(t, -1)), 2);

  /* 把 d-1 设成休息日：d 与 d-2 打卡应仍算 2 天 */
  const wd = util.weekdayIndexMon(util.addDays(t, -1));
  fit.updatePlanRow(wd, { rest: true });
  fit.toggleToday(t);
  assert.strictEqual(fit.streak(t), 2, '休息日应跳过不中断');
});

test('健身计划：把某天设为休息日，热力图与今日提示同步变化', async () => {
  const ctx = await startFitness();
  const fit = f(ctx);
  const t = ctx.App.util.today();
  const wd = ctx.App.util.weekdayIndexMon(t);
  fit.updatePlanRow(wd, { rest: true });
  assert.strictEqual(fit.isRestDay(t), true);
  ctx.App.pages.fitness._renderAll();
  const cell = ctx.document.querySelector('.hm-cell[data-date="' + t + '"]');
  assert.ok(cell.classList.contains('rest'), '休息日格子应为 rest 样式');
  assert.ok(ctx.document.getElementById('page-host').textContent.indexOf('休息日，好好休息') >= 0);
});

/* ---------- 热力图与补记 ---------- */

test('热力图：给定月份的关卡映射正确（练了 / 没练 / 休息 / 未来）', async () => {
  const ctx = await startFitness();
  const fit = f(ctx);
  const util = ctx.App.util;
  const t = util.today();
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));

  /* 挑一个未来日期和一个过去日期（都非休息日） */
  const future = util.addDays(t, 3);
  const past = util.addDays(t, -3);
  const map = fit.heatmapData(y, m);
  if (fit.heatmapData(y, m)[future] !== 'rest') assert.strictEqual(map[future], 0, '未来日期应为 0');

  fit.toggleToday(past);
  const map2 = fit.heatmapData(y, m);
  assert.strictEqual(map2[past], 2, '补记后应为 2（练了）');
  assert.strictEqual(fit.monthDone(y, m) >= 1, true);
});

test('热力图：点某天补记 / 取消，未来日期不给点', async () => {
  const ctx = await startFitness();
  const fit = f(ctx);
  const util = ctx.App.util;
  const t = util.today();
  const past = util.addDays(t, -2);

  let r = fit.toggleDay(past, t);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.done, true);
  assert.strictEqual(fit.todayDone(past), true);

  r = fit.toggleDay(past, t);
  assert.strictEqual(r.done, false, '再点应取消');

  r = fit.toggleDay(util.addDays(t, 5), t);
  assert.strictEqual(r.ok, false, '未来日期不应处理');
});

test('热力图：DOM 点格子补记生效', async () => {
  const ctx = await startFitness();
  const fit = f(ctx);
  const past = ctx.App.util.addDays(ctx.App.util.today(), -1);
  const cell = ctx.document.querySelector('.hm-cell[data-date="' + past + '"]');
  assert.ok(cell, '应能找到昨天格子');
  cell.click();
  assert.strictEqual(fit.todayDone(past), true, '点一下应补记');
  ctx.document.querySelector('.hm-cell[data-date="' + past + '"]').click();
  assert.strictEqual(fit.todayDone(past), false, '再点应取消');
});

test('热力图：可以切到上个月看历史，并能回到本月', async () => {
  const ctx = await startFitness();
  const util = ctx.App.util;
  const t = util.today();
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));

  ctx.document.querySelector('[data-act="hmPrev"]').click();
  const expectPrev = m === 1 ? { y: y - 1, m: 12 } : { y: y, m: m - 1 };
  assert.strictEqual(ctx.App.pages.fitness._state.year, expectPrev.y);
  assert.strictEqual(ctx.App.pages.fitness._state.month, expectPrev.m);
  assert.ok(ctx.document.getElementById('page-host').textContent.indexOf(expectPrev.y + ' 年 ' + expectPrev.m + ' 月') >= 0);

  ctx.document.querySelector('[data-act="hmNow"]').click();
  assert.strictEqual(ctx.App.pages.fitness._state.year, y);
  assert.strictEqual(ctx.App.pages.fitness._state.month, m);
});

/* ---------- 落库 / 静态 ---------- */

test('落库：打卡与周计划写进存储层（C4）', async () => {
  const ctx = await startFitness();
  const fit = f(ctx);
  const K = ctx.App.schema.KEYS;
  fit.toggleToday(ctx.App.util.today());
  fit.updatePlanRow(1, { content: '腿' });
  assert.strictEqual(ctx.App.store.get(K.fitnessLogs).length, 1);
  assert.strictEqual(ctx.App.store.get(K.fitnessPlan).length, 7);
  const dump = ctx.App.store.exportJSON();
  assert.strictEqual(dump.data[K.fitnessLogs].length, 1);
  assert.strictEqual(dump.data[K.fitnessPlan].filter(p => p.weekday === 1)[0].content, '腿');
});

test('健身计划：模块文件已接入 index.html，样式类齐备', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/modules/fitness.js') >= 0, 'index.html 应加载 fitness.js');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ['.hm-cell', '.plan-wd', '.lg'].forEach(cls => {
    assert.ok(css.indexOf(cls) >= 0, '缺少样式 ' + cls);
  });
});
