'use strict';
/* Step 12 · 数据与设置：导出 / 导入预览 / 覆盖合并 / 清空兜底 / 存储占用 / 外观 / 偏好 / 关于。
   对应 PRD 验收：E1–E7（备份恢复全链路）。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot, APP_FILES, ROOT, plain } = require('./harness');

async function startSettings(seed) {
  const ctx = await boot({ files: APP_FILES, seed: seed });
  await ctx.App.start();
  ctx.App.router.go('settings');
  return ctx;
}
function s(ctx) { return ctx.App.actions.settings; }
function K(ctx) { return ctx.App.schema.KEYS; }
function pageText(ctx) { return ctx.document.getElementById('page-host').textContent; }
function click(ctx, sel) {
  const el = ctx.document.querySelector(sel);
  assert.ok(el, '找不到可点元素 ' + sel);
  el.click();
  return el;
}
function change(ctx, el) {
  el.dispatchEvent(new ctx.window.Event('change', { bubbles: true, cancelable: true }));
}
function input(ctx, el) {
  el.dispatchEvent(new ctx.window.Event('input', { bubbles: true, cancelable: true }));
}
function typeClearWord(ctx, word) {
  const el = ctx.document.getElementById('clear-word');
  el.value = word;
  input(ctx, el);
  return el;
}

/* ---------- 结构 ---------- */

test('数据与设置：六块内容齐备', async () => {
  const ctx = await startSettings();
  assert.strictEqual(ctx.document.querySelector('.page-head h2').textContent, '数据与设置');
  const heads = Array.prototype.slice.call(ctx.document.querySelectorAll('.cols-settings .card-hd h3')).map(h => h.textContent);
  ['数据备份', '存储占用', '外观', '偏好', '危险区', '关于'].forEach(t => {
    assert.ok(heads.indexOf(t) >= 0, '缺少「' + t + '」区块');
  });
});

/* ---------- E1 导出 ---------- */

test('E1：导出全部数据，文件名、内容、备份时间都对', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  ctx.App.store.set(keys.tasks, [
    { id: 't1', title: '任务一', date: ctx.App.util.today(), done: false },
    { id: 't2', title: '任务二', date: ctx.App.util.today(), done: true }
  ]);
  ctx.App.store.set(keys.gameGames, [{ id: 'g1', name: '某游戏', status: 'playing', rating: 8, createdAt: 1, clearedAt: '' }]);

  const r = s(ctx).exportData();
  assert.strictEqual(r.ok, true);
  assert.ok(r.fileName.indexOf('个人管理-备份-') === 0, '文件名前缀');
  assert.ok(/^个人管理-备份-\d{8}\.json$/.test(r.fileName), '文件名格式应为 个人管理-备份-YYYYMMDD.json：' + r.fileName);
  assert.ok(r.bytes > 0 && r.sizeText.length > 0, '应有体积信息');

  assert.strictEqual(r.payload.app, 'personal-manager');
  assert.strictEqual(r.payload.schemaVersion, 1);
  assert.ok(r.payload.exportedAt > 0);
  assert.strictEqual(plain(r.payload.data[keys.tasks]).length, 2, '导出的任务条数应与库里一致');
  assert.strictEqual(plain(r.payload.data[keys.gameGames])[0].name, '某游戏');
  assert.ok(r.payload.data[keys.settings] && r.payload.data[keys.settings].theme, '应含设置项');
  assert.ok(r.payload.data[keys.meta].lastBackupAt > 0, '文件里应记着这次备份时间');

  const meta = ctx.App.store.get(keys.meta);
  assert.ok(meta.lastBackupAt > 0, '应记录上次备份时间');
  assert.strictEqual(meta.lastBackupAt, r.payload.exportedAt);
});

test('E1：页面上点「导出全部数据」后显示文件名与体积', async () => {
  const ctx = await startSettings();
  click(ctx, '[data-act="export"]');
  assert.ok(pageText(ctx).indexOf('刚导出：个人管理-备份-') >= 0, '页面应回显导出结果');
  assert.ok(pageText(ctx).indexOf('KB') >= 0 || pageText(ctx).indexOf('B') >= 0);
  assert.ok(ctx.App.store.get(K(ctx).meta).lastBackupAt > 0);
  /* 顶部备份提醒应随之消失 */
  ctx.App.renderReminder();
  assert.strictEqual(ctx.document.getElementById('reminder-host').innerHTML, '');
});

