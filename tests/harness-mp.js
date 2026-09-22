/* harness-mp.js —— 小程序「页面层」测试宿主。

   为什么需要它：`16-mp-core` 只测 core，`17-mp-project` 只做静态检查。
   两者都发现不了一个已经真实发生过的严重 bug ——
   `pages/index/index.js` 里少写了一个 `var recsToday`，
   静态检查全绿，但小程序一打开首页就 ReferenceError、日期空白、记录永不显示。
   页面代码不会被静态分析执行，只有真正跑起来才暴露。

   做法：给 node 注入 `wx` / `Page` / `Component` / `getApp` 的最小实现，
   直接 require 页面文件拿到定义对象，合成一个带 `setData`（支持 'a.b' 路径）的实例，
   就能在 node 里跑 onLoad / onShow / 事件处理器，并断言 UI 副作用。
   `wx` 的存储后端用真内存 map，所以 store 走的是和真机一致的 wx 分支。 */

const path = require('path');

const MP = path.resolve(__dirname, '..', 'miniprogram');

/* ---------- 可观测的 UI 副作用 ---------- */
const ui = {
  modals: [],
  toasts: [],
  clipboard: null,
  switches: [],
  navigations: [],
  storage: {}
};

let modalReply = { confirm: true, cancel: false };

function resetAll() {
  ui.modals = [];
  ui.toasts = [];
  ui.clipboard = null;
  ui.switches = [];
  ui.navigations = [];
  ui.storage = {};
  modalReply = { confirm: true, cancel: false };
}

function setModalReply(confirm) { modalReply = { confirm: confirm, cancel: !confirm }; }

/* ---------- wx 最小实现 ---------- */
const wxStub = {
  getStorageSync(k) {
    return Object.prototype.hasOwnProperty.call(ui.storage, k) ? ui.storage[k] : '';
  },
  setStorageSync(k, v) { ui.storage[k] = v; },
  removeStorageSync(k) { delete ui.storage[k]; },

  showModal(opt) {
    ui.modals.push({ title: opt && opt.title, content: opt && opt.content, confirmText: opt && opt.confirmText });
    if (opt && typeof opt.success === 'function') opt.success(modalReply);
    if (opt && typeof opt.complete === 'function') opt.complete(modalReply);
  },
  showToast(opt) { ui.toasts.push({ title: opt && opt.title, icon: opt && opt.icon }); },
  showLoading() {}, hideLoading() {},

  setClipboardData(opt) {
    ui.clipboard = opt && opt.data;
    if (opt && typeof opt.success === 'function') opt.success({});
  },
  getClipboardData(opt) {
    if (opt && typeof opt.success === 'function') opt.success({ data: ui.clipboard || '' });
  },

  switchTab(opt) { ui.switches.push(opt && opt.url); },
  navigateTo(opt) { ui.navigations.push(opt && opt.url); },
  redirectTo(opt) { ui.navigations.push(opt && opt.url); },
  reLaunch(opt) { ui.navigations.push(opt && opt.url); },

  stopPullDownRefresh() {},
  vibrateShort() {},
  setNavigationBarTitle() {},

  /* 云开发未接入：显式留空，让 store 走本地分支 */
  cloud: undefined
};

const appStub = {
  globalData: { openid: '', cloudReady: false, version: '0.1.0' }
};

/* 永久注入：store.js 是在函数体内按 typeof 探测的，只有这里先挂上才走 wx 分支 */
global.wx = wxStub;
global.getApp = function () { return appStub; };

let captured = null;
global.Page = function (def) { captured = def; };
global.Component = function (def) { captured = def; };
global.App = function (def) { captured = def; };

/* ---------- 加载与实例化 ---------- */

function loadDefinition(rel) {
  const abs = path.join(MP, rel);
  delete require.cache[require.resolve(abs)];
  captured = null;
  require(abs);
  if (!captured) throw new Error(rel + ' 没有调用 Page() / Component()');
  const def = captured;
  captured = null;
  return def;
}

function deepClone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

/* 合成页面/组件实例：data 独立副本 + 支持 'form.title' 路径的 setData */
function instantiate(def) {
  const inst = Object.assign({}, def);

  /* Component 的方法挂在 methods 下，展平后才能像页面方法一样直接调用 */
  if (def.methods && typeof def.methods === 'object') Object.assign(inst, def.methods);

  inst.data = deepClone(def.data || {}) || {};

  inst.setData = function (patch, cb) {
    Object.keys(patch || {}).forEach(function (k) {
      if (k.indexOf('.') < 0) { inst.data[k] = patch[k]; return; }
      const parts = k.split('.');
      let cur = inst.data;
      for (let i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] === undefined || cur[parts[i]] === null) cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = patch[k];
    });
    /* 回调显式绑定实例：真机上 this 不保证，代码不该依赖，但宿主也不该制造假失败 */
    if (typeof cb === 'function') cb.call(inst);
  };

  /* 自定义 tabBar 的选中态同步 */
  const tabBar = { data: {}, setData(p) { Object.assign(tabBar.data, p || {}); } };
  inst.getTabBar = function () { return tabBar; };
  inst.__tabBar = tabBar;

  return inst;
}

/* 挂载：加载定义 → 合成实例 → 跑生命周期（默认 onLoad + onShow） */
function mount(rel, opts) {
  opts = opts || {};
  const inst = instantiate(loadDefinition(rel));
  if (!opts.skipLoad && typeof inst.onLoad === 'function') inst.onLoad(opts.query || {});
  if (!opts.skipShow && typeof inst.onShow === 'function') inst.onShow();
  return inst;
}

/* 只加载定义，不跑生命周期（用于测「生命周期本身」） */
function load(rel) { return instantiate(loadDefinition(rel)); }

/* ---------- 事件构造 ---------- */

function tapEvent(dataset) {
  return { currentTarget: { dataset: dataset || {} }, detail: {} };
}

function inputEvent(value, dataset) {
  return { currentTarget: { dataset: dataset || {} }, detail: { value: value } };
}

module.exports = {
  MP: MP,
  ui: ui,
  appStub: appStub,
  wxStub: wxStub,
  resetAll: resetAll,
  setModalReply: setModalReply,
  loadDefinition: loadDefinition,
  instantiate: instantiate,
  mount: mount,
  load: load,
  tapEvent: tapEvent,
  inputEvent: inputEvent,
  deepClone: deepClone
};
