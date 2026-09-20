/* today.js —— 今日：每日计划、快速备忘、打卡与今日流水。
   同时提供 App.actions.checkin（健身 / 饮食打卡），供健身与饮食模块复用。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var util = App.util, ui = App.ui, store = App.store, schema = App.schema;
  var K = schema.KEYS;
  var L = schema.LABELS;

  function prioRank(p) {
    var r = L.priorityOrder[p];
    return r === undefined ? 1 : r;
  }
  function moduleLabel(m) { return schema.MODULE_LABELS[m] || m; }

  /* ============ 今日计划与备忘 ============ */
  var today = {
    list: function (date) {
      return store.get(K.tasks).filter(function (t) { return t.date === date; });
    },

    sorted: function (date) {
      return today.list(date).slice().sort(function (a, b) {
        var pa = prioRank(a.priority), pb = prioRank(b.priority);
        if (pa !== pb) return pa - pb;
        return (a.order || 0) - (b.order || 0);
      });
    },

    visible: function (date, hideDone) {
      var l = today.sorted(date);
      return hideDone ? l.filter(function (t) { return !t.done; }) : l;
    },

    counts: function (date) {
      var l = today.list(date);
      return { total: l.length, done: l.filter(function (t) { return t.done; }).length };
    },

    nextOrder: function (date) {
      var m = 0;
      today.list(date).forEach(function (t) { if ((t.order || 0) > m) m = t.order || 0; });
      return m + 1;
    },

    get: function (id) {
      return store.get(K.tasks).filter(function (t) { return t.id === id; })[0] || null;
    },

    add: function (title, opts) {
      opts = opts || {};
      var date = opts.date || util.today();
      var text = String(title == null ? '' : title).trim();
      if (!text) return null;
      var item = {
        id: util.uid('task'), title: text, date: date,
        priority: opts.priority || 'mid',
        done: false, doneAt: null,
        moduleRef: opts.moduleRef || null,
        note: opts.note || '',
        order: today.nextOrder(date),
        createdAt: Date.now()
      };
      var all = store.get(K.tasks).slice();
      all.push(item);
      store.set(K.tasks, all);
      return item;
    },

    update: function (id, patch) {
      var all = store.get(K.tasks).slice();
      var i = -1;
      all.forEach(function (t, idx) { if (t.id === id) i = idx; });
      if (i < 0) return null;
      all[i] = Object.assign({}, all[i], patch);
      store.set(K.tasks, all);
      return all[i];
    },

    toggle: function (id) {
      var t = today.get(id);
      if (!t) return null;
      return today.update(id, { done: !t.done, doneAt: !t.done ? Date.now() : null });
    },

    remove: function (id) {
      var all = store.get(K.tasks);
      if (!all.some(function (t) { return t.id === id; })) return false;
      store.snapshot(K.tasks);
      store.set(K.tasks, all.filter(function (t) { return t.id !== id; }));
      return true;
    },

    moveTomorrow: function (id) {
      var t = today.get(id);
      if (!t) return null;
      var target = util.addDays(t.date, 1);
      return today.update(id, { date: target, order: today.nextOrder(target) });
    },

    moveToDate: function (id, date) {
      return today.update(id, { date: date, order: today.nextOrder(date) });
    },

    linkModule: function (id, module, refId) {
      return today.update(id, { moduleRef: module ? { module: module, id: refId || '' } : null });
    },

    reorder: function (date, orderedIds) {
      var all = store.get(K.tasks).slice();
      var rank = {};
      orderedIds.forEach(function (id, i) { rank[id] = i + 1; });
      all.forEach(function (t) {
        if (t.date === date && rank[t.id] !== undefined) t.order = rank[t.id];
      });
      store.set(K.tasks, all);
      return true;
    },

    /* 把任意模块的条目加进今日计划（联动用） */
    pushToToday: function (title, date, module, refId) {
      return today.add(title, {
        date: date || util.today(),
        moduleRef: module ? { module: module, id: refId || '' } : null
      });
    },

    /* ---------- 备忘 ---------- */
    notes: function () {
      return store.get(K.notes).slice().sort(function (a, b) {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });
    },

    getNote: function (id) {
      return store.get(K.notes).filter(function (n) { return n.id === id; })[0] || null;
    },

    addNote: function (content) {
      var text = String(content == null ? '' : content).trim();
      if (!text) return null;
      var n = { id: util.uid('note'), content: text, pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
      var all = store.get(K.notes).slice();
      all.push(n);
      store.set(K.notes, all);
      return n;
    },

    updateNote: function (id, content) {
      var all = store.get(K.notes).slice();
      var i = -1;
      all.forEach(function (n, idx) { if (n.id === id) i = idx; });
      if (i < 0) return null;
      all[i] = Object.assign({}, all[i], { content: content, updatedAt: Date.now() });
      store.set(K.notes, all);
      return all[i];
    },

    togglePinNote: function (id) {
      var n = today.getNote(id);
      if (!n) return null;
      var all = store.get(K.notes).slice();
      all.forEach(function (x, idx) { if (x.id === id) all[idx] = Object.assign({}, x, { pinned: !x.pinned }); });
      store.set(K.notes, all);
      return all.filter(function (x) { return x.id === id; })[0];
    },

    removeNote: function (id) {
      var all = store.get(K.notes);
      if (!all.some(function (n) { return n.id === id; })) return false;
      store.snapshot(K.notes);
      store.set(K.notes, all.filter(function (n) { return n.id !== id; }));
      return true;
    },

    /* ---------- 今日流水（跨模块聚合，只读） ---------- */
    recordsOn: function (date) {
      var out = [];
      store.get(K.studyLogs).forEach(function (l) {
        if (l.date !== date) return;
        out.push({ id: l.id, module: 'study', label: '学习', text: l.note || '学习记录', minutes: l.minutes });
      });
      store.get(K.consultWorklogs).forEach(function (w) {
        if (w.date !== date) return;
        out.push({ id: w.id, module: 'consult', label: '工时', text: w.content || '工时记录', minutes: w.minutes });
      });
      store.get(K.gameLogs).forEach(function (g) {
        if (g.date !== date) return;
        var gm = store.get(K.gameGames).filter(function (x) { return x.id === g.gameId; })[0];
        out.push({ id: g.id, module: 'game', label: '游戏', text: (gm ? gm.name : '游戏') + (g.note ? ' · ' + g.note : ''), minutes: g.minutes });
      });
      return out;
    }
  };
  App.actions = App.actions || {};
  App.actions.today = today;

  /* ============ 打卡（健身 / 饮食）—— 健身与饮食模块复用 ============ */
  var checkin = {
    fitnessPlan: function () {
      var plan = store.get(K.fitnessPlan);
      if (!plan || plan.length !== 7) {
        plan = schema.defaultFitnessPlan();
        store.set(K.fitnessPlan, plan);
      }
      return plan;
    },

    planRow: function (dateStr) {
      var wd = util.weekdayIndexMon(dateStr);
      return checkin.fitnessPlan().filter(function (p) { return p.weekday === wd; })[0] || null;
    },

    planContent: function (dateStr) {
      var r = checkin.planRow(dateStr);
      return r ? r.content : '';
    },

    /* 只读地看某天的周计划安排，不会顺手建出默认模板。
       首页总览这类「只看不写」的场景专用。 */
    planOf: function (dateStr) {
      var plan = store.get(K.fitnessPlan);
      if (!Array.isArray(plan) || plan.length !== 7) return { rest: false, content: '' };
      var wd = util.weekdayIndexMon(dateStr || util.today());
      var row = null;
      plan.forEach(function (p) { if (p.weekday === wd) row = p; });
      if (!row) return { rest: false, content: '' };
      return { rest: !!row.rest, content: String(row.content || '') };
    },

    isRestDay: function (dateStr) {
      var r = checkin.planRow(dateStr);
      return !!(r && r.rest);
    },

    /* 只读版本的连续打卡天数，同样不建模板 */
    streakOf: function (from) {
      from = from || util.today();
      var done = {};
      store.get(K.fitnessLogs).forEach(function (l) { if (l.done) done[l.date] = 1; });
      var plan = store.get(K.fitnessPlan);
      var restMap = {};
      if (Array.isArray(plan) && plan.length === 7) {
        plan.forEach(function (p) { restMap[p.weekday] = !!p.rest; });
      }
      var count = 0, d = from, guard = 0;
      while (guard++ < 400) {
        if (restMap[util.weekdayIndexMon(d)]) { d = util.addDays(d, -1); continue; }
        if (done[d]) { count++; d = util.addDays(d, -1); continue; }
        if (d === from) { d = util.addDays(d, -1); continue; }
        break;
      }
      return count;
    },

    updatePlanRow: function (weekday, patch) {
      var plan = checkin.fitnessPlan().slice();
      plan.forEach(function (p, i) { if (p.weekday === weekday) plan[i] = Object.assign({}, p, patch); });
      store.set(K.fitnessPlan, plan);
      return plan;
    },

    fitnessLog: function (date) {
      return store.get(K.fitnessLogs).filter(function (l) { return l.date === date; })[0] || null;
    },

    setFitnessDone: function (date, done) {
      var all = store.get(K.fitnessLogs).slice();
      var i = -1;
      all.forEach(function (l, idx) { if (l.date === date) i = idx; });
      if (i < 0) all.push({ id: util.uid('flog'), date: date, done: !!done, note: '' });
      else all[i] = Object.assign({}, all[i], { done: !!done });
      store.set(K.fitnessLogs, all);
      return checkin.fitnessLog(date);
    },

    toggleFitness: function (date) {
      date = date || util.today();
      var cur = checkin.fitnessLog(date);
      return checkin.setFitnessDone(date, !(cur && cur.done));
    },

    /* 连续打卡天数：休息日跳过不中断，今天尚未打卡不算断 */
    streak: function (from) {
      from = from || util.today();
      var count = 0, d = from, guard = 0;
      while (guard++ < 400) {
        var log = checkin.fitnessLog(d);
        if (checkin.isRestDay(d)) { d = util.addDays(d, -1); continue; }
        if (log && log.done) { count++; d = util.addDays(d, -1); continue; }
        if (d === from) { d = util.addDays(d, -1); continue; }
        break;
      }
      return count;
    },

    /* ---------- 饮食 ---------- */
    mealsOn: function (date) {
      var recs = store.get(K.dietRecords).filter(function (r) { return r.date === date; });
      var out = {};
      L.mealOrder.forEach(function (m) {
        out[m] = recs.filter(function (r) { return r.meal === m; })[0] || null;
      });
      return out;
    },

    upsertMeal: function (date, meal, patch) {
      var all = store.get(K.dietRecords).slice();
      var i = -1;
      all.forEach(function (r, idx) { if (r.date === date && r.meal === meal) i = idx; });
      if (i < 0) {
        all.push(Object.assign({
          id: util.uid('meal'), date: date, meal: meal, content: '', done: false, note: ''
        }, patch));
      } else {
        all[i] = Object.assign({}, all[i], patch);
      }
      store.set(K.dietRecords, all);
      return all.filter(function (r) { return r.date === date && r.meal === meal; })[0];
    },

    setMealContent: function (date, meal, content) {
      var text = String(content == null ? '' : content);
      return checkin.upsertMeal(date, meal, { content: text, done: text.trim().length > 0 });
    },

    toggleMeal: function (date, meal) {
      var cur = checkin.mealsOn(date)[meal];
      if (cur && cur.done && cur.content && cur.content.trim()) {
        return checkin.upsertMeal(date, meal, { done: false });
      }
      return checkin.upsertMeal(date, meal, { done: !(cur && cur.done) });
    },

    /* 某天是否四餐全部完成 */
    mealSummary: function (date) {
      var m = checkin.mealsOn(date);
      var done = 0, filled = 0;
      L.mealOrder.forEach(function (k) {
        var r = m[k];
        if (r && r.content && r.content.trim()) filled++;
        if (r && r.done) done++;
      });
      return { done: done, filled: filled, total: 4 };
    },

    favorites: function () {
      return util.sortBy(store.get(K.dietFavorites).slice(), function (x) { return x.order || 0; });
    },

    addFavorite: function (content) {
      var text = String(content == null ? '' : content).trim();
      if (!text) return null;
      var all = store.get(K.dietFavorites).slice();
      if (all.some(function (f) { return f.content === text; })) return null;
      var item = { id: util.uid('fav'), content: text, order: all.length + 1 };
      all.push(item);
      store.set(K.dietFavorites, all);
      return item;
    },

    removeFavorite: function (id) {
      var all = store.get(K.dietFavorites);
      if (!all.some(function (f) { return f.id === id; })) return false;
      store.snapshot(K.dietFavorites);
      store.set(K.dietFavorites, all.filter(function (f) { return f.id !== id; }));
      return true;
    },

    moveFavorite: function (id, dir) {
      var list = checkin.favorites();
      var i = -1;
      list.forEach(function (f, idx) { if (f.id === id) i = idx; });
      var j = i + (dir > 0 ? 1 : -1);
      if (i < 0 || j < 0 || j >= list.length) return false;
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      list.forEach(function (f, idx) { f.order = idx + 1; });
      store.set(K.dietFavorites, list);
      return true;
    }
  };
  App.actions.checkin = checkin;

  /* ============ 页面 ============ */
  var state = { date: util.today(), hideDone: false };

  function taskRowHTML(t) {
    var left = ui.check(t.done, { act: 'toggle', id: t.id }) +
      '<span class="prio ' + t.priority + '"></span>' +
      '<span class="row-title" data-act="editTask" data-id="' + util.esc(t.id) + '">' + util.esc(t.title) + '</span>' +
      (t.moduleRef && t.moduleRef.module ? ui.tag('来自 ' + moduleLabel(t.moduleRef.module), 'info') : '');
    var right = '<span class="list-actions">' +
      '<span class="ico-btn" data-act="tomorrow" data-id="' + util.esc(t.id) + '" title="顺延到明天">明天</span>' +
      '<span class="ico-btn" data-act="moveToday" data-id="' + util.esc(t.id) + '" title="移到别的日期">移动</span>' +
      '<span class="ico-btn" data-act="delTask" data-id="' + util.esc(t.id) + '">×</span></span>';
    return ui.row(left, right, { id: t.id, done: t.done, drag: true });
  }

  function taskListHTML() {
    var list = today.visible(state.date, state.hideDone);
    if (!list.length) {
      return ui.empty(state.hideDone ? '今天该做的都做完了' : '今天还没有安排，敲回车加第一条',
        state.hideDone ? '' : ui.btn('加一条', { act: 'focusTaskInput', small: true }));
    }
    return list.map(taskRowHTML).join('');
  }

  function notesHTML() {
    var list = today.notes();
    if (!list.length) {
      return ui.empty('还没有便签，随手记点东西',
        ui.btn('记一条', { act: 'focusNote', small: true }));
    }
    return '<div class="list">' + list.map(function (n) {
      return '<div class="note-item' + (n.pinned ? ' pinned' : '') + '" data-id="' + util.esc(n.id) + '">' +
        '<div class="note-txt" data-act="editNote" data-id="' + util.esc(n.id) + '">' + util.esc(n.content) + '</div>' +
        '<div class="note-ops">' +
        '<span class="ico-btn" data-act="pinNote" data-id="' + util.esc(n.id) + '">' + (n.pinned ? '取消置顶' : '置顶') + '</span>' +
        '<span class="ico-btn" data-act="delNote" data-id="' + util.esc(n.id) + '">×</span></div></div>';
    }).join('') + '</div>';
  }

  function mealsHTML(date) {
    var m = checkin.mealsOn(date);
    return L.mealOrder.map(function (key) {
      var r = m[key];
      return '<div class="meal-row">' +
        ui.check(!!(r && r.done), { act: 'toggleMeal', id: date, id2: key }) +
        '<span class="meal-lb">' + util.esc(L.meal[key]) + '</span>' +
        ui.input({ cls: 'meal-inp', act: 'mealInp', date: date, id2: key, value: (r ? r.content : ''), placeholder: '吃了什么' }) +
        '</div>';
    }).join('');
  }

  function recordsHTML(date) {
    var recs = today.recordsOn(date);
    if (!recs.length) return '<div class="empty-sm">今天还没有记录</div>';
    return '<div class="list">' + recs.map(function (r) {
      return '<div class="row"><div class="row-main"><span class="tag">' + util.esc(r.label) + '</span>' +
        '<span>' + util.esc(r.text) + '</span></div>' +
        '<div class="row-side">' + util.esc(util.fmtDuration(r.minutes)) + '</div></div>';
    }).join('') + '</div>';
  }

  function checkinHTML(date) {
    var fit = checkin.fitnessLog(date);
    var done = !!(fit && fit.done);
    return '<div class="kick">' +
      '<div class="rowflex"><span class="muted">健身</span>' +
      ui.btn(done ? '今天已打卡' : '立刻打卡', { act: 'toggleFitness', id2: date, small: true, tone: done ? 'on' : '' }) +
      '<span class="muted right">连续 ' + checkin.streak(date) + ' 天</span></div>' +
      '<div class="muted2">计划：' + (checkin.isRestDay(date) ? '休息日' : util.esc(checkin.planContent(date) || '还没排')) + '</div>' +
      '</div>' +
      '<div class="kick"><div class="muted mb6">饮食</div>' + mealsHTML(date) + '</div>' +
      '<div class="kick"><div class="muted mb6">今日记录</div>' + recordsHTML(date) + '</div>';
  }

  function bodyHTML() {
    var date = state.date;
    var isToday = date === util.today();
    var cnt = today.counts(date);

    var planCard = ui.card('今日计划',
      '<div class="rowflex" style="margin-bottom:8px;">' +
      ui.input({ id: 'task-input', fk: 'task-input', placeholder: '敲回车添加，N 键快速聚焦' }) +
      ui.select({
        id: 'task-priority', fk: 'task-priority', value: 'mid',
        options: [{ value: 'high', label: '高' }, { value: 'mid', label: '中' }, { value: 'low', label: '低' }]
      }) +
      ui.select({
        id: 'task-module', fk: 'task-module', value: '',
        options: [{ value: '', label: '不关联模块' }, { value: 'study', label: '学习计划' },
        { value: 'dev', label: '开发工作' }, { value: 'consult', label: '咨询工作' },
        { value: 'fitness', label: '健身计划' }, { value: 'diet', label: '饮食计划' },
        { value: 'game', label: '游戏娱乐' }]
      }) + '</div>' +
      '<div class="list list-scroll" id="task-list">' + taskListHTML() + '</div>' +
      '<div class="rowflex task-foot" id="task-foot">' +
      '<span class="muted" id="task-count">已完成 ' + cnt.done + ' / ' + cnt.total + '</span>' +
      '<label class="right muted"><input type="checkbox" id="hide-done"' + (state.hideDone ? ' checked' : '') + '> 隐藏已完成</label>' +
      '</div>',
      { extra: '<span class="right">' + (isToday ? '今天' : util.esc(date) + ' · 补记') + '</span>' });

    var noteCard = ui.card('快速备忘',
      '<div id="note-list">' + notesHTML() + '</div>' +
      '<div class="rowflex" style="margin-top:8px;">' +
      ui.input({ id: 'note-input', fk: 'note-input', placeholder: '敲回车新增便签' }) + '</div>');

    var checkinCard = ui.card('打卡 · 记录', '<div id="checkin-box">' + checkinHTML(date) + '</div>');

    return '<div class="page-head"><h2>今日</h2><p>一天的入口：要做的、要记的、要打的卡都在这里</p></div>' +
      ui.dateNav(date, { suffix: isToday ? '' : '（补记）' }) +
      '<div class="cols-today">' + planCard + noteCard + checkinCard + '</div>';
  }

  var ctxRoot = null;

  /* 整页重绘：切换日期时必须走这里，日期标题与卡片角标才会跟着变 */
  function renderAll() {
    if (!ctxRoot) return;
    ctxRoot.innerHTML = bodyHTML();
    bind(ctxRoot);
    ui.initSortable(document.getElementById('task-list'), { onReorder: onReorder, itemSelector: '.row' });
  }

  function refresh() {
    if (!ctxRoot) return;
    var l = document.getElementById('task-list');
    if (l) {
      l.innerHTML = taskListHTML();
      ui.initSortable(l, { onReorder: onReorder, itemSelector: '.row' });
    }
    var c = document.getElementById('task-count');
    if (c) {
      var n = today.counts(state.date);
      c.textContent = '已完成 ' + n.done + ' / ' + n.total;
    }
    var nl = document.getElementById('note-list');
    if (nl) nl.innerHTML = notesHTML();
    var cb = document.getElementById('checkin-box');
    if (cb) cb.innerHTML = checkinHTML(state.date);
  }

  function onReorder(ids) {
    today.reorder(state.date, ids);
    refresh();
  }

  function bind(rootEl) {
    rootEl.onclick = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !rootEl.contains(t)) return;
      var act = t.dataset.act, id = t.dataset.id;

      if (act === 'prevDay') { state.date = util.addDays(state.date, -1); return renderAll(); }
      if (act === 'nextDay') { state.date = util.addDays(state.date, 1); return renderAll(); }
      if (act === 'focusTaskInput') { var ti = document.getElementById('task-input'); if (ti) ti.focus(); return; }
      if (act === 'focusNote') { var ni = document.getElementById('note-input'); if (ni) ni.focus(); return; }
      if (act === 'toggle') { today.toggle(id); return refresh(); }
      if (act === 'tomorrow') { today.moveTomorrow(id); return refresh(); }
      if (act === 'moveToday') {
        var d = window.prompt('移到哪一天？格式 2026-09-21', util.addDays(state.date, 1));
        if (d && util.isValidDate(d)) { today.moveToDate(id, d); refresh(); }
        return;
      }
      if (act === 'delTask') { today.remove(id); ui.toast('已删除 1 条', { undo: true, id: id }); return refresh(); }
      if (act === 'editTask') {
        var cur = (today.get(id) || {}).title || '';
        ui.inlineEdit(t, cur, function (v) {
          var s = v.trim();
          if (s) { today.update(id, { title: s }); refresh(); }
        });
        return;
      }
      if (act === 'pinNote') { today.togglePinNote(id); return refresh(); }
      if (act === 'delNote') { today.removeNote(id); ui.toast('已删除便签', { undo: true }); return refresh(); }
      if (act === 'editNote') {
        var n = today.getNote(id);
        ui.inlineEdit(t, n ? n.content : '', function (v) {
          var s = v.trim();
          if (s) { today.updateNote(id, s); refresh(); }
        });
        return;
      }
      if (act === 'toggleFitness') { checkin.toggleFitness(t.dataset.id2 || state.date); return refresh(); }
      if (act === 'toggleMeal') { checkin.toggleMeal(t.dataset.id, t.dataset.id2); return refresh(); }
    };

    rootEl.onchange = function (e) {
      var t = e.target;
      if (t.id === 'hide-done') {
        state.hideDone = !!t.checked;
        return refresh();
      }
      if (t.dataset && t.dataset.act === 'mealInp') {
        checkin.setMealContent(t.dataset.date, t.dataset.id2, t.value);
        return refresh();
      }
    };

    rootEl.onkeydown = function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (t.id === 'task-input') {
        e.preventDefault();
        var pr = document.getElementById('task-priority');
        var md = document.getElementById('task-module');
        var created = today.add(t.value, {
          date: state.date,
          priority: pr ? pr.value : 'mid',
          moduleRef: md && md.value ? { module: md.value, id: '' } : null
        });
        if (created) { t.value = ''; refresh(); }
        return;
      }
      if (t.id === 'note-input') {
        e.preventDefault();
        if (today.addNote(t.value)) { t.value = ''; refresh(); }
      }
    };
  }

  App.pages.today = {
    id: 'today',
    title: '今日',
    subtitle: '今天的计划、备忘和打卡',

    render: function (rootEl) {
      ctxRoot = rootEl;
      renderAll();
    },

    refresh: refresh,

    primaryAdd: function () {
      var ti = document.getElementById('task-input');
      if (ti) ti.focus();
    },

    destroy: function () { ctxRoot = null; },

    /* 供测试使用 */
    _state: state,
    _taskListHTML: function () { return taskListHTML(); },
    _bodyHTML: function () { return bodyHTML(); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
