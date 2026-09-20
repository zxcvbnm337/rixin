'use strict';
/* Step 7 · 开发工作：项目列表、看板拖拽、任务、Bug 与转任务、踩坑笔记与搜索。
   对应 PRD 验收：D3（看板拖拽 + 自动盖完成时间）、D4（Bug 转任务）。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot, APP_FILES, ROOT, plain } = require('./harness');

async function startDev(seed) {
  const ctx = await boot({ files: APP_FILES, seed: seed });
  await ctx.App.start();
  ctx.App.router.go('dev');
  return ctx;
}
function fire(win, el, type) {
  el.dispatchEvent(new win.Event(type, { bubbles: true, cancelable: true }));
}
function d(ctx) { return ctx.App.actions.dev; }

/* ---------- 结构 ---------- */

test('开发工作：三个页签，默认停在项目', async () => {
  const ctx = await startDev();
  const tabs = Array.prototype.slice.call(ctx.document.querySelectorAll('#dev-tabs .tab')).map(t => t.textContent);
  assert.deepStrictEqual(plain(tabs), ['项目', 'Bug 记录', '踩坑笔记']);
  assert.ok(ctx.document.querySelector('#dev-tabs .tab.on').textContent.indexOf('项目') >= 0);
});

test('开发工作：点页签切换内容区', async () => {
  const ctx = await startDev();
  ctx.document.querySelector('[data-act="tab"][data-tab="bugs"]').click();
  assert.strictEqual(ctx.App.pages.dev._state.tab, 'bugs');
  assert.ok(ctx.document.querySelector('.filterbar'), 'Bug 页签应有筛选条');
  ctx.document.querySelector('[data-act="tab"][data-tab="notes"]').click();
  assert.strictEqual(ctx.App.pages.dev._state.tab, 'notes');
  assert.ok(ctx.document.getElementById('dev-body').textContent.indexOf('新增笔记') >= 0);
});

test('D10：三个页签在无数据时都有引导', async () => {
  const ctx = await startDev();
  let body = ctx.document.getElementById('dev-body');
  assert.ok(body.querySelector('.empty'));
  assert.ok(body.textContent.indexOf('新建项目') >= 0);

  ctx.document.querySelector('[data-act="tab"][data-tab="bugs"]').click();
  body = ctx.document.getElementById('dev-body');
  assert.ok(body.querySelector('.empty'));
  assert.ok(body.textContent.indexOf('新建 Bug') >= 0);

  ctx.document.querySelector('[data-act="tab"][data-tab="notes"]').click();
  body = ctx.document.getElementById('dev-body');
  assert.ok(body.querySelector('.empty'));
});

/* ---------- 项目 ---------- */

test('项目：新增（技术栈去重）/ 编辑 / 状态流转 / 名称必填', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  assert.strictEqual(dev.addProject({ name: '  ' }), null);

  const p = dev.addProject({ name: '个人工作台', desc: '自用 App', stack: 'Vue, Node  Vue, MySQL' });
  assert.deepStrictEqual(plain(p.stack), ['Vue', 'Node', 'MySQL'], '技术栈应去重');
  assert.strictEqual(p.status, 'doing');

  dev.updateProject(p.id, { desc: '改成别的描述', stack: ['Go'] });
  assert.strictEqual(dev.getProject(p.id).desc, '改成别的描述');
  assert.deepStrictEqual(plain(dev.getProject(p.id).stack), ['Go']);

  dev.setProjectStatus(p.id, 'done');
  assert.strictEqual(dev.getProject(p.id).status, 'done');
  assert.strictEqual(dev.setProjectStatus(p.id, '乱写'), null);
});

test('项目：删除时级联清掉它的任务与 Bug', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const p = dev.addProject({ name: '待删项目' });
  dev.addTask({ projectId: p.id, title: '任务一' });
  dev.addBug({ projectId: p.id, title: 'Bug 一' });
  assert.strictEqual(dev.tasks().length, 1);
  assert.strictEqual(dev.bugs().length, 1);

  assert.strictEqual(dev.removeProject(p.id), true);
  assert.strictEqual(dev.projects().length, 0);
  assert.strictEqual(dev.tasks().length, 0, '任务应被连带删除');
  assert.strictEqual(dev.bugs().length, 0, 'Bug 应被连带删除');
  assert.strictEqual(dev.removeProject('不存在'), false);
});

