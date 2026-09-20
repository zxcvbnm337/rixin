'use strict';
/* Step 4 · 外壳：侧边栏、顶栏、主题、备份提醒、样式变量一致性 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createApp, boot, APP_FILES, CORE_FILES, ROOT, plain } = require('./harness');

async function startShell(seed) {
  const ctx = await boot({ files: APP_FILES, seed: seed });
  await ctx.App.start();
  return ctx;
}

test('外壳：启动后侧边栏渲染 4 组共 9 个导航入口', async () => {
  const ctx = await startShell();
  const box = ctx.document.getElementById('sidebar');
  assert.strictEqual(box.querySelectorAll('.sb-group').length, 4, '应有 4 个分组');
  assert.strictEqual(box.querySelectorAll('.nav-item').length, 9, '应有 9 个导航入口');
  assert.ok(box.querySelector('.nav-item.on'), '当前页应有高亮');
});

test('外壳：点击导航切换页面且不刷新浏览器', async () => {
  const ctx = await startShell();
  const box = ctx.document.getElementById('sidebar');
  const study = Array.prototype.slice.call(box.querySelectorAll('.nav-item'))
    .filter(n => n.dataset.page === 'study')[0];
  study.click();
  assert.strictEqual(ctx.window.location.hash, '#/study');
  assert.strictEqual(ctx.App.router.current.page, 'study');
});

test('外壳：顶栏显示当前页标题与说明', async () => {
  const ctx = await startShell();
  const tb = ctx.document.getElementById('topbar');
  assert.ok(tb.querySelector('.tb-title').textContent.indexOf('首页总览') >= 0);
  assert.ok(tb.querySelector('.tb-sub'), '应有说明文字');
  assert.ok(tb.querySelector('#global-search'), '应有全局搜索框');
  assert.ok(tb.querySelector('#theme-switch'), '应有主题切换');
});

test('外壳：切到别的页面后顶栏标题跟着变', async () => {
  const ctx = await startShell();
  ctx.App.router.go('consult');
  const tb = ctx.document.getElementById('topbar');
  assert.ok(tb.querySelector('.tb-title').textContent.indexOf('咨询工作') >= 0);
});

test('主题：auto 模式下白天用浅色、夜里用深色（B3）', async () => {
  const ctx = await startShell();
  const App = ctx.App;
  App.util.hhmm = function () { return '14:00'; };
  assert.strictEqual(App.currentThemeName(), 'light');
  assert.strictEqual(App.applyTheme(), 'light');
  assert.strictEqual(ctx.document.documentElement.dataset.theme, 'light');

  App.util.hhmm = function () { return '23:30'; };
  assert.strictEqual(App.applyTheme(), 'dark');
  assert.strictEqual(ctx.document.documentElement.dataset.theme, 'dark');
});

test('主题：白天时段可自定义，边界为左闭右开', async () => {
  const ctx = await startShell();
  const App = ctx.App;
  const K = App.schema.KEYS;
  const s = App.store.get(K.settings);
  s.theme = 'auto'; s.dayStart = '08:00'; s.dayEnd = '20:00';
  App.store.set(K.settings, s);

  App.util.hhmm = function () { return '08:00'; };
  assert.strictEqual(App.currentThemeName(), 'light', '起始时刻算白天');
  App.util.hhmm = function () { return '20:00'; };
  assert.strictEqual(App.currentThemeName(), 'dark', '结束时刻算夜里');
  App.util.hhmm = function () { return '07:59'; };
  assert.strictEqual(App.currentThemeName(), 'dark');
});

test('主题：手动锁定后不再跟随时间（B2）', async () => {
  const ctx = await startShell();
  const App = ctx.App;
  const K = App.schema.KEYS;
  App.util.hhmm = function () { return '14:00'; };
  const sw = ctx.document.getElementById('theme-switch');
  sw.value = 'dark';
  sw.onchange();

  assert.strictEqual(App.store.get(K.settings).theme, 'dark', '设置应被写入');
  assert.strictEqual(ctx.document.documentElement.dataset.theme, 'dark', '应立刻变深色');

  const storage = require('./harness').dumpStorage(ctx.window);
  const next = createApp({ files: APP_FILES, seed: storage });
  await next.App.start();
  assert.strictEqual(next.App.store.get(K.settings).theme, 'dark', '刷新后主题选择应保留');
  assert.strictEqual(next.document.documentElement.dataset.theme, 'dark');
});

test('主题：顶栏选择项包含 跟随时间/白天/晚上 三种', async () => {
  const ctx = await startShell();
  const opts = Array.prototype.slice.call(ctx.document.querySelectorAll('#theme-switch option')).map(o => o.value);
  assert.deepStrictEqual(opts, ['auto', 'light', 'dark']);
});

test('侧边栏底部显示数据条数与当前主题', async () => {
  const ctx = await startShell();
  const txt = ctx.document.querySelector('.sb-foot').textContent;
  assert.ok(txt.indexOf('共 0 条数据') >= 0);
  assert.ok(txt.indexOf('主题') >= 0);
});

test('备份提醒：上次备份在 7 天内不提示（E6）', async () => {
  const ctx = await startShell();
  const App = ctx.App;
  const K = App.schema.KEYS;
  const meta = App.store.get(K.meta);
  meta.createdAt = Date.now();
  meta.lastBackupAt = Date.now() - 3 * 86400000;
  App.store.set(K.meta, meta);
  assert.strictEqual(App.shouldRemindBackup(), false);
  assert.strictEqual(ctx.document.getElementById('reminder-host').innerHTML, '');
});

test('备份提醒：超过 7 天在顶部出现提示条（E6）', async () => {
  const ctx = await startShell();
  const App = ctx.App;
  const K = App.schema.KEYS;
  const meta = App.store.get(K.meta);
  meta.createdAt = Date.now();
  meta.lastBackupAt = Date.now() - 8 * 86400000;
  meta.backupTipClosedAt = null;
  App.store.set(K.meta, meta);
  App.renderReminder();
  const host = ctx.document.getElementById('reminder-host');
  assert.strictEqual(App.shouldRemindBackup(), true);
  assert.ok(host.querySelector('.reminder'), '应出现提示条');
  assert.ok(host.textContent.indexOf('备份') >= 0);
});

test('备份提醒：关闭后当天不再出现（E6）', async () => {
  const ctx = await startShell();
  const App = ctx.App;
  const K = App.schema.KEYS;
  const meta = App.store.get(K.meta);
  meta.createdAt = Date.now();
  meta.lastBackupAt = Date.now() - 8 * 86400000;
  meta.backupTipClosedAt = null;
  App.store.set(K.meta, meta);
  App.renderReminder();

  const close = ctx.document.querySelector('.reminder .rm-close');
  close.click();
  assert.strictEqual(App.shouldRemindBackup(), false, '关闭后当天不应再提示');
  assert.strictEqual(ctx.document.getElementById('reminder-host').innerHTML, '');
});

test('备份提醒：从没备份过时以首次使用时间为基准', async () => {
  const ctx = await startShell();
  const App = ctx.App;
  const K = App.schema.KEYS;
  const meta = App.store.get(K.meta);
  meta.createdAt = Date.now() - 30 * 86400000;
  meta.lastBackupAt = null;
  meta.backupTipClosedAt = null;
  App.store.set(K.meta, meta);
  assert.strictEqual(App.shouldRemindBackup(), true, '30 天没备份应提示');

  meta.createdAt = Date.now() - 3600000;
  App.store.set(K.meta, meta);
  assert.strictEqual(App.shouldRemindBackup(), false, '刚用 1 小时不应提示');
});

test('全局快捷键：Ctrl+3 切到第 3 个导航项（F3）', async () => {
  const ctx = await startShell();
  const ev = new ctx.window.KeyboardEvent('keydown', { key: '3', ctrlKey: true, bubbles: true });
  ctx.document.dispatchEvent(ev);
  assert.strictEqual(ctx.App.router.current.page, 'study', '第 3 项是学习计划');
});

test('全局快捷键：/ 聚焦搜索框（F3）', async () => {
  const ctx = await startShell();
  const ev = new ctx.window.KeyboardEvent('keydown', { key: '/', bubbles: true });
  ctx.document.dispatchEvent(ev);
  assert.strictEqual(ctx.document.activeElement.id, 'global-search');
});

test('全局快捷键：Esc 关闭浮层（F3）', async () => {
  const ctx = await startShell();
  ctx.App.ui.drawer('测试抽屉', '<p>x</p>');
  assert.ok(ctx.document.querySelector('.drawer'));
  const ev = new ctx.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  ctx.document.dispatchEvent(ev);
  assert.strictEqual(ctx.document.getElementById('overlay-host').innerHTML, '');
});

test('全局快捷键：在输入框里打字不会触发单键快捷键', async () => {
  const ctx = await startShell();
  const before = ctx.App.router.current.page;
  const ev = new ctx.window.KeyboardEvent('keydown', { key: 'n', bubbles: true });
  Object.defineProperty(ev, 'target', { value: ctx.document.getElementById('global-search') });
  ctx.document.dispatchEvent(ev);
  assert.strictEqual(ctx.App.router.current.page, before, '输入时不应用快捷键切页');
});

test('全局搜索：能按关键词命中任务、笔记、游戏与客户（F4）', async () => {
  const ctx = await startShell();
  const App = ctx.App;
  const K = App.schema.KEYS;
  App.store.set(K.tasks, [{ id: 't1', title: '整理 RAG 复盘', date: '2026-09-20' }]);
  App.store.set(K.notes, [{ id: 'n1', content: '给客户回电话，聊 RAG 方案' }]);
  App.store.set(K.gameGames, [{ id: 'g1', name: 'RAG 测试游戏', status: 'playing' }]);
  App.store.set(K.consultClients, [{ id: 'c1', name: '王工', contact: 'RAG 项目对接' }]);

  const hits = App.search('rag');
  assert.ok(hits.length >= 4, '应命中 4 类数据，实际 ' + hits.length);
  const modules = hits.map(h => h.module);
  assert.ok(modules.indexOf('今日计划') >= 0);
  assert.ok(modules.indexOf('快速备忘') >= 0);
  assert.ok(modules.indexOf('游戏') >= 0);
  assert.ok(modules.indexOf('客户') >= 0);
});

test('全局搜索：无结果时不报错', async () => {
  const ctx = await startShell();
  assert.deepStrictEqual(plain(ctx.App.search('绝对不存在的关键词xyz')), []);
});

/* ---------- 样式静态检查 ---------- */

