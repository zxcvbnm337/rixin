/* home.js —— 首页总览：七张摘要卡（今日计划 / 今日打卡 / 学习进度 / 项目进展 /
   本周工时 / 游戏时长 / 快速备忘）+ 就地勾选与便签 + 卡片菜单。
   定位：看板层，只读聚合各模块，唯一例外是勾选完成与写便签。
   对应 PRD 第 3 章与页面结构设计 4.1。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var util = App.util, ui = App.ui, store = App.store, schema = App.schema;
  var K = schema.KEYS, L = schema.LABELS;

  /* 取某个模块的动作层；模块没加载时返回 null，首页要能优雅降级 */
  function A(name) {
    var acts = App.actions || {};
    return acts[name] || null;
  }
  function pageUrl(p) { return '#' + (p === 'home' ? '/home' : '/' + p); }

  var CARDS = [
    { id: 'todayPlan', title: '今日计划', page: 'today', row: 1 },
    { id: 'checkin', title: '今日打卡', page: 'fitness', row: 1 },
    { id: 'study', title: '学习进度', page: 'study', row: 1 },
    { id: 'projects', title: '项目进展', page: 'dev', row: 2 },
    { id: 'consultWeek', title: '本周工时', page: 'consult', row: 2 },
    { id: 'game', title: '游戏时长', page: 'game', row: 3 },
    { id: 'notes', title: '快速备忘', page: 'today', row: 3 }
  ];
  var CARD_LIMIT_PLAN = 5;
  var CARD_LIMIT_STUDY = 3;
  var CARD_LIMIT_PROJECT = 2;

  /* ==================== 数据聚合（只读） ==================== */

  function planData(date) {
    date = date || util.today();
    var t = A('today');
    if (!t) return { date: date, items: [], total: 0, done: 0, remaining: 0 };
    var all = t.sorted(date);
    var undone = all.filter(function (x) { return !x.done; });
    return {
      date: date,
      total: all.length,
      done: all.length - undone.length,
      remaining: undone.length,
      items: undone.slice(0, CARD_LIMIT_PLAN).map(function (x) {
        return { id: x.id, title: x.title, priority: x.priority, moduleRef: x.moduleRef || null };
      })
    };
  }

  function checkinData(date) {
    date = date || util.today();
    var f = A('fitness'), d = A('diet');
    /* 一律走只读入口：首页不能因为看一眼就顺手落库 */
    var plan = f ? f.planOf(date) : { rest: false, content: '' };
    var out = {
      date: date,
      fitness: {
        done: f ? f.todayDone(date) : false,
        isRest: plan.rest,
        hasPlan: !!String(plan.content || '').trim(),
        plan: plan.content || '',
        streak: f ? f.streakOf(date) : 0
      },
      diet: { done: 0, filled: 0, total: 4 }
    };
    var ds = d ? d.summary() : null;
    if (ds) out.diet = { done: ds.doneToday, filled: ds.filledToday, total: ds.total };
    return out;
  }

  function studyData(limit) {
    var st = A('study');
    if (!st) return { doing: [], progress: 0, minutes: 0, weekMinutes: 0, directions: 0 };
    var items = st.items();
    var doing = items.filter(function (i) { return i.status === 'doing'; });
    if (!doing.length) doing = items.filter(function (i) { return i.progress > 0 && i.progress < 100; });
    doing = doing.slice().sort(function (a, b) { return (b.progress || 0) - (a.progress || 0); });
    var s = st.summary();
    return {
      doing: doing.slice(0, limit || CARD_LIMIT_STUDY).map(function (i) {
        var dir = i.directionId ? st.getDirection(i.directionId) : null;
        return { id: i.id, name: i.name, progress: util.clamp(i.progress, 0, 100), direction: dir ? dir.name : '' };
      }),
      doingTotal: doing.length,
      progress: s.progress,
      minutes: s.minutes,
      weekMinutes: s.weekMinutes,
      directions: s.activeDirections
    };
  }

  function projectsData(limit) {
    limit = limit || CARD_LIMIT_PROJECT;
    var dv = A('dev'), cs = A('consult');
    var devList = [], consultList = [];
    if (dv) {
      var ps = dv.projects();
      var doing = ps.filter(function (p) { return p.status === 'doing'; });
      if (!doing.length) doing = ps;
      devList = doing.slice(0, limit).map(function (p) {
        var b = dv.board(p.id);
        var total = b.todo.length + b.doing.length + b.done.length;
        return {
          id: p.id, name: p.name, total: total, done: b.done.length,
          ratio: total ? Math.round(b.done.length / total * 100) : 0
        };
      });
    }
    if (cs) {
      consultList = cs.projects().slice(0, limit).map(function (p) {
        return { id: p.id, name: p.name, stage: p.stage || '', minutes: cs.projectMinutes(p.id) };
      });
    }
    var ds = dv ? dv.summary() : { doing: 0, openBugs: 0, tasks: 0, doneTasks: 0 };
    return { dev: devList, consult: consultList, devSummary: ds };
  }

  function consultWeekData() {
    var cs = A('consult');
    if (!cs) return { minutes: 0, items: [], clients: 0 };
    var items = cs.summaryItems('week', util.today());
    var s = cs.summary();
    return {
      minutes: s.weekMinutes,
      items: items.slice(0, 5),
      clients: s.activeClients,
      pending: s.pendingDeliverables
    };
  }

  function gameData() {
    var gm = A('game');
    if (!gm) return { weekMinutes: 0, playing: [], total: 0, games: 0 };
    var s = gm.summary();
    return {
      weekMinutes: s.weekMinutes,
      total: s.minutesTotal,
      games: s.games,
      playing: gm.games({ status: 'playing' }).slice(0, CARD_LIMIT_STUDY).map(function (g) {
        return { id: g.id, name: g.name, rating: g.rating, minutes: gm.gameMinutes(g.id) };
      })
    };
  }

  function notesData(limit) {
    var t = A('today');
    if (!t) return [];
    return t.notes().slice(0, limit || 5).map(function (n) {
      return { id: n.id, content: n.content, pinned: !!n.pinned, updatedAt: n.updatedAt || n.createdAt || 0 };
    });
  }

  var home = {
    cards: function () { return CARDS.slice(); },

    hiddenCards: function () {
      var meta = store.get(K.meta);
      return Array.isArray(meta.homeHidden) ? meta.homeHidden.slice() : [];
    },

    visibleCards: function () {
      var hidden = home.hiddenCards();
      return CARDS.filter(function (c) { return hidden.indexOf(c.id) < 0; });
    },

    hideCard: function (id) {
      if (!CARDS.some(function (c) { return c.id === id; })) return false;
      var meta = store.get(K.meta);
      var list = Array.isArray(meta.homeHidden) ? meta.homeHidden.slice() : [];
      if (list.indexOf(id) < 0) list.push(id);
      meta.homeHidden = list;
      store.set(K.meta, meta);
      return true;
    },

    showCard: function (id) {
      var meta = store.get(K.meta);
      var list = Array.isArray(meta.homeHidden) ? meta.homeHidden.slice() : [];
      var next = list.filter(function (x) { return x !== id; });
      if (next.length === list.length) return false;
      meta.homeHidden = next;
      store.set(K.meta, meta);
      return true;
    },

    showAllCards: function () {
      var meta = store.get(K.meta);
      meta.homeHidden = [];
      store.set(K.meta, meta);
      return true;
    },

    plan: planData,
    checkin: checkinData,
    study: studyData,
    projects: projectsData,
    consultWeek: consultWeekData,
    game: gameData,
    notes: notesData,

    data: function () {
      return {
        date: util.today(),
        plan: planData(),
        checkin: checkinData(),
        study: studyData(),
        projects: projectsData(),
        consultWeek: consultWeekData(),
        game: gameData(),
        notes: notesData()
      };
    },

    /* ---------- 首页唯一允许的写入：勾选完成 + 便签 ---------- */
    toggleTask: function (id) {
      var t = A('today');
      return t ? t.toggle(id) : null;
    },

    addNote: function (content) {
      var t = A('today');
      return t ? t.addNote(content) : null;
    },

    updateNote: function (id, content) {
      var t = A('today');
      return t ? t.updateNote(id, content) : null;
    },

    togglePinNote: function (id) {
      var t = A('today');
      return t ? t.togglePinNote(id) : null;
    },

    removeNote: function (id) {
      var t = A('today');
      return t ? t.removeNote(id) : null;
    },

    /* 备份提醒是否该出现（E6），首页只读这个判断 */
    backupReminder: function () {
      return typeof App.shouldRemindBackup === 'function' ? App.shouldRemindBackup() : false;
    }
  };

  App.actions = App.actions || {};
  App.actions.home = home;

  /* ==================== 页面 ==================== */

  var state = { menuFor: null };

  function prioTag(p) {
    if (!p || p === 'mid') return '';
    var tone = p === 'high' ? 'tone-warn' : '';
    return '<span class="tag ' + tone + '">' + util.esc(L.priority[p] || p) + '</span>';
  }

  function homeCard(card, body, extraHead) {
    return '<section class="card home-card" data-card="' + util.esc(card.id) + '">' +
      '<header class="card-hd">' +
      '<h3><span class="hc-link" data-act="goModule" data-page="' + util.esc(card.page) + '">' +
      util.esc(card.title) + '</span></h3>' +
      (extraHead || '') +
      '<span class="hc-more" data-act="cardMenu" data-card="' + util.esc(card.id) + '" title="更多">…</span>' +
      '</header>' +
      '<div class="card-bd">' + body + '</div>' +
      '<div class="card-menu" data-menu="' + util.esc(card.id) + '">' +
      '<span data-act="goModule" data-page="' + util.esc(card.page) + '">进入模块</span>' +
      '<span data-act="hideCard" data-card="' + util.esc(card.id) + '">隐藏此卡</span>' +
      '</div></section>';
  }

  /* ---------- 今日计划 ---------- */
  function planCard() {
    var d = home.plan();
    if (!d.total) {
      return homeCard(CARDS[0], ui.empty('今天还没有计划，去今日页加一条吧',
        ui.btn('去今日', { act: 'goModule', id2: 'today', small: true })));
    }
    if (!d.items.length) {
      return homeCard(CARDS[0],
        '<div class="empty-sm">今天的 ' + d.total + ' 条都完成了 🎉</div>',
        '<span class="right muted">' + d.done + ' / ' + d.total + '</span>');
    }
    var rows = d.items.map(function (t) {
      return '<div class="row">' +
        '<div class="row-main">' +
        ui.check(false, { act: 'toggleTask', id: t.id }) +
        '<span class="row-title">' + util.esc(t.title) + '</span>' +
        prioTag(t.priority) +
        (t.moduleRef ? '<span class="tag">' + util.esc(schema.MODULE_LABELS[t.moduleRef.module] || t.moduleRef.module) + '</span>' : '') +
        '</div></div>';
    }).join('');
    return homeCard(CARDS[0], '<div class="list">' + rows + '</div>',
      '<span class="right muted">未完成 ' + d.remaining + ' · 已完成 ' + d.done + '/' + d.total + '</span>');
  }

  /* ---------- 今日打卡 ---------- */
  function checkinCard() {
    var c = home.checkin();
    var fit = c.fitness;
    var fitTxt = fit.isRest ? '今天是休息日'
      : (fit.done ? '已打卡' : (fit.hasPlan ? '还没打卡：' + fit.plan : '今天没有安排'));
    var fitRow = '<div class="row">' +
      '<div class="row-main">' +
      ui.check(fit.done, { act: 'toggleFitness' }) +
      '<span class="hc-row-t">健身</span>' +
      '<span class="muted2">' + util.esc(fitTxt) + '</span>' +
      (fit.streak ? '<span class="tag tone-ok">连续 ' + fit.streak + ' 天</span>' : '') +
      '</div>' +
      '<div class="row-side"><span class="ico-btn" data-act="goModule" data-page="fitness">去健身</span></div>' +
      '</div>';
    var dietRow = '<div class="row">' +
      '<div class="row-main">' +
      ui.check(c.diet.done >= c.diet.total, { act: 'goModule', id: 'diet' }) +
      '<span class="hc-row-t">饮食</span>' +
      '<span class="muted2">已勾 ' + c.diet.done + ' / ' + c.diet.total + '，已填 ' + c.diet.filled + '</span>' +
      '</div>' +
      '<div class="row-side"><span class="ico-btn" data-act="goModule" data-page="diet">去饮食</span></div>' +
      '</div>';
    return homeCard(CARDS[1], '<div class="list">' + fitRow + dietRow + '</div>');
  }

  /* ---------- 学习进度 ---------- */
  function studyCard() {
    var d = home.study();
    if (!d.doing.length) {
      return homeCard(CARDS[2], ui.empty('还没有进行中的学习项',
        ui.btn('去学习计划', { act: 'goModule', id2: 'study', small: true })));
    }
    var rows = d.doing.map(function (i) {
      return '<div class="hc-prog">' +
        '<div class="hc-line"><span class="hc-line-t">' + util.esc(i.name) + '</span>' +
        '<span class="muted">' + i.progress + '%</span></div>' +
        (i.direction ? '<div class="muted2">' + util.esc(i.direction) + '</div>' : '') +
        ui.progress(i.progress) + '</div>';
    }).join('');
    return homeCard(CARDS[2], rows + '<div class="muted mt8">进行中 ' + d.doingTotal +
      ' 项 · 本周学习 ' + util.esc(util.fmtDurationCN(d.weekMinutes)) + '</div>');
  }

  /* ---------- 项目进展 ---------- */
  function projectsCard() {
    var d = home.projects();
    if (!d.dev.length && !d.consult.length) {
      return homeCard(CARDS[3], ui.empty('还没有进行中的项目',
        ui.btn('去开发工作', { act: 'goModule', id2: 'dev', small: true })));
    }
    var devRows = d.dev.map(function (p) {
      return '<div class="hc-prog">' +
        '<div class="hc-line"><span class="hc-line-t">' + util.esc(p.name) + '</span>' +
        '<span class="muted">任务 ' + p.done + '/' + p.total + '</span></div>' +
        '<div class="muted2">开发</div>' +
        ui.progress(p.ratio) + '</div>';
    }).join('');
    var conRows = d.consult.map(function (p) {
      return '<div class="hc-line"><span class="hc-line-t">' + util.esc(p.name) + '</span>' +
        '<span class="muted">' + util.esc(p.stage || '咨询') +
        (p.minutes ? ' · ' + util.esc(util.fmtDurationCN(p.minutes)) : '') + '</span></div>';
    }).join('');
    var foot = '<div class="muted mt8">进行中开发 ' + d.devSummary.doing + ' 个 · 待修 Bug ' +
      d.devSummary.openBugs + ' 个 · 开发任务 ' + d.devSummary.doneTasks + '/' + d.devSummary.tasks + '</div>';
    return homeCard(CARDS[3],
      (devRows ? devRows : '') + (conRows ? '<div class="hc-sub">咨询项目</div>' + conRows : '') + foot);
  }

  /* ---------- 本周工时 ---------- */
  function consultWeekCard() {
    var d = home.consultWeek();
    var body = d.items.length
      ? ui.bar(d.items, { fmt: function (v) { return util.fmtDuration(v); } })
      : ui.empty('本周还没有工时记录',
        ui.btn('去咨询工作', { act: 'goModule', id2: 'consult', small: true }));
    return homeCard(CARDS[4], body,
      '<span class="right muted">本周 ' + util.esc(util.fmtDurationCN(d.minutes)) + '</span>');
  }

  /* ---------- 游戏时长 ---------- */
  function gameCard() {
    var d = home.game();
    var rows = d.playing.length
      ? d.playing.map(function (g) {
        return '<div class="hc-line"><span class="hc-line-t">' + util.esc(g.name) + '</span>' +
          '<span class="muted">' + util.esc(util.fmtDurationCN(g.minutes)) + '</span></div>';
      }).join('')
      : ui.empty('最近没有在玩的游戏',
        ui.btn('去游戏娱乐', { act: 'goModule', id2: 'game', small: true }));
    return homeCard(CARDS[5], rows,
      '<span class="right muted">本周 ' + util.esc(util.fmtDurationCN(d.weekMinutes)) + '</span>');
  }

  /* ---------- 快速备忘 ---------- */
  function notesCard() {
    var list = home.notes();
    var rows = list.length
      ? '<div class="list">' + list.map(function (n) {
        return '<div class="row" data-id="' + util.esc(n.id) + '">' +
          '<div class="row-main">' +
          '<span class="row-title' + (n.pinned ? ' pin' : '') + '" data-act="noteEdit" data-id="' + util.esc(n.id) + '">' +
          util.esc(n.content) + '</span></div>' +
          '<div class="row-side">' +
          '<span class="ico-btn" data-act="notePin" data-id="' + util.esc(n.id) + '">' + (n.pinned ? '取消置顶' : '置顶') + '</span>' +
          '<span class="ico-btn" data-act="noteDel" data-id="' + util.esc(n.id) + '">×</span>' +
          '</div></div>';
      }).join('') + '</div>'
      : '<div class="empty-sm">还没有便签，下面写一条试试</div>';
    var input = '<div class="rowflex mt8">' +
      ui.input({ id: 'home-note-input', fk: 'home-note', placeholder: '随手记一条，回车即存' }) +
      ui.btn('记下', { act: 'noteAdd', small: true }) +
      '</div>';
    return homeCard(CARDS[6], rows + input);
  }

  function hiddenBarHTML() {
    var hidden = home.hiddenCards();
    if (!hidden.length) return '';
    return '<div class="hc-hidden-bar">已隐藏 ' + hidden.length + ' 张卡片' +
      '<span class="ico-btn" data-act="showAllCards">恢复显示</span></div>';
  }

  function bodyHTML() {
    var vis = home.visibleCards();
    var byRow = { 1: [], 2: [], 3: [] };
    var builders = {
      todayPlan: planCard, checkin: checkinCard, study: studyCard,
      projects: projectsCard, consultWeek: consultWeekCard, game: gameCard, notes: notesCard
    };
    vis.forEach(function (c) {
      var html = builders[c.id]();
      /* 按卡片 id 找出对应的行，卡片标题可能与常量表不同步，这里以 CARDS 为准 */
      var def = CARDS.filter(function (x) { return x.id === c.id; })[0];
      byRow[def.row].push(html);
    });
    function rowHTML(n, cls) {
      return byRow[n].length ? '<div class="grid ' + cls + '">' + byRow[n].join('') + '</div>' : '';
    }
    return '<div class="page-head"><h2>首页总览</h2><p>今天该关注什么</p></div>' +
      '<div class="stack">' +
      rowHTML(1, 'grid-3') + rowHTML(2, 'grid-2') + rowHTML(3, 'grid-2') +
      '</div>' + hiddenBarHTML();
  }

  /* ---------- 渲染 ---------- */
  var ctxRoot = null;

  function renderAll() {
    if (!ctxRoot) return;
    ctxRoot.innerHTML = bodyHTML();
    bind(ctxRoot);
  }

  function toggleMenu(cardId) {
    var menus = document.querySelectorAll('.home-card .card-menu');
    Array.prototype.slice.call(menus).forEach(function (m) {
      m.classList.toggle('on', m.dataset.menu === cardId && !m.classList.contains('on'));
    });
    state.menuFor = cardId;
  }

  function closeMenus() {
    Array.prototype.slice.call(document.querySelectorAll('.home-card .card-menu')).forEach(function (m) {
      m.classList.remove('on');
    });
    state.menuFor = null;
  }

  function addNoteFromInput() {
    var el = document.getElementById('home-note-input');
    if (!el) return;
    var v = String(el.value || '').trim();
    if (!v) return;
    if (home.addNote(v)) {
      el.value = '';
      renderAll();
      ui.toast('已记下');
    }
  }

  function bind(rootEl) {
    rootEl.onclick = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !rootEl.contains(t)) { closeMenus(); return; }
      var act = t.dataset.act;
      var id = t.dataset.id;

      if (act === 'cardMenu') return toggleMenu(t.dataset.card);
      closeMenus();

      if (act === 'goModule') {
        var pg = t.dataset.page || id;
        if (pg) App.router.go(pg);
        return;
      }
      if (act === 'hideCard') {
        home.hideCard(t.dataset.card);
        renderAll();
        ui.toast('已隐藏该卡片');
        return;
      }
      if (act === 'showAllCards') { home.showAllCards(); renderAll(); return; }
      if (act === 'toggleTask') { home.toggleTask(id); return renderAll(); }
      if (act === 'toggleFitness') {
        var f = A('fitness');
        if (f && f.toggleToday) f.toggleToday(util.today());
        return renderAll();
      }
      if (act === 'noteAdd') return addNoteFromInput();
      if (act === 'noteEdit') {
        var t2 = A('today');
        var n = t2 ? t2.getNote(id) : null;
        ui.inlineEdit(t, n ? n.content : '', function (v) {
          if (String(v).trim()) { home.updateNote(id, String(v).trim()); renderAll(); }
        });
        return;
      }
      if (act === 'notePin') { home.togglePinNote(id); return renderAll(); }
      if (act === 'noteDel') { home.removeNote(id); ui.toast('已删除便签', { undo: true }); return renderAll(); }
      if (act === 'closeReminder') { if (App.closeBackupTip) App.closeBackupTip(); return; }
    };

    rootEl.onkeydown = function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (t && t.id === 'home-note-input') { e.preventDefault(); addNoteFromInput(); }
    };
  }

  App.pages.home = {
    id: 'home',
    title: '首页总览',
    subtitle: '今天该关注什么',

    render: function (rootEl) {
      ctxRoot = rootEl;
      renderAll();
    },

    refresh: function () { renderAll(); },

    primaryAdd: function () {
      var el = document.getElementById('home-note-input');
      if (el) el.focus();
    },

    destroy: function () { closeMenus(); ctxRoot = null; },

    /* 供测试使用 */
    _state: state,
    _bodyHTML: function () { return bodyHTML(); },
    _renderAll: renderAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