/* ---------- E4 预览 ---------- */

test('E4：导入预览给出「将新增 X 条、覆盖 Y 条」的准确数字', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  const today = ctx.App.util.today();
  ctx.App.store.set(keys.tasks, [{ id: 't1', title: '本地 t1', date: today, done: false }]);

  const payload = {
    app: 'personal-manager', schemaVersion: 1, exportedAt: Date.now(),
    data: {
      [keys.tasks]: [
        { id: 't1', title: '文件 t1', date: today, done: true },
        { id: 't2', title: '文件 t2', date: today, done: false },
        { id: 't3', title: '文件 t3', date: today, done: false }
      ]
    }
  };
  const p = s(ctx).preview(payload);
  assert.strictEqual(p.error, null);
  assert.strictEqual(p.add, 2, '应新增 2 条');
  assert.strictEqual(p.overwrite, 1, '应覆盖 1 条');
  assert.strictEqual(p.text, '将新增 2 条、覆盖 1 条');
  const tk = p.byKey.filter(r => r.key === keys.tasks)[0];
  assert.strictEqual(tk.label, '今日计划');
  assert.strictEqual(tk.add, 2);
  assert.strictEqual(tk.overwrite, 1);
});

test('导入：非法文件被拦下，给出明确提示且不动数据', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  ctx.App.store.set(keys.tasks, [{ id: 't1', title: '原样', date: ctx.App.util.today(), done: false }]);

  assert.ok(s(ctx).preview(null).error);
  assert.ok(s(ctx).preview({ hello: 1 }).error, '不是本应用的文件应被拒');
  assert.ok(s(ctx).preview({ app: 'personal-manager' }).error, '缺数据段应被拒');

  const r = s(ctx).applyImport({ nope: 1 }, 'merge');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(ctx.App.store.get(keys.tasks).length, 1, '数据应原封不动');
});

/* ---------- E5 合并去重 ---------- */

test('E5：合并导入按 id 去重，同 id 以文件里的为准，其余追加', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  const today = ctx.App.util.today();
  ctx.App.store.set(keys.tasks, [
    { id: 't1', title: '本地 t1', date: today, done: false },
    { id: 't2', title: '本地 t2', date: today, done: false }
  ]);
  ctx.App.store.set(keys.gameGames, [{ id: 'g1', name: '本地游戏', status: 'wish', rating: 0, createdAt: 1, clearedAt: '' }]);

  const payload = {
    app: 'personal-manager', schemaVersion: 1, exportedAt: Date.now(),
    data: {
      [keys.tasks]: [
        { id: 't1', title: '文件 t1', date: today, done: true },
        { id: 't9', title: '文件新增', date: today, done: false }
      ]
    }
  };
  const r = s(ctx).applyImport(payload, 'merge');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mode, 'merge');

  const tasks = plain(ctx.App.store.get(keys.tasks));
  assert.strictEqual(tasks.length, 3, 't1 被覆盖、t2 保留、t9 追加 → 共 3 条，不能重复');
  const t1 = tasks.filter(x => x.id === 't1')[0];
  assert.strictEqual(t1.title, '文件 t1', '同 id 以文件为准');
  assert.strictEqual(t1.done, true);
  assert.ok(tasks.some(x => x.id === 't2'), '未在文件里的本地记录应保留');
  assert.ok(tasks.some(x => x.id === 't9'));
  assert.strictEqual(ctx.App.store.get(keys.gameGames).length, 1, '合并模式不该动别的集合');
});

/* ---------- E3 + E2 覆盖导入与恢复 ---------- */

