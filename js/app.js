/* app.js —— 启动、侧边栏、顶栏、主题、全局快捷键、全局搜索、备份提醒 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var util = App.util;
  var ui = App.ui;
  var store = App.store;
  var schema = App.schema;
  var router = App.router;

  var NAV = [
    [{ page: 'home', label: '首页总览' }, { page: 'today', label: '今日' }],
    [{ page: 'study', label: '学习计划' }, { page: 'dev', label: '开发工作' }, { page: 'consult', label: '咨询工作' }],
    [{ page: 'fitness', label: '健身计划' }, { page: 'diet', label: '饮食计划' }, { page: 'game', label: '游戏娱乐' }],
    [{ page: 'settings', label: '数据与设置' }]
  ];

  function el(id) { return document.getElementById(id); }

  /* ---------- 侧边栏 ---------- */
  App.sidebar = {
    render: function () {
      var box = el('sidebar');
      if (!box) return;
      var cur = router.current ? router.current.page : 'home';
      var html = '<div class="sb-brand"><span class="sb-dot"></span><span class="sb-name">日新 · Rixin</span></div>';
      NAV.forEach(function (group) {
        html += '<nav class="sb-group">';
        group.forEach(function (it) {
          html += '<div class="nav-item' + (it.page === cur ? ' on' : '') + '" data-act="nav" data-page="' + it.page + '">' +
            '<span class="nav-ico">' + util.esc(it.label.charAt(0)) + '</span>' +
            '<span class="nav-txt">' + util.esc(it.label) + '</span></div>';
        });
        html += '</nav>';
      });
      var u = store.usage();
      html += '<div class="sb-foot"><div class="sb-stat">共 ' + u.count + ' 条数据</div>' +
        '<div class="sb-stat">主题：' + util.esc(schema.LABELS.theme[App.currentThemeName()]) + '</div></div>';
      box.innerHTML = html;
      box.onclick = function (e) {
        var t = e.target.closest('[data-act="nav"]');
        if (!t) return;
        router.go(t.dataset.page);
      };
    }
  };

  /* ---------- 顶栏 ---------- */
  App.topbar = {
    render: function () {
      var box = el('topbar');
      if (!box) return;
      var m = router.meta();
      var s = store.get(schema.KEYS.settings);
      var themeName = App.currentThemeName();
      box.innerHTML =
        '<span class="tb-title">' + util.esc(m.title) + '</span>' +
        '<span class="tb-sub">' + util.esc(m.sub || '') + '</span>' +
        '<span class="tb-spacer"></span>' +
        '<span class="tb-search">' +
        ui.input({ id: 'global-search', fk: 'global-search', placeholder: '搜索任务 / 笔记 / 游戏 / 客户（按 / 聚焦）' }) +
        '<span id="search-pop"></span>' +
        '</span>' +
        ui.select({
          id: 'theme-switch', fk: 'theme-switch', value: s.theme, act: 'theme',
          options: [
            { value: 'auto', label: '主题：跟随时间' },
            { value: 'light', label: '主题：白天' },
            { value: 'dark', label: '主题：晚上' }
          ]
        }) + '<span class="muted">当前 ' + util.esc(schema.LABELS.theme[themeName]) + '</span>';

      var search = el('global-search');
      if (search) {
        search.oninput = function () { App.topbar.showSearch(search.value); };
        search.onkeydown = function (e) { if (e.key === 'Escape') { search.value = ''; App.topbar.showSearch(''); } };
      }
      var sw = el('theme-switch');
      if (sw) {
        sw.onchange = function () {
          var st = store.get(schema.KEYS.settings);
          st.theme = sw.value;
          store.set(schema.KEYS.settings, st);
          App.applyTheme();
          App.topbar.render();
          App.sidebar.render();
        };
      }
    },

    showSearch: function (q) {
      var pop = el('search-pop');
      if (!pop) return;
      q = String(q || '').trim();
      if (!q) { pop.innerHTML = ''; return; }
      var hits = App.search(q).slice(0, 12);
      if (!hits.length) { pop.innerHTML = '<div class="search-item"><span class="muted">没有匹配结果</span></div>'; return; }
      pop.innerHTML = '<div class="search-pop">' + hits.map(function (h, i) {
        return '<div class="search-item" data-act="searchGo" data-page="' + util.esc(h.page) + '" data-param="' + util.esc(h.param || '') + '">' +
          h.title + '<small>' + util.esc(h.module) + (h.sub ? ' · ' + util.esc(h.sub) : '') + '</small></div>';
      }).join('') + '</div>';
      pop.firstChild.onclick = function (e) {
        var t = e.target.closest('[data-act="searchGo"]');
        if (!t) return;
        router.go(t.dataset.page, t.dataset.param || null);
        pop.innerHTML = '';
        var s = el('global-search'); if (s) s.value = '';
      };
    }
  };

  /* ---------- 全局搜索 ---------- */
  App.search = function (q) {
    var K = schema.KEYS;
    var kw = String(q || '').toLowerCase();
    var out = [];
    function hit(text) { return String(text || '').toLowerCase().indexOf(kw) >= 0; }
    function push(page, module, title, sub, param) {
      out.push({ page: page, module: module, title: util.esc(title), sub: sub, param: param || null });
    }

    store.get(K.tasks).forEach(function (t) { if (hit(t.title)) push('today', '今日计划', t.title, t.date); });
    store.get(K.notes).forEach(function (n) { if (hit(n.content)) push('today', '快速备忘', n.content.slice(0, 40), ''); });
    store.get(K.studyDirections).forEach(function (d) { if (hit(d.name) || hit(d.goal)) push('study', '学习方向', d.name, d.goal); });
    store.get(K.studyItems).forEach(function (i) { if (hit(i.name)) push('study', '学习项', i.name, i.progress + '%'); });
    store.get(K.studyLogs).forEach(function (l) { if (hit(l.note)) push('study', '学习笔记', l.note.slice(0, 40), l.date); });
    store.get(K.devProjects).forEach(function (p) { if (hit(p.name) || hit(p.desc)) push('dev', '开发项目', p.name, (p.stack || []).join(' ')); });
    store.get(K.devTasks).forEach(function (t) { if (hit(t.title) || hit(t.desc)) push('dev', '开发任务', t.title, schema.LABELS.taskStatus[t.status]); });
    store.get(K.devBugs).forEach(function (b) { if (hit(b.title) || hit(b.steps)) push('dev', 'Bug', b.title, schema.LABELS.bugStatus[b.status]); });
    store.get(K.devNotes).forEach(function (n) { if (hit(n.title) || hit(n.body)) push('dev', '踩坑笔记', n.title, (n.tags || []).join(' ')); });
    store.get(K.consultClients).forEach(function (c) { if (hit(c.name) || hit(c.contact)) push('consult', '客户', c.name, c.contact || ''); });
    store.get(K.consultProjects).forEach(function (p) { if (hit(p.name)) push('consult', '咨询项目', p.name, p.stage || ''); });
    store.get(K.consultMeetings).forEach(function (m) { if (hit(m.points) || hit(m.followUp)) push('consult', '沟通纪要', (m.points || '').slice(0, 30), m.date); });
    store.get(K.consultWorklogs).forEach(function (w) { if (hit(w.content)) push('consult', '工时记录', (w.content || '').slice(0, 30), w.date); });
    store.get(K.gameGames).forEach(function (g) { if (hit(g.name) || hit(g.thought)) push('game', '游戏', g.name, schema.LABELS.gameStatus[g.status]); });
    store.get(K.dietFavorites).forEach(function (f) { if (hit(f.content)) push('diet', '常用饮食', f.content, ''); });
    return out;
  };

  /* ---------- 主题 ---------- */
  App.currentThemeName = function () {
    var s = store.get(schema.KEYS.settings);
    if (s.theme !== 'auto') return s.theme;
    var now = util.hhmm();
    return (now >= s.dayStart && now < s.dayEnd) ? 'light' : 'dark';
  };

  App.applyTheme = function () {
    var name = App.currentThemeName();
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.theme = name;
    }
    return name;
  };

  /* ---------- 备份提醒（E6） ---------- */
  App.shouldRemindBackup = function (now) {
    now = now || Date.now();
    var meta = store.get(schema.KEYS.meta);
    var s = store.get(schema.KEYS.settings);
    var days = Number(s.backupRemindDays) || 7;
    var base = meta.lastBackupAt || meta.createdAt || now;
    if (now - base < days * 86400000) return false;
    if (meta.backupTipClosedAt === util.fmtDate(new Date(now))) return false;
    return true;
  };

  App.closeBackupTip = function () {
    var meta = store.get(schema.KEYS.meta);
    meta.backupTipClosedAt = util.today();
    store.set(schema.KEYS.meta, meta);
    App.renderReminder();
  };

  App.renderReminder = function () {
    var host = typeof document !== 'undefined' ? el('reminder-host') : null;
    if (!host) return;
    if (!App.shouldRemindBackup()) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="reminder"><span>已经有一阵子没备份了，建议现在导出一次数据文件。</span>' +
      ui.btn('去导出', { act: 'goSettings', small: true }) +
      '<span class="rm-close" data-act="closeReminder">关闭</span></div>';
    host.onclick = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) return;
      if (t.dataset.act === 'closeReminder') App.closeBackupTip();
      if (t.dataset.act === 'goSettings') router.go('settings');
    };
  };

  /* ---------- 全局快捷键 ---------- */
  function bindGlobalKeys() {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', function (e) {
      var target = e.target;
      var tag = (target && target.tagName) ? String(target.tagName).toLowerCase() : '';
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (e.key === 'Escape') { ui.closeAll(); App.topbar.showSearch(''); return; }
      if (typing) return;
      if (e.key === '/') {
        e.preventDefault();
        var s = el('global-search');
        if (s) s.focus();
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        var page = App.pages[router.current ? router.current.page : 'home'];
        if (page && typeof page.primaryAdd === 'function') {
          e.preventDefault();
          page.primaryAdd();
        }
        return;
      }
      if (e.ctrlKey && !e.altKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        var flat = [];
        NAV.forEach(function (g) { g.forEach(function (it) { flat.push(it); }); });
        var target = flat[Number(e.key) - 1];
        if (target) { e.preventDefault(); router.go(target.page); }
      }
    });
  }

  /* ---------- 启动 ---------- */
  App.start = async function () {
    await store.init();
    store.onError = function (msg) { ui.toast(msg); };
    App.applyTheme();
    bindGlobalKeys();
    /* 偏好：打开默认进哪一页。仅在地址栏还没带 hash 时生效，不影响手动跳转与刷新。 */
    try {
      if (root.location && !root.location.hash) {
        var pref = store.get(schema.KEYS.settings).defaultPage;
        var target = router.buildHash(pref || 'home');
        if (target && target !== '#/home') root.location.hash = target;
      }
    } catch (e) {}
    router.init();
    App.renderReminder();
    if (typeof setInterval === 'function') {
      App._themeTimer = setInterval(function () {
        var before = document.documentElement.dataset.theme;
        var after = App.applyTheme();
        if (before !== after) { App.topbar.render(); App.sidebar.render(); }
      }, 60000);
    }
    return App;
  };

  /* 停止后台定时器（页面关闭或测试环境清理时调用） */
  App.stop = function () {
    if (App._themeTimer) {
      clearInterval(App._themeTimer);
      App._themeTimer = null;
    }
  };

  if (typeof root.addEventListener === 'function' && !root.__PM_NO_AUTOSTART__) {
    root.addEventListener('DOMContentLoaded', function () { App.start(); });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
