/* consult.js —— 咨询工作：客户 → 项目 + 交付物 + 沟通纪要 + 工时（含计时器与四维汇总）。
   对应 PRD 5.4 与页面结构设计 4.5。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var util = App.util, ui = App.ui, store = App.store, schema = App.schema;
  var K = schema.KEYS;
  var L = schema.LABELS;

  function trim(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function idxOf(list, id) {
    var i = -1;
    list.forEach(function (x, k) { if (x.id === id) i = k; });
    return i;
  }
  function sortedBy(list, key, desc) {
    return util.sortBy(list.slice(), function (x) { return x[key] || 0; }, !!desc);
  }

  /* ---------- 计时器：开始时间存 sessionStorage，刷新也能接着算 ---------- */
  var TIMER_KEY = 'pm.timer';
  var TIMER_WARN_SEC = 14400; /* 4 小时 */
  var clock = function () { return Date.now(); };

  function ss() {
    try { return root.sessionStorage || null; } catch (e) { return null; }
  }
  function readTimer() {
    var s = ss();
    if (!s) return null;
    try {
      var raw = s.getItem(TIMER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeTimer(v) {
    var s = ss();
    if (!s) return;
    try {
      if (v) s.setItem(TIMER_KEY, JSON.stringify(v));
      else s.removeItem(TIMER_KEY);
    } catch (e) { /* 忽略配额等异常 */ }
  }

  var consult = {
    TIMER_WARN_SEC: TIMER_WARN_SEC,
    /* 供测试注入时钟 */
    _setClock: function (fn) { clock = (typeof fn === 'function') ? fn : function () { return Date.now(); }; },

    /* ================= 客户 ================= */
    clients: function (filter) {
      filter = filter || {};
      var list = store.get(K.consultClients).slice();
      if (filter.status) list = list.filter(function (c) { return c.status === filter.status; });
      if (filter.q) {
        var kw = String(filter.q).toLowerCase();
        list = list.filter(function (c) {
          return String(c.name || '').toLowerCase().indexOf(kw) >= 0 ||
            String(c.contact || '').toLowerCase().indexOf(kw) >= 0;
        });
      }
      return sortedBy(list, 'createdAt', true);
    },

    getClient: function (id) {
      return store.get(K.consultClients).filter(function (c) { return c.id === id; })[0] || null;
    },

    addClient: function (opts) {
      opts = opts || {};
      var name = trim(opts.name);
      if (!name) return null;
      var c = {
        id: util.uid('cli'), name: name,
        contact: String(opts.contact || ''),
        phone: String(opts.phone || ''),
        status: L.clientStatus[opts.status] ? opts.status : 'talking',
        note: String(opts.note || ''),
        createdAt: Date.now()
      };
      var all = store.get(K.consultClients).slice();
      all.push(c);
      store.set(K.consultClients, all);
      return c;
    },

    updateClient: function (id, patch) {
      var all = store.get(K.consultClients).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      all[i] = Object.assign({}, all[i], patch);
      store.set(K.consultClients, all);
      return all[i];
    },

    setClientStatus: function (id, status) {
      if (!L.clientStatus[status]) return null;
      return consult.updateClient(id, { status: status });
    },

    /* 删客户：连带它的项目、交付物、纪要、工时 */
    removeClient: function (id) {
      var all = store.get(K.consultClients);
      if (!all.some(function (c) { return c.id === id; })) return false;
      var projs = store.get(K.consultProjects);
      var mine = projs.filter(function (p) { return p.clientId === id; }).map(function (p) { return p.id; });
      var dl = store.get(K.consultDeliverables);
      var hasDl = dl.some(function (x) { return mine.indexOf(x.projectId) >= 0; });
      var wl = store.get(K.consultWorklogs);
      var hasWl = wl.some(function (x) { return mine.indexOf(x.projectId) >= 0; });
      var mt = store.get(K.consultMeetings);
      var hasMt = mt.some(function (m) { return m.clientId === id; });

      var group = [K.consultClients];
      if (mine.length) group.push(K.consultProjects);
      if (hasDl) group.push(K.consultDeliverables);
      if (hasWl) group.push(K.consultWorklogs);
      if (hasMt) group.push(K.consultMeetings);
      store.snapshotMany(group);

      store.set(K.consultClients, all.filter(function (c) { return c.id !== id; }));
      if (mine.length) {
        store.set(K.consultProjects, projs.filter(function (p) { return p.clientId !== id; }));
        if (hasDl) store.set(K.consultDeliverables, dl.filter(function (x) { return mine.indexOf(x.projectId) < 0; }));
        if (hasWl) store.set(K.consultWorklogs, wl.filter(function (x) { return mine.indexOf(x.projectId) < 0; }));
      }
      if (hasMt) store.set(K.consultMeetings, mt.filter(function (m) { return m.clientId !== id; }));
      return true;
    },

    /* ================= 项目 ================= */
    projects: function (filter) {
      filter = filter || {};
      var list = store.get(K.consultProjects).slice();
      if (filter.clientId) list = list.filter(function (p) { return p.clientId === filter.clientId; });
      return sortedBy(list, 'createdAt');
    },

    getProject: function (id) {
      return store.get(K.consultProjects).filter(function (p) { return p.id === id; })[0] || null;
    },

    addProject: function (opts) {
      opts = opts || {};
      var name = trim(opts.name);
      if (!name) return null;
      var p = {
        id: util.uid('cproj'),
        clientId: opts.clientId || '',
        name: name,
        startDate: util.isValidDate(opts.startDate) ? opts.startDate : '',
        endDate: util.isValidDate(opts.endDate) ? opts.endDate : '',
        quote: num(opts.quote),
        stage: String(opts.stage || ''),
        createdAt: Date.now()
      };
      var all = store.get(K.consultProjects).slice();
      all.push(p);
      store.set(K.consultProjects, all);
      return p;
    },

    updateProject: function (id, patch) {
      var all = store.get(K.consultProjects).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      var next = Object.assign({}, all[i], patch);
      if (patch && patch.quote !== undefined) next.quote = num(patch.quote);
      all[i] = next;
      store.set(K.consultProjects, all);
      return next;
    },

    removeProject: function (id) {
      var all = store.get(K.consultProjects);
      if (!all.some(function (p) { return p.id === id; })) return false;
      var dl = store.get(K.consultDeliverables);
      var hasDl = dl.some(function (x) { return x.projectId === id; });
      var wl = store.get(K.consultWorklogs);
      var hasWl = wl.some(function (x) { return x.projectId === id; });
      var group = [K.consultProjects];
      if (hasDl) group.push(K.consultDeliverables);
      if (hasWl) group.push(K.consultWorklogs);
      store.snapshotMany(group);

      store.set(K.consultProjects, all.filter(function (p) { return p.id !== id; }));
      if (hasDl) store.set(K.consultDeliverables, dl.filter(function (x) { return x.projectId !== id; }));
      if (hasWl) store.set(K.consultWorklogs, wl.filter(function (x) { return x.projectId !== id; }));
      return true;
    },

    /* ================= 交付物 ================= */
    deliverables: function (filter) {
      filter = filter || {};
      var list = store.get(K.consultDeliverables).slice();
      if (filter.projectId) list = list.filter(function (d) { return d.projectId === filter.projectId; });
      if (filter.status) list = list.filter(function (d) { return d.status === filter.status; });
      return list;
    },

    getDeliverable: function (id) {
      return store.get(K.consultDeliverables).filter(function (d) { return d.id === id; })[0] || null;
    },

    addDeliverable: function (opts) {
      opts = opts || {};
      var name = trim(opts.name);
      if (!name) return null;
      var d = {
        id: util.uid('dlv'), projectId: opts.projectId || '', name: name,
        status: L.deliverableStatus[opts.status] ? opts.status : 'pending',
        deliveredAt: opts.status === 'delivered' ? util.today() : '',
        url: String(opts.url || '')
      };
      var all = store.get(K.consultDeliverables).slice();
      all.push(d);
      store.set(K.consultDeliverables, all);
      return d;
    },

    updateDeliverable: function (id, patch) {
      var all = store.get(K.consultDeliverables).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      all[i] = Object.assign({}, all[i], patch);
      store.set(K.consultDeliverables, all);
      return all[i];
    },

    setDeliverableStatus: function (id, status) {
      if (!L.deliverableStatus[status]) return null;
      return consult.updateDeliverable(id, {
        status: status,
        deliveredAt: status === 'delivered' ? util.today() : ''
      });
    },

    removeDeliverable: function (id) {
      var all = store.get(K.consultDeliverables);
      if (!all.some(function (d) { return d.id === id; })) return false;
      store.snapshot(K.consultDeliverables);
      store.set(K.consultDeliverables, all.filter(function (d) { return d.id !== id; }));
      return true;
    },

    /* ================= 沟通纪要 ================= */
    meetings: function (filter) {
      filter = filter || {};
      var list = store.get(K.consultMeetings).slice();
      if (filter.clientId) list = list.filter(function (m) { return m.clientId === filter.clientId; });
      if (filter.projectId) list = list.filter(function (m) { return m.projectId === filter.projectId; });
      return list.sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    },

    getMeeting: function (id) {
      return store.get(K.consultMeetings).filter(function (m) { return m.id === id; })[0] || null;
    },

    addMeeting: function (opts) {
      opts = opts || {};
      if (!trim(opts.points) && !trim(opts.followUp)) return null;
      var m = {
        id: util.uid('meet'),
        date: util.isValidDate(opts.date) ? opts.date : util.today(),
        clientId: opts.clientId || '',
        projectId: opts.projectId || '',
        attendees: String(opts.attendees || ''),
        points: String(opts.points || ''),
        followUp: String(opts.followUp || ''),
        followUpDone: false,
        createdAt: Date.now()
      };
      var all = store.get(K.consultMeetings).slice();
      all.push(m);
      store.set(K.consultMeetings, all);
      return m;
    },

    updateMeeting: function (id, patch) {
      var all = store.get(K.consultMeetings).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      all[i] = Object.assign({}, all[i], patch);
      store.set(K.consultMeetings, all);
      return all[i];
    },

    removeMeeting: function (id) {
      var all = store.get(K.consultMeetings);
      if (!all.some(function (m) { return m.id === id; })) return false;
      store.snapshot(K.consultMeetings);
      store.set(K.consultMeetings, all.filter(function (m) { return m.id !== id; }));
      return true;
    },

    /* 待跟进 → 今日计划：新增任务并带上客户来源痕迹 */
    followUpToToday: function (id) {
      var m = consult.getMeeting(id);
      if (!m) return null;
      if (!trim(m.followUp)) return null;
      if (m.followUpDone) return null;
      var task = null;
      if (App.actions.today && typeof App.actions.today.pushToToday === 'function') {
        task = App.actions.today.pushToToday(m.followUp, util.today(), 'consult', m.id);
      }
      consult.updateMeeting(id, { followUpDone: true });
      return task;
    },

    /* ================= 工时 ================= */
    worklogs: function (filter) {
      filter = filter || {};
      var list = store.get(K.consultWorklogs).slice();
      if (filter.projectId) list = list.filter(function (w) { return w.projectId === filter.projectId; });
      if (filter.from) list = list.filter(function (w) { return w.date >= filter.from; });
      if (filter.to) list = list.filter(function (w) { return w.date <= filter.to; });
      if (filter.q) {
        var kw = String(filter.q).toLowerCase();
        list = list.filter(function (w) {
          return String(w.content || '').toLowerCase().indexOf(kw) >= 0;
        });
      }
      if (filter.clientId) {
        var ids = consult.projects({ clientId: filter.clientId }).map(function (p) { return p.id; });
        list = list.filter(function (w) { return ids.indexOf(w.projectId) >= 0; });
      }
      return list.sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    },

    getWorklog: function (id) {
      return store.get(K.consultWorklogs).filter(function (w) { return w.id === id; })[0] || null;
    },

    addWorklog: function (opts) {
      opts = opts || {};
      var mins = Math.round(num(opts.minutes));
      if (!(mins > 0)) return null;
      var w = {
        id: util.uid('wlog'),
        date: util.isValidDate(opts.date) ? opts.date : util.today(),
        projectId: opts.projectId || '',
        minutes: mins,
        content: String(opts.content || ''),
        createdAt: Date.now()
      };
      var all = store.get(K.consultWorklogs).slice();
      all.push(w);
      store.set(K.consultWorklogs, all);
      return w;
    },

    updateWorklog: function (id, patch) {
      var all = store.get(K.consultWorklogs).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      var next = Object.assign({}, all[i], patch);
      if (patch && patch.minutes !== undefined) next.minutes = Math.round(num(patch.minutes));
      all[i] = next;
      store.set(K.consultWorklogs, all);
      return next;
    },

    removeWorklog: function (id) {
      var all = store.get(K.consultWorklogs);
      if (!all.some(function (w) { return w.id === id; })) return false;
      store.snapshot(K.consultWorklogs);
      store.set(K.consultWorklogs, all.filter(function (w) { return w.id !== id; }));
      return true;
    },

    /* ---------- 计时器 ---------- */
    timerState: function () {
      var t = readTimer();
      if (!t || !t.startedAt) return { running: false, projectId: '', startedAt: null, seconds: 0 };
      return {
        running: true, projectId: t.projectId, startedAt: t.startedAt,
        seconds: Math.max(0, Math.floor((clock() - t.startedAt) / 1000))
      };
    },

    startTimer: function (projectId) {
      if (!consult.getProject(projectId)) return { ok: false, error: '请先选一个项目' };
      if (consult.timerState().running) return { ok: false, error: '已经在计时了' };
      writeTimer({ projectId: projectId, startedAt: clock() });
      return { ok: true };
    },

    cancelTimer: function () { writeTimer(null); return true; },

    stopTimer: function (opts) {
      opts = opts || {};
      var t = readTimer();
      if (!t || !t.startedAt) return { ok: false, error: '没有在计时' };
      var sec = Math.max(0, Math.floor((clock() - t.startedAt) / 1000));
      var minutes = (opts.minutes != null) ? Math.round(num(opts.minutes))
        : Math.max(1, Math.round(sec / 60));
      writeTimer(null);
      var log = consult.addWorklog({
        date: util.today(), projectId: t.projectId,
        minutes: minutes, content: opts.content || '计时器记录'
      });
      return { ok: true, log: log, seconds: sec, minutes: minutes };
    },

    /* ---------- 汇总 ---------- */
    clientMinutes: function (clientId) {
      var ids = consult.projects({ clientId: clientId }).map(function (p) { return p.id; });
      return util.sum(store.get(K.consultWorklogs).filter(function (w) {
        return ids.indexOf(w.projectId) >= 0;
      }), function (w) { return w.minutes; });
    },

    clientAmount: function (clientId) {
      return util.sum(consult.projects({ clientId: clientId }), function (p) { return num(p.quote); });
    },

    projectMinutes: function (projectId) {
      return util.sum(store.get(K.consultWorklogs).filter(function (w) {
        return w.projectId === projectId;
      }), function (w) { return w.minutes; });
    },

    clientStats: function (id) {
      return {
        projectCount: consult.projects({ clientId: id }).length,
        minutes: consult.clientMinutes(id),
        amount: consult.clientAmount(id),
        pendingDeliverables: consult.deliverables().filter(function (d) {
          var p = consult.getProject(d.projectId);
          return p && p.clientId === id && d.status === 'pending';
        }).length
      };
    },

    /* 四组维度：按客户 / 按项目 / 本周 / 本月 → [{label, value}] */
    summaryItems: function (kind, refDate) {
      var ref = refDate || util.today();
      var logs = store.get(K.consultWorklogs).slice();
      var byProject = (kind === 'project' || kind === 'week' || kind === 'month');
      if (kind === 'week') {
        var s = util.startOfWeek(ref, store.weekStartsOn());
        var e = util.addDays(s, 6);
        logs = logs.filter(function (l) { return l.date >= s && l.date <= e; });
      } else if (kind === 'month') {
        var mk = util.monthKey(ref);
        logs = logs.filter(function (l) { return util.monthKey(l.date) === mk; });
      }
      var map = {};
      logs.forEach(function (l) {
        var p = consult.getProject(l.projectId);
        var label;
        if (byProject) label = p ? p.name : '未归属项目';
        else {
          var c = p ? consult.getClient(p.clientId) : null;
          label = c ? c.name : '未归属客户';
        }
        map[label] = (map[label] || 0) + num(l.minutes);
      });
      return Object.keys(map).map(function (k) { return { label: k, value: map[k] }; })
        .sort(function (a, b) { return b.value - a.value; });
    },

    /* 供首页取数 */
    summary: function () {
      var ps = consult.projects();
      var wls = store.get(K.consultWorklogs);
      return {
        clients: consult.clients().length,
        activeClients: consult.clients().filter(function (c) { return c.status === 'doing'; }).length,
        projects: ps.length,
        worklogs: wls.length,
        minutes: util.sum(wls, function (w) { return w.minutes; }),
        weekMinutes: util.sum(consult.worklogs({
          from: util.startOfWeek(util.today(), store.weekStartsOn()),
          to: util.addDays(util.startOfWeek(util.today(), store.weekStartsOn()), 6)
        }), function (w) { return w.minutes; }),
        pendingDeliverables: consult.deliverables({ status: 'pending' }).length,
        pendingFollowUps: consult.meetings().filter(function (m) {
          return !!trim(m.followUp) && !m.followUpDone;
        }).length
      };
    }
  };
  App.actions = App.actions || {};
  App.actions.consult = consult;

  /* ================= 页面 ================= */
  var state = {
    tab: 'clients',
    clientId: null,
    summaryKind: 'client',
    timerProjectId: '',
    timerWarned: false,
    clientFilter: { status: '', q: '' },
    workFilter: { from: '', to: '', q: '' }
  };

  var KIND_LABELS = { client: '按客户', project: '按项目', week: '本周', month: '本月' };

  function statusTone(s) {
    if (s === 'done' || s === 'delivered' || s === 'closed') return 'ok';
    if (s === 'paused' || s === 'fixing') return 'warn';
    return 'info';
  }
  function projectName(id) { var p = consult.getProject(id); return p ? p.name : '未归属项目'; }

  /* ---------- 页签 A：客户 ---------- */
  function clientCardHTML(c) {
    var s = consult.clientStats(c.id);
    var body =
      '<div class="muted2">' + (c.contact || c.phone ? util.esc([c.contact, c.phone].filter(Boolean).join(' · ')) : '（没写联系人）') + '</div>' +
      '<div class="kv mt8"><span class="kv-k">累计工时</span><span>' + util.esc(util.fmtDurationCN(s.minutes)) + '</span></div>' +
      '<div class="kv"><span class="kv-k">累计金额</span><span>' + util.esc(util.fmtMoney(s.amount)) + '</span></div>' +
      '<div class="kv"><span class="kv-k">项目</span><span>' + s.projectCount + ' 个' +
      (s.pendingDeliverables ? ' · 待交付 ' + s.pendingDeliverables : '') + '</span></div>' +
      '<div class="list-actions mt8">' +
      '<span class="ico-btn" data-act="openClient" data-id="' + util.esc(c.id) + '">看详情</span>' +
      '<span class="ico-btn" data-act="editClient" data-id="' + util.esc(c.id) + '">编辑</span>' +
      '<span class="ico-btn" data-act="delClient" data-id="' + util.esc(c.id) + '">删除</span>' +
      '</div>';
    return ui.card(c.name, body, { extra: ui.tag(L.clientStatus[c.status] || c.status, statusTone(c.status)) });
  }

  function clientsHTML() {
    var f = state.clientFilter;
    var all = consult.clients();
    var list = consult.clients(f);
    var bar = ui.filterBar([
      {
        type: 'select', key: 'status', label: '全部状态', value: f.status,
        options: [{ value: '', label: '全部状态' }].concat(Object.keys(L.clientStatus).map(function (k) {
          return { value: k, label: L.clientStatus[k] };
        }))
      },
      { type: 'text', key: 'q', label: '搜索客户名 / 联系人', value: f.q }
    ]);
    var body;
    if (!all.length) {
      body = ui.empty('还没有客户，先把合作方建一个', ui.btn('新增客户', { act: 'newClient', small: true }));
    } else if (!list.length) {
      body = '<div class="empty-sm">没有符合筛选条件的客户</div>';
    } else {
      body = '<div class="grid grid-3">' + list.map(clientCardHTML).join('') + '</div>';
    }
    return '<div class="rowflex"><span class="muted" id="client-count">共 ' + list.length + ' 个客户</span>' +
      (list.length === all.length ? '' : '<span class="muted">（已筛选）</span>') + '</div>' +
      bar + '<div id="client-list">' + body + '</div>' +
      '<div class="mt8">' + ui.btn('＋ 新增客户', { act: 'newClient' }) + '</div>';
  }

  /* 客户 / 工时两处的筛选：只重绘列表，别让输入框失焦 */
  function refreshClientList() {
    var box = document.getElementById('client-list');
    if (!box) return renderAll();
    var all = consult.clients();
    var list = consult.clients(state.clientFilter);
    if (!all.length) {
      box.innerHTML = ui.empty('还没有客户，先把合作方建一个', ui.btn('新增客户', { act: 'newClient', small: true }));
    } else if (!list.length) {
      box.innerHTML = '<div class="empty-sm">没有符合筛选条件的客户</div>';
    } else {
      box.innerHTML = '<div class="grid grid-3">' + list.map(clientCardHTML).join('') + '</div>';
    }
    var cnt = document.getElementById('client-count');
    if (cnt) cnt.textContent = '共 ' + list.length + ' 个客户';
  }

  function refreshWorkList() {
    var box = document.getElementById('work-list');
    if (!box) return renderAll();
    var all = consult.worklogs();
    var list = consult.worklogs(state.workFilter);
    if (!list.length) {
      box.innerHTML = all.length
        ? '<div class="empty-sm">没有符合筛选条件的工时</div>'
        : ui.empty('还没有工时记录', ui.btn('记一笔工时', { act: 'newWorklog', small: true }));
    } else {
      box.innerHTML = '<div class="list list-scroll">' + list.map(workRowHTML).join('') + '</div>';
    }
    var cnt = document.getElementById('work-count');
    if (cnt) cnt.textContent = '共 ' + list.length + ' 笔' +
      (list.length === all.length ? '' : '（已筛选，共 ' + all.length + ' 笔）');
  }

  /* ---------- 页签 B：工时 ---------- */
  function timerBarHTML() {
    var ts = consult.timerState();
    var opts = [{ value: '', label: '选择项目…' }].concat(consult.projects().map(function (p) {
      return { value: p.id, label: p.name };
    }));
    return ui.card('计时器',
      '<div class="rowflex">' +
      ui.select({ id: 'timer-project', fk: 'timer-project', value: ts.projectId || state.timerProjectId || '', options: opts }) +
      (ts.running
        ? ui.btn('停止计时', { act: 'timerStop', small: true, tone: 'danger' })
        : ui.btn('开始计时', { act: 'timerStart', small: true })) +
      '<span class="timer-clock" id="timer-clock">' + util.fmtClock(ts.seconds) + '</span>' +
      (ts.running ? '<span class="muted">正在为「' + util.esc(projectName(ts.projectId)) + '」计时</span>' : '') +
      '<span class="right">' + ui.btn('＋ 记一笔工时', { act: 'newWorklog', small: true }) + '</span>' +
      '</div>');
  }

  function workRowHTML(w) {
    return ui.row(
      '<span class="muted">' + util.esc(w.date) + '</span>' +
      '<span class="row-title" data-act="pickWorkProject" data-id="' + util.esc(w.projectId) + '">' +
      util.esc(projectName(w.projectId)) + '</span>' +
      (w.content ? '<span class="muted2">' + util.esc(w.content) + '</span>' : ''),
      '<span class="list-actions">' +
      '<span class="row-side">' + util.esc(util.fmtDuration(w.minutes)) + '</span>' +
      '<span class="ico-btn" data-act="editWorklog" data-id="' + util.esc(w.id) + '">编辑</span>' +
      '<span class="ico-btn" data-act="delWorklog" data-id="' + util.esc(w.id) + '">×</span></span>',
      { id: w.id }
    );
  }

  function workHTML() {
    var f = state.workFilter;
    var all = consult.worklogs();
    var list = consult.worklogs(f);
    var items = consult.summaryItems(state.summaryKind, util.today());
    var total = util.sum(items, function (i) { return i.value; });
    var kindTabs = '<div class="tabs">' + Object.keys(KIND_LABELS).map(function (k) {
      return '<span class="tab' + (k === state.summaryKind ? ' on' : '') + '" data-act="sumKind" data-kind="' + k + '">' +
        KIND_LABELS[k] + '</span>';
    }).join('') + '</div>';

    var bar = ui.filterBar([
      { type: 'text', key: 'from', label: '起始日期 如 2026-09-01', value: f.from },
      { type: 'text', key: 'to', label: '截止日期 如 2026-09-30', value: f.to },
      { type: 'text', key: 'q', label: '搜索工作内容', value: f.q }
    ]);
    var listBody = !list.length
      ? (all.length
        ? '<div class="empty-sm">没有符合筛选条件的工时</div>'
        : ui.empty('还没有工时记录', ui.btn('记一笔工时', { act: 'newWorklog', small: true })))
      : '<div class="list list-scroll">' + list.map(workRowHTML).join('') + '</div>';

    var left = '<div class="card">' + bar + '<div class="rowflex" style="margin-bottom:8px;">' +
      '<span class="muted" id="work-count">共 ' + list.length + ' 笔' +
      (list.length === all.length ? '' : '（已筛选，共 ' + all.length + ' 笔）') + '</span>' +
      '<span class="right">' + ui.btn('＋ 记一笔工时', { act: 'newWorklog', small: true }) + '</span></div>' +
      '<div id="work-list">' + listBody + '</div></div>';

    var right = '<div class="card">' + kindTabs +
      '<div class="muted" style="margin-bottom:8px;">合计 ' + util.esc(util.fmtDurationCN(total)) + '</div>' +
      ui.bar(items, { fmt: function (v) { return util.fmtDuration(v); } }) + '</div>';

    return timerBarHTML() + '<div class="cols-side" style="margin-top:14px;">' + left + right + '</div>';
  }

  /* ---------- 客户详情 ---------- */
  function projectBlockHTML(p) {
    var dls = consult.deliverables({ projectId: p.id });
    var period = (p.startDate || '—') + ' ~ ' + (p.endDate || '进行中');
    return '<div class="card">' +
      '<header class="card-hd"><h3>' + util.esc(p.name) + '</h3>' +
      '<span class="right list-actions">' +
      '<span class="ico-btn" data-act="newDeliverable" data-id="' + util.esc(p.id) + '">＋ 交付物</span>' +
      '<span class="ico-btn" data-act="editProject" data-id="' + util.esc(p.id) + '">编辑</span>' +
      '<span class="ico-btn" data-act="delProject" data-id="' + util.esc(p.id) + '">删除</span>' +
      '</span></header>' +
      '<div class="card-bd">' +
      '<div class="kv"><span class="kv-k">周期</span><span>' + util.esc(period) + '</span></div>' +
      '<div class="kv"><span class="kv-k">报价</span><span>' + util.esc(util.fmtMoney(p.quote)) + '</span></div>' +
      '<div class="kv"><span class="kv-k">阶段</span><span>' + (p.stage ? util.esc(p.stage) : '—') + '</span></div>' +
      '<div class="kv"><span class="kv-k">已投入</span><span>' + util.esc(util.fmtDurationCN(consult.projectMinutes(p.id))) + '</span></div>' +
      '<div class="muted mt8">交付物</div>' +
      (dls.length ? '<div class="list">' + dls.map(function (d) {
        return ui.row(
          '<span>' + util.esc(d.name) + '</span>' +
          (d.deliveredAt ? '<span class="muted">' + util.esc(d.deliveredAt) + '</span>' : '') +
          (d.url ? '<span class="muted2">' + util.esc(d.url) + '</span>' : ''),
          '<span class="list-actions">' + ui.tag(L.deliverableStatus[d.status] || d.status, statusTone(d.status)) +
          '<span class="ico-btn" data-act="toggleDeliverable" data-id="' + util.esc(d.id) + '">' +
          (d.status === 'delivered' ? '改回待交付' : '标记已交付') + '</span>' +
          '<span class="ico-btn" data-act="delDeliverable" data-id="' + util.esc(d.id) + '">×</span></span>'
        );
      }).join('') + '</div>' : '<div class="empty-sm">还没有交付物</div>') +
      '</div></div>';
  }

  function meetingHTML(m) {
    return '<div class="row" data-id="' + util.esc(m.id) + '">' +
      '<div class="row-main" style="flex-direction:column; align-items:flex-start; gap:2px;">' +
      '<div class="rowflex"><span class="muted">' + util.esc(m.date) + '</span>' +
      (m.attendees ? '<span class="muted2">' + util.esc(m.attendees) + '</span>' : '') +
      (m.projectId ? ui.tag(projectName(m.projectId)) : '') + '</div>' +
      '<div>' + util.esc(m.points || '（没写要点）') + '</div>' +
      (m.followUp ? '<div class="muted2">待跟进：' + util.esc(m.followUp) +
        (m.followUpDone ? '（已加进今日）' : '') + '</div>' : '') +
      '</div>' +
      '<div class="row-side list-actions">' +
      (m.followUp && !m.followUpDone
        ? '<span class="ico-btn" data-act="followUpToday" data-id="' + util.esc(m.id) + '">加进今日</span>' : '') +
      '<span class="ico-btn" data-act="editMeeting" data-id="' + util.esc(m.id) + '">编辑</span>' +
      '<span class="ico-btn" data-act="delMeeting" data-id="' + util.esc(m.id) + '">×</span>' +
      '</div></div>';
  }

  function clientPageHTML() {
    var c = consult.getClient(state.clientId);
    if (!c) {
      return '<div class="page-head"><h2>客户详情</h2><p>这个客户可能已经被删掉了</p></div>' +
        ui.empty('找不到这个客户', ui.btn('回到客户列表', { act: 'backToClients', small: true }));
    }
    var s = consult.clientStats(c.id);
    var projs = consult.projects({ clientId: c.id });
    var meetings = consult.meetings({ clientId: c.id });

    return '<div class="page-head"><h2>' + util.esc(c.name) + '</h2><p>' +
      util.esc([c.contact, c.phone, c.note].filter(Boolean).join(' · ') || '客户详情') + '</p></div>' +
      '<div class="rowflex" style="margin-bottom:12px;">' +
      '<span class="ico-btn" data-act="backToClients">‹ 返回客户列表</span>' +
      ui.tag(L.clientStatus[c.status] || c.status, statusTone(c.status)) +
      '<span class="muted">累计工时 ' + util.esc(util.fmtDurationCN(s.minutes)) +
      ' · 累计金额 ' + util.esc(util.fmtMoney(s.amount)) + '</span>' +
      '<span class="right list-actions">' +
      '<span class="ico-btn" data-act="newProject">＋ 项目</span>' +
      '<span class="ico-btn" data-act="newMeeting">＋ 纪要</span>' +
      '<span class="ico-btn" data-act="newWorklog">＋ 工时</span>' +
      '</span></div>' +
      '<div class="stack">' +
      (projs.length ? projs.map(projectBlockHTML).join('')
        : '<div class="card">' + ui.empty('还没有项目', ui.btn('新增项目', { act: 'newProject', small: true })) + '</div>') +
      '<div class="card"><header class="card-hd"><h3>沟通纪要</h3>' +
      '<span class="right">' + ui.btn('＋ 写纪要', { act: 'newMeeting', small: true }) + '</span></header>' +
      '<div class="card-bd">' +
      (meetings.length ? '<div class="list">' + meetings.map(meetingHTML).join('') + '</div>'
        : ui.empty('还没有纪要')) +
      '</div></div>' +
      '</div>';
  }

  function bodyHTML() {
    if (state.clientId) return clientPageHTML();
    var tabs = '<div id="consult-tabs">' + ui.tabs([
      { id: 'clients', label: '客户' },
      { id: 'work', label: '工时' }
    ], state.tab, { act: 'tab' }) + '</div>';
    var content = state.tab === 'clients' ? clientsHTML() : workHTML();
    var sub = state.tab === 'clients' ? '客户、项目、交付与纪要' : '计时器、工时记录与四维汇总';
    return '<div class="page-head"><h2>咨询工作</h2><p>' + sub + '</p></div>' +
      tabs + '<div id="consult-body">' + content + '</div>';
  }

  /* ---------- 表单抽屉 ---------- */
  function drawerForm(rows) {
    return '<div class="form">' + rows.join('') + '</div>' +
      '<div class="modal-ft">' + ui.btn('保存', { act: 'formSave' }) + ui.btn('取消', { act: 'closeDrawer' }) + '</div>';
  }
  function collect(el) {
    var v = {};
    Array.prototype.slice.call(el.querySelectorAll('[data-fk]')).forEach(function (n) { v[n.dataset.fk] = n.value; });
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
  function clientOptions(selected) {
    return [{ value: '', label: '（不归属客户）' }].concat(consult.clients().map(function (c) {
      return { value: c.id, label: c.name };
    })).map(function (o) { return { value: o.value, label: o.label }; });
  }
  function consultProjectOptions(selected) {
    return [{ value: '', label: '（不归属项目）' }].concat(consult.projects().map(function (p) {
      return { value: p.id, label: p.name };
    })).map(function (o) { return { value: o.value, label: o.label }; });
  }

  function openClientForm(id) {
    var c = id ? consult.getClient(id) : null;
    return openForm(c ? ('editClient:' + c.id) : 'client', c ? '编辑客户' : '新增客户', [
      ui.field('客户名称', ui.input({ fk: 'name', value: c ? c.name : '' })),
      ui.field('联系人', ui.input({ fk: 'contact', value: c ? c.contact : '' })),
      ui.field('联系方式', ui.input({ fk: 'phone', value: c ? c.phone : '' })),
      ui.field('合作状态', ui.select({
        fk: 'status', value: c ? c.status : 'talking',
        options: Object.keys(L.clientStatus).map(function (k) { return { value: k, label: L.clientStatus[k] }; })
      })),
      ui.field('备注', ui.textarea({ fk: 'note', rows: 3, value: c ? c.note : '' }))
    ]);
  }

  function openProjectForm(id, clientId) {
    var p = id ? consult.getProject(id) : null;
    return openForm(p ? ('editProject:' + p.id) : 'project', p ? '编辑项目' : '新增项目', [
      ui.field('项目名称', ui.input({ fk: 'name', value: p ? p.name : '' })),
      ui.field('所属客户', ui.select({ fk: 'clientId', value: p ? p.clientId : (clientId || ''), options: clientOptions() })),
      ui.field('开始日期', ui.input({ fk: 'startDate', value: p ? p.startDate : '', placeholder: '2026-09-01' })),
      ui.field('结束日期', ui.input({ fk: 'endDate', value: p ? p.endDate : '', placeholder: '2026-12-31' })),
      ui.field('报价（元）', ui.input({ fk: 'quote', type: 'number', value: p ? String(p.quote) : '0' })),
      ui.field('阶段', ui.input({ fk: 'stage', value: p ? p.stage : '', placeholder: '需求确认 / 开发中 / 验收' }))
    ]);
  }

  function openDeliverableForm(projectId) {
    return openForm('deliverable', '新增交付物', [
      ui.field('交付物名称', ui.input({ fk: 'name', value: '' })),
      ui.field('所属项目', ui.select({ fk: 'projectId', value: projectId || '', options: consultProjectOptions() })),
      ui.field('状态', ui.select({
        fk: 'status', value: 'pending',
        options: Object.keys(L.deliverableStatus).map(function (k) { return { value: k, label: L.deliverableStatus[k] }; })
      })),
      ui.field('链接', ui.input({ fk: 'url', value: '', placeholder: 'https://…' }))
    ]);
  }

  function openMeetingForm(id) {
    var m = id ? consult.getMeeting(id) : null;
    return openForm(m ? ('editMeeting:' + m.id) : 'meeting', m ? '编辑纪要' : '写沟通纪要', [
      ui.field('日期', ui.input({ fk: 'date', value: m ? m.date : util.today() })),
      ui.field('客户', ui.select({ fk: 'clientId', value: m ? m.clientId : (state.clientId || ''), options: clientOptions() })),
      ui.field('项目', ui.select({ fk: 'projectId', value: m ? m.projectId : '', options: consultProjectOptions() })),
      ui.field('参与人', ui.input({ fk: 'attendees', value: m ? m.attendees : '' })),
      ui.field('要点', ui.textarea({ fk: 'points', rows: 4, value: m ? m.points : '' })),
      ui.field('待跟进（可空）', ui.input({ fk: 'followUp', value: m ? m.followUp : '', placeholder: '填了就能一键加进今日' }))
    ]);
  }

  function openWorklogForm(id) {
    var w = id ? consult.getWorklog(id) : null;
    return openForm(w ? ('editWorklog:' + w.id) : 'worklog', w ? '编辑工时' : '记一笔工时', [
      ui.field('项目', ui.select({ fk: 'projectId', value: w ? w.projectId : (state.timerProjectId || ''), options: consultProjectOptions() })),
      ui.field('日期', ui.input({ fk: 'date', value: w ? w.date : util.today() })),
      ui.field('时长（分钟）', ui.input({ fk: 'minutes', type: 'number', value: w ? String(w.minutes) : '' })),
      ui.field('工作内容', ui.input({ fk: 'content', value: w ? w.content : '', placeholder: '做了什么' }))
    ]);
  }

  function saveForm(mode, v) {
    if (mode === 'client') {
      if (!consult.addClient(v)) { ui.toast('客户名称不能为空'); return; }
      ui.closeDrawer(); ui.toast('已新增客户'); renderAll(); return;
    }
    if (mode.indexOf('editClient:') === 0) {
      if (!trim(v.name)) { ui.toast('客户名称不能为空'); return; }
      consult.updateClient(mode.slice('editClient:'.length), v);
      ui.closeDrawer(); ui.toast('客户已更新'); renderAll(); return;
    }
    if (mode === 'project') {
      var p = consult.addProject(Object.assign({}, v, { clientId: v.clientId || state.clientId }));
      if (!p) { ui.toast('项目名称不能为空'); return; }
      ui.closeDrawer(); ui.toast('已新增项目'); renderAll(); return;
    }
    if (mode.indexOf('editProject:') === 0) {
      if (!trim(v.name)) { ui.toast('项目名称不能为空'); return; }
      consult.updateProject(mode.slice('editProject:'.length), v);
      ui.closeDrawer(); ui.toast('项目已更新'); renderAll(); return;
    }
    if (mode === 'deliverable') {
      if (!consult.addDeliverable(v)) { ui.toast('交付物名称不能为空'); return; }
      ui.closeDrawer(); ui.toast('已新增交付物'); renderAll(); return;
    }
    if (mode === 'meeting') {
      if (!consult.addMeeting(Object.assign({}, v, {
        clientId: v.clientId || state.clientId
      }))) { ui.toast('要点或待跟进至少填一个'); return; }
      ui.closeDrawer(); ui.toast('已记下纪要'); renderAll(); return;
    }
    if (mode.indexOf('editMeeting:') === 0) {
      consult.updateMeeting(mode.slice('editMeeting:'.length), v);
      ui.closeDrawer(); ui.toast('纪要已更新'); renderAll(); return;
    }
    if (mode === 'worklog') {
      if (!consult.addWorklog(v)) { ui.toast('时长要大于 0 分钟'); return; }
      ui.closeDrawer(); ui.toast('已记一笔工时'); renderAll(); return;
    }
    if (mode.indexOf('editWorklog:') === 0) {
      var w = consult.updateWorklog(mode.slice('editWorklog:'.length), v);
      if (!w || !(w.minutes > 0)) { ui.toast('时长要大于 0 分钟'); return; }
      ui.closeDrawer(); ui.toast('工时已更新'); renderAll(); return;
    }
  }

  /* ---------- 计时器的秒级刷新 ---------- */
  var tickHandle = null;
  function stopTick() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  }
  function paintClock() {
    var el = document.getElementById('timer-clock');
    if (!el) return;
    var st = consult.timerState();
    el.textContent = util.fmtClock(st.seconds);
  }
  function startTick() {
    stopTick();
    if (typeof setInterval !== 'function') return;
    tickHandle = setInterval(tickOnce, 1000);
  }

  /* 一次 tick：刷新时钟显示，并在超 4 小时时提醒一次 */
  function tickOnce() {
    if (!document.getElementById('timer-clock')) { stopTick(); return; }
    paintClock();
    var st = consult.timerState();
    if (st.running && st.seconds >= TIMER_WARN_SEC && !state.timerWarned) {
      state.timerWarned = true;
      ui.confirm('还在计时，要停吗？（已经超过 4 小时）', function () {
        var r = consult.stopTimer();
        if (r.ok) { ui.toast('已停止计时并记录 ' + util.fmtDuration(r.minutes)); renderAll(); }
      }, { okText: '停止计时', cancelText: '继续计时' });
    }
  }

  /* ---------- 渲染与事件 ---------- */
  var ctxRoot = null;

  function renderAll() {
    if (!ctxRoot) return;
    ctxRoot.innerHTML = bodyHTML();
    bind(ctxRoot);
    if (!state.clientId && state.tab === 'work') { paintClock(); startTick(); }
    else stopTick();
  }

  function bind(rootEl) {
    rootEl.onclick = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !rootEl.contains(t)) return;
      var act = t.dataset.act, id = t.dataset.id;

      if (act === 'tab') { state.tab = t.dataset.tab; return renderAll(); }
      if (act === 'backToClients') { state.clientId = null; return renderAll(); }
      if (act === 'openClient') { state.clientId = id; return renderAll(); }
      if (act === 'sumKind') { state.summaryKind = t.dataset.kind; return renderAll(); }
      if (act === 'pickWorkProject') { state.tab = 'work'; return renderAll(); }

      if (act === 'newClient') return openClientForm(null);
      if (act === 'editClient') return openClientForm(id);
      if (act === 'newProject') return openProjectForm(null, state.clientId);
      if (act === 'editProject') return openProjectForm(id, null);
      if (act === 'newDeliverable') return openDeliverableForm(id);
      if (act === 'newMeeting') return openMeetingForm(null);
      if (act === 'editMeeting') return openMeetingForm(id);
      if (act === 'newWorklog') return openWorklogForm(null);
      if (act === 'editWorklog') return openWorklogForm(id);

      if (act === 'timerStart') {
        var sel = document.getElementById('timer-project');
        var pid = sel ? sel.value : '';
        state.timerProjectId = pid;
        var r = consult.startTimer(pid);
        if (!r.ok) { ui.toast(r.error); return; }
        state.timerWarned = false;
        ui.toast('开始计时');
        return renderAll();
      }
      if (act === 'timerStop') {
        var rs = consult.stopTimer();
        if (!rs.ok) { ui.toast(rs.error); return; }
        ui.toast('已停止并记录 ' + util.fmtDuration(rs.minutes));
        return renderAll();
      }

      if (act === 'toggleDeliverable') {
        var dl = consult.getDeliverable(id);
        if (!dl) return;
        consult.setDeliverableStatus(id, dl.status === 'delivered' ? 'pending' : 'delivered');
        return renderAll();
      }
      if (act === 'delDeliverable') {
        consult.removeDeliverable(id); ui.toast('已删除交付物', { undo: true }); return renderAll();
      }
      if (act === 'followUpToday') {
        var task = consult.followUpToToday(id);
        if (task) ui.toast('已加进今日计划');
        else ui.toast('这条待跟进已经处理过了');
        return renderAll();
      }
      if (act === 'delWorklog') {
        consult.removeWorklog(id); ui.toast('已删除工时', { undo: true }); return renderAll();
      }
      if (act === 'delMeeting') {
        consult.removeMeeting(id); ui.toast('已删除纪要', { undo: true }); return renderAll();
      }
      if (act === 'delProject') {
        var p = consult.getProject(id);
        if (!p) return;
        ui.confirm('删除项目「' + p.name + '」？它的交付物和工时会被一起删除。', function () {
          consult.removeProject(id); ui.toast('已删除项目', { undo: true }); renderAll();
        }, { danger: true, okText: '删除' });
        return;
      }
      if (act === 'delClient') {
        var c = consult.getClient(id);
        if (!c) return;
        ui.confirm('删除客户「' + c.name + '」？它的项目、交付物、纪要和工时都会被删除。', function () {
          consult.removeClient(id); ui.toast('已删除客户', { undo: true }); renderAll();
        }, { danger: true, okText: '删除' });
        return;
      }
    };

    /* 筛选条：当前页签只会渲染一套筛选条，按页签决定落到哪组条件上 */
    function filterTarget(t) {
      var key = t.dataset.fkey || String(t.dataset.fk || '').replace(/^filter-/, '');
      if (!key || state.clientId) return null;
      if (state.tab === 'work') return { key: key, box: state.workFilter, fn: refreshWorkList };
      return { key: key, box: state.clientFilter, fn: refreshClientList };
    }

    rootEl.onchange = function (e) {
      var t = e.target;
      if (!t || !t.dataset || t.dataset.act !== 'filter') return;
      var hit = filterTarget(t);
      if (!hit) return;
      hit.box[hit.key] = t.value;
      hit.fn();
    };

    rootEl.oninput = function (e) {
      var t = e.target;
      if (!t || !t.dataset || t.dataset.act !== 'filter') return;
      var hit = filterTarget(t);
      if (!hit) return;
      hit.box[hit.key] = t.value;
      hit.fn();
    };
  }

  App.pages.consult = {
    id: 'consult',
    title: '咨询工作',
    subtitle: '客户、交付与工时',

    render: function (rootEl, param) {
      ctxRoot = rootEl;
      state.clientId = param || null;
      renderAll();
    },

    refresh: function () { renderAll(); },

    primaryAdd: function () {
      if (state.clientId) return openMeetingForm(null);
      if (state.tab === 'clients') return openClientForm(null);
      return openWorklogForm(null);
    },

    destroy: function () { stopTick(); ctxRoot = null; },

    /* 供测试使用 */
    _state: state,
    _bodyHTML: function () { return bodyHTML(); },
    _stopTick: stopTick,
    _startTick: startTick,
    _tickOnce: tickOnce,
    _renderAll: renderAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