test('项目：卡片显示任务完成比与最近更新时间', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const p = dev.addProject({ name: '进度项目' });
  dev.addTask({ projectId: p.id, title: 'A', status: 'done' });
  dev.addTask({ projectId: p.id, title: 'B' });
  dev.addTask({ projectId: p.id, title: 'C' });
  const s = dev.projectStats(p.id);
  assert.strictEqual(s.taskCount, 3);
  assert.strictEqual(s.doneCount, 1);
  assert.strictEqual(s.ratio, 33, '完成比应取整为 33%');

  ctx.App.pages.dev._renderAll();
  const card = ctx.document.querySelector('.grid .card');
  assert.ok(card.textContent.indexOf('任务 1 / 3 完成') >= 0);
  assert.ok(card.textContent.indexOf('最近更新') >= 0);
});

/* ---------- 任务 & D3 看板 ---------- */

test('任务：新增默认值、优先级校验、标签解析', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  assert.strictEqual(dev.addTask({ title: '  ' }), null);
  const t = dev.addTask({ title: '接登录接口', tags: '登录, 后端  登录' });
  assert.strictEqual(t.status, 'todo');
  assert.strictEqual(t.priority, 'mid');
  assert.strictEqual(t.doneAt, null);
  assert.deepStrictEqual(plain(t.tags), ['登录', '后端']);
  assert.strictEqual(dev.addTask({ title: 'x', status: 'done' }).doneAt > 0, true, '直接建成已完成应盖时间');
});

test('D3：拖任务到「已完成」列 → 状态变更且自动盖完成时间', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const p = dev.addProject({ name: '看板项目' });
  const t = dev.addTask({ projectId: p.id, title: '拖我' });
  ctx.App.router.go('dev', p.id);
  assert.ok(ctx.document.querySelector('.board'), '应渲染看板');
  assert.strictEqual(ctx.document.querySelectorAll('[data-col="todo"] .board-card').length, 1);

  const card = ctx.document.querySelector('.board-card[data-id="' + t.id + '"]');
  assert.ok(card, '应能找到任务卡');
  fire(ctx.window, card, 'dragstart');
  const doneCol = ctx.document.querySelector('[data-drop="done"]');
  fire(ctx.window, doneCol, 'dragover');
  fire(ctx.window, doneCol, 'drop');

  const after = dev.getTask(t.id);
  assert.strictEqual(after.status, 'done', '状态应改成已完成');
  assert.ok(after.doneAt, '应自动盖完成时间');
  assert.strictEqual(ctx.document.querySelectorAll('[data-col="done"] .board-card').length, 1,
    '卡片应出现在已完成列');
  assert.strictEqual(ctx.document.querySelectorAll('[data-col="todo"] .board-card').length, 0,
    '待办列应不再有它');
});

test('D3：三列列头计数随状态变化', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const p = dev.addProject({ name: '计数项目' });
  dev.addTask({ projectId: p.id, title: 'A' });
  dev.addTask({ projectId: p.id, title: 'B' });
  dev.addTask({ projectId: p.id, title: 'C', status: 'doing' });
  ctx.App.router.go('dev', p.id);
  const cnt = sel => ctx.document.querySelector(sel + ' .board-hd .cnt').textContent;
  assert.strictEqual(cnt('[data-col="todo"]'), '2');
  assert.strictEqual(cnt('[data-col="doing"]'), '1');
  assert.strictEqual(cnt('[data-col="done"]'), '0');

  const t = dev.tasks({ status: 'todo' })[0];
  dev.setTaskStatus(t.id, 'done');
  ctx.App.pages.dev._renderAll();
  assert.strictEqual(cnt('[data-col="todo"]'), '1');
  assert.strictEqual(cnt('[data-col="done"]'), '1');
});

test('D3：setTaskStatus 从已完成退回应清掉完成时间', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const t = dev.addTask({ title: '来回拖' });
  dev.setTaskStatus(t.id, 'done');
  assert.ok(dev.getTask(t.id).doneAt);
  dev.setTaskStatus(t.id, 'doing');
  assert.strictEqual(dev.getTask(t.id).status, 'doing');
  assert.strictEqual(dev.getTask(t.id).doneAt, null, '回到进行中应清掉完成时间');
  assert.strictEqual(dev.setTaskStatus(t.id, '乱写'), null);
});