test('E3：覆盖导入完全以文件为准；E2：清空后能整份恢复，条数一致', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  const today = ctx.App.util.today();

  /* 造一份完整数据并导出 */
  ctx.App.store.set(keys.tasks, [
    { id: 't1', title: '任务一', date: today, done: false },
    { id: 't2', title: '任务二', date: today, done: true }
  ]);
  ctx.App.store.set(keys.gameGames, [{ id: 'g1', name: '游戏一', status: 'playing', rating: 7, createdAt: 1, clearedAt: '' }]);
  ctx.App.store.set(keys.dietFavorites, [{ id: 'f1', content: '鸡胸肉', order: 0 }]);
  const snapshot = JSON.parse(JSON.stringify(s(ctx).exportData().payload));

  /* E3：覆盖 → 本地换成文件内容 */
  ctx.App.store.set(keys.tasks, [{ id: 'zzz', title: '会被冲掉', date: today, done: false }]);
  const r1 = s(ctx).applyImport(snapshot, 'overwrite');
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.mode, 'overwrite');
  assert.strictEqual(plain(ctx.App.store.get(keys.tasks)).length, 2, '覆盖后应只剩文件里的 2 条');
  assert.ok(!plain(ctx.App.store.get(keys.tasks)).some(x => x.id === 'zzz'));

  /* E2：模拟清空浏览器数据后整份恢复 */
  ctx.App.store.clearAll();
  assert.strictEqual(ctx.App.store.get(keys.tasks).length, 0);
  assert.strictEqual(ctx.App.store.get(keys.gameGames).length, 0);

  const r2 = s(ctx).applyImport(snapshot, 'overwrite');
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(plain(ctx.App.store.get(keys.tasks)).length, 2, '恢复后任务条数应与导出时一致');
  assert.strictEqual(plain(ctx.App.store.get(keys.gameGames))[0].name, '游戏一');
  assert.strictEqual(plain(ctx.App.store.get(keys.dietFavorites))[0].content, '鸡胸肉');
  assert.strictEqual(s(ctx).usageInfo().count, 4, '总条数应与导出时一致');
});

/* ---------- E3：页面上必弹覆盖 / 合并选择 ---------- */

test('E3：导入时先出预览，再让选「覆盖 / 合并」，选完还要二次确认', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  const today = ctx.App.util.today();
  const payload = {
    app: 'personal-manager', schemaVersion: 1, exportedAt: Date.now(),
    data: { [keys.tasks]: [{ id: 't1', title: '来自文件', date: today, done: false }] }
  };

  ctx.App.pages.settings._openImportPreview(payload);
  const drawer = ctx.document.querySelector('#overlay-host .drawer');
  assert.ok(drawer, '应先弹出预览抽屉');
  assert.ok(drawer.textContent.indexOf('将新增 1 条、覆盖 0 条') >= 0, '预览要给出条数');
  assert.ok(ctx.document.querySelector('#overlay-host [data-act="importOverwrite"]'), '应有「按覆盖导入」');
  assert.ok(ctx.document.querySelector('#overlay-host [data-act="importMerge"]'), '应有「按合并导入」');

  /* 点合并 → 二次确认框 */
  click(ctx, '#overlay-host [data-act="importMerge"]');
  const modal = ctx.document.querySelector('#overlay-host .modal');
  assert.ok(modal, '应再弹一次确认框');
  assert.ok(modal.textContent.indexOf('合并') >= 0);
  assert.strictEqual(ctx.App.store.get(keys.tasks).length, 0, '确认前不能落库');

  click(ctx, '#overlay-host [data-act="cfYes"]');
  assert.strictEqual(plain(ctx.App.store.get(keys.tasks)).length, 1, '确认后才导入');
  assert.strictEqual(plain(ctx.App.store.get(keys.tasks))[0].title, '来自文件');
  assert.ok(pageText(ctx).indexOf('上次导入：合并') >= 0, '页面应回显导入结果');
});

test('E3：取消导入则什么都不动', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  const today = ctx.App.util.today();
  ctx.App.store.set(keys.tasks, [{ id: 't1', title: '本地', date: today, done: false }]);
  const payload = {
    app: 'personal-manager', schemaVersion: 1, exportedAt: Date.now(),
    data: { [keys.tasks]: [{ id: 't9', title: '文件', date: today, done: false }] }
  };
  ctx.App.pages.settings._openImportPreview(payload);
  click(ctx, '#overlay-host [data-act="importOverwrite"]');
  click(ctx, '#overlay-host [data-act="cfNo"]');
  const tasks = plain(ctx.App.store.get(keys.tasks));
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].title, '本地');
});

/* ---------- E7 清空兜底 ---------- */

test('E7：清空前按钮要先输入「确认清空」才可点', async () => {
  const ctx = await startSettings();
  const btn = ctx.document.getElementById('clear-ok');
  assert.ok(btn, '应有清空按钮');
  assert.strictEqual(btn.hasAttribute('disabled'), true, '默认不可点');

  typeClearWord(ctx, '随便写点');
  assert.strictEqual(ctx.document.getElementById('clear-ok').hasAttribute('disabled'), true, '写错也不可点');
  assert.strictEqual(s(ctx).canClear('随便写点'), false);

  typeClearWord(ctx, '确认清空');
  assert.strictEqual(ctx.document.getElementById('clear-ok').hasAttribute('disabled'), false, '写对了才可点');
  assert.strictEqual(s(ctx).canClear(' 确认清空 '), true, '两侧空格应被忽略');
});

