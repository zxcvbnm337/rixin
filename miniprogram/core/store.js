/* core/store.js —— 本地数据层（local-first）。
   核心原则：任何一次写入都先落本机存储并立即返回成功，同步到云端是后台行为。
   失败进 pending 队列，网络恢复后由 flushPending 补传。
   这样即便没有云开发、没有网络、没有登录，记录链路也 100% 可用——
   这是小程序能过审、能上线的前提，也是用户数据不丢的底线。

   不依赖 App 全局对象；wx 不存在时（Node 跑测试）自动降级到内存后端。 */

var util = require('./util.js');
var schema = require('./schema.js');

/* ---------------- 存储后端 ---------------- */

var memStore = {};

function wxBackend() {
  return {
    get: function (k) {
      try {
        var v = wx.getStorageSync(k);
        return (v === '' || v === undefined) ? null : v;   // wx 缺省返回 ''，统一成 null
      } catch (e) { return null; }
    },
    set: function (k, v) { try { wx.setStorageSync(k, v); } catch (e) {} },
    del: function (k) { try { wx.removeStorageSync(k); } catch (e) {} }
  };
}

var memBackend = {
  get: function (k) { return Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null; },
  set: function (k, v) { memStore[k] = v; },
  del: function (k) { delete memStore[k]; }
};

function pickBackend() {
  if (typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') return wxBackend();
  return memBackend;
}

/* ---------------- 基础读写 ---------------- */

var backend = null;
var cache = {};
var initialized = false;

function init() {
  backend = pickBackend();
  cache = {};
  initialized = true;
  if (!read(schema.STORAGE_KEYS.meta)) {
    var meta = schema.defaultMeta();
    meta.createdAt = Date.now();
    write(schema.STORAGE_KEYS.meta, meta);
  }
  if (!read(schema.STORAGE_KEYS.settings)) {
    write(schema.STORAGE_KEYS.settings, schema.defaultSettings());
  }
  return true;
}

function ensure() { if (!initialized) init(); }

function read(key) {
  ensure();
  if (!Object.prototype.hasOwnProperty.call(cache, key)) cache[key] = backend.get(key);
  return cache[key];
}

function write(key, val) {
  ensure();
  cache[key] = val;
  backend.set(key, val);
  return val;
}

function readList(key) {
  var v = read(key);
  return Array.isArray(v) ? v.slice() : [];   // 返回副本：调用方就地 push 不会污染缓存
}

/* 仅供测试使用：把后端重置为内存态，并清空撤销栈与序号计数器 */
function _reset() {
  memStore = {};
  backend = memBackend;
  cache = {};
  initialized = false;
  undoStack.length = 0;
  seqCounter = 0;
  init();
}

/* ---------------- 记录（records） ---------------- */

/* 排序键：先按录入时间，再按自增序号。
   只靠 createdAt 不够——同一毫秒内连记两笔时时间戳相同，
   顺序会退化成「看排序实现」，用户会看到列表跳动。seq 保证严格可预测。 */
function cmpTimeDesc(a, b) {
  var ta = a.createdAt || 0, tb = b.createdAt || 0;
  if (tb !== ta) return tb - ta;
  return (b.seq || 0) - (a.seq || 0);
}

/* 自增序号：从现有数据的最大值接续，避免重启后重复 */
var seqCounter = 0;

function nextSeq(list) {
  var max = 0;
  (list || []).forEach(function (r) { if (r && r.seq > max) max = r.seq; });
  if (max > seqCounter) seqCounter = max;
  return ++seqCounter;
}

/* 全部有效记录（已过滤软删除），按时间倒序 */
function all() {
  return readList(schema.STORAGE_KEYS.records).filter(function (r) {
    return r && !r.deleted;
  }).sort(cmpTimeDesc);
}

function listByDate(date) {
  var d = date || util.today();
  return all().filter(function (r) { return r.date === d; });
}

function listBetween(from, to) {
  return all().filter(function (r) { return r.date >= from && r.date <= to; });
}
function get(id) {
  var hit = null;
  readList(schema.STORAGE_KEYS.records).forEach(function (r) {
    if (r && r.id === id) hit = r;
  });
  return hit;
}

/* 新增一条记录。入参宽松：缺 title 时用分类名兜底，永不落空 */
function add(input) {
  input = input || {};
  var now = Date.now();
  var kind = schema.KIND_MAP[input.kind] ? input.kind : 'other';
  var rec = {
    id: util.uid('rec'),
    date: util.isValidDate(input.date) ? input.date : util.today(),
    kind: kind,
    title: String(input.title || '').trim() || schema.kindLabel(kind),
    minutes: util.clamp(input.minutes, 0, schema.MAX_MINUTES),
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 6) : [],
    raw: String(input.raw || ''),
    source: input.source || 'manual',   // manual | quick | ai
    createdAt: now,
    updatedAt: now,
    deleted: false,
    synced: false
  };
  var list = readList(schema.STORAGE_KEYS.records);
  rec.seq = nextSeq(list);
  list.push(rec);
  write(schema.STORAGE_KEYS.records, list);
  pushPending({ op: 'put', id: rec.id });
  return rec;
}