test('D3：board() 按状态正确分组', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const p = dev.addProject({ name: '分组项目' });
  dev.addTask({ projectId: p.id, title: 't1' });
  dev.addTask({ projectId: p.id, title: 't2', status: 'doing' });
  dev.addTask({ projectId: p.id, title: 't3', status: 'done' });
  const b = dev.board(p.id);
  assert.deepStrictEqual(plain([b.todo.length, b.doing.length, b.done.length]), [1, 1, 1]);
  assert.strictEqual(b.todo[0].title, 't1');
  assert.strictEqual(b.done[0].title, 't3');
});

test('任务：删除', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const t = dev.addTask({ title: '要删的' });
  assert.strictEqual(dev.removeTask(t.id), true);
  assert.strictEqual(dev.tasks().length, 0);
  assert.strictEqual(dev.removeTask('不存在'), false);
});

/* ---------- Bug & D4 ---------- */

test('Bug：新增 / 编辑 / 状态流转 / 删除', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  assert.strictEqual(dev.addBug({ title: '  ' }), null);
  const b = dev.addBug({ title: '点保存没反应', level: 'high', steps: '1. 点保存' });
  assert.strictEqual(b.status, 'open');
  assert.strictEqual(b.level, 'high');

  dev.updateBug(b.id, { solution: '改成异步提交' });
  assert.strictEqual(dev.getBug(b.id).solution, '改成异步提交');
  dev.setBugStatus(b.id, 'fixing');
  assert.strictEqual(dev.getBug(b.id).status, 'fixing');
  assert.strictEqual(dev.setBugStatus(b.id, '乱写'), null);
  assert.strictEqual(dev.removeBug(b.id), true);
  assert.strictEqual(dev.bugs().length, 0);
});

test('D4：Bug 转成任务 —— 待办列多一张卡，Bug 变已解决', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const p = dev.addProject({ name: 'Bug 项目' });
  const b = dev.addBug({ projectId: p.id, title: '内存泄漏', level: 'high', steps: '跑 10 分钟就涨' });
  assert.strictEqual(dev.tasks().length, 0);

  const r = dev.bugToTask(b.id);
  assert.ok(r && r.task, '应返回新任务');
  assert.strictEqual(r.task.projectId, p.id, '任务应落到同一个项目');
  assert.strictEqual(r.task.status, 'todo', '应进待办列');
  assert.strictEqual(r.task.priority, 'high', '优先级应继承 Bug 级别');
  assert.strictEqual(r.task.title, '内存泄漏');
  assert.strictEqual(dev.getBug(b.id).status, 'resolved', 'Bug 应变成已解决');

  ctx.App.router.go('dev', p.id);
  assert.strictEqual(ctx.document.querySelectorAll('[data-col="todo"] .board-card').length, 1,
    '看板待办列应多一张卡');
  assert.strictEqual(dev.bugToTask('不存在'), null);
});

test('D4：Bug 列表里点「转成任务」按钮走通（DOM）', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const p = dev.addProject({ name: 'P' });
  const b = dev.addBug({ projectId: p.id, title: '按钮点不动' });
  ctx.document.querySelector('[data-act="tab"][data-tab="bugs"]').click();
  ctx.document.querySelector('[data-act="bugToTask"][data-id="' + b.id + '"]').click();
  assert.strictEqual(dev.tasks().length, 1);
  assert.strictEqual(dev.getBug(b.id).status, 'resolved');
  assert.ok(ctx.document.querySelector('.tbl tbody').textContent.indexOf('已解决') >= 0);
});

test('Bug：按项目 / 状态 / 级别 / 关键词筛选', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const p1 = dev.addProject({ name: 'P1' });
  const p2 = dev.addProject({ name: 'P2' });
  dev.addBug({ projectId: p1.id, title: '登录超时', level: 'high' });
  dev.addBug({ projectId: p2.id, title: '样式错位', level: 'low' });
  assert.strictEqual(dev.bugs({ projectId: p1.id }).length, 1);
  assert.strictEqual(dev.bugs({ level: 'low' }).length, 1);
  assert.strictEqual(dev.bugs({ q: '登录' }).length, 1);
  assert.strictEqual(dev.bugs({ status: 'open' }).length, 2);
});

/* ---------- 踩坑笔记 ---------- */