const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const lightBlock = css.slice(css.indexOf(':root, [data-theme="light"]'), css.indexOf('[data-theme="dark"]'));
const darkStart = css.indexOf('[data-theme="dark"]');
const darkBlock = css.slice(darkStart, css.indexOf('}', css.indexOf('--shadow', darkStart)) + 1);
const restCss = css.slice(0, css.indexOf(':root, [data-theme="light"]')) +
  css.slice(css.indexOf('}', css.indexOf('--shadow', darkStart)) + 1);

function varsOf(block) {
  return (block.match(/--[a-z0-9-]+(?=\s*:)/g) || []).sort();
}

test('样式：两套主题定义的变量名完全一致（切主题不会缺色）', () => {
  const l = varsOf(lightBlock);
  const d = varsOf(darkBlock);
  assert.ok(l.length >= 20, '浅色变量数量异常：' + l.length);
  assert.deepStrictEqual(d, l, '两套主题的变量名必须一一对应');
});

test('样式：变量块之外不出现硬编码颜色（B1 不留亮块）', () => {
  const hexes = restCss.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepStrictEqual(hexes, [], '除主题变量定义外不应出现裸色值，发现：' + hexes.join(', '));
});

test('样式：包含三档响应式断点（A4）', () => {
  assert.ok(css.indexOf('@media (max-width: 1440px)') >= 0, '缺少 1440 断点');
  assert.ok(css.indexOf('@media (max-width: 1024px)') >= 0, '缺少 1024 断点');
  assert.ok(css.indexOf('#sidebar { width: 56px') >= 0, '窄屏应把侧边栏收成图标条');
  assert.ok(css.indexOf('.nav-txt') >= 0, '窄屏应隐藏导航文字');
});

