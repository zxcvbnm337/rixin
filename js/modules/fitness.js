/* fitness.js —— 健身计划：周计划模板 + 今日打卡 + 月历热力图。
   打卡与周计划的数据操作复用 today.js 里的 App.actions.checkin。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var util = App.util, ui = App.ui, store = App.store, schema = App.schema;
  var K = schema.KEYS;
  var L = schema.LABELS;

  function ck() { return App.actions.checkin; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  /* 用「当周第一天」的日期串做周标识，简单且不会歧义 */
  function weekKeyOf(dateStr) {
    return util.startOfWeek(dateStr || util.today(), store.weekStartsOn());
  }

  /* 把某周的计划记进 meta，便于「把上周套用到本周」；只留最近 8 周 */
  function savePlanForWeek(plan, weekKey) {
    var meta = store.get(K.meta);
    meta.fitnessPlanByWeek = meta.fitnessPlanByWeek || {};
    meta.fitnessPlanByWeek[weekKey || weekKeyOf(util.today())] = clone(plan);
    var keys = Object.keys(meta.fitnessPlanByWeek).sort();
    while (keys.length > 8) { delete meta.fitnessPlanByWeek[keys.shift()]; }
    store.set(K.meta, meta);
  }

  var fitness = {
    /* ---------- 周计划模板 ---------- */
    plan: function () { return ck().fitnessPlan(); },

    planRow: function (weekday) {
      return ck().fitnessPlan().filter(function (p) { return p.weekday === weekday; })[0] || null;
    },

    updatePlanRow: function (weekday, patch) {
      var plan = ck().updatePlanRow(weekday, patch);
      savePlanForWeek(plan);
      return plan;
    },

    toggleRest: function (weekday) {
      var row = fitness.planRow(weekday);
      if (!row) return null;
      return fitness.updatePlanRow(weekday, { rest: !row.rest });
    },

    weekKeyOf: weekKeyOf,

    /* 「把上周套用到本周」：把上周保存的计划整份写回模板 */
    copyLastWeekToThisWeek: function (from) {
      var thisMon = weekKeyOf(from || util.today());
      var lastMon = util.addDays(thisMon, -7);
      var meta = store.get(K.meta);
      var byWeek = (meta && meta.fitnessPlanByWeek) || {};
      var prev = byWeek[lastMon];
      if (!prev || prev.length !== 7) {
        return { ok: false, error: '上周没有保存过计划' };
      }
      store.set(K.fitnessPlan, clone(prev));
      savePlanForWeek(prev, thisMon);
      return { ok: true, changed: 7 };
    },

    /* ---------- 今日打卡（复用 checkin） ---------- */
    todayDone: function (date) {
      var log = ck().fitnessLog(date || util.today());
      return !!(log && log.done);
    },

    toggleToday: function (date) { return ck().toggleFitness(date || util.today()); },

    isRestDay: function (date) { return ck().isRestDay(date || util.today()); },

    planContent: function (date) { return ck().planContent(date || util.today()); },

    /* 只读版本：不会因为看一眼就建出默认周计划模板（首页总览用） */
    planOf: function (date) { return ck().planOf(date || util.today()); },

    streakOf: function (date) { return ck().streakOf(date || util.today()); },

    streak: function (date) { return ck().streak(date || util.today()); },

    /* 月历热力图：练了=2、有计划没练=1、休息日='rest'、未来=0 */
    heatmapData: function (year, month) {
      var map = {};
      var total = util.daysInMonth(year, month);
      var today = util.today();
      for (var d = 1; d <= total; d++) {
        var ds = year + '-' + util.pad2(month) + '-' + util.pad2(d);
        if (ck().isRestDay(ds)) { map[ds] = 'rest'; continue; }
        var log = ck().fitnessLog(ds);
        if (log && log.done) { map[ds] = 2; continue; }
        map[ds] = ds <= today ? 1 : 0;
      }
      return map;
    },

    /* 点热力图某天：补记 / 取消（未来日期不处理） */
    toggleDay: function (date, today) {
      today = today || util.today();
      if (date > today) return { ok: false, error: '还没到那一天' };
      if (ck().isRestDay(date)) return { ok: false, error: '那天是休息日' };
      var log = ck().fitnessLog(date);
      var next = !(log && log.done);
      ck().setFitnessDone(date, next);
      return { ok: true, done: next, date: date };
    },

    monthDone: function (year, month) {
      var map = fitness.heatmapData(year, month);
      var n = 0;
      Object.keys(map).forEach(function (d) { if (map[d] === 2) n++; });
      return n;
    },

    /* 供首页取数 */
    summary: function () {
      var t = util.today();
      var plan = fitness.plan();
      var active = plan.filter(function (p) { return !p.rest && String(p.content || '').trim(); }).length;
      return {
        streak: fitness.streak(t),
        doneToday: fitness.todayDone(t),
        isRestToday: fitness.isRestDay(t),
        plannedDays: active,
        monthDone: fitness.monthDone(Number(t.slice(0, 4)), Number(t.slice(5, 7)))
      };
    },

    _savePlanForWeek: savePlanForWeek
  };
  App.actions = App.actions || {};
  App.actions.fitness = fitness;

  /* ================= 页面 ================= */
  var WEEK_LABELS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
  var state = { year: 0, month: 0 };

  function ensureMonth() {
    if (!state.year) {
      var t = util.today();
      state.year = Number(t.slice(0, 4));
      state.month = Number(t.slice(5, 7));
    }
  }

  /* ---------- 周计划模板 ---------- */
  function planHTML() {
    var plan = fitness.plan();
    var rows = plan.map(function (p) {
      return '<div class="row" data-id="' + p.weekday + '">' +
        '<div class="row-main">' +
        '<span class="plan-wd">' + util.esc(WEEK_LABELS[p.weekday - 1]) + '</span>' +
        '<span class="row-title" data-act="editPlan" data-id="' + p.weekday + '">' +
        (p.rest ? '<span class="muted">休息日</span>' : (p.content ? util.esc(p.content) : '<span class="muted">点这里写练什么</span>')) +
        '</span>' +
        '</div>' +
        '<div class="row-side">' +
        '<label class="muted"><input type="checkbox" data-act="toggleRest" data-id="' + p.weekday + '"' +
        (p.rest ? ' checked' : '') + '> 休息日</label>' +
        '</div></div>';
    }).join('');
    return ui.card('本周计划模板',
      '<div class="list">' + rows + '</div>',
      { extra: '<span class="right">' + ui.btn('把上周套用到本周', { act: 'applyLastWeek', small: true }) + '</span>' });
  }

  /* ---------- 今日打卡 ---------- */
  function checkinHTML() {
    var t = util.today();
    var rest = fitness.isRestDay(t);
    var done = fitness.todayDone(t);
    var content = fitness.planContent(t);
    return ui.card('今天（' + util.esc(util.formatDateCN(t)) + '）',
      '<div class="stack-tight">' +
      '<div class="rowflex">' +
      ui.btn(done ? '今天已打卡' : '立刻打卡', { act: 'toggleFitness', small: true, tone: done ? 'on' : '' }) +
      '<span class="muted">连续 <b>' + fitness.streak(t) + '</b> 天</span>' +
      '</div>' +
      '<div class="muted">计划：' + (rest ? '休息日，好好休息' : util.esc(content || '还没排')) + '</div>' +
      '</div>');
  }

  /* ---------- 打卡历史（热力图） ---------- */
  function historyHTML() {
    ensureMonth();
    var y = state.year, m = state.month;
    var map = fitness.heatmapData(y, m);
    var today = util.today();
    return ui.card('打卡历史',
      '<div class="rowflex" style="margin-bottom:8px;">' +
      '<span class="ico-btn" data-act="hmPrev">‹ 上月</span>' +
      '<span class="muted">' + y + ' 年 ' + m + ' 月</span>' +
      '<span class="ico-btn" data-act="hmNext">下月 ›</span>' +
      '<span class="right muted">本月练了 ' + fitness.monthDone(y, m) + ' 天</span>' +
      '</div>' +
      ui.heatmap(y, m, map, { today: today, act: 'hmPick' }) +
      '<div class="rowflex muted" style="margin-top:8px; gap:14px;">' +
      '<span><i class="lg lv2"></i> 练了</span>' +
      '<span><i class="lg lv1"></i> 没练</span>' +
      '<span><i class="lg rest"></i> 休息日</span></div>' +
      (y === Number(today.slice(0, 4)) && m === Number(today.slice(5, 7))
        ? '' : '<div class="mt8">' + ui.btn('回到本月', { act: 'hmNow', small: true }) + '</div>'));
  }

  function bodyHTML() {
    return '<div class="page-head"><h2>健身计划</h2><p>排好每周练什么，做完打勾，看连续坚持天数</p></div>' +
      '<div class="stack">' + planHTML() + checkinHTML() + historyHTML() + '</div>';
  }

  /* ---------- 渲染与事件 ---------- */
  var ctxRoot = null;

  function renderAll() {
    if (!ctxRoot) return;
    ctxRoot.innerHTML = bodyHTML();
    bind(ctxRoot);
  }

  function bind(rootEl) {
    rootEl.onclick = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !rootEl.contains(t)) return;
      var act = t.dataset.act, id = t.dataset.id;

      if (act === 'toggleFitness') { fitness.toggleToday(); return renderAll(); }
      if (act === 'applyLastWeek') {
        var r = fitness.copyLastWeekToThisWeek();
        ui.toast(r.ok ? '已套用上周的计划' : r.error);
        return renderAll();
      }
      if (act === 'editPlan') {
        var wd = Number(id);
        var row = fitness.planRow(wd);
        if (!row) return;
        ui.inlineEdit(t, row.content || '', function (v) {
          fitness.updatePlanRow(wd, { content: v.trim() });
          renderAll();
        });
        return;
      }
      if (act === 'hmPrev') {
        ensureMonth();
        state.month -= 1;
        if (state.month < 1) { state.month = 12; state.year -= 1; }
        return renderAll();
      }
      if (act === 'hmNext') {
        ensureMonth();
        state.month += 1;
        if (state.month > 12) { state.month = 1; state.year += 1; }
        return renderAll();
      }
      if (act === 'hmNow') {
        var td = util.today();
        state.year = Number(td.slice(0, 4));
        state.month = Number(td.slice(5, 7));
        return renderAll();
      }
      if (act === 'hmPick') {
        var res = fitness.toggleDay(t.dataset.date);
        if (!res.ok) { ui.toast(res.error); return; }
        ui.toast(res.done ? '已补记 ' + res.date : '已取消 ' + res.date);
        return renderAll();
      }
    };

    rootEl.onchange = function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.act === 'toggleRest') {
        fitness.toggleRest(Number(t.dataset.id));
        return renderAll();
      }
    };
  }

  App.pages.fitness = {
    id: 'fitness',
    title: '健身计划',
    subtitle: '每周安排与打卡',

    render: function (rootEl) {
      ctxRoot = rootEl;
      ensureMonth();
      renderAll();
    },

    refresh: function () { renderAll(); },

    primaryAdd: function () {
      var first = document.querySelector('[data-act="editPlan"]');
      if (first) first.click();
    },

    destroy: function () { ctxRoot = null; },

    /* 供测试使用 */
    _state: state,
    _bodyHTML: function () { return bodyHTML(); },
    _renderAll: renderAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
