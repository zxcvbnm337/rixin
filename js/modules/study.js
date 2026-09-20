/* study.js —— 学习计划：方向 → 学习项 → 学习记录，三层台账。
   对应 PRD 5.2 与页面结构设计 4.3：三个页签、方向卡片、学习项表格、学习记录流水、笔记按学习项聚合。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var util = App.util, ui = App.ui, store = App.store, schema = App.schema;
  var K = schema.KEYS;
  var L = schema.LABELS;

  function trim(v) { return String(v == null ? '' : v).trim(); }
  function idxOf(list, id) {
    var i = -1;
    list.forEach(function (x, k) { if (x.id === id) i = k; });
    return i;
  }

  var study = {
    /* ================= 方向 ================= */
    directions: function () {
      return util.sortBy(store.get(K.studyDirections).slice(), function (d) { return d.createdAt || 0; });
    },

    getDirection: function (id) {
      return store.get(K.studyDirections).filter(function (d) { return d.id === id; })[0] || null;
    },

    addDirection: function (opts) {
      opts = opts || {};
      var name = trim(opts.name);
      if (!name) return null;
      var item = {
        id: util.uid('dir'), name: name,
        goal: String(opts.goal || ''),
        targetDate: util.isValidDate(opts.targetDate) ? opts.targetDate : '',
        status: L.studyDirectionStatus[opts.status] ? opts.status : 'active',
        createdAt: Date.now()
      };
      var all = store.get(K.studyDirections).slice();
      all.push(item);
      store.set(K.studyDirections, all);
      return item;
    },

    updateDirection: function (id, patch) {
      var all = store.get(K.studyDirections).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      all[i] = Object.assign({}, all[i], patch);
      store.set(K.studyDirections, all);
      return all[i];
    },

    setDirectionStatus: function (id, status) {
      if (!L.studyDirectionStatus[status]) return null;
      return study.updateDirection(id, { status: status });
    },

    archiveDirection: function (id) { return study.setDirectionStatus(id, 'archived'); },

    /* 删方向时连带删掉它的学习项与记录，避免留下孤儿数据 */
    removeDirection: function (id) {
      var dirs = store.get(K.studyDirections);
      if (!dirs.some(function (d) { return d.id === id; })) return false;
      var items = store.get(K.studyItems);
      var mine = items.filter(function (i) { return i.directionId === id; }).map(function (i) { return i.id; });
      var logs = store.get(K.studyLogs);
      var touchLogs = logs.some(function (l) { return mine.indexOf(l.itemId) >= 0; });
      /* 级联删除存成一个快照，撤销时能一次全还原 */
      store.snapshotMany(touchLogs
        ? [K.studyDirections, K.studyItems, K.studyLogs]
        : [K.studyDirections, K.studyItems]);

      store.set(K.studyDirections, dirs.filter(function (d) { return d.id !== id; }));
      if (mine.length) {
        store.set(K.studyItems, items.filter(function (i) { return i.directionId !== id; }));
        if (touchLogs) {
          store.set(K.studyLogs, logs.filter(function (l) { return mine.indexOf(l.itemId) < 0; }));
        }
      }
      return true;
    },

    directionItems: function (directionId) {
      return study.items({ directionId: directionId });
    },

    directionMinutes: function (directionId) {
      var ids = study.directionItems(directionId).map(function (i) { return i.id; });
      return util.sum(store.get(K.studyLogs).filter(function (l) {
        return ids.indexOf(l.itemId) >= 0;
      }), function (l) { return l.minutes; });
    },

    /* 方向进度 = 该方向下所有学习项进度（0-100）的平均值；没有学习项记 0 */
    directionProgress: function (directionId) {
      var its = study.directionItems(directionId);
      if (!its.length) return 0;
      return Math.round(util.sum(its, function (i) { return util.clamp(i.progress, 0, 100); }) / its.length);
    },

    directionStats: function (directionId) {
      var its = study.directionItems(directionId);
      var dir = study.getDirection(directionId);
      return {
        itemCount: its.length,
        doneCount: its.filter(function (i) { return util.clamp(i.progress, 0, 100) >= 100; }).length,
        progress: study.directionProgress(directionId),
        minutes: study.directionMinutes(directionId),
        daysLeft: (dir && dir.targetDate) ? util.diffDays(dir.targetDate, util.today()) : null
      };
    },

    overview: function () {
      return study.directions().map(function (d) {
        return { direction: d, stats: study.directionStats(d.id) };
      });
    },

    /* ================= 学习项 ================= */
    items: function (filter) {
      filter = filter || {};
      var list = store.get(K.studyItems).slice();
      if (filter.directionId) list = list.filter(function (i) { return i.directionId === filter.directionId; });
      if (filter.status) list = list.filter(function (i) { return i.status === filter.status; });
      if (filter.type) list = list.filter(function (i) { return i.type === filter.type; });
      if (filter.q) {
        var kw = String(filter.q).toLowerCase();
        list = list.filter(function (i) { return String(i.name || '').toLowerCase().indexOf(kw) >= 0; });
      }
      return util.sortBy(list, function (i) { return i.createdAt || 0; });
    },

    getItem: function (id) {
      return store.get(K.studyItems).filter(function (i) { return i.id === id; })[0] || null;
    },

    addItem: function (opts) {
      opts = opts || {};
      var name = trim(opts.name);
      if (!name) return null;
      var p = util.clamp(opts.progress == null || opts.progress === '' ? 0 : opts.progress, 0, 100);
      var item = {
        id: util.uid('sitem'),
        directionId: opts.directionId || '',
        name: name,
        type: L.studyItemType[opts.type] ? opts.type : 'course',
        url: String(opts.url || ''),
        progress: p,
        status: L.studyItemStatus[opts.status] ? opts.status : (p >= 100 ? 'done' : (p > 0 ? 'doing' : 'todo')),
        startDate: util.isValidDate(opts.startDate) ? opts.startDate : '',
        dueDate: util.isValidDate(opts.dueDate) ? opts.dueDate : '',
        createdAt: Date.now()
      };
      var all = store.get(K.studyItems).slice();
      all.push(item);
      store.set(K.studyItems, all);
      return item;
    },

    updateItem: function (id, patch) {
      var all = store.get(K.studyItems).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      all[i] = Object.assign({}, all[i], patch);
      store.set(K.studyItems, all);
      return all[i];
    },

    /* 改进度：到 100 自动「已完成」，从 100 往下退回「进行中」；搁置状态不被覆盖 */
    setItemProgress: function (id, pct) {
      var cur = study.getItem(id);
      if (!cur) return null;
      var p = Math.round(util.clamp(pct, 0, 100));
      var patch = { progress: p };
      if (p >= 100) patch.status = 'done';
      else if (cur.status === 'done') patch.status = 'doing';
      return study.updateItem(id, patch);
    },

    setItemStatus: function (id, status) {
      if (!L.studyItemStatus[status]) return null;
      var patch = { status: status };
      if (status === 'done') patch.progress = 100;
      return study.updateItem(id, patch);
    },

    /* 删学习项时连带删掉它的学习记录 */
    removeItem: function (id) {
      var all = store.get(K.studyItems);
      if (!all.some(function (i) { return i.id === id; })) return false;
      var logs = store.get(K.studyLogs);
      var hasLogs = logs.some(function (l) { return l.itemId === id; });
      store.snapshotMany(hasLogs ? [K.studyItems, K.studyLogs] : [K.studyItems]);
      store.set(K.studyItems, all.filter(function (i) { return i.id !== id; }));
      if (hasLogs) store.set(K.studyLogs, logs.filter(function (l) { return l.itemId !== id; }));
      return true;
    },

    itemMinutes: function (itemId) {
      return util.sum(store.get(K.studyLogs).filter(function (l) {
        return l.itemId === itemId;
      }), function (l) { return l.minutes; });
    },

    /* ================= 学习记录 ================= */
    logs: function (filter) {
      filter = filter || {};
      var list = store.get(K.studyLogs).slice();
      if (filter.itemId) list = list.filter(function (l) { return l.itemId === filter.itemId; });
      if (filter.directionId) {
        var ids = study.directionItems(filter.directionId).map(function (i) { return i.id; });
        list = list.filter(function (l) { return ids.indexOf(l.itemId) >= 0; });
      }
      if (filter.from) list = list.filter(function (l) { return l.date >= filter.from; });
      if (filter.to) list = list.filter(function (l) { return l.date <= filter.to; });
      return list.sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    },

    getLog: function (id) {
      return store.get(K.studyLogs).filter(function (l) { return l.id === id; })[0] || null;
    },

    addLog: function (opts) {
      opts = opts || {};
      var mins = Math.round(Number(opts.minutes));
      if (!opts.itemId) return null;
      if (!(mins > 0)) return null;
      var log = {
        id: util.uid('slog'),
        date: util.isValidDate(opts.date) ? opts.date : util.today(),
        itemId: opts.itemId,
        minutes: mins,
        note: String(opts.note == null ? '' : opts.note),
        createdAt: Date.now()
      };
      var all = store.get(K.studyLogs).slice();
      all.push(log);
      store.set(K.studyLogs, all);
      return log;
    },

    /* 从输入框文本记一笔：'90' / '1.5h' / '1h30m'；解析失败给可读的错误 */
    logFromInput: function (itemId, dateStr, durationStr, note) {
      if (!study.getItem(itemId)) return { ok: false, error: '请先选一个学习项' };
      var mins = util.parseDuration(durationStr);
      if (mins === null) return { ok: false, error: '时长看不懂，试试 90 / 1.5h / 1h30m' };
      if (!(mins > 0)) return { ok: false, error: '时长要大于 0' };
      var log = study.addLog({ itemId: itemId, date: dateStr, minutes: mins, note: note });
      return log ? { ok: true, log: log, minutes: mins } : { ok: false, error: '记录失败' };
    },

    removeLog: function (id) {
      var all = store.get(K.studyLogs);
      if (!all.some(function (l) { return l.id === id; })) return false;
      store.snapshot(K.studyLogs);
      store.set(K.studyLogs, all.filter(function (l) { return l.id !== id; }));
      return true;
    },

    /* 学习项详情里的笔记 = 该学习项下 note 非空的记录 */
    notesForItem: function (itemId) {
      return study.logs({ itemId: itemId }).filter(function (l) { return trim(l.note).length > 0; });
    },

    /* ================= 统计（供首页 / 今日取数） ================= */
    minutesTotal: function (filter) { return util.sum(study.logs(filter), function (l) { return l.minutes; }); },

    minutesOn: function (date) {
      return util.sum(store.get(K.studyLogs).filter(function (l) { return l.date === date; }),
        function (l) { return l.minutes; });
    },

    minutesInWeek: function (dateStr, weekStartsOn) {
      var s = util.startOfWeek(dateStr || util.today(), weekStartsOn == null ? store.weekStartsOn() : weekStartsOn);
      var e = util.addDays(s, 6);
      return util.sum(store.get(K.studyLogs).filter(function (l) {
        return l.date >= s && l.date <= e;
      }), function (l) { return l.minutes; });
    },

    summary: function () {
      var items = study.items();
      return {
        directions: study.directions().length,
        activeDirections: study.directions().filter(function (d) { return d.status === 'active'; }).length,
        items: items.length,
        doing: items.filter(function (i) { return i.status === 'doing'; }).length,
        progress: items.length
          ? Math.round(util.sum(items, function (i) { return util.clamp(i.progress, 0, 100); }) / items.length)
          : 0,
        minutes: study.minutesTotal(),
        weekMinutes: study.minutesInWeek(util.today())
      };
    }
  };
  App.actions = App.actions || {};
  App.actions.study = study;

  /* ================= 页面 ================= */
  var state = {
    tab: 'overview',
    itemFilter: { directionId: '', status: '', type: '', q: '' }
  };

  function statusTone(s) {
    if (s === 'done' || s === 'active') return 'ok';
    if (s === 'archived' || s === 'paused') return 'warn';
    return 'info';
  }

  /* ---------- 页签 A：方向总览 ---------- */
  function dirCardHTML(o) {
    var d = o.direction, s = o.stats;
    var days = '';
    if (s.daysLeft !== null) {
      days = s.daysLeft >= 0 ? ('剩 ' + s.daysLeft + ' 天') : ('已超期 ' + (-s.daysLeft) + ' 天');
    }
    var body =
      '<div class="muted2">' + (d.goal ? util.esc(d.goal) : '（还没写目标）') + '</div>' +
      (d.targetDate ? '<div class="muted">目标 ' + util.esc(d.targetDate) + (days ? ' · ' + days : '') + '</div>' : '') +
      '<div class="mt8">' + ui.progress(s.progress, { showText: true }) + '</div>' +
      '<div class="muted">' + s.itemCount + ' 个学习项（完成 ' + s.doneCount + '） · 累计 ' +
      util.esc(util.fmtDurationCN(s.minutes)) + '</div>' +
      '<div class="list-actions mt8">' +
      '<span class="ico-btn" data-act="dirItems" data-id="' + util.esc(d.id) + '">看学习项</span>' +
      '<span class="ico-btn" data-act="editDirection" data-id="' + util.esc(d.id) + '">编辑</span>' +
      (d.status === 'active'
        ? '<span class="ico-btn" data-act="dirStatus" data-id="' + util.esc(d.id) + '" data-status="done">标记达成</span>'
        : '<span class="ico-btn" data-act="dirStatus" data-id="' + util.esc(d.id) + '" data-status="active">恢复进行</span>') +
      '<span class="ico-btn" data-act="dirStatus" data-id="' + util.esc(d.id) + '" data-status="archived">归档</span>' +
      '<span class="ico-btn" data-act="delDirection" data-id="' + util.esc(d.id) + '">删除</span>' +
      '</div>';
    return ui.card(d.name, body, {
      extra: ui.tag(L.studyDirectionStatus[d.status] || d.status, statusTone(d.status))
    });
  }

  function overviewHTML() {
    var list = study.overview();
    if (!list.length) {
      return ui.empty('还没有学习方向，先定一个要学的东西', ui.btn('新建方向', { act: 'newDirection', small: true }));
    }
    return '<div class="grid grid-3">' + list.map(dirCardHTML).join('') + '</div>' +
      '<div class="mt8">' + ui.btn('＋ 新建方向', { act: 'newDirection' }) + '</div>';
  }

  /* ---------- 页签 B：学习项表格 ---------- */
  function progressCellHTML(it) {
    return '<span class="prog-cell">' + ui.progress(it.progress) +
      '<span class="prog-val" data-act="editProgress" data-id="' + util.esc(it.id) + '" title="点一下改准确数值">' +
      util.clamp(it.progress, 0, 100) + '%</span>' +
      '<span class="ico-btn" data-act="progDown" data-id="' + util.esc(it.id) + '">−</span>' +
      '<span class="ico-btn" data-act="progUp" data-id="' + util.esc(it.id) + '">＋</span>' +
      '</span>';
  }

  function itemRowHTML(it) {
    var dir = study.getDirection(it.directionId);
    var pct = util.clamp(it.progress, 0, 100);
    return '<tr data-id="' + util.esc(it.id) + '">' +
      '<td class="tbl-name" data-act="editItem" data-id="' + util.esc(it.id) + '">' + util.esc(it.name) + '</td>' +
      '<td>' + (dir ? util.esc(dir.name) : '<span class="muted">未归属</span>') + '</td>' +
      '<td>' + util.esc(L.studyItemType[it.type] || it.type) + '</td>' +
      '<td>' + progressCellHTML(it) + '</td>' +
      '<td>' + ui.tag(L.studyItemStatus[it.status] || it.status, statusTone(it.status)) + '</td>' +
      '<td class="muted">' + util.esc(it.startDate || '—') + '</td>' +
      '<td class="muted">' + util.esc(it.dueDate || '—') + '</td>' +
      '<td class="list-actions">' +
      '<span class="ico-btn" data-act="newLog" data-id="' + util.esc(it.id) + '">记一笔</span>' +
      '<span class="ico-btn" data-act="itemNotes" data-id="' + util.esc(it.id) + '">笔记</span>' +
      '<span class="ico-btn" data-act="editItem" data-id="' + util.esc(it.id) + '">编辑</span>' +
      '<span class="ico-btn" data-act="delItem" data-id="' + util.esc(it.id) + '">删除</span>' +
      '</td></tr>';
  }

  function tableHTML(list) {
    if (!list.length) return ui.empty('没有匹配的学习项', ui.btn('新增学习项', { act: 'newItem', small: true }));
    return '<table class="tbl"><thead><tr>' +
      ['名称', '所属方向', '类型', '进度', '状态', '开始日', '预计完成', '操作']
        .map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + list.map(itemRowHTML).join('') + '</tbody></table>';
  }

  function itemsHTML() {
    var f = state.itemFilter;
    var dirOptions = [{ value: '', label: '全部方向' }].concat(study.directions().map(function (d) {
      return { value: d.id, label: d.name };
    }));
    var stOptions = [{ value: '', label: '全部状态' }].concat(Object.keys(L.studyItemStatus).map(function (k) {
      return { value: k, label: L.studyItemStatus[k] };
    }));
    return ui.filterBar([
      { type: 'select', key: 'directionId', label: '方向', value: f.directionId, options: dirOptions },
      { type: 'select', key: 'status', label: '状态', value: f.status, options: stOptions },
      { type: 'text', key: 'q', label: '搜索学习项', value: f.q }
    ]) +
      '<div id="item-table">' + tableHTML(study.items(f)) + '</div>' +
      '<div class="mt8">' + ui.btn('＋ 新增学习项', { act: 'newItem' }) + '</div>';
  }

  /* ---------- 页签 C：学习记录 ---------- */
  function logRowHTML(l) {
    var it = study.getItem(l.itemId);
    var name = it ? it.name : '（学习项已删除）';
    return ui.row(
      '<span class="muted">' + util.esc(l.date) + '</span>' +
      '<span class="row-title" data-act="logItem" data-id="' + util.esc(l.itemId) + '">' + util.esc(name) + '</span>' +
      (trim(l.note) ? '<span class="muted2">' + util.esc(l.note) + '</span>' : ''),
      '<span class="list-actions">' +
      '<span class="row-side">' + util.esc(util.fmtDuration(l.minutes)) + '</span>' +
      '<span class="ico-btn" data-act="delLog" data-id="' + util.esc(l.id) + '">×</span></span>',
      { id: l.id }
    );
  }

  function logsHTML() {
    var list = study.logs();
    var head = '<div class="rowflex" style="margin-bottom:10px;">' +
      ui.btn('＋ 记一笔', { act: 'newLog' }) +
      '<span class="muted right">共 ' + list.length + ' 笔 · 合计 ' + util.esc(util.fmtDurationCN(study.minutesTotal())) + '</span>' +
      '</div>';
    if (!list.length) {
      return head + ui.empty('还没有学习记录，记一笔试试', ui.btn('＋ 记一笔', { act: 'newLog', small: true }));
    }
    return head + '<div class="list">' + list.map(logRowHTML).join('') + '</div>';
  }

  function bodyHTML() {
    var tabs = '<div id="study-tabs">' + ui.tabs([
      { id: 'overview', label: '方向总览' },
      { id: 'items', label: '学习项' },
      { id: 'logs', label: '学习记录' }
    ], state.tab, { act: 'tab' }) + '</div>';
    var content = state.tab === 'overview' ? overviewHTML()
      : state.tab === 'items' ? itemsHTML()
        : logsHTML();
    var sub = state.tab === 'overview' ? '看每个方向学到哪了'
      : state.tab === 'items' ? '每门课 / 书 / 文档的进度和状态'
        : '按日期倒序的流水，笔记沉淀在这';
    return '<div class="page-head"><h2>学习计划</h2><p>' + sub + '</p></div>' +
      tabs + '<div id="study-body">' + content + '</div>';
  }

  /* ---------- 表单抽屉 ---------- */
  function drawerForm(rows) {
    return '<div class="form">' + rows.join('') + '</div>' +
      '<div class="modal-ft">' + ui.btn('保存', { act: 'formSave' }) + ui.btn('取消', { act: 'closeDrawer' }) + '</div>';
  }

  function collect(el) {
    var v = {};
    Array.prototype.slice.call(el.querySelectorAll('[data-fk]')).forEach(function (n) {
      v[n.dataset.fk] = n.value;
    });
    return v;
  }

  function openForm(mode, title, rows) {
    var entry = ui.drawer(title, drawerForm(rows));
    if (entry && entry.el) {
      entry.el.addEventListener('click', function (e) {
        var t = e.target.closest('[data-act]');
        if (!t || t.dataset.act !== 'formSave') return;
        saveForm(mode, collect(entry.el));
      });
    }
    return entry;
  }

  function openDirectionForm(id) {
    var d = id ? study.getDirection(id) : null;
    var rows = [
      ui.field('方向名称', ui.input({ fk: 'name', value: d ? d.name : '', placeholder: '如：LLM 应用工程' })),
      ui.field('目标（一句话）', ui.input({ fk: 'goal', value: d ? d.goal : '', placeholder: '如：能独立上线一个 Agent 应用' })),
      ui.field('目标日期（可空）', ui.input({ fk: 'targetDate', value: d ? d.targetDate : '', placeholder: '2026-12-31' })),
      ui.field('状态', ui.select({
        fk: 'status', value: d ? d.status : 'active',
        options: Object.keys(L.studyDirectionStatus).map(function (k) {
          return { value: k, label: L.studyDirectionStatus[k] };
        })
      }))
    ];
    return openForm(d ? ('editDirection:' + d.id) : 'direction', d ? '编辑学习方向' : '新建学习方向', rows);
  }

  function openItemForm(id) {
    var it = id ? study.getItem(id) : null;
    var dirs = study.directions();
    var dirOptions = [{ value: '', label: '（不归属任何方向）' }].concat(dirs.map(function (d) {
      return { value: d.id, label: d.name };
    }));
    var rows = [
      ui.field('学习项名称', ui.input({ fk: 'name', value: it ? it.name : '', placeholder: '如：LangGraph 官方教程' })),
      ui.field('所属方向', ui.select({ fk: 'directionId', value: it ? it.directionId : (state.itemFilter.directionId || ''), options: dirOptions })),
      ui.field('类型', ui.select({
        fk: 'type', value: it ? it.type : 'course',
        options: Object.keys(L.studyItemType).map(function (k) { return { value: k, label: L.studyItemType[k] }; })
      })),
      ui.field('链接（可空）', ui.input({ fk: 'url', value: it ? it.url : '', placeholder: 'https://…' })),
      ui.field('进度 %', ui.input({ fk: 'progress', type: 'number', value: it ? String(it.progress) : '0' })),
      ui.field('状态', ui.select({
        fk: 'status', value: it ? it.status : 'todo',
        options: Object.keys(L.studyItemStatus).map(function (k) { return { value: k, label: L.studyItemStatus[k] }; })
      })),
      ui.field('开始日期（可空）', ui.input({ fk: 'startDate', value: it ? it.startDate : '', placeholder: '2026-09-01' })),
      ui.field('预计完成（可空）', ui.input({ fk: 'dueDate', value: it ? it.dueDate : '', placeholder: '2026-10-01' }))
    ];
    return openForm(it ? ('editItem:' + it.id) : 'item', it ? '编辑学习项' : '新增学习项', rows);
  }

  function openLogForm(itemId) {
    var items = study.items();
    if (!items.length) { ui.toast('先建一个学习项，才能记学习'); return; }
    var rows = [
      ui.field('学习项', ui.select({
        fk: 'itemId', value: itemId || items[0].id,
        options: items.map(function (i) { return { value: i.id, label: i.name }; })
      })),
      ui.field('日期', ui.input({ fk: 'date', value: util.today(), placeholder: '2026-09-20' })),
      ui.field('时长', ui.input({ fk: 'duration', value: '', placeholder: '90 或 1.5h 或 1h30m' })),
      ui.field('笔记（可空）', ui.textarea({ fk: 'note', rows: 4, placeholder: '今天学了什么、卡在哪' }))
    ];
    return openForm('log', '记一笔学习', rows);
  }

  function saveForm(mode, v) {
    if (mode === 'direction' || mode.indexOf('editDirection:') === 0) {
      var editDirId = mode.indexOf('editDirection:') === 0 ? mode.slice('editDirection:'.length) : null;
      var payload = { name: v.name, goal: v.goal, targetDate: v.targetDate, status: v.status };
      var okD = editDirId ? study.updateDirection(editDirId, payload) : study.addDirection(payload);
      if (!okD) { ui.toast('方向名称不能为空'); return; }
      ui.closeDrawer(); ui.toast(editDirId ? '方向已更新' : '已新建方向'); renderAll(); return;
    }
    if (mode === 'item' || mode.indexOf('editItem:') === 0) {
      var editItemId = mode.indexOf('editItem:') === 0 ? mode.slice('editItem:'.length) : null;
      var p = { name: v.name, directionId: v.directionId, type: v.type, url: v.url, progress: v.progress, status: v.status, startDate: v.startDate, dueDate: v.dueDate };
      var okI = editItemId ? study.updateItem(editItemId, Object.assign({}, p, { progress: util.clamp(p.progress, 0, 100) })) : study.addItem(p);
      if (!okI) { ui.toast('学习项名称不能为空'); return; }
      ui.closeDrawer(); ui.toast(editItemId ? '学习项已更新' : '已新增学习项'); renderAll(); return;
    }
    if (mode === 'log') {
      var r = study.logFromInput(v.itemId, v.date, v.duration, v.note);
      if (!r.ok) { ui.toast(r.error); return; }
      ui.closeDrawer();
      renderAll();
      ui.toast('已记录 ' + util.fmtDuration(r.minutes));
      askProgressBump(v.itemId);
    }
  }

  /* 记一笔后的确认条：默认不改进度（取消即不改） */
  function askProgressBump(itemId) {
    var it = study.getItem(itemId);
    if (!it) return;
    var cur = util.clamp(it.progress, 0, 100);
    var next = Math.min(100, cur + 2);
    if (next === cur) return;
    ui.confirm('记好了。把「' + it.name + '」的进度从 ' + cur + '% 调到 ' + next + '% 吗？',
      function () {
        study.setItemProgress(itemId, next);
        renderAll();
        ui.toast('进度已更新');
      },
      { okText: '进度 +2%', cancelText: '先不改' });
  }

  function bumpProgress(id, delta) {
    var it = study.getItem(id);
    if (!it) return;
    study.setItemProgress(id, util.clamp(it.progress, 0, 100) + delta);
  }

  function showItemNotes(id) {
    var it = study.getItem(id);
    if (!it) return;
    var notes = study.notesForItem(id);
    var body = notes.length
      ? notes.map(function (l) {
        return '<div class="note-item"><div class="note-txt">' +
          '<div class="muted">' + util.esc(l.date) + ' · ' + util.esc(util.fmtDuration(l.minutes)) + '</div>' +
          ui.md(l.note) + '</div></div>';
      }).join('')
      : ui.empty('这个学习项还没有带笔记的记录');
    ui.drawer('「' + it.name + '」的笔记 · 共 ' + notes.length + ' 条', body);
  }

  /* ---------- 渲染与事件 ---------- */
  var ctxRoot = null;

  function renderAll() {
    if (!ctxRoot) return;
    ctxRoot.innerHTML = bodyHTML();
    bind(ctxRoot);
  }

  function refreshTable() {
    var box = document.getElementById('item-table');
    if (box) box.innerHTML = tableHTML(study.items(state.itemFilter));
  }

  function bind(rootEl) {
    rootEl.onclick = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !rootEl.contains(t)) return;
      var act = t.dataset.act, id = t.dataset.id;

      if (act === 'tab') { state.tab = t.dataset.tab; return renderAll(); }
      if (act === 'newDirection') return openDirectionForm(null);
      if (act === 'editDirection') return openDirectionForm(id);
      if (act === 'newItem') return openItemForm(null);
      if (act === 'editItem') return openItemForm(id);
      if (act === 'newLog') return openLogForm(id || null);
      if (act === 'itemNotes') return showItemNotes(id);

      if (act === 'dirItems') {
        state.tab = 'items';
        state.itemFilter.directionId = id;
        return renderAll();
      }
      if (act === 'dirStatus') { study.setDirectionStatus(id, t.dataset.status); return renderAll(); }
      if (act === 'progUp') { bumpProgress(id, 10); return renderAll(); }
      if (act === 'progDown') { bumpProgress(id, -10); return renderAll(); }
      if (act === 'editProgress') {
        var it = study.getItem(id);
        if (!it) return;
        ui.inlineEdit(t, String(util.clamp(it.progress, 0, 100)), function (v) {
          var raw = String(v).trim();
          if (!/^\d+(\.\d+)?$/.test(raw)) { ui.toast('进度要填 0-100 的数字'); return; }
          study.setItemProgress(id, Number(raw));
          renderAll();
        });
        return;
      }
      if (act === 'itemStatus') { study.setItemStatus(id, t.dataset.status); return renderAll(); }
      if (act === 'logItem') { state.tab = 'logs'; return renderAll(); }

      if (act === 'delDirection') {
        var d = study.getDirection(id);
        if (!d) return;
        ui.confirm('删除方向「' + d.name + '」？它的学习项和学习记录会一并删除。', function () {
          study.removeDirection(id);
          ui.toast('已删除方向', { undo: true });
          renderAll();
        }, { danger: true, okText: '删除' });
        return;
      }
      if (act === 'delItem') {
        var it2 = study.getItem(id);
        if (!it2) return;
        ui.confirm('删除学习项「' + it2.name + '」？它的学习记录会一并删除。', function () {
          study.removeItem(id);
          ui.toast('已删除学习项', { undo: true });
          renderAll();
        }, { danger: true, okText: '删除' });
        return;
      }
      if (act === 'delLog') { study.removeLog(id); ui.toast('已删除记录', { undo: true }); return renderAll(); }
    };

    rootEl.onchange = function (e) {
      var t = e.target;
      if (!t.dataset || t.dataset.act !== 'filter') return;
      var key = t.dataset.fkey || String(t.dataset.fk || '').replace(/^filter-/, '');
      if (!key) return;
      state.itemFilter[key] = t.value;
      refreshTable();
    };

    /* 搜索框边打边筛：只重绘表格，避免输入框失焦 */
    rootEl.oninput = function (e) {
      var t = e.target;
      if (!t.dataset || t.dataset.act !== 'filter') return;
      var key = t.dataset.fkey || String(t.dataset.fk || '').replace(/^filter-/, '');
      if (key !== 'q') return;
      state.itemFilter.q = t.value;
      refreshTable();
    };
  }

  App.pages.study = {
    id: 'study',
    title: '学习计划',
    subtitle: '方向、学习项和学习记录',

    render: function (rootEl) {
      ctxRoot = rootEl;
      renderAll();
    },

    refresh: function () { refreshTable(); },

    primaryAdd: function () {
      if (state.tab === 'overview') return openDirectionForm(null);
      if (state.tab === 'items') return openItemForm(null);
      return openLogForm(null);
    },

    destroy: function () { ctxRoot = null; },

    /* 供测试使用 */
    _state: state,
    _bodyHTML: function () { return bodyHTML(); },
    _tableHTML: function () { return tableHTML(study.items(state.itemFilter)); },
    _renderAll: renderAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