test('踩坑笔记：新增 / 编辑 / 删除 / 标签汇总', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  assert.strictEqual(dev.addNote({ title: '  ' }), null);
  const n = dev.addNote({ title: 'Vite 别名不生效', body: '## 原因\n- 忘了配 resolve', tags: 'Vite, 构建' });
  assert.deepStrictEqual(plain(n.tags), ['Vite', '构建']);
  assert.deepStrictEqual(plain(dev.allTags().sort()), ['Vite', '构建'].sort());

  dev.updateNote(n.id, { body: '改了正文', tags: 'Vite' });
  assert.strictEqual(dev.getNote(n.id).body, '改了正文');
  assert.deepStrictEqual(plain(dev.getNote(n.id).tags), ['Vite']);

  assert.strictEqual(dev.removeNote(n.id), true);
  assert.strictEqual(dev.notes().length, 0);
  assert.strictEqual(dev.removeNote('不存在'), false);
});

test('踩坑笔记：全文搜索覆盖标题与正文，标签筛选生效', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  dev.addNote({ title: 'Vite 别名', body: 'resolve.alias', tags: 'Vite' });
  dev.addNote({ title: 'MySQL 索引', body: '最左前缀', tags: 'DB' });
  assert.strictEqual(dev.notes({ q: 'vite' }).length, 1, '忽略大小写，命中标题');
  assert.strictEqual(dev.notes({ q: '最左' }).length, 1, '命中正文');
  assert.strictEqual(dev.notes({ q: '不存在xyz' }).length, 0);
  assert.strictEqual(dev.notes({ tag: 'DB' }).length, 1);
  assert.strictEqual(dev.notes({ tag: 'Vite' })[0].title, 'Vite 别名');
});

test('踩坑笔记：左列表 + 右正文，正文按极简 Markdown 渲染', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  dev.addNote({ title: 'Markdown 测试', body: '## 原因\n- 第一条\n- 第二条\n**加粗** 和 `code`', tags: 'x' });
  ctx.document.querySelector('[data-act="tab"][data-tab="notes"]').click();
  assert.ok(ctx.document.querySelector('.note-pane'), '应有两栏');
  assert.strictEqual(ctx.document.querySelectorAll('.note-list-item').length, 1);

  const right = ctx.document.querySelector('.note-pane .card:nth-child(2)');
  assert.ok(right.querySelector('.md h4'), '## 应渲染成 h4');
  assert.strictEqual(right.querySelectorAll('.md li').length, 2, '应有两个列表项');
  assert.ok(right.querySelector('.md strong'), '应渲染粗体');
  assert.ok(right.querySelector('.md code'), '应渲染行内代码');
});

test('踩坑笔记：点左列表切换右侧正文', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const a = dev.addNote({ title: '笔记甲', body: '甲的正文' });
  const b = dev.addNote({ title: '笔记乙', body: '乙的正文' });
  ctx.document.querySelector('[data-act="tab"][data-tab="notes"]').click();
  ctx.document.querySelector('[data-act="pickNote"][data-id="' + a.id + '"]').click();
  let right = ctx.document.querySelector('.note-pane .card:nth-child(2)');
  assert.ok(right.textContent.indexOf('甲的正文') >= 0);
  ctx.document.querySelector('[data-act="pickNote"][data-id="' + b.id + '"]').click();
  right = ctx.document.querySelector('.note-pane .card:nth-child(2)');
  assert.ok(right.textContent.indexOf('乙的正文') >= 0);
  assert.ok(ctx.document.querySelector('[data-act="pickNote"][data-id="' + b.id + '"]').classList.contains('on'),
    '选中的条目应高亮');
});

test('踩坑笔记：标签点选筛选 + 搜索框边打边筛且不失焦', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  dev.addNote({ title: 'Vite 别名', body: 'a', tags: 'Vite' });
  dev.addNote({ title: 'MySQL 索引', body: 'b', tags: 'DB' });
  ctx.document.querySelector('[data-act="tab"][data-tab="notes"]').click();

  ctx.document.querySelector('[data-act="tagPick"][data-tag="DB"]').click();
  assert.strictEqual(ctx.App.pages.dev._state.noteFilter.tag, 'DB');
  assert.strictEqual(ctx.document.querySelectorAll('.note-list-item').length, 1);
  assert.ok(ctx.document.querySelector('.note-list-item').textContent.indexOf('MySQL 索引') >= 0);

  ctx.document.querySelector('[data-act="tagPick"][data-tag=""]').click();
  assert.strictEqual(ctx.document.querySelectorAll('.note-list-item').length, 2);

  const inp = ctx.document.querySelector('[data-act="filter"][data-fk="filter-q"]');
  const before = inp;
  inp.value = 'vite';
  fire(ctx.window, inp, 'input');
  assert.strictEqual(ctx.document.querySelectorAll('.note-list-item').length, 1, '搜索应生效');
  assert.strictEqual(ctx.document.querySelector('[data-act="filter"][data-fk="filter-q"]'), before,
    '搜索框不应被重建');
});