function update(id, patch) {
  var list = readList(schema.STORAGE_KEYS.records).slice();
  var idx = -1;
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) { idx = i; break; }
  if (idx < 0) return null;
  snapshotMany([schema.STORAGE_KEYS.records]);
  var next = Object.assign({}, list[idx], patch || {}, {
    updatedAt: Date.now(),
    synced: false
  });
  if (next.minutes !== undefined) next.minutes = util.clamp(next.minutes, 0, schema.MAX_MINUTES);
  list[idx] = next;
  write(schema.STORAGE_KEYS.records, list);
  pushPending({ op: 'put', id: id });
  return next;
}

/* 软删除：保留数据以便撤销与云端比对，UI 层已过滤 */
function remove(id) {
  var list = readList(schema.STORAGE_KEYS.records).slice();
  var idx = -1;
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) { idx = i; break; }
  if (idx < 0) return false;
  snapshotMany([schema.STORAGE_KEYS.records]);
  list[idx] = Object.assign({}, list[idx], { deleted: true, updatedAt: Date.now(), synced: false });
  write(schema.STORAGE_KEYS.records, list);
  pushPending({ op: 'del', id: id });
  return true;
}

/* ---------------- 撤销 ---------------- */

var undoStack = [];
var UNDO_LIMIT = 20;

function snapshotMany(keys) {
  var snap = {};
  (keys || []).forEach(function (k) { snap[k] = read(k); });
  undoStack.push(snap);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  return snap;
}

function canUndo() { return undoStack.length > 0; }

function undo() {
  var snap = undoStack.pop();
  if (!snap) return false;
  Object.keys(snap).forEach(function (k) { write(k, snap[k]); });
  return true;
}

/* ---------------- 待同步队列 ---------------- */

function pending() { return readList(schema.STORAGE_KEYS.pending); }

function pendingCount() { return pending().length; }

function pushPending(op) {
  var q = pending();
  q.push(Object.assign({ ts: Date.now() }, op || {}));
  write(schema.STORAGE_KEYS.pending, q);
  return q.length;
}

/* P2 阶段接入云函数后才真正补传；在云开发就绪前保持队列不清空，
   宁可多留几条元数据，也不能出现「以为传上去了其实没有」。 */
function flushPending() {
  if (!backend || typeof wx === 'undefined' || !wx.cloud) return 0;
  return 0;
}

function markSynced(ids) {
  if (!ids || !ids.length) return 0;
  var map = {};
  ids.forEach(function (id) { map[id] = true; });
  var list = readList(schema.STORAGE_KEYS.records).map(function (r) {
    return (r && map[r.id]) ? Object.assign({}, r, { synced: true }) : r;
  });
  write(schema.STORAGE_KEYS.records, list);
  write(schema.STORAGE_KEYS.pending, pending().filter(function (op) {
    return !(op && map[op.id]);
  }));
  var meta = read(schema.STORAGE_KEYS.meta) || schema.defaultMeta();
  write(schema.STORAGE_KEYS.meta, Object.assign({}, meta, { lastSyncAt: Date.now() }));
  return ids.length;
}

/* ---------------- 设置 ---------------- */

function settings() {
  var saved = read(schema.STORAGE_KEYS.settings);
  var def = schema.defaultSettings();
  if (!saved) { write(schema.STORAGE_KEYS.settings, def); return def; }
  return Object.assign({}, def, saved);
}

function saveSettings(patch) {
  var next = Object.assign({}, settings(), patch || {});
  write(schema.STORAGE_KEYS.settings, next);
  return next;
}

