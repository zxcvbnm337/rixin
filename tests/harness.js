'use strict';
/* 测试基建：用 jsdom 提供浏览器环境，把 js/ 下的源码内联加载进去。
   无头运行，不需要启动浏览器。 */
const fs = require('fs');
const path = require('path');

const JSDOM_CANDIDATES = [
  'C:/Users/33702/.workbuddy/binaries/node/workspace/node_modules/jsdom',
  'jsdom'
];
let JSDOM = null;
for (const c of JSDOM_CANDIDATES) {
  try { JSDOM = require(c).JSDOM; break; } catch (e) { /* next */ }
}
if (!JSDOM) throw new Error('未找到 jsdom，请先在 node 工作区安装 jsdom');

const ROOT = path.resolve(__dirname, '..');

const CORE_FILES = [
  'js/core/util.js',
  'js/core/schema.js',
  'js/core/store.js',
  'js/core/ui.js',
  'js/core/router.js'
];

const MODULE_NAMES = ['home', 'today', 'study', 'dev', 'consult', 'fitness', 'diet', 'game', 'settings'];
const MODULE_FILES = MODULE_NAMES.map(n => 'js/modules/' + n + '.js');

const APP_FILES = CORE_FILES.concat(MODULE_FILES, ['js/app.js']);

function readIfExists(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function existingFiles(list) {
  return list.filter(f => fs.existsSync(path.join(ROOT, f)));
}

function buildHtml(files, seed) {
  const seedScript = seed
    ? '<script>(function(){var s=' + JSON.stringify(seed) + ';for(var k in s){try{localStorage.setItem(k,s[k]);}catch(e){}}})();<\/script>'
    : '';
  const scripts = files.map(f => {
    const code = readIfExists(f);
    if (!code) return '';
    return '<script>' + code + '<\/script>';
  }).join('\n');
  return '<!DOCTYPE html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8">' +
    '<title>我的工作台</title></head><body>' +
    '<aside id="sidebar"></aside>' +
    '<main id="main"><header id="topbar"></header><div id="reminder-host"></div>' +
    '<section id="page-host"></section></main>' +
    '<div id="overlay-host"></div><div id="toast-host"></div>' +
    '<script>globalThis.__PM_NO_AUTOSTART__ = true;<\/script>' +
    seedScript + scripts +
    '</body></html>';
}

const tracked = [];

function createApp(options) {
  options = options || {};
  const files = options.files || APP_FILES;
  const html = buildHtml(files, options.seed);
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://local.test/',
    pretendToBeVisual: true
  });
  const win = dom.window;
  const ctx = { dom, window: win, document: win.document, App: win.App };
  tracked.push(ctx);
  return ctx;
}

/* 用例跑完后统一收尾：先停掉应用定时器，再关闭 jsdom 环境，
   否则主题定时器会让事件循环一直活着，测试进程无法退出。 */
function teardownAll() {
  while (tracked.length) {
    const ctx = tracked.pop();
    try {
      /* 先把当前页面的定时器停掉（如咨询计时器的秒级刷新），再停应用定时器 */
      const r = ctx.App && ctx.App.router;
      const pg = (r && r.current && ctx.App.pages) ? ctx.App.pages[r.current.page] : null;
      if (pg && typeof pg.destroy === 'function') pg.destroy();
    } catch (e) {}
    try { if (ctx.App && typeof ctx.App.stop === 'function') ctx.App.stop(); } catch (e) {}
    try { ctx.window.close(); } catch (e) {}
  }
}

try {
  const { after } = require('node:test');
  after(teardownAll);
} catch (e) { /* 非测试环境忽略 */ }

/* 启动：创建环境 + 初始化存储层 + 启动路由 */
async function boot(options) {
  const ctx = createApp(options);
  if (!ctx.App) throw new Error('App 命名空间未创建，脚本加载失败');
  if (ctx.App.store && typeof ctx.App.store.init === 'function') {
    await ctx.App.store.init();
  }
  if (ctx.App.router && typeof ctx.App.router.init === 'function' && options && options.initRouter) {
    ctx.App.router.init();
  }
  return ctx;
}

/* 把一个 JSDOM 实例的本地存储导出（用于模拟"重启浏览器"） */
function dumpStorage(win) {
  const out = {};
  const ls = win.localStorage;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    out[k] = ls.getItem(k);
  }
  return out;
}

/* 断言助手 */
function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}

/* jsdom 环境里的数组/对象带着另一个 realm 的原型，
   assert.deepStrictEqual 会因为原型不同而失败。比较前先拍平成普通结构。 */
function plain(x) {
  return JSON.parse(JSON.stringify(x));
}

module.exports = {
  JSDOM,
  ROOT,
  CORE_FILES,
  MODULE_FILES,
  APP_FILES,
  MODULE_NAMES,
  createApp,
  boot,
  dumpStorage,
  buildHtml,
  existingFiles,
  assert,
  plain,
  teardownAll
};
