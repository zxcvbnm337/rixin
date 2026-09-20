/* settings.js —— 数据与设置：备份与恢复（导出 / 预览 / 覆盖 / 合并）、存储占用、
   外观、偏好、清空兜底、关于。对应 PRD 5.8 / 7.1–7.4 与页面结构设计 4.9。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var util = App.util, ui = App.ui, store = App.store, schema = App.schema;
  var K = schema.KEYS, L = schema.LABELS;

  var VERSION = '1.0.0';
  /* localStorage 大约 5MB，从 4MB 起提示该备份了 */
  var STORAGE_LIMIT = 4 * 1024 * 1024;
  var CLEAR_WORD = '确认清空';
  var APP_PAGES = ['home', 'today', 'study', 'dev', 'consult', 'fitness', 'diet', 'game'];

  var KEY_LABELS = {
    'pm.tasks': '今日计划',
    'pm.notes': '快速备忘',
    'pm.study.directions': '学习方向',
    'pm.study.items': '学习项',
    'pm.study.logs': '学习记录',
    'pm.dev.projects': '开发项目',
    'pm.dev.tasks': '开发任务',
    'pm.dev.bugs': 'Bug',
    'pm.dev.notes': '踩坑笔记',
    'pm.consult.clients': '客户',
    'pm.consult.projects': '咨询项目',
    'pm.consult.deliverables': '交付物',
    'pm.consult.meetings': '沟通纪要',
    'pm.consult.worklogs': '工时记录',
    'pm.fitness.plan': '周计划',
    'pm.fitness.logs': '健身打卡',
    'pm.diet.records': '饮食记录',
    'pm.diet.favorites': '常用饮食',
    'pm.game.games': '游戏',
    'pm.game.logs': '游戏时长'
  };

  /* 关于区：按模块汇总数据量 */
  var MODULE_COUNTS = [
    { label: '今日', keys: [K.tasks, K.notes] },
    { label: '学习计划', keys: [K.studyDirections, K.studyItems, K.studyLogs] },
    { label: '开发工作', keys: [K.devProjects, K.devTasks, K.devBugs, K.devNotes] },
    { label: '咨询工作', keys: [K.consultClients, K.consultProjects, K.consultDeliverables, K.consultMeetings, K.consultWorklogs] },
    { label: '健身计划', keys: [K.fitnessPlan, K.fitnessLogs] },
    { label: '饮食计划', keys: [K.dietRecords, K.dietFavorites] },
    { label: '游戏娱乐', keys: [K.gameGames, K.gameLogs] }
  ];

  function labelOf(key) { return KEY_LABELS[key] || key; }

  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (Math.round(n / 1024 * 10) / 10) + ' KB';
    return (Math.round(n / 1024 / 1024 * 100) / 100) + ' MB';
  }

  function fmtTime(ts) {
    if (!ts) return '还没有';
    var d = new Date(Number(ts));
    return util.fmtDate(d) + ' ' + util.pad2(d.getHours()) + ':' + util.pad2(d.getMinutes());
  }

  function daysSince(ts) {
    if (!ts) return null;
    return Math.floor((Date.now() - Number(ts)) / 86400000);
  }

  /* 浏览器下载。无 DOM（测试环境）或浏览器不支持时返回 false，逻辑层仍然成立。 */
  function download(name, text) {
    try {
      if (typeof document === 'undefined') return false;
      if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return false;
      var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      if (document.body) document.body.appendChild(a);
      if (typeof a.click === 'function') a.click();
      if (document.body && a.parentNode) a.parentNode.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 3000);
      return true;
    } catch (e) { return false; }
  }

  /* ==================== 数据层 ==================== */

  var settings = {
    version: VERSION,
    storageLimit: STORAGE_LIMIT,

    get: function () { return store.get(K.settings); },

    patch: function (obj) {
      var next = Object.assign({}, store.get(K.settings), obj || {});
      store.set(K.settings, next);
      return next;
    },

    setTheme: function (name) {
      if (!L.theme[name]) return null;
      return settings.patch({ theme: name });
    },

    /* 白天时段，接受 'HH:MM'；非法值原样保留由页面提示 */
    setDayRange: function (start, end) {
      var patch = {};
      if (start !== undefined) patch.dayStart = String(start);
      if (end !== undefined) patch.dayEnd = String(end);
      return settings.patch(patch);
    },

    setWeekStartsOn: function (v) {
      return settings.patch({ weekStartsOn: Number(v) === 0 ? 0 : 1 });
    },

    setDefaultPage: function (page) {
      if (APP_PAGES.indexOf(page) < 0) return null;
      return settings.patch({ defaultPage: page });
    },

    setBackupRemindDays: function (n) {
      var days = Math.round(Number(n));
      if (!(days > 0)) return null;
      return settings.patch({ backupRemindDays: days });
    },

    weekStartsOn: function () { return store.weekStartsOn(); },

    /* 存储占用：总条数 + 估算容量 + 逐类条数 */
    usageInfo: function () {
      var u = store.usage();
      return {
        count: u.count,
        bytes: u.bytes,
        text: fmtBytes(u.bytes),
        limitText: fmtBytes(STORAGE_LIMIT),
        ratio: STORAGE_LIMIT ? Math.round(u.bytes / STORAGE_LIMIT * 100) : 0,
        near: u.bytes >= STORAGE_LIMIT,
        rows: u.byKey.filter(function (r) { return r.count > 0; }).map(function (r) {
          return { key: r.key, label: labelOf(r.key), count: r.count };
        })
      };
    },

    /* 关于区：版本号 + 各模块数据量 */
    about: function () {
      var meta = store.get(K.meta);
      return {
        version: VERSION,
        createdAt: meta.createdAt || null,
        createdAtText: meta.createdAt ? fmtTime(meta.createdAt) : '未知',
        lastBackupAt: meta.lastBackupAt || null,
        lastBackupText: fmtTime(meta.lastBackupAt),
        total: store.usage().count,
        groups: MODULE_COUNTS.map(function (g) {
          return { label: g.label, count: util.sum(g.keys, function (k) { return store.get(k).length; }) };
        })
      };
    },

    /* ---------- 备份（导出） ---------- */

    exportFileName: function (ts) { return store.exportFileName(ts); },

    /* 导出：先把「上次备份时间」写进去，再打包，保证文件里也记着这次备份 */
    exportData: function () {
      var now = Date.now();
      var meta = store.get(K.meta);
      meta.lastExportAt = now;
      meta.lastBackupAt = now;
      store.set(K.meta, meta);

      var payload = store.exportJSON();
      payload.exportedAt = now;
      var fileName = store.exportFileName(now);
      var text = JSON.stringify(payload, null, 2);
      var downloaded = download(fileName, text);
      return {
        ok: true,
        fileName: fileName,
        bytes: text.length,
        sizeText: fmtBytes(text.length),
        downloaded: downloaded,
        payload: payload
      };
    },

    /* ---------- 恢复（导入） ---------- */

    /* 预览：将新增 X 条、覆盖 Y 条（E4） */
    preview: function (payload) {
      var p = store.importPreview(payload);
      return {
        error: p.error,
        total: p.total,
        add: p.add,
        overwrite: p.overwrite,
        text: '将新增 ' + p.add + ' 条、覆盖 ' + p.overwrite + ' 条',
        byKey: p.byKey.map(function (r) {
          return { key: r.key, label: labelOf(r.key), add: r.add, overwrite: r.overwrite };
        })
      };
    },

    /* 执行导入：mode = 'overwrite' | 'merge'（E3 / E5） */
    applyImport: function (payload, mode) { return store.importApply(payload, mode); },

    /* ---------- 清空兜底（E7） ---------- */

    canClear: function (input) { return String(input == null ? '' : input).trim() === CLEAR_WORD; },

    /* 清空：先自动导出一份快照文件，再清数据 |
       个人偏好（主题 / 时段 / 周起始 / 默认页）刻意保留，清的是内容不是习惯 */
    clearAll: function () {
      var snapshot = settings.exportData();
      store.clearAll();
      var now = Date.now();
      var meta = store.get(K.meta);
      meta.lastBackupAt = now;
      meta.lastExportAt = now;
      meta.lastSnapshotAt = now;
      meta.snapshotFileName = snapshot.fileName;
      store.set(K.meta, meta);
      return { ok: true, snapshot: snapshot, keptSettings: store.get(K.settings) };
    },

    /* 数据整体换过之后，外壳与当前页都要重画 */
    afterDataChange: function () {
      if (App.topbar && App.topbar.render) App.topbar.render();
      if (App.sidebar && App.sidebar.render) App.sidebar.render();
      if (App.router && App.router.refreshCurrent) App.router.refreshCurrent();
    }
  };

  App.actions = App.actions || {};
  App.actions.settings = settings;

  /* ==================== 页面 ==================== */

  var state = { clearInput: '', lastExport: null, lastImport: null };

  function themeOptions() {
    return ['auto', 'light', 'dark'].map(function (k) { return { value: k, label: '主题：' + L.theme[k] }; });
  }
  function pageOptions() {
    return APP_PAGES.map(function (p) {
      return { value: p, label: schema.MODULE_LABELS[p] || p };
    });
  }

  /* ---------- 数据备份 ---------- */
  function backupHTML() {
    var s = settings.get();
    var meta = store.get(K.meta);
    var d = daysSince(meta.lastBackupAt);
    var remindDays = Number(s.backupRemindDays) || 7;
    var stale = (d === null) || (d >= remindDays);
    var lastTxt = meta.lastBackupAt
      ? fmtTime(meta.lastBackupAt) + '（' + (d === 0 ? '今天' : d + ' 天前') + '）'
      : '还没有备份过';

    var exp = state.lastExport;
    var expLine = exp
      ? '<div class="muted mt8">刚导出：' + util.esc(exp.fileName) + ' · ' + util.esc(exp.sizeText) +
      (exp.downloaded ? '' : '（浏览器未触发下载，可再试一次）') + '</div>'
      : '';

    var imp = state.lastImport;
    var impLine = imp
      ? '<div class="muted mt8">上次导入：' + util.esc(imp.mode === 'merge' ? '合并' : '覆盖') +
      ' · 新增 ' + imp.added + ' 条、覆盖 ' + imp.replaced + ' 条</div>'
      : '';

    return ui.card('数据备份',
      '<div class="kv"><span class="kv-k">上次备份</span><span' + (stale ? ' class="warn-txt"' : '') + '>' + util.esc(lastTxt) + '</span></div>' +
      '<div class="kv"><span class="kv-k">提醒间隔</span><span>' + remindDays + ' 天</span></div>' +
      (stale ? '<div class="muted mt8 warn-txt">已经' + (d === null ? '还没有备份过' : '超过 ' + remindDays + ' 天没备份') + '，建议现在导出一次。</div>' : '') +
      '<div class="list-actions mt8">' +
      ui.btn('导出全部数据', { act: 'export' }) +
      ui.btn('导入数据', { act: 'pickImport' }) +
      '<input type="file" accept=".json,application/json" id="import-file" class="import-file" data-act="importFile">' +
      '</div>' + expLine + impLine);
  }

  /* ---------- 存储占用 ---------- */
  function storageHTML() {
    var u = settings.usageInfo();
    var rows = u.rows.length
      ? '<table class="tbl mt8"><thead><tr><th>数据类别</th><th>条数</th></tr></thead><tbody>' +
      u.rows.map(function (r) {
        return '<tr><td>' + util.esc(r.label) + '</td><td>' + r.count + '</td></tr>';
      }).join('') + '</tbody></table>'
      : '<div class="muted mt8">还没有任何数据。</div>';

    return ui.card('存储占用',
      '<div class="kv"><span class="kv-k">合计</span><span>' + u.count + ' 条</span></div>' +
      '<div class="kv"><span class="kv-k">估算占用</span><span' + (u.near ? ' class="warn-txt"' : '') + '>' + util.esc(u.text) + ' / 约 ' + util.esc(u.limitText) + '</span></div>' +
      (u.near ? '<div class="muted mt8 warn-txt">占用接近浏览器上限，请先导出备份，再清理不用的数据。</div>' : '') +
      rows);
  }

  /* ---------- 外观 ---------- */
  function appearanceHTML() {
    var s = settings.get();
    var cur = App.currentThemeName ? App.currentThemeName() : s.theme;
    return ui.card('外观',
      '<div class="form">' +
      ui.field('主题模式', ui.select({
        id: 'set-theme', fk: 'theme', act: 'theme', value: s.theme, options: themeOptions()
      })) +
      ui.field('白天时段起', ui.input({ id: 'set-dayStart', fk: 'dayStart', act: 'dayRange', value: s.dayStart, placeholder: '06:00' })) +
      ui.field('白天时段止', ui.input({ id: 'set-dayEnd', fk: 'dayEnd', act: 'dayRange', value: s.dayEnd, placeholder: '18:00' })) +
      '</div>' +
      '<div class="muted mt8">当前生效：' + util.esc(L.theme[cur]) +
      '（跟随时间时，' + util.esc(s.dayStart) + '–' + util.esc(s.dayEnd) + ' 用浅色，其余时间用深色）</div>');
  }

  /* ---------- 偏好 ---------- */
  function preferenceHTML() {
    var s = settings.get();
    return ui.card('偏好',
      '<div class="form">' +
      ui.field('一周第一天', ui.select({
        id: 'set-weekStart', fk: 'weekStartsOn', act: 'weekStart', value: String(s.weekStartsOn),
        options: [{ value: '1', label: '周一' }, { value: '0', label: '周日' }]
      })) +
      ui.field('打开默认进哪一页', ui.select({
        id: 'set-defaultPage', fk: 'defaultPage', act: 'defaultPage', value: s.defaultPage, options: pageOptions()
      })) +
      ui.field('备份提醒间隔（天）', ui.input({
        id: 'set-remindDays', fk: 'backupRemindDays', act: 'remindDays', value: String(s.backupRemindDays), placeholder: '7'
      })) +
      '</div>');
  }

  /* ---------- 危险区 ---------- */
  function dangerHTML() {
    var u = settings.usageInfo();
    return ui.card('危险区',
      '<div class="muted">清空会删掉全部业务数据（' + u.count + ' 条）。执行前会自动先导出一份快照文件，' +
      '个人偏好设置会保留。</div>' +
      '<div class="form mt8">' +
      ui.field('输入「' + CLEAR_WORD + '」以启用按钮', ui.input({
        id: 'clear-word', fk: 'clearWord', act: 'clearWord', placeholder: CLEAR_WORD
      })) +
      '</div>' +
      '<div class="list-actions mt8">' +
      ui.btn('清空全部数据', { act: 'clearAll', id: 'clear-ok', tone: 'danger' }) +
      '</div>' +
      '<div class="muted mt8" id="clear-hint">按钮在输入正确的四个字之前不可点。</div>');
  }

  /* ---------- 关于 ---------- */
  function aboutHTML() {
    var a = settings.about();
    return ui.card('关于',
      '<div class="kv"><span class="kv-k">版本</span><span>v' + util.esc(a.version) + '</span></div>' +
      '<div class="kv"><span class="kv-k">启用时间</span><span>' + util.esc(a.createdAtText) + '</span></div>' +
      '<div class="kv"><span class="kv-k">上次备份</span><span>' + util.esc(a.lastBackupText) + '</span></div>' +
      '<div class="kv"><span class="kv-k">数据总量</span><span>' + a.total + ' 条</span></div>' +
      '<table class="tbl mt8"><thead><tr><th>模块</th><th>数据条数</th></tr></thead><tbody>' +
      a.groups.map(function (g) {
        return '<tr><td>' + util.esc(g.label) + '</td><td>' + g.count + '</td></tr>';
      }).join('') + '</tbody></table>');
  }

  function bodyHTML() {
    return '<div class="page-head"><h2>数据与设置</h2><p>备份、外观与偏好</p></div>' +
      '<div class="cols-settings">' +
      backupHTML() + storageHTML() + appearanceHTML() +
      preferenceHTML() + dangerHTML() + aboutHTML() +
      '</div>';
  }

  /* ---------- 渲染 ---------- */
  var ctxRoot = null;

  function syncClearBtn() {
    var btn = document.getElementById('clear-ok');
    if (!btn) return;
    var ok = settings.canClear(state.clearInput);
    if (ok) btn.removeAttribute('disabled'); else btn.setAttribute('disabled', 'disabled');
    var hint = document.getElementById('clear-hint');
    if (hint) hint.textContent = ok ? '已确认，点按钮执行清空。' : '按钮在输入正确的四个字之前不可点。';
  }

  function renderAll() {
    if (!ctxRoot) return;
    ctxRoot.innerHTML = bodyHTML();
    bind(ctxRoot);
    var inp = document.getElementById('clear-word');
    if (inp) inp.value = state.clearInput;
    syncClearBtn();
  }

  /* ---------- 导入：文件 → 预览 → 覆盖/合并 → 二次确认 ---------- */

  function openImportPreview(payload) {
    var p = settings.preview(payload);
    if (p.error) { ui.toast(p.error); return null; }
    var detail = p.byKey.length
      ? '<table class="tbl mt8"><thead><tr><th>类别</th><th>新增</th><th>覆盖</th></tr></thead><tbody>' +
      p.byKey.map(function (r) {
        return '<tr><td>' + util.esc(r.label) + '</td><td>' + r.add + '</td><td>' + r.overwrite + '</td></tr>';
      }).join('') + '</tbody></table>'
      : '<div class="muted mt8">文件里没有业务数据，只会同步设置项。</div>';

    var body = '<div class="import-preview">' + util.esc(p.text) + '</div>' + detail +
      '<div class="modal-ft">' +
      ui.btn('按覆盖导入', { act: 'importOverwrite', tone: 'danger' }) +
      ui.btn('按合并导入', { act: 'importMerge' }) +
      ui.btn('取消', { act: 'closeDrawer' }) +
      '</div>';

    var entry = ui.drawer('导入预览', body);
    if (entry && entry.el) {
      entry.el.addEventListener('click', function (e) {
        var t = e.target.closest('[data-act]');
        if (!t) return;
        if (t.dataset.act === 'importMerge') return confirmImport(payload, 'merge');
        if (t.dataset.act === 'importOverwrite') return confirmImport(payload, 'overwrite');
      });
    }
    return entry;
  }

  function confirmImport(payload, mode) {
    var isOver = mode !== 'merge';
    ui.closeDrawer();
    ui.confirm(
      '确认按「' + (isOver ? '覆盖' : '合并') + '」方式导入？' +
      (isOver ? '现有数据会被文件里的内容整体替换。' : '同 id 的记录以文件里的为准，其余追加。'),
      function () {
        var r = settings.applyImport(payload, mode);
        if (!r.ok) { ui.toast(r.error); return; }
        state.lastImport = r;
        ui.toast('导入完成：新增 ' + r.added + ' 条、覆盖 ' + r.replaced + ' 条');
        settings.afterDataChange();
        renderAll();
      },
      { danger: isOver, okText: '确认导入' }
    );
  }

  function handleFile(input) {
    var f = input && input.files && input.files[0];
    if (!f) return;
    var Reader = root.FileReader;
    if (typeof Reader !== 'function') { ui.toast('当前浏览器不支持读取本地文件'); return; }
    var reader = new Reader();
    reader.onload = function () {
      var payload;
      try { payload = JSON.parse(String(reader.result)); }
      catch (e) { ui.toast('这个文件不是合法的 JSON'); return; }
      openImportPreview(payload);
    };
    reader.onerror = function () { ui.toast('读取文件失败'); };
    reader.readAsText(f);
  }

  function doExport() {
    var r = settings.exportData();
    state.lastExport = r;
    ui.toast('已导出 ' + r.fileName + '（' + r.sizeText + '）');
    renderAll();
    if (App.renderReminder) App.renderReminder();
    return r;
  }

  function doClear() {
    ui.confirm(
      '确定清空全部数据？清空前会自动导出一份快照文件作为最后的保险。',
      function () {
        var r = settings.clearAll();
        state.clearInput = '';
        ui.toast('已清空，快照：' + r.snapshot.fileName);
        settings.afterDataChange();
        renderAll();
      },
      { danger: true, okText: '清空数据' }
    );
  }

  /* ---------- 绑定 ---------- */
  function bind(rootEl) {
    rootEl.onclick = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !rootEl.contains(t)) return;
      var act = t.dataset.act;

      if (act === 'export') return doExport();
      if (act === 'pickImport') {
        var fi = document.getElementById('import-file');
        if (fi) fi.click();
        return;
      }
      if (act === 'clearAll') {
        if (!settings.canClear(state.clearInput)) { ui.toast('请先输入「' + CLEAR_WORD + '」'); return; }
        return doClear();
      }
    };

    /* 文本输入：改完立刻存，并且不让整页重绘（否则输入框会失焦） */
    rootEl.oninput = function (e) {
      var t = e.target;
      if (!t || !t.dataset) return;
      if (t.dataset.act === 'clearWord') {
        state.clearInput = t.value;
        syncClearBtn();
        return;
      }
      if (t.dataset.act === 'dayRange') {
        settings.setDayRange(
          document.getElementById('set-dayStart').value,
          document.getElementById('set-dayEnd').value
        );
        if (App.applyTheme) App.applyTheme();
        return;
      }
    };

    rootEl.onchange = function (e) {
      var t = e.target;
      if (!t || !t.dataset) return;
      var act = t.dataset.act;
      if (act === 'importFile') return handleFile(t);
      if (act === 'theme') {
        settings.setTheme(t.value);
        if (App.applyTheme) App.applyTheme();
        if (App.topbar && App.topbar.render) App.topbar.render();
        if (App.sidebar && App.sidebar.render) App.sidebar.render();
        renderAll();
        return;
      }
      if (act === 'weekStart') { settings.setWeekStartsOn(t.value); renderAll(); return; }
      if (act === 'defaultPage') { settings.setDefaultPage(t.value); renderAll(); return; }
      if (act === 'remindDays') {
        if (!settings.setBackupRemindDays(t.value)) ui.toast('提醒间隔要大于 0 天');
        renderAll();
        if (App.renderReminder) App.renderReminder();
        return;
      }
      if (act === 'dayRange') {
        settings.setDayRange(
          document.getElementById('set-dayStart').value,
          document.getElementById('set-dayEnd').value
        );
        renderAll();
        return;
      }
    };

    rootEl.onkeydown = function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (t && t.dataset && t.dataset.act === 'clearWord') {
        state.clearInput = t.value;
        syncClearBtn();
      }
    };
  }

  App.pages.settings = {
    id: 'settings',
    title: '数据与设置',
    subtitle: '备份、外观与偏好',

    render: function (rootEl) {
      ctxRoot = rootEl;
      renderAll();
    },

    refresh: function () { renderAll(); },

    primaryAdd: function () { doExport(); },

    destroy: function () { ctxRoot = null; },

    /* 供测试使用 */
    _state: state,
    _bodyHTML: function () { return bodyHTML(); },
    _renderAll: renderAll,
    _openImportPreview: openImportPreview,
    _confirmImport: confirmImport,
    _handleFile: handleFile,
    _doExport: doExport,
    _syncClearBtn: syncClearBtn
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