/* 核心层偏好：一周第一天。各页面统一从这里取，不要各写一份 */
function weekStartsOn() { return settings().weekStartsOn === 0 ? 0 : 1; }

/* ---------------- 统计（只读派生，不产生数据） ---------------- */

function minutesOn(date) {
  var d = date || util.today();
  return util.sum(all().filter(function (r) { return r.date === d; }), function (r) { return r.minutes; });
}

function countOn(date) {
  var d = date || util.today();
  return all().filter(function (r) { return r.date === d; }).length;
}

/* 分类汇总：始终返回全部 6 个分类，便于图表稳定渲染 */
function byKind(records) {
  var out = {};
  schema.KINDS.forEach(function (k) { out[k.id] = 0; });
  (records || []).forEach(function (r) {
    if (!r) return;
    out[r.kind] = (out[r.kind] || 0) + (r.minutes || 0);
  });
  return out;
}

/* 最近 n 天（含今天），用于柱状图 */
function recentDays(n, endDate) {
  var end = endDate || util.today();
  var out = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = util.addDays(end, -i);
    out.push({ date: d, minutes: minutesOn(d) });
  }
  return out;
}

/* 某一周的全部记录。weekStartsOn 从设置里取，保证与用户认知一致 */
function weekRange(dateStr) {
  var ws = util.startOfWeek(dateStr || util.today(), weekStartsOn());
  return { from: ws, to: util.addDays(ws, 6) };
}

function weekRecords(dateStr) {
  var r = weekRange(dateStr);
  return listBetween(r.from, r.to);
}

/* 连续记录天数：今天还没记就从昨天往前算，不让「今天还没开始」打断连续感 */
function streak() {
  var dates = {};
  all().forEach(function (r) { dates[r.date] = true; });
  var d = util.today();
  if (!dates[d]) d = util.addDays(d, -1);
  var n = 0;
  while (dates[d]) { n++; d = util.addDays(d, -1); }
  return n;
}

/* 概览数字，给「我的」页用 */
function overview() {
  var recs = all();
  var days = {};
  recs.forEach(function (r) { days[r.date] = true; });
  var total = util.sum(recs, function (r) { return r.minutes; });
  return {
    records: recs.length,
    days: Object.keys(days).length,
    minutes: total,
    streak: streak(),
    pending: pendingCount()
  };
}

/* ---------------- 导入导出 ---------------- */

function exportAll() {
  return {
    app: 'time-ledger',
    version: schema.SCHEMA_VERSION,
    exportedAt: Date.now(),
    records: readList(schema.STORAGE_KEYS.records),
    settings: settings()
  };
}

function replaceAll(data) {
  data = data || {};
  var legacy = schema.LEGACY_KIND_MAP;
  /* 导入的数据可能没有 seq（例如来自网页版），按数组顺序补一个，
     保证导入后列表顺序与原文件一致，而不是退化成不确定排序 */
  var recs = (Array.isArray(data.records) ? data.records : []).map(function (r, i) {
    var kind = schema.KIND_MAP[r.kind] ? r.kind : (legacy[r.kind] || 'other');
    var seq = (typeof r.seq === 'number' && r.seq > 0) ? r.seq : (i + 1);
    return Object.assign({}, r, { kind: kind, seq: seq });
  });
  seqCounter = 0;
  write(schema.STORAGE_KEYS.records, recs);
  if (data.settings) write(schema.STORAGE_KEYS.settings, Object.assign({}, schema.defaultSettings(), data.settings));
  return recs.length;
}

module.exports = {
  init: init,
  _reset: _reset,
  read: read,
  write: write,
  cmpTimeDesc: cmpTimeDesc,
  all: all,
  get: get,
  listByDate: listByDate,
  listBetween: listBetween,
  add: add,
  update: update,
  remove: remove,
  undo: undo,
  canUndo: canUndo,
  snapshotMany: snapshotMany,
  pending: pending,
  pendingCount: pendingCount,
  pushPending: pushPending,
  flushPending: flushPending,
  markSynced: markSynced,
  settings: settings,
  saveSettings: saveSettings,
  weekStartsOn: weekStartsOn,
  minutesOn: minutesOn,
  countOn: countOn,
  byKind: byKind,
  recentDays: recentDays,
  weekRange: weekRange,
  weekRecords: weekRecords,
  streak: streak,
  overview: overview,
  exportAll: exportAll,
  replaceAll: replaceAll
};
