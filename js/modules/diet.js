/* diet.js —— 饮食计划：四餐记录 + 常用项 + 日期切换 + 历史。
   四餐的数据操作复用 today.js 里的 App.actions.checkin。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var util = App.util, ui = App.ui, store = App.store, schema = App.schema;
  var K = schema.KEYS;
  var L = schema.LABELS;

  function ck() { return App.actions.checkin; }

  var diet = {
    /* ---------- 四餐 ---------- */
    mealsOn: function (date) { return ck().mealsOn(date || util.today()); },

    setMealContent: function (date, meal, content) {
      return ck().setMealContent(date, meal, content);
    },

    toggleMeal: function (date, meal) { return ck().toggleMeal(date, meal); },

    summaryOf: function (date) { return ck().mealSummary(date || util.today()); },

    /* 从常用项填入某一格 */
    pickFavorite: function (date, meal, favId) {
      var fav = ck().favorites().filter(function (f) { return f.id === favId; })[0];
      if (!fav) return null;
      return ck().setMealContent(date, meal, fav.content);
    },

    /* ---------- 常用项 ---------- */
    favorites: function () { return ck().favorites(); },
    addFavorite: function (content) { return ck().addFavorite(content); },
    removeFavorite: function (id) { return ck().removeFavorite(id); },
    moveFavorite: function (id, dir) { return ck().moveFavorite(id, dir); },

    /* ---------- 历史（按日期倒序，只列有记录的日期） ----------
       可传 filter.from / filter.to 做日期范围筛选 */
    history: function (limit, filter) {
      filter = filter || {};
      var dates = util.uniq(store.get(K.dietRecords).map(function (r) { return r.date; }));
      if (filter.from) dates = dates.filter(function (d) { return d >= filter.from; });
      if (filter.to) dates = dates.filter(function (d) { return d <= filter.to; });
      dates = dates.sort().reverse();
      return dates.slice(0, limit || 30).map(function (ds) {
        return { date: ds, summary: ck().mealSummary(ds), meals: ck().mealsOn(ds) };
      });
    },

    /* 供首页取数 */
    summary: function () {
      var t = util.today();
      var today = ck().mealSummary(t);
      return {
        doneToday: today.done,
        filledToday: today.filled,
        total: today.total,
        favorites: ck().favorites().length,
        historyDays: diet.history(999).length
      };
    }
  };
  App.actions = App.actions || {};
  App.actions.diet = diet;

  /* ================= 页面 ================= */
  var state = { date: util.today(), lastMeal: 'breakfast', open: {}, histFilter: { from: '', to: '' } };

  function favOptions(meal) {
    var opts = [{ value: '', label: '从常用选' }].concat(diet.favorites().map(function (f) {
      return { value: f.id, label: f.content };
    }));
    return opts;
  }

  function mealRowHTML(date, meal) {
    var m = diet.mealsOn(date);
    var r = m[meal];
    return '<div class="meal-row">' +
      ui.check(!!(r && r.done), { act: 'toggleMeal', id: date, id2: meal }) +
      '<span class="meal-lb">' + util.esc(L.meal[meal]) + '</span>' +
      ui.input({
        cls: 'meal-inp', act: 'mealInp', date: date, id2: meal,
        value: (r ? r.content : ''), placeholder: '吃了什么'
      }) +
      ui.select({ act: 'pickFav', id2: date, key: meal, value: '', options: favOptions(meal) }) +
      '</div>';
  }

  function mealsHTML() {
    var date = state.date;
    var s = diet.summaryOf(date);
    var isToday = date === util.today();
    return ui.card('这一天的四餐',
      '<div class="meal-grid">' + L.mealOrder.map(function (m) { return mealRowHTML(date, m); }).join('') + '</div>' +
      '<div class="rowflex muted" style="margin-top:8px;">' +
      '<span>已填 ' + s.filled + ' / 4</span>' +
      '<span>已勾 ' + s.done + ' / 4</span>' +
      '<span class="right">' + (isToday ? '今天' : util.esc(date) + ' · 补记') + '</span>' +
      '</div>');
  }

  function favoritesHTML() {
    var list = diet.favorites();
    var body = list.length
      ? '<div class="fav-list">' + list.map(function (f, i) {
        return '<span class="fav-chip">' +
          '<span class="ico-btn" data-act="favUp" data-id="' + util.esc(f.id) + '">↑</span>' +
          '<span class="row-title" data-act="useFav" data-id="' + util.esc(f.id) + '">' + util.esc(f.content) + '</span>' +
          '<span class="ico-btn" data-act="favDown" data-id="' + util.esc(f.id) + '">↓</span>' +
          '<span class="ico-btn" data-act="delFav" data-id="' + util.esc(f.id) + '">×</span>' +
          '</span>';
      }).join('') + '</div>'
      : ui.empty('还没有常用项，加几个常吃的', ui.btn('新增常用项', { act: 'focusFav', small: true }));
    return ui.card('常用项',
      body +
      '<div class="rowflex" style="margin-top:8px;">' +
      ui.input({ id: 'fav-input', fk: 'fav-input', placeholder: '敲回车添加，如「鸡蛋 + 牛奶」' }) +
      '</div>' +
      '<div class="muted" style="margin-top:6px;">点常用项的名字就填进「' +
      util.esc(L.meal[state.lastMeal] || '早餐') + '」</div>');
  }

  function historyBodyHTML() {
    var list = diet.history(30, state.histFilter);
    if (!list.length) {
      return store.get(K.dietRecords).length
        ? '<div class="empty-sm">这个日期范围内没有记录</div>'
        : ui.empty('还没有记录，从上面的四餐开始', ui.btn('去记四餐', { act: 'focusMeal', small: true }));
    }
    return '<div class="list">' + list.map(function (h) {
      var open = !!state.open[h.date];
      var named = L.mealOrder.map(function (m) {
        var r = h.meals[m];
        return '<div class="muted2">' + util.esc(L.meal[m]) + '：' +
          (r && r.content ? util.esc(r.content) : '—') +
          (r && r.done ? ' ✓' : '') + '</div>';
      }).join('');
      return '<div>' +
        '<div class="hist-hd" data-act="toggleHist" data-date="' + util.esc(h.date) + '">' +
        '<span>' + util.esc(util.formatDateCN(h.date)) + '</span>' +
        '<span class="muted">已填 ' + h.summary.filled + ' / 4</span>' +
        '<span class="right muted">' + (open ? '收起' : '展开') + '</span></div>' +
        (open ? '<div class="hist-bd">' + named + '</div>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function historyHTML() {
    var f = state.histFilter;
    var bar = ui.filterBar([
      { type: 'text', key: 'from', label: '起始日期 如 2026-09-01', value: f.from },
      { type: 'text', key: 'to', label: '截止日期 如 2026-09-30', value: f.to }
    ]);
    return ui.card('历史', bar + '<div id="diet-hist">' + historyBodyHTML() + '</div>');
  }

  /* 只重绘历史列表，日期筛选框不失焦 */
  function refreshHistory() {
    var box = document.getElementById('diet-hist');
    if (!box) return renderAll();
    box.innerHTML = historyBodyHTML();
  }

  function bodyHTML() {
    return '<div class="page-head"><h2>饮食计划</h2><p>记三餐吃了什么，打勾表示按计划吃了</p></div>' +
      ui.dateNav(state.date, { suffix: state.date === util.today() ? '' : '（补记）' }) +
      '<div class="stack">' + mealsHTML() + favoritesHTML() + historyHTML() + '</div>';
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

      if (act === 'prevDay') { state.date = util.addDays(state.date, -1); return renderAll(); }
      if (act === 'nextDay') { state.date = util.addDays(state.date, 1); return renderAll(); }
      /* 点进某一格就把它记为「当前格」，常用项会填到这里 */
      if (act === 'mealInp') { if (t.dataset.id2) state.lastMeal = t.dataset.id2; return; }
      if (act === 'toggleMeal') { diet.toggleMeal(id, t.dataset.id2); return renderAll(); }
      if (act === 'toggleHist') {
        var ds = t.dataset.date;
        state.open[ds] = !state.open[ds];
        return renderAll();
      }
      if (act === 'useFav') {
        var r = diet.pickFavorite(state.date, state.lastMeal, id);
        if (r) ui.toast('已填进「' + L.meal[state.lastMeal] + '」');
        return renderAll();
      }
      if (act === 'favUp') { diet.moveFavorite(id, -1); return renderAll(); }
      if (act === 'favDown') { diet.moveFavorite(id, 1); return renderAll(); }
      if (act === 'delFav') { diet.removeFavorite(id); ui.toast('已删除常用项', { undo: true }); return renderAll(); }
      /* 空状态里的主操作按钮：把焦点送到该填的地方 */
      if (act === 'focusFav') {
        var fi = document.getElementById('fav-input');
        if (fi) fi.focus();
        return;
      }
      if (act === 'focusMeal') {
        var mi = rootEl.querySelector('[data-act="mealInp"]');
        if (mi) mi.focus();
        return;
      }
    };

    rootEl.onchange = function (e) {
      var t = e.target;
      if (!t.dataset) return;
      if (t.dataset.act === 'mealInp') {
        diet.setMealContent(t.dataset.date, t.dataset.id2, t.value);
        return renderAll();
      }
      if (t.dataset.act === 'pickFav' && t.value) {
        diet.pickFavorite(t.dataset.id, t.dataset.key, t.value);
        return renderAll();
      }
      if (t.dataset.act === 'filter') {
        var key = t.dataset.fkey || String(t.dataset.fk || '').replace(/^filter-/, '');
        if (key) { state.histFilter[key] = t.value; refreshHistory(); }
      }
    };

    rootEl.oninput = function (e) {
      var t = e.target;
      if (!t || !t.dataset || t.dataset.act !== 'filter') return;
      var key = t.dataset.fkey || String(t.dataset.fk || '').replace(/^filter-/, '');
      if (!key) return;
      state.histFilter[key] = t.value;
      refreshHistory();
    };

    /* 记住最后碰过的那一格，常用项就填到那格 */
    rootEl.onfocusin = function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.act === 'mealInp' && t.dataset.id2) {
        state.lastMeal = t.dataset.id2;
      }
    };

    rootEl.onkeydown = function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (t && t.id === 'fav-input') {
        e.preventDefault();
        if (diet.addFavorite(t.value)) { t.value = ''; renderAll(); }
        else ui.toast('重复或为空，没加上');
      }
    };
  }

  App.pages.diet = {
    id: 'diet',
    title: '饮食计划',
    subtitle: '三餐记录与打卡',

    render: function (rootEl) {
      ctxRoot = rootEl;
      renderAll();
    },

    refresh: function () { renderAll(); },

    primaryAdd: function () {
      var el = document.getElementById('fav-input');
      if (el) el.focus();
    },

    destroy: function () { ctxRoot = null; },

    /* 供测试使用 */
    _state: state,
    _bodyHTML: function () { return bodyHTML(); },
    _renderAll: renderAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