test('E7：清空会先自动导出快照，偏好设置保留', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  const today = ctx.App.util.today();
  ctx.App.store.set(keys.tasks, [{ id: 't1', title: '要没了', date: today, done: false }]);
  ctx.App.store.set(keys.gameGames, [{ id: 'g1', name: '也没了', status: 'wish', rating: 0, createdAt: 1, clearedAt: '' }]);
  s(ctx).setTheme('dark');
  s(ctx).setWeekStartsOn(0);
  s(ctx).setDefaultPage('study');

  const r = s(ctx).clearAll();
  assert.strictEqual(r.ok, true);
  assert.ok(r.snapshot && r.snapshot.fileName.indexOf('个人管理-备份-') === 0, '清空前应自动导出一份快照');
  assert.strictEqual(plain(r.snapshot.payload.data[keys.tasks]).length, 1, '快照里应含清空前的数据');
  assert.strictEqual(plain(r.snapshot.payload.data[keys.gameGames])[0].name, '也没了');

  assert.strictEqual(ctx.App.store.get(keys.tasks).length, 0, '业务数据应清空');
  assert.strictEqual(ctx.App.store.get(keys.gameGames).length, 0);
  assert.strictEqual(s(ctx).usageInfo().count, 0);

  const kept = s(ctx).get();
  assert.strictEqual(kept.theme, 'dark', '偏好设置应保留');
  assert.strictEqual(kept.weekStartsOn, 0);
  assert.strictEqual(kept.defaultPage, 'study');

  const meta = ctx.App.store.get(keys.meta);
  assert.ok(meta.lastSnapshotAt > 0);
  assert.strictEqual(meta.snapshotFileName, r.snapshot.fileName);
});

test('E7：页面上走一遍清空（输入 → 确认 → 清空），取消则不动', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  ctx.App.store.set(keys.tasks, [{ id: 't1', title: '任务', date: ctx.App.util.today(), done: false }]);
  ctx.App.pages.settings._renderAll();

  /* 没输入就点，应被拦下 */
  click(ctx, '[data-act="clearAll"]');
  assert.strictEqual(ctx.document.querySelector('#overlay-host .modal'), null, '不该弹确认框');
  assert.strictEqual(ctx.App.store.get(keys.tasks).length, 1);

  /* 先取消 */
  typeClearWord(ctx, '确认清空');
  click(ctx, '[data-act="clearAll"]');
  assert.ok(ctx.document.querySelector('#overlay-host .modal'), '应弹确认框');
  click(ctx, '#overlay-host [data-act="cfNo"]');
  assert.strictEqual(ctx.App.store.get(keys.tasks).length, 1, '取消后数据还在');

  /* 再确认 */
  typeClearWord(ctx, '确认清空');
  click(ctx, '[data-act="clearAll"]');
  click(ctx, '#overlay-host [data-act="cfYes"]');
  assert.strictEqual(ctx.App.store.get(keys.tasks).length, 0, '确认后应清空');
  assert.ok(ctx.document.getElementById('toast-host').textContent.indexOf('已清空，快照：') >= 0,
    '应提示快照文件名');
});

/* ---------- E6 备份提醒 ---------- */

