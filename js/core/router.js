/* router.js —— 哈希路由。解析/构造为纯函数，便于测试。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  /* 页面注册表：各模块文件往这里挂自己的页面对象 */
  App.pages = App.pages || {};

  var ROUTES = [
    { id: 'home', page: 'home', path: '/home', title: '首页总览', sub: '今天该关注什么' },
    { id: 'today', page: 'today', path: '/today', title: '今日', sub: '今天的计划、备忘和打卡' },
    { id: 'study', page: 'study', path: '/study', title: '学习计划', sub: '方向、学习项和学习记录' },
    { id: 'dev', page: 'dev', path: '/dev', title: '开发工作', sub: '项目、Bug 与踩坑笔记' },
    { id: 'devProject', page: 'dev', path: '/dev/project/:id', title: '项目看板', sub: '三列拖拽改状态' },
    { id: 'consult', page: 'consult', path: '/consult', title: '咨询工作', sub: '客户、交付与工时' },
    { id: 'consultClient', page: 'consult', path: '/consult/client/:id', title: '客户详情', sub: '项目、交付物与纪要' },
    { id: 'fitness', page: 'fitness', path: '/fitness', title: '健身计划', sub: '每周安排与打卡' },
    { id: 'diet', page: 'diet', path: '/diet', title: '饮食计划', sub: '三餐记录与打卡' },
    { id: 'game', page: 'game', path: '/game', title: '游戏娱乐', sub: '游戏库与时长' },
    { id: 'settings', page: 'settings', path: '/settings', title: '数据与设置', sub: '备份、外观与偏好' }
  ];

  function parseHash(hash) {
    var h = String(hash || '').replace(/^#/, '');
    if (!h) h = '/home';
    var hp = h.split('/');
    for (var i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i];
      var pp = r.path.split('/');
      if (pp.length !== hp.length) continue;
      var param = null, ok = true;
      for (var j = 1; j < pp.length; j++) {
        if (pp[j].charAt(0) === ':') {
          param = decodeURIComponent(hp[j] || '');
        } else if (pp[j] !== hp[j]) { ok = false; break; }
      }
      if (ok) return { page: r.page, routeId: r.id, param: param, title: r.title, sub: r.sub };
    }
    return { page: 'home', routeId: 'home', param: null, title: '首页总览', sub: '今天该关注什么' };
  }

  /* 构造 hash：给了参数且该页存在带参路由时，优先用带参路由 */
  function buildHash(page, param) {
    var exact = null, paramRoute = null;
    for (var i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i];
      if (r.page !== page) continue;
      if (r.path.indexOf(':id') >= 0) {
        if (!paramRoute) paramRoute = r;
      } else if (!exact) {
        exact = r;
      }
    }
    var target = (param && paramRoute) ? paramRoute : (exact || paramRoute);
    if (!target) return '#/home';
    if (target.path.indexOf(':id') >= 0) {
      if (!param) return '#' + (exact ? exact.path : '/home');
      return '#' + target.path.replace(':id', encodeURIComponent(param));
    }
    return '#' + target.path;
  }

  var router = {
    routes: ROUTES,
    current: null,      // { page, routeId, param, title, sub }
    _prevPage: null,

    parseHash: parseHash,
    buildHash: buildHash,

    go: function (page, param) {
      var hash = buildHash(page, param);
      if (typeof root.location === 'undefined') return hash;
      if (root.location.hash === hash) { router.dispatch(); return hash; }
      /* 手动导航：记下这次 hash，同步派发一次，避免等待异步的 hashchange 造成延迟 */
      router._skipHash = hash;
      root.location.hash = hash;
      router.dispatch();
      return hash;
    },

    init: function () {
      if (typeof root.addEventListener === 'function') {
        root.addEventListener('hashchange', function () {
          if (router._skipHash && root.location.hash === router._skipHash) {
            router._skipHash = null;
            return;
          }
          router._skipHash = null;
          router.dispatch();
        });
      }
      router.dispatch();
    },

    dispatch: function (hashArg) {
      var hash = (hashArg !== undefined)
        ? hashArg
        : ((typeof root.location !== 'undefined') ? root.location.hash : '');
      var cur = router.parseHash(hash);
      var prev = router.current;
      if (prev && prev.page !== cur.page) {
        var prevObj = App.pages[prev.page];
        if (prevObj && typeof prevObj.destroy === 'function') {
          try { prevObj.destroy(); } catch (e) {}
        }
      }
      router.current = cur;
      var page = App.pages[cur.page];
      var hostEl = (typeof document !== 'undefined') ? document.getElementById('page-host') : null;
      if (hostEl) {
        if (!page) {
          /* 页面模块缺失时也必须保住外壳，不能整屏空白 */
          hostEl.innerHTML = '<div class="empty"><p>页面模块「' + App.util.esc(cur.page) + '」尚未加载</p></div>';
        } else {
          try { page.render(hostEl, cur.param); }
          catch (e) {
            hostEl.innerHTML = '<div class="empty"><p>页面渲染出错：' + App.util.esc(e.message) + '</p></div>';
            throw e;
          }
        }
      }
      if (App.topbar && App.topbar.render) App.topbar.render();
      if (App.sidebar && App.sidebar.render) App.sidebar.render();
      return cur;
    },

    refreshCurrent: function () {
      if (!router.current) return;
      var page = App.pages[router.current.page];
      if (!page) return;
      if (typeof page.refresh === 'function') page.refresh();
      else if (typeof page.render === 'function') {
        var hostEl = (typeof document !== 'undefined') ? document.getElementById('page-host') : null;
        if (hostEl) page.render(hostEl, router.current.param);
      }
    },

    /* 当前页的标题与说明（顶栏用） */
    meta: function () {
      var cur = router.current || { title: '首页总览', sub: '' };
      return { title: cur.title, sub: cur.sub };
    }
  };

  root.App.router = router;
})(typeof globalThis !== 'undefined' ? globalThis : this);