/* ---------- 路由 ---------- */

test('路由：#/dev/project/:id 进入看板，返回列表', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const p = dev.addProject({ name: '路由项目' });
  ctx.App.router.go('dev', p.id);
  assert.strictEqual(ctx.window.location.hash, '#/dev/project/' + p.id);
  assert.strictEqual(ctx.App.pages.dev._state.projectId, p.id);
  assert.ok(ctx.document.querySelector('.board'), '应进入看板视图');
  assert.ok(ctx.document.querySelector('.page-head h2').textContent.indexOf('路由项目') >= 0);

  ctx.document.querySelector('[data-act="backToList"]').click();
  assert.strictEqual(ctx.App.pages.dev._state.projectId, null);
  assert.ok(ctx.document.getElementById('dev-tabs'), '应回到列表视图');
});

test('路由：项目不存在时看板给出兜底，不报错', async () => {
  const ctx = await startDev();
  ctx.App.router.go('dev', '不存在的项目');
  assert.ok(ctx.document.querySelector('.empty'), '应显示兜底空状态');
  assert.ok(ctx.document.getElementById('page-host').textContent.indexOf('找不到') >= 0);
});

/* ---------- 表单 / 落库 / 静态 ---------- */

test('DOM：抽屉表单新建项目', async () => {
  const ctx = await startDev();
  ctx.document.querySelector('[data-act="newProject"]').click();
  ctx.document.querySelector('#overlay-host [data-fk="name"]').value = '新项目';
  ctx.document.querySelector('#overlay-host [data-fk="stack"]').value = 'Vue, Node';
  ctx.document.querySelector('#overlay-host [data-act="formSave"]').click();
  assert.strictEqual(d(ctx).projects().length, 1);
  assert.deepStrictEqual(plain(d(ctx).projects()[0].stack), ['Vue', 'Node']);
  assert.strictEqual(ctx.document.getElementById('overlay-host').innerHTML, '');
});

test('DOM：看板里「＋ 新增任务」把任务加到当前项目', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const p = dev.addProject({ name: 'P' });
  ctx.App.router.go('dev', p.id);
  ctx.document.querySelector('[data-act="newTask"]').click();
  ctx.document.querySelector('#overlay-host [data-fk="title"]').value = '新任务';
  ctx.document.querySelector('#overlay-host [data-act="formSave"]').click();
  assert.strictEqual(dev.tasks().length, 1);
  assert.strictEqual(dev.tasks()[0].projectId, p.id, '应归到当前项目');
  assert.strictEqual(ctx.document.querySelectorAll('[data-col="todo"] .board-card').length, 1);
});

test('落库：开发数据写进存储层，导出备份里能看到（C4）', async () => {
  const ctx = await startDev();
  const dev = d(ctx);
  const K = ctx.App.schema.KEYS;
  const p = dev.addProject({ name: '持久化' });
  dev.addTask({ projectId: p.id, title: 'T' });
  dev.addBug({ projectId: p.id, title: 'B' });
  dev.addNote({ title: 'N', body: 'b' });

  assert.strictEqual(ctx.App.store.get(K.devProjects).length, 1);
  assert.strictEqual(ctx.App.store.get(K.devTasks).length, 1);
  assert.strictEqual(ctx.App.store.get(K.devBugs).length, 1);
  assert.strictEqual(ctx.App.store.get(K.devNotes).length, 1);
  const dump = ctx.App.store.exportJSON();
  assert.strictEqual(dump.data[K.devProjects][0].name, '持久化');
});

test('开发工作：模块文件已接入 index.html，样式类齐备', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/modules/dev.js') >= 0, 'index.html 应加载 dev.js');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ['.board', '.board-card', '.bc-title', '.note-pane', '.note-list-item', '.tag-pick', '.md'].forEach(cls => {
    assert.ok(css.indexOf(cls) >= 0, '缺少样式 ' + cls);
  });
});
