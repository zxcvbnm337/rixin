/* game.js —— 游戏娱乐：游戏库（卡片/表格 + 状态分组）+ 时长记录（含 +30 连加）+ 统计排行。
   对应 PRD 5.7 与页面结构设计 4.8。 */
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
  function ratingRank(r) { return Number(r) || 0; }

  var game = {
    /* ================= 游戏库 ================= */
    games: function (filter) {
      filter = filter || {};
      var list = store.get(K.gameGames).slice();
      if (filter.status) list = list.filter(function (g) { return g.status === filter.status; });
      if (filter.q) {
        var kw = String(filter.q).toLowerCase();
        list = list.filter(function (g) {
          return String(g.name || '').toLowerCase().indexOf(kw) >= 0 ||
            String(g.thought || '').toLowerCase().indexOf(kw) >= 0;
        });
      }
      var order = L.gameStatusOrder;
      return list.sort(function (a, b) {
        var oa = order.indexOf(a.status), ob = order.indexOf(b.status);
        if (oa < 0) oa = 99;
        if (ob < 0) ob = 99;
        if (oa !== ob) return oa - ob;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    },

    /* 按状态分组（在玩置顶），空组不返回。
       若 filter.status 指定了某个状态，就只出那一组——筛选条靠它生效。 */
    grouped: function (filter) {
      filter = filter || {};
      var order = filter.status ? [filter.status] : L.gameStatusOrder;
      var out = [];
      order.forEach(function (st) {
        if (!L.gameStatus[st]) return;
        var items = game.games(Object.assign({}, filter, { status: st }));
        if (items.length) out.push({ status: st, label: L.gameStatus[st], games: items });
      });
      return out;
    },

    getGame: function (id) {
      return store.get(K.gameGames).filter(function (g) { return g.id === id; })[0] || null;
    },

    addGame: function (opts) {
      opts = opts || {};
      var name = trim(opts.name);
      if (!name) return null;
      var st = L.gameStatus[opts.status] ? opts.status : 'wish';
      var r = Math.round(Number(opts.rating) || 0);
      var g = {
        id: util.uid('game'), name: name,
        platform: L.gamePlatform[opts.platform] ? opts.platform : 'pc',
        status: st,
        rating: util.clamp(r, 0, 10),
        thought: String(opts.thought || ''),
        createdAt: Date.now(),
        clearedAt: st === 'cleared' ? util.today() : ''
      };
      var all = store.get(K.gameGames).slice();
      all.push(g);
      store.set(K.gameGames, all);
      return g;
    },

    updateGame: function (id, patch) {
      var all = store.get(K.gameGames).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      var next = Object.assign({}, all[i], patch);
      if (patch && patch.rating !== undefined) next.rating = util.clamp(Math.round(Number(patch.rating) || 0), 0, 10);
      all[i] = next;
      store.set(K.gameGames, all);
      return next;
    },

    /* 改成「已通关」自动记通关日期；改成别的状态清掉 */
    setGameStatus: function (id, status) {
      if (!L.gameStatus[status]) return null;
      return game.updateGame(id, {
        status: status,
        clearedAt: status === 'cleared' ? (game.getGame(id) || {}).clearedAt || util.today() : ''
      });
    },

    removeGame: function (id) {
      var all = store.get(K.gameGames);
      if (!all.some(function (g) { return g.id === id; })) return false;
      var logs = store.get(K.gameLogs);
      var hasLogs = logs.some(function (l) { return l.gameId === id; });
      store.snapshotMany(hasLogs ? [K.gameGames, K.gameLogs] : [K.gameGames]);
      store.set(K.gameGames, all.filter(function (g) { return g.id !== id; }));
      if (hasLogs) store.set(K.gameLogs, logs.filter(function (l) { return l.gameId !== id; }));
      return true;
    },

    /* ================= 时长记录 ================= */
    logs: function (filter) {
      filter = filter || {};
      var list = store.get(K.gameLogs).slice();
      if (filter.gameId) list = list.filter(function (l) { return l.gameId === filter.gameId; });
      if (filter.from) list = list.filter(function (l) { return l.date >= filter.from; });
      if (filter.to) list = list.filter(function (l) { return l.date <= filter.to; });
      return list.sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    },

    getLog: function (id) {
      return store.get(K.gameLogs).filter(function (l) { return l.id === id; })[0] || null;
    },

    addLog: function (opts) {
      opts = opts || {};
      var mins = Math.round(Number(opts.minutes) || 0);
      if (!(mins > 0)) return null;
      if (!game.getGame(opts.gameId)) return null;
      var log = {
        id: util.uid('glog'),
        date: util.isValidDate(opts.date) ? opts.date : util.today(),
        gameId: opts.gameId,
        minutes: mins,
        note: String(opts.note || ''),
        createdAt: Date.now()
      };
      var all = store.get(K.gameLogs).slice();
      all.push(log);
      store.set(K.gameLogs, all);
      return log;
    },

    updateLog: function (id, patch) {
      var all = store.get(K.gameLogs).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      var next = Object.assign({}, all[i], patch);
      if (patch && patch.minutes !== undefined) next.minutes = Math.round(Number(patch.minutes) || 0);
      all[i] = next;
      store.set(K.gameLogs, all);
      return next;
    },

    removeLog: function (id) {
      var all = store.get(K.gameLogs);
      if (!all.some(function (l) { return l.id === id; })) return false;
      store.snapshot(K.gameLogs);
      store.set(K.gameLogs, all.filter(function (l) { return l.id !== id; }));
      return true;
    },

    /* 快速记录：'30' 新增一条；'+30' 在最后一条上加 30 分钟 */
    quickLog: function (gameId, input, note) {
      var raw = String(input == null ? '' : input).trim();
      var append = false;
      if (raw.charAt(0) === '+') { append = true; raw = raw.slice(1); }
      var mins = util.parseDuration(raw);
      if (mins === null || !(mins > 0)) {
        return { ok: false, error: '分钟数看不懂，试试 30 / +30 / 1.5h' };
      }
      if (!game.getGame(gameId)) return { ok: false, error: '请先选一个游戏' };

      var rows = game.logs({ gameId: gameId });
      if (append && rows.length) {
        var last = rows[0];
        var updated = game.updateLog(last.id, { minutes: last.minutes + mins });
        return { ok: true, mode: 'append', log: updated };
      }
      var log = game.addLog({ gameId: gameId, minutes: mins, note: note });
      return log ? { ok: true, mode: 'new', log: log } : { ok: false, error: '记录失败' };
    },

    /* ================= 统计 ================= */
    ranking: function (kind, refDate) {
      var ref = refDate || util.today();
      var logs = store.get(K.gameLogs).slice();
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
        var g = game.getGame(l.gameId);
        var key = g ? g.name : '已删除的游戏';
        map[key] = (map[key] || 0) + (Number(l.minutes) || 0);
      });
      return Object.keys(map).map(function (k) { return { label: k, value: map[k] }; })
        .sort(function (a, b) { return b.value - a.value; });
    },

    totalMinutes: function (kind, refDate) {
      return util.sum(game.ranking(kind, refDate), function (i) { return i.value; });
    },

    gameMinutes: function (gameId) {
      return util.sum(store.get(K.gameLogs).filter(function (l) {
        return l.gameId === gameId;
      }), function (l) { return l.minutes; });
    },

    /* 供首页取数 */
    summary: function () {
      var gs = store.get(K.gameGames);
      return {
        games: gs.length,
        playing: gs.filter(function (g) { return g.status === 'playing'; }).length,
        wish: gs.filter(function (g) { return g.status === 'wish'; }).length,
        cleared: gs.filter(function (g) { return g.status === 'cleared'; }).length,
        minutesTotal: util.sum(store.get(K.gameLogs), function (l) { return l.minutes; }),
        weekMinutes: game.totalMinutes('week', util.today())
      };
    }
  };
  App.actions = App.actions || {};
  App.actions.game = game;

  /* ================= 页面 ================= */
  var state = { tab: 'library', view: 'card', rankKind: 'week', quickGameId: '', filter: { status: '', q: '' } };

  function ratingHTML(r) {
    return r > 0 ? util.esc(String(r) + '/10') : '<span class="muted">未评分</span>';
  }

  function gameCardHTML(g) {
    return ui.card(g.name,
      '<div class="muted2">' + (g.thought ? util.esc(g.thought) : '（没写感想）') + '</div>' +
      '<div class="kv mt8"><span class="kv-k">平台</span><span>' + util.esc(L.gamePlatform[g.platform] || g.platform) + '</span></div>' +
      '<div class="kv"><span class="kv-k">评分</span><span>' + ratingHTML(g.rating) + '</span></div>' +
      '<div class="kv"><span class="kv-k">时长</span><span>' + util.esc(util.fmtDurationCN(game.gameMinutes(g.id))) + '</span></div>' +
      (g.clearedAt ? '<div class="kv"><span class="kv-k">通关</span><span>' + util.esc(g.clearedAt) + '</span></div>' : '') +
      '<div class="list-actions mt8">' +
      '<span class="ico-btn" data-act="quickFor" data-id="' + util.esc(g.id) + '">记时长</span>' +
      '<span class="ico-btn" data-act="editGame" data-id="' + util.esc(g.id) + '">编辑</span>' +
      statusButtons(g) +
      '<span class="ico-btn" data-act="delGame" data-id="' + util.esc(g.id) + '">删除</span>' +
      '</div>',
      { extra: ui.tag(L.gameStatus[g.status] || g.status, g.status === 'playing' ? 'info' : (g.status === 'cleared' ? 'ok' : '')) });
  }

  function statusButtons(g) {
    if (g.status === 'playing') return '<span class="ico-btn" data-act="gameStatus" data-id="' + util.esc(g.id) + '" data-status="cleared">通关</span>';
    if (g.status === 'wish') return '<span class="ico-btn" data-act="gameStatus" data-id="' + util.esc(g.id) + '" data-status="playing">开始玩</span>';
    if (g.status === 'cleared') return '<span class="ico-btn" data-act="gameStatus" data-id="' + util.esc(g.id) + '" data-status="playing">再玩</span>';
    return '<span class="ico-btn" data-act="gameStatus" data-id="' + util.esc(g.id) + '" data-status="wish">想玩</span>';
  }

  function gameRowHTML(g) {
    return '<tr data-id="' + util.esc(g.id) + '">' +
      '<td class="tbl-name" data-act="editGame" data-id="' + util.esc(g.id) + '">' + util.esc(g.name) + '</td>' +
      '<td>' + util.esc(L.gamePlatform[g.platform] || g.platform) + '</td>' +
      '<td>' + ui.tag(L.gameStatus[g.status] || g.status, g.status === 'playing' ? 'info' : '') + '</td>' +
      '<td>' + ratingHTML(g.rating) + '</td>' +
      '<td class="muted2">' + util.esc(g.thought || '—') + '</td>' +
      '<td class="list-actions">' +
      '<span class="ico-btn" data-act="quickFor" data-id="' + util.esc(g.id) + '">记时长</span>' +
      '<span class="ico-btn" data-act="editGame" data-id="' + util.esc(g.id) + '">编辑</span>' +
      '<span class="ico-btn" data-act="delGame" data-id="' + util.esc(g.id) + '">删除</span>' +
      '</td></tr>';
  }

  /* 游戏库正文：按筛选结果分组渲染（卡片 / 表格两种视图共用） */
  function libraryBodyHTML() {
    var groups = game.grouped(state.filter);
    if (!groups.length) {
      return store.get(K.gameGames).length
        ? '<div class="empty-sm">没有符合筛选条件的游戏</div>'
        : ui.empty('还没有游戏，先把想玩的加进来', ui.btn('新增游戏', { act: 'newGame', small: true }));
    }
    return groups.map(function (grp) {
      if (state.view === 'table') {
        return '<div class="mt8"><div class="muted" style="margin-bottom:4px;">' + util.esc(grp.label) +
          '（' + grp.games.length + '）</div>' +
          '<table class="tbl"><thead><tr>' +
          ['名称', '平台', '状态', '评分', '感想', '操作'].map(function (h) { return '<th>' + h + '</th>'; }).join('') +
          '</tr></thead><tbody>' + grp.games.map(gameRowHTML).join('') + '</tbody></table></div>';
      }
      return '<div class="mt8"><div class="muted" style="margin-bottom:6px;">' + util.esc(grp.label) +
        '（' + grp.games.length + '）</div>' +
        '<div class="game-grid">' + grp.games.map(gameCardHTML).join('') + '</div></div>';
    }).join('');
  }

  function libraryHTML() {
    var f = state.filter;
    var bar = ui.filterBar([
      {
        type: 'select', key: 'status', label: '全部状态', value: f.status,
        options: [{ value: '', label: '全部状态' }].concat(L.gameStatusOrder.map(function (k) {
          return { value: k, label: L.gameStatus[k] };
        }))
      },
      { type: 'text', key: 'q', label: '搜索游戏名 / 感想', value: f.q }
    ]);
    var toggle = '<div class="tabs"><span class="tab' + (state.view === 'card' ? ' on' : '') +
      '" data-act="viewMode" data-view="card">卡片</span>' +
      '<span class="tab' + (state.view === 'table' ? ' on' : '') + '" data-act="viewMode" data-view="table">表格</span></div>';

    return bar + toggle + '<div id="game-list">' + libraryBodyHTML() + '</div>' +
      '<div class="mt8">' + ui.btn('＋ 新增游戏', { act: 'newGame' }) + '</div>';
  }

  /* 筛选时只重绘游戏库，输入框不失焦 */
  function refreshLibrary() {
    var box = document.getElementById('game-list');
    if (!box) return renderAll();
    box.innerHTML = libraryBodyHTML();
  }

  function logsHTML() {
    var list = game.logs();
    var opts = [{ value: '', label: '选择游戏…' }].concat(game.games().map(function (g) {
      return { value: g.id, label: g.name };
    }));
    var quick = '<div class="card"><div class="quick-bar">' +
      ui.select({ id: 'quick-game', fk: 'quick-game', value: state.quickGameId || '', options: opts }) +
      ui.input({ id: 'quick-min', fk: 'quick-min', placeholder: '分钟，如 30 或 +30', cls: 'quick-min' }) +
      ui.input({ id: 'quick-note', fk: 'quick-note', placeholder: '备注（可空）' }) +
      ui.btn('记一笔', { act: 'quickSubmit', small: true }) +
      '<span class="muted">回车即存；填 +30 就在最后一条上加 30 分钟</span>' +
      '</div></div>';

    var rows = list.length
      ? '<div class="list list-scroll">' + list.map(function (l) {
        var g = game.getGame(l.gameId);
        return ui.row(
          '<span class="muted">' + util.esc(l.date) + '</span>' +
          '<span class="row-title">' + util.esc(g ? g.name : '（游戏已删除）') + '</span>' +
          (l.note ? '<span class="muted2">' + util.esc(l.note) + '</span>' : ''),
          '<span class="list-actions"><span class="row-side">' + util.esc(util.fmtDuration(l.minutes)) + '</span>' +
          '<span class="ico-btn" data-act="delLog" data-id="' + util.esc(l.id) + '">×</span></span>',
          { id: l.id }
        );
      }).join('') + '</div>'
      : ui.empty('还没有时长记录，用上面的快速记录栏记一笔',
        '<span class="btn btn-sm" data-act="tab" data-tab="library">先去游戏库加一款</span>');

    return quick + '<div class="card mt8"><div class="rowflex" style="margin-bottom:8px;">' +
      '<span class="muted">共 ' + list.length + ' 条 · 合计 ' + util.esc(util.fmtDurationCN(game.totalMinutes('all'))) + '</span>' +
      '</div>' + rows + '</div>';
  }

  function statsHTML() {
    var items = game.ranking(state.rankKind, util.today());
    var total = util.sum(items, function (i) { return i.value; });
    var tabs = '<div class="tabs">' +
      '<span class="tab' + (state.rankKind === 'week' ? ' on' : '') + '" data-act="rankKind" data-kind="week">本周</span>' +
      '<span class="tab' + (state.rankKind === 'month' ? ' on' : '') + '" data-act="rankKind" data-kind="month">本月</span>' +
      '</div>';
    return ui.card('时长排行', tabs +
      '<div class="muted" style="margin-bottom:8px;">总时长 ' + util.esc(util.fmtDurationCN(total)) + '</div>' +
      ui.bar(items, { fmt: function (v) { return util.fmtDuration(v); } }));
  }

  function bodyHTML() {
    var tabs = '<div id="game-tabs">' + ui.tabs([
      { id: 'library', label: '游戏库' },
      { id: 'logs', label: '时长记录' },
      { id: 'stats', label: '统计' }
    ], state.tab, { act: 'tab' }) + '</div>';
    var content = state.tab === 'library' ? libraryHTML()
      : state.tab === 'logs' ? logsHTML()
        : statsHTML();
    var sub = state.tab === 'library' ? '按状态分组，记录想玩与通关'
      : state.tab === 'logs' ? '快速记时长，支持 +30 连加'
        : '本周 / 本月各游戏时长排行';
    return '<div class="page-head"><h2>游戏娱乐</h2><p>' + sub + '</p></div>' +
      tabs + '<div id="game-body">' + content + '</div>';
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
  function openForm(mode, title, rows, onExtra) {
    var entry = ui.drawer(title, drawerForm(rows));
    if (entry && entry.el) {
      entry.el.addEventListener('click', function (e) {
        var t = e.target.closest('[data-act]');
        if (!t) return;
        if (t.dataset.act === 'formSave') { saveForm(mode, collect(entry.el)); return; }
        if (onExtra) onExtra(t, entry.el);
      });
    }
    return entry;
  }

  /* 1–10 的点击式评分刻度（不做星星） */
  function ratingPickHTML(value) {
    var v = Number(value) || 0;
    var cells = '';
    for (var i = 1; i <= 10; i++) {
      cells += '<span class="rt' + (i <= v ? ' on' : '') + '" data-act="pickRating" data-v="' + i + '">' + i + '</span>';
    }
    return '<div class="rating">' + cells + '</div>' +
      '<input type="hidden" data-fk="rating" value="' + v + '">';
  }

  function openGameForm(id) {
    var g = id ? game.getGame(id) : null;
    var rows = [
      ui.field('游戏名称', ui.input({ fk: 'name', value: g ? g.name : '', placeholder: '如：艾尔登法环' })),
      ui.field('平台', ui.select({
        fk: 'platform', value: g ? g.platform : 'pc',
        options: Object.keys(L.gamePlatform).map(function (k) { return { value: k, label: L.gamePlatform[k] }; })
      })),
      ui.field('状态', ui.select({
        fk: 'status', value: g ? g.status : 'wish',
        options: L.gameStatusOrder.map(function (k) { return { value: k, label: L.gameStatus[k] }; })
      })),
      ui.field('评分（1–10，点一下选）', ratingPickHTML(g ? g.rating : 0)),
      ui.field('短感想', ui.textarea({ fk: 'thought', rows: 3, value: g ? g.thought : '' }))
    ];
    return openForm(g ? ('editGame:' + g.id) : 'game', g ? '编辑游戏' : '新增游戏', rows,
      function (t, el) {
        if (t.dataset.act !== 'pickRating') return;
        var v = Number(t.dataset.v) || 0;
        var hid = el.querySelector('[data-fk="rating"]');
        if (hid) hid.value = String(v);
        Array.prototype.slice.call(el.querySelectorAll('.rating .rt')).forEach(function (x) {
          if (Number(x.dataset.v) <= v) x.classList.add('on'); else x.classList.remove('on');
        });
      });
  }

  function saveForm(mode, v) {
    if (mode === 'game') {
      if (!game.addGame(v)) { ui.toast('游戏名称不能为空'); return; }
      ui.closeDrawer(); ui.toast('已新增游戏'); renderAll(); return;
    }
    if (mode.indexOf('editGame:') === 0) {
      if (!trim(v.name)) { ui.toast('游戏名称不能为空'); return; }
      game.updateGame(mode.slice('editGame:'.length), v);
      ui.closeDrawer(); ui.toast('游戏已更新'); renderAll(); return;
    }
  }

  /* 快速记录（回车或点按钮都走这里） */
  function submitQuick() {
    var sel = document.getElementById('quick-game');
    var minEl = document.getElementById('quick-min');
    var noteEl = document.getElementById('quick-note');
    var gid = sel ? sel.value : '';
    state.quickGameId = gid;
    var r = game.quickLog(gid, minEl ? minEl.value : '', noteEl ? noteEl.value : '');
    if (!r.ok) { ui.toast(r.error); return; }
    ui.toast((r.mode === 'append' ? '已累加到 ' : '已记录 ') + util.fmtDuration(r.log.minutes));
    renderAll();
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

      if (act === 'tab') { state.tab = t.dataset.tab; return renderAll(); }
      if (act === 'viewMode') { state.view = t.dataset.view; return renderAll(); }
      if (act === 'rankKind') { state.rankKind = t.dataset.kind; return renderAll(); }
      if (act === 'newGame') return openGameForm(null);
      if (act === 'editGame') return openGameForm(id);
      if (act === 'gameStatus') { game.setGameStatus(id, t.dataset.status); return renderAll(); }
      if (act === 'quickFor') {
        state.tab = 'logs';
        state.quickGameId = id;
        renderAll();
        var sel = document.getElementById('quick-game');
        if (sel) { sel.value = id; }
        var mi = document.getElementById('quick-min');
        if (mi) mi.focus();
        return;
      }
      if (act === 'quickSubmit') return submitQuick();
      if (act === 'delLog') { game.removeLog(id); ui.toast('已删除记录', { undo: true }); return renderAll(); }
      if (act === 'delGame') {
        var g = game.getGame(id);
        if (!g) return;
        ui.confirm('删除游戏「' + g.name + '」？它的时长记录会一并删除。', function () {
          game.removeGame(id); ui.toast('已删除游戏', { undo: true }); renderAll();
        }, { danger: true, okText: '删除' });
        return;
      }
    };

    rootEl.onkeydown = function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (t && t.id === 'quick-min') { e.preventDefault(); submitQuick(); }
    };

    /* 游戏库筛选条：状态走 change，关键词边打边筛走 input */
    function applyFilter(t) {
      var key = t.dataset.fkey || String(t.dataset.fk || '').replace(/^filter-/, '');
      if (!key) return false;
      state.filter[key] = t.value;
      refreshLibrary();
      return true;
    }
    rootEl.onchange = function (e) {
      var t = e.target;
      if (!t || !t.dataset || t.dataset.act !== 'filter') return;
      applyFilter(t);
    };
    rootEl.oninput = function (e) {
      var t = e.target;
      if (!t || !t.dataset || t.dataset.act !== 'filter') return;
      applyFilter(t);
    };
  }

  App.pages.game = {
    id: 'game',
    title: '游戏娱乐',
    subtitle: '游戏库与时长',

    render: function (rootEl) {
      ctxRoot = rootEl;
      renderAll();
    },

    refresh: function () { renderAll(); },

    primaryAdd: function () {
      if (state.tab === 'library') return openGameForm(null);
      state.tab = 'logs';
      renderAll();
      var mi = document.getElementById('quick-min');
      if (mi) mi.focus();
    },

    destroy: function () { ctxRoot = null; },

    /* 供测试使用 */
    _state: state,
    _bodyHTML: function () { return bodyHTML(); },
    _renderAll: renderAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