test('E6：超过提醒间隔出现顶部提示条，关掉当天不再出现', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);

  /* 刚备份过 → 不提醒 */
  ctx.App.store.set(keys.meta, Object.assign({}, ctx.App.store.get(keys.meta), { lastBackupAt: Date.now() }));
  assert.strictEqual(ctx.App.shouldRemindBackup(), false);
  ctx.App.renderReminder();
  assert.strictEqual(ctx.document.getElementById('reminder-host').innerHTML, '');

  /* 上次备份改成 8 天前 → 提醒 */
  const eightDaysAgo = Date.now() - 8 * 86400000;
  ctx.App.store.set(keys.meta, Object.assign({}, ctx.App.store.get(keys.meta), { lastBackupAt: eightDaysAgo, backupTipClosedAt: null }));
  assert.strictEqual(ctx.App.shouldRemindBackup(), true);
  ctx.App.renderReminder();
  const host = ctx.document.getElementById('reminder-host');
  assert.ok(host.textContent.indexOf('备份') >= 0, '应出现备份提示条');

  /* 关掉 → 当天不再出现 */
  host.querySelector('[data-act="closeReminder"]').click();
  assert.strictEqual(host.innerHTML, '', '关掉后提示条应消失');
  assert.strictEqual(ctx.App.shouldRemindBackup(), false, '当天不该再提醒');
  assert.strictEqual(ctx.App.store.get(keys.meta).backupTipClosedAt, ctx.App.util.today());

  /* 把提醒间隔改大到 30 天 → 8 天前也不提醒 */
  ctx.App.store.set(keys.meta, Object.assign({}, ctx.App.store.get(keys.meta), { backupTipClosedAt: null }));
  s(ctx).setBackupRemindDays(30);
  assert.strictEqual(ctx.App.shouldRemindBackup(), false);
});

/* ---------- 存储占用 ---------- */

test('存储占用：条数与估算容量准确，页面列出来', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  ctx.App.store.set(keys.tasks, [
    { id: 't1', title: 'a', date: ctx.App.util.today(), done: false },
    { id: 't2', title: 'b', date: ctx.App.util.today(), done: false }
  ]);
  ctx.App.store.set(keys.studyItems, [{ id: 'i1', name: 'x', progress: 0, status: 'todo' }]);

  const u = s(ctx).usageInfo();
  assert.strictEqual(u.count, 3);
  assert.ok(u.bytes > 0);
  assert.ok(u.text.length > 0);
  assert.strictEqual(u.near, false, '小数据量不该告警');
  const labels = plain(u.rows.map(r => r.label));
  assert.ok(labels.indexOf('今日计划') >= 0);
  assert.ok(labels.indexOf('学习项') >= 0);
  assert.strictEqual(u.rows.filter(r => r.label === '今日计划')[0].count, 2);

  ctx.App.pages.settings._renderAll();
  const txt = pageText(ctx);
  assert.ok(txt.indexOf('合计') >= 0 && txt.indexOf('3 条') >= 0);
  assert.ok(txt.indexOf('估算占用') >= 0);
});

test('存储占用：接近上限时给出提醒', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  const today = ctx.App.util.today();
  const per = 20000;
  const n = Math.ceil((s(ctx).storageLimit + 1024) / per) + 2;
  const big = [];
  for (let i = 0; i < n; i++) {
    big.push({ id: 'n' + i, title: 'x'.repeat(per), date: today, done: false });
  }
  ctx.App.store.set(keys.devNotes, big);

  const u = s(ctx).usageInfo();
  assert.strictEqual(u.near, true, '超过上限应告警（实测 ' + u.text + '）');
  ctx.App.pages.settings._renderAll();
  assert.ok(pageText(ctx).indexOf('接近浏览器上限') >= 0);
});

/* ---------- 外观 / 偏好 ---------- */

test('外观：切主题立刻生效并落库，顶栏同步', async () => {
  const ctx = await startSettings();
  assert.strictEqual(ctx.App.store.get(K(ctx).settings).theme, 'auto');

  const sel = ctx.document.getElementById('set-theme');
  sel.value = 'dark';
  change(ctx, sel);

  assert.strictEqual(s(ctx).get().theme, 'dark');
  assert.strictEqual(ctx.App.currentThemeName(), 'dark');
  assert.strictEqual(ctx.document.documentElement.dataset.theme, 'dark', 'html data-theme 应跟着变');
  assert.strictEqual(ctx.document.getElementById('theme-switch').value, 'dark', '顶栏主题选择器应同步');

  /* 非法主题被拒 */
  assert.strictEqual(s(ctx).setTheme('neon'), null);
  assert.strictEqual(s(ctx).get().theme, 'dark');
});

test('外观：白天时段可改，跟随时间时按区间判定', async () => {
  const ctx = await startSettings();
  const startEl = ctx.document.getElementById('set-dayStart');
  startEl.value = '07:30';
  input(ctx, startEl);
  assert.strictEqual(s(ctx).get().dayStart, '07:30');
  assert.strictEqual(ctx.App.store.get(K(ctx).settings).dayStart, '07:30', '应即时落库');

  const endEl = ctx.document.getElementById('set-dayEnd');
  endEl.value = '21:00';
  input(ctx, endEl);
  assert.strictEqual(s(ctx).get().dayEnd, '21:00');

  /* 跟随时间：现在落在区间内 → 白天 */
  s(ctx).setTheme('auto');
  assert.strictEqual(ctx.App.currentThemeName(), 'light');
  /* 把区间挪到今天之外 → 晚上 */
  s(ctx).setDayRange('00:00', '00:01');
  const nm = ctx.App.util.hhmm();
  const expect = (nm >= '00:00' && nm < '00:01') ? 'light' : 'dark';
  assert.strictEqual(ctx.App.currentThemeName(), expect);
});

