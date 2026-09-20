'use strict';
/* Step 1 · 路由：解析、构造、跳转与页面生命周期 */
const { test } = require('node:test');
const assert = require('node:assert');
const { createApp, CORE_FILES } = require('./harness');

const ctx = createApp({ files: CORE_FILES });
const App = ctx.App;
const router = App.router;

test('router：路由表覆盖 PRD 章节 2.3 的全部 11 条路由', () => {
  const paths = router.routes.map(r => r.path);
  [
    '/home', '/today', '/study', '/dev', '/dev/project/:id', '/consult',
    '/consult/client/:id', '/fitness', '/diet', '/game', '/settings'
  ].forEach(p => assert.ok(paths.includes(p), '缺少路由 ' + p));
  assert.strictEqual(router.routes.length, 11);
});

test('router：侧边栏共 9 个导航入口（导航项 = 页面数）', () => {
  const navPages = router.routes.filter(r => r.path.indexOf(':id') < 0).map(r => r.page);
  const uniq = Array.from(new Set(navPages));
  assert.strictEqual(uniq.length, 9, '首页总览 + 8 个模块 = 9 个页面');
});

test('router.parseHash 解析各条路由', () => {
  assert.strictEqual(router.parseHash('#/home').page, 'home');
  assert.strictEqual(router.parseHash('#/today').page, 'today');
  assert.strictEqual(router.parseHash('#/study').page, 'study');
  assert.strictEqual(router.parseHash('#/dev').page, 'dev');
  assert.strictEqual(router.parseHash('#/consult').page, 'consult');
  assert.strictEqual(router.parseHash('#/fitness').page, 'fitness');
  assert.strictEqual(router.parseHash('#/diet').page, 'diet');
  assert.strictEqual(router.parseHash('#/game').page, 'game');
  assert.strictEqual(router.parseHash('#/settings').page, 'settings');
});

test('router.parseHash 提取二级路由参数', () => {
  const a = router.parseHash('#/dev/project/p_123');
  assert.strictEqual(a.page, 'dev');
  assert.strictEqual(a.param, 'p_123');
  const b = router.parseHash('#/consult/client/c_9');
  assert.strictEqual(b.page, 'consult');
  assert.strictEqual(b.param, 'c_9');
});

test('router.parseHash 对 URL 编码的参数解码', () => {
  const r = router.parseHash('#/dev/project/' + encodeURIComponent('项目 A'));
  assert.strictEqual(r.param, '项目 A');
});

test('router.parseHash 空值或非法值回落到首页', () => {
  assert.strictEqual(router.parseHash('').page, 'home');
  assert.strictEqual(router.parseHash('#').page, 'home');
  assert.strictEqual(router.parseHash('#/不存在的页面').page, 'home');
});

test('router.buildHash 与 parseHash 双向一致', () => {
  ['home', 'today', 'study', 'dev', 'consult', 'fitness', 'diet', 'game', 'settings'].forEach(p => {
    const hash = router.buildHash(p);
    assert.strictEqual(router.parseHash(hash).page, p, p + ' 往返应一致');
  });
});

test('router.buildHash 对二级路由拼接参数', () => {
  assert.strictEqual(router.buildHash('dev', 'p1'), '#/dev/project/p1');
  assert.strictEqual(router.buildHash('consult', 'c1'), '#/consult/client/c1');
});

test('router.buildHash 二级路由缺少参数时回落到一级页面', () => {
  assert.strictEqual(router.buildHash('dev'), '#/dev');
});

test('router.meta 返回标题与说明供顶栏使用', () => {
  router.current = router.parseHash('#/study');
  const m = router.meta();
  assert.strictEqual(m.title, '学习计划');
  assert.ok(m.sub && m.sub.length > 0);
});

test('router.dispatch 渲染当前页，并在页面出错时给出可见提示', () => {
  const host = ctx.document.getElementById('page-host');
  const orig = router.parseHash;

  App.pages.__ok = {
    id: '__ok',
    render(root) { root.innerHTML = '<div id="probe-ok">ok</div>'; }
  };
  router.parseHash = () => ({ page: '__ok', routeId: '__ok', param: null, title: '探针', sub: '' });
  router.current = null;
  router.dispatch();
  assert.ok(host.querySelector('#probe-ok'), '正常页面应被渲染');

  App.pages.__boom = {
    id: '__boom',
    render() { throw new Error('故意失败'); }
  };
  router.parseHash = () => ({ page: '__boom', routeId: '__boom', param: null, title: 'x', sub: '' });
  router.current = { page: '__ok', routeId: '__ok', param: null, title: '', sub: '' };
  assert.throws(() => router.dispatch(), /故意失败/);
  assert.ok(host.innerHTML.includes('页面渲染出错'), '出错时应有可见提示而不是白屏');

  router.parseHash = orig;
});

test('router.dispatch 切换页面时调用上一页的 destroy，并更新 current', () => {
  let destroyed = 0;
  App.pages.__a = { id: '__a', render() {}, destroy() { destroyed++; } };
  App.pages.__b = { id: '__b', render() {} };
  const orig = router.parseHash;

  router.current = { page: '__a', routeId: '__a', param: null, title: '', sub: '' };
  router.parseHash = () => ({ page: '__b', routeId: '__b', param: null, title: 'B', sub: '' });
  router.dispatch();
  router.parseHash = orig;

  assert.strictEqual(destroyed, 1, '离开页面应触发 destroy');
  assert.strictEqual(router.current.page, '__b', 'current 应更新为新页面');
});

test('router.dispatch 同页面内切换参数不触发 destroy', () => {
  let destroyed = 0;
  App.pages.__same = { id: '__same', render() {}, destroy() { destroyed++; } };
  const orig = router.parseHash;
  router.current = { page: '__same', routeId: '__same', param: 'p1', title: '', sub: '' };
  router.parseHash = () => ({ page: '__same', routeId: '__same', param: 'p2', title: '', sub: '' });
  router.dispatch();
  router.parseHash = orig;
  assert.strictEqual(destroyed, 0, '同一页面换参数不应销毁页面');
  assert.strictEqual(router.current.param, 'p2');
});

test('router.refreshCurrent 调用当前页 refresh', () => {
  let n = 0;
  App.pages.__c = { id: '__c', render() {}, refresh() { n++; } };
  router.current = { page: '__c', routeId: '__c', param: null, title: '', sub: '' };
  router.refreshCurrent();
  assert.strictEqual(n, 1);
});

test('router.refreshCurrent 对没有 refresh 的页面回退到 render', () => {
  let rendered = 0;
  App.pages.__d = { id: '__d', render() { rendered++; } };
  router.current = { page: '__d', routeId: '__d', param: null, title: '', sub: '' };
  router.refreshCurrent();
  assert.strictEqual(rendered, 1);
});