test('样式：为全部通用组件提供了类', () => {
  ['.card', '.row', '.board', '.tag', '.prog', '.bar-row', '.hm-cell',
    '.drawer', '.modal', '.toast', '.empty', '.filterbar', '.datenav', '.tabs', '.ck'
  ].forEach(cls => {
    assert.ok(css.indexOf(cls) >= 0, '缺少组件样式 ' + cls);
  });
});

test('页面外壳文件齐全（A1）', () => {
  ['index.html', 'style.css', 'js/core/util.js', 'js/core/schema.js', 'js/core/store.js',
    'js/core/ui.js', 'js/core/router.js', 'js/app.js'].forEach(f => {
      assert.ok(fs.existsSync(path.join(ROOT, f)), '缺少文件 ' + f);
    });
});

test('index.html 按依赖顺序用普通 script 标签加载（禁用 type=module）', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('type="module"') < 0, '不允许使用 ES Module，file:// 下会被拦截');
  const order = ['js/core/util.js', 'js/core/schema.js', 'js/core/store.js', 'js/core/ui.js',
    'js/core/router.js', 'js/app.js'];
  let last = -1;
  order.forEach(f => {
    const i = html.indexOf(f);
    assert.ok(i > last, f + ' 的加载顺序不正确');
    last = i;
  });
  assert.ok(html.indexOf('id="page-host"') >= 0);
  assert.ok(html.indexOf('id="toast-host"') >= 0);
  assert.ok(html.indexOf('id="overlay-host"') >= 0);
});