test('偏好：一周第一天、默认首页都能改并即时落库', async () => {
  const ctx = await startSettings();
  assert.strictEqual(s(ctx).weekStartsOn(), 1, '默认周一起');

  const wk = ctx.document.getElementById('set-weekStart');
  wk.value = '0';
  change(ctx, wk);
  assert.strictEqual(s(ctx).get().weekStartsOn, 0);
  assert.strictEqual(s(ctx).weekStartsOn(), 0, 'store 侧应能读到');

  const dp = ctx.document.getElementById('set-defaultPage');
  dp.value = 'game';
  change(ctx, dp);
  assert.strictEqual(s(ctx).get().defaultPage, 'game');
  assert.strictEqual(s(ctx).setDefaultPage('不存在'), null, '非法页面应被拒');

  /* 各模块按该偏好分周：周日开始算一周 */
  const util = ctx.App.util;
  const sunday = '2026-09-20';            /* 周日 */
  assert.strictEqual(util.startOfWeek(sunday, 0), '2026-09-20');
  s(ctx).setWeekStartsOn(1);
  assert.strictEqual(util.startOfWeek(sunday, s(ctx).weekStartsOn()), '2026-09-14');
});

test('偏好：默认首页在启动时生效', async () => {
  const ctx = await boot({
    files: APP_FILES,
    seed: { 'pm.settings': JSON.stringify({ theme: 'light', defaultPage: 'game' }) }
  });
  await ctx.App.start();
  assert.strictEqual(ctx.App.router.current.page, 'game', '没有 hash 时应进偏好里设的页面');
  assert.strictEqual(ctx.document.querySelector('.page-head h2').textContent, '游戏娱乐');
});

/* ---------- 关于 ---------- */

test('关于：版本号 + 各模块数据量', async () => {
  const ctx = await startSettings();
  const keys = K(ctx);
  ctx.App.store.set(keys.tasks, [{ id: 't1', title: 'a', date: ctx.App.util.today(), done: false }]);
  ctx.App.store.set(keys.gameGames, [{ id: 'g1', name: 'g', status: 'wish', rating: 0, createdAt: 1, clearedAt: '' }]);

  const a = s(ctx).about();
  assert.ok(/^\d+\.\d+\.\d+$/.test(a.version), '应有版本号');
  assert.strictEqual(a.total, 2);
  const map = {};
  a.groups.forEach(g => { map[g.label] = g.count; });
  assert.strictEqual(map['今日'], 1);
  assert.strictEqual(map['游戏娱乐'], 1);
  assert.strictEqual(map['学习计划'], 0);

  ctx.App.pages.settings._renderAll();
  assert.ok(pageText(ctx).indexOf('v' + a.version) >= 0);
});

/* ---------- 落库 / 静态 ---------- */

test('设置项落进存储层，刷新后仍在', async () => {
  const ctx = await startSettings();
  s(ctx).setTheme('light');
  s(ctx).setWeekStartsOn(0);
  s(ctx).setDefaultPage('diet');
  s(ctx).setBackupRemindDays(14);

  const raw = JSON.parse(ctx.window.localStorage.getItem(K(ctx).settings));
  assert.strictEqual(raw.theme, 'light');
  assert.strictEqual(raw.weekStartsOn, 0);
  assert.strictEqual(raw.defaultPage, 'diet');
  assert.strictEqual(raw.backupRemindDays, 14);
  assert.strictEqual(s(ctx).setBackupRemindDays(0), null, '0 天不合法');
});

test('数据与设置：模块已接入 index.html，样式类齐备', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/modules/settings.js') >= 0, 'index.html 应加载 settings.js');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ['.cols-settings', '.warn-txt', '.import-file', '.import-preview'].forEach(cls => {
    assert.ok(css.indexOf(cls) >= 0, '缺少样式 ' + cls);
  });
});
