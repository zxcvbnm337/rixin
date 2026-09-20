/* store.js —— 存储层。对外同步读写（走内存缓存），内部异步落盘。
   后端优先级：IndexedDB -> 浏览器键值存储 -> 内存（仅测试用）。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var schema = App.schema;
  var util = App.util;

  var DB_NAME = 'personal-manager';
  var DB_STORE = 'kv';

  var cache = {};
  var backend = { kind: 'memory' };
  var undoStack = [];
  var UNDO_LIMIT = 20;

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  function notifyError(msg) {
    store.lastError = msg;
    if (typeof store.onError === 'function') { try { store.onError(msg); } catch (e) {} }
  }

  /* ---------- 后端探测 ---------- */

  function openIDB() {
    return new Promise(function (resolve) {
      var idb = root.indexedDB;
      if (!idb) return resolve(null);
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      var req;
      try { req = idb.open(DB_NAME, 1); }
      catch (e) { return finish(null); }
      req.onupgradeneeded = function () {
        try { req.result.createObjectStore(DB_STORE); } catch (e) {}
      };
      req.onsuccess = function () { finish(req.result); };
      req.onerror = function () { finish(null); };
      req.onblocked = function () { finish(null); };
      setTimeout(function () { finish(null); }, 1500);
    });
  }

  function idbAll(db) {
    return new Promise(function (resolve) {
      var out = {};
      try {
        var tx = db.transaction(DB_STORE, 'readonly');
        var os = tx.objectStore(DB_STORE);
        var req = os.openCursor();
        req.onsuccess = function () {
          var cur = req.result;
          if (cur) { out[cur.key] = cur.value; cur.continue(); }
          else resolve(out);
        };
        req.onerror = function () { resolve(out); };
      } catch (e) { resolve(out); }
    });
  }

  function idbPut(db, key, value) {
    try {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
    } catch (e) { notifyError('数据写入失败，请先导出备份'); }
  }

  function idbDelete(db, key) {
    try {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
    } catch (e) {}
  }

  function lsAvailable() {
    try {
      if (!root.localStorage) return false;
      root.localStorage.setItem('__pm_probe__', '1');
      root.localStorage.removeItem('__pm_probe__');
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 落盘 ---------- */

  function persist(key) {
    var v = cache[key];
    if (backend.kind === 'ls') {
      try {
        root.localStorage.setItem(key, JSON.stringify(v));
      } catch (e) {
        notifyError('本地存储写入失败（可能已满），请先导出备份再清理数据');
      }
    } else if (backend.kind === 'idb') {
      idbPut(backend.db, key, v);
    }
  }

  function persistAll() {
    schema.ALL_KEYS.forEach(persist);
  }

  var store = {
    ready: false,
    lastError: null,
    onError: null,

    async init() {
      cache = {};
      var db = await openIDB();
      if (db) {
        backend = { kind: 'idb', db: db };
        cache = await idbAll(db);
      } else if (lsAvailable()) {
        backend = { kind: 'ls' };
        schema.ALL_KEYS.forEach(function (k) {
          var raw = null;
          try { raw = root.localStorage.getItem(k); } catch (e) { raw = null; }
          if (raw !== null && raw !== undefined) {
            try { cache[k] = JSON.parse(raw); } catch (e) {}
          }
        });
      } else {
        backend = { kind: 'memory' };
      }
      store.backendKind = backend.kind;

      /* 首启初始化：补齐缺失的 key */
      schema.ALL_KEYS.forEach(function (k) {
        if (cache[k] === undefined || cache[k] === null) cache[k] = schema.defaults(k);
      });
      if (!cache[schema.KEYS.meta].createdAt) cache[schema.KEYS.meta].createdAt = Date.now();
      /* 设置项做一次浅合并，保证新增字段有默认值 */
      cache[schema.KEYS.settings] = Object.assign(
        {}, schema.defaultSettings, cache[schema.KEYS.settings] || {}
      );

      persistAll();
      store.ready = true;
      return store;
    },

    /* 仅供测试：注入内存后端并重置 */
    _useMemory() {
      backend = { kind: 'memory' };
      store.backendKind = 'memory';
      cache = {};
      schema.ALL_KEYS.forEach(function (k) { cache[k] = schema.defaults(k); });
      cache[schema.KEYS.meta].createdAt = Date.now();
      store.ready = true;
      undoStack = [];
    },

    get: function (key, fallback) {
      var v = cache[key];
      if (v === undefined || v === null) {
        if (fallback !== undefined) return fallback;
        return schema.defaults(key);
      }
      return v;
    },

    set: function (key, value) {
      cache[key] = value;
      persist(key);
      return value;
    },

    /* 偏好：一周第一天（1 = 周一，0 = 周日）。放在核心层，各模块按用户设置分周，
       模块之间不用互相引用。 */
    weekStartsOn: function () {
      var v = Number((cache[schema.KEYS.settings] || {}).weekStartsOn);
      return v === 0 ? 0 : 1;
    },

    setMany: function (obj) {
      Object.keys(obj).forEach(function (k) { cache[k] = obj[k]; });
      Object.keys(obj).forEach(persist);
    },

    all: function () { return clone(cache); },

    /* ---------- 撤销 ---------- */
    snapshot: function (key) {
      undoStack.push({ key: key, prev: clone(cache[key]) });
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    },

    /* 一次操作动了多个 key 时（如级联删除），存成一个整体，
       撤销时一起还原，不然只能回退一半。 */
    snapshotMany: function (keys) {
      var entry = { keys: (keys || []).slice(), prev: {} };
      entry.keys.forEach(function (k) { entry.prev[k] = clone(cache[k]); });
      undoStack.push(entry);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      return entry;
    },

    canUndo: function () { return undoStack.length > 0; },

    undo: function () {
      var item = undoStack.pop();
      if (!item) return null;
      if (item.keys) {
        item.keys.forEach(function (k) { cache[k] = item.prev[k]; });
        item.keys.forEach(persist);
      } else {
        cache[item.key] = item.prev;
        persist(item.key);
      }
      return item;
    },

    clearUndo: function () { undoStack = []; },

    /* ---------- 备份 ---------- */
    exportJSON: function () {
      var data = {};
      schema.ALL_KEYS.forEach(function (k) { data[k] = clone(cache[k]); });
      return {
        app: 'personal-manager',
        schemaVersion: schema.defaultMeta.schemaVersion,
        exportedAt: Date.now(),
        data: data
      };
    },

    exportFileName: function (ts) {
      var d = new Date(ts || Date.now());
      return '个人管理-备份-' + d.getFullYear() + util.pad2(d.getMonth() + 1) + util.pad2(d.getDate()) + '.json';
    },

    validatePayload: function (payload) {
      if (!payload || typeof payload !== 'object') return '文件格式不正确';
      if (payload.app !== 'personal-manager') return '这不是本应用导出的备份文件';
      if (!payload.data || typeof payload.data !== 'object') return '备份文件缺少数据段';
      return null;
    },

    importPreview: function (payload) {
      var err = store.validatePayload(payload);
      if (err) return { error: err, total: 0, add: 0, overwrite: 0, byKey: [] };
      var add = 0, overwrite = 0, byKey = [];

      schema.COLLECTIONS.forEach(function (k) {
        var fileArr = Array.isArray(payload.data[k]) ? payload.data[k] : [];
        var localArr = Array.isArray(cache[k]) ? cache[k] : [];
        var localIds = {};
        localArr.forEach(function (r) { if (r && r.id) localIds[r.id] = 1; });
        var a = 0, o = 0;
        fileArr.forEach(function (r) {
          if (r && r.id && localIds[r.id]) o++; else a++;
        });
        if (a || o) byKey.push({ key: k, add: a, overwrite: o });
        add += a; overwrite += o;
      });

      [schema.KEYS.meta, schema.KEYS.settings].forEach(function (k) {
        if (payload.data[k] && typeof payload.data[k] === 'object') {
          overwrite += 1;
          byKey.push({ key: k, add: 0, overwrite: 1 });
        }
      });

      return { error: null, total: add + overwrite, add: add, overwrite: overwrite, byKey: byKey };
    },

    importApply: function (payload, mode) {
      var err = store.validatePayload(payload);
      if (err) return { ok: false, error: err };
      mode = mode === 'merge' ? 'merge' : 'overwrite';
      var added = 0, replaced = 0;

      schema.COLLECTIONS.forEach(function (k) {
        var fileArr = Array.isArray(payload.data[k]) ? payload.data[k] : [];
        if (mode === 'overwrite') {
          replaced += (Array.isArray(cache[k]) ? cache[k].length : 0);
          cache[k] = clone(fileArr);
          added += fileArr.length;
        } else {
          var idx = {};
          var merged = (Array.isArray(cache[k]) ? cache[k] : []).slice();
          merged.forEach(function (r, i) { if (r && r.id) idx[r.id] = i; });
          fileArr.forEach(function (r) {
            if (r && r.id && idx[r.id] !== undefined) {
              merged[idx[r.id]] = clone(r); replaced++;
            } else {
              merged.push(clone(r)); added++;
              if (r && r.id) idx[r.id] = merged.length - 1;
            }
          });
          cache[k] = merged;
        }
        persist(k);
      });

      if (mode === 'overwrite') {
        if (payload.data[schema.KEYS.meta]) {
          cache[schema.KEYS.meta] = Object.assign({}, schema.defaultMeta, clone(payload.data[schema.KEYS.meta]));
          persist(schema.KEYS.meta);
        }
        if (payload.data[schema.KEYS.settings]) {
          cache[schema.KEYS.settings] = Object.assign({}, schema.defaultSettings, clone(payload.data[schema.KEYS.settings]));
          persist(schema.KEYS.settings);
        }
      } else if (payload.data[schema.KEYS.settings]) {
        cache[schema.KEYS.settings] = Object.assign({}, cache[schema.KEYS.settings], clone(payload.data[schema.KEYS.settings]));
        persist(schema.KEYS.settings);
      }

      store.clearUndo();
      return { ok: true, mode: mode, added: added, replaced: replaced };
    },

    /* 清空：数据集合与 meta 归零，保留个人偏好设置 */
    clearAll: function () {
      schema.COLLECTIONS.forEach(function (k) {
        cache[k] = [];
        persist(k);
      });
      cache[schema.KEYS.meta] = Object.assign({}, schema.defaultMeta, { createdAt: Date.now() });
      persist(schema.KEYS.meta);
      store.clearUndo();
      return true;
    },

    usage: function () {
      var count = 0, byKey = [];
      schema.COLLECTIONS.forEach(function (k) {
        var n = Array.isArray(cache[k]) ? cache[k].length : 0;
        count += n;
        byKey.push({ key: k, count: n });
      });
      var bytes = 0;
      try { bytes = JSON.stringify(cache).length; } catch (e) { bytes = 0; }
      return { count: count, bytes: bytes, byKey: byKey };
    },

    /* 仅测试用：读取内部缓存快照 */
    _cache: function () { return cache; }
  };

  root.App.store = store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
