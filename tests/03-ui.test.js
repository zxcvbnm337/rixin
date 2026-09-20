'use strict';
/* Step 3 · 通用组件：全部 15 个组件的输出与转义 */
const { test } = require('node:test');
const assert = require('node:assert');
const { createApp, CORE_FILES } = require('./harness');

const ctx = createApp({ files: CORE_FILES });
const App = ctx.App;
const ui = App.ui;
const util = App.util;

test('ui.btn 生成按钮并携带动作与数据属性', () => {
  const html = ui.btn('保存', { act: 'save', id2: 'a1', tone: 'danger', small: true });
  assert.ok(html.includes('data-act="save"'));
  assert.ok(html.includes('data-id="a1"'));
  assert.ok(html.includes('btn-danger'));
  assert.ok(html.includes('btn-sm'));
  assert.ok(html.includes('保存'));
});

test('ui.btn 对文本做转义，防止注入', () => {
  const html = ui.btn('<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<img'), '不应输出未转义的标签');
  assert.ok(html.includes('&lt;img'));
});

test('ui.input 转义 value 与 placeholder', () => {
  const html = ui.input({ value: '" onfocus="alert(1)', placeholder: 'a"b', fk: 'f1' });
  assert.ok(!html.includes('onfocus="alert(1)"'), '不应break出属性');
  assert.ok(html.includes('data-fk="f1"'));
});

test('ui.select 正确标记 selected 项', () => {
  const html = ui.select({
    value: 'b',
    options: [{ value: 'a', label: '甲' }, { value: 'b', label: '乙' }]
  });
  const bOpt = html.split('<option').filter(s => s.includes('value="b"'))[0];
  assert.ok(bOpt.includes('selected'), '应选中 b');
  const aOpt = html.split('<option').filter(s => s.includes('value="a"'))[0];
  assert.ok(!aOpt.includes('selected'), 'a 不应被选中');
});

test('ui.card 带 module 时整卡可点击跳转', () => {
  const html = ui.card('今日计划', '内容', { module: 'today' });
  assert.ok(html.includes('data-act="open"'));
  assert.ok(html.includes('data-module="today"'));
  assert.ok(html.includes('<h3>今日计划</h3>'));
});

test('ui.card 标题传 null 时不渲染头部', () => {
  const html = ui.card(null, '只有内容');
  assert.ok(!html.includes('card-hd'));
  assert.ok(html.includes('只有内容'));
});

test('ui.row 支持完成态与拖拽标记', () => {
  const html = ui.row('左', '右', { done: true, drag: true, id: 'r1' });
  assert.ok(html.includes('class="row done"'));
  assert.ok(html.includes('draggable="true"'));
  assert.ok(html.includes('data-id="r1"'));
});

test('ui.board 渲染三列并显示计数', () => {
  const html = ui.board([
    { id: 'todo', title: '待办', count: 3, cards: ['<div>a</div>'] },
    { id: 'doing', title: '进行中', count: 2, cards: [] },
    { id: 'done', title: '已完成', count: 0, cards: [] }
  ]);
  assert.ok(html.includes('data-col="todo"'));
  assert.ok(html.includes('data-drop="doing"'));
  assert.strictEqual(html.split('board-col').length - 1, 3);
  assert.ok(html.includes('>3<'), '应显示计数 3');
  assert.ok(html.split('board-empty').length - 1 >= 1, '空列要有占位');
});

test('ui.empty 渲染引导文案与操作按钮', () => {
  const html = ui.empty('还没有项目', ui.btn('新建项目', { act: 'new' }));
  assert.ok(html.includes('还没有项目'));
  assert.ok(html.includes('新建项目'));
});

test('ui.tag 支持色调', () => {
  assert.ok(ui.tag('高', 'danger').includes('tone-danger'));
  assert.ok(ui.tag('中').includes('class="tag"'));
});

test('ui.progress 越界值被夹到 0-100', () => {
  assert.ok(ui.progress(150).includes('width:100%'));
  assert.ok(ui.progress(-20).includes('width:0%'));
  assert.ok(ui.progress(62, { showText: true }).includes('62%'));
});

test('ui.check 按状态输出 on 类并带动作', () => {
  const on = ui.check(true, { act: 'toggle', id: 't1' });
  assert.ok(on.includes('ck on'));
  assert.ok(on.includes('data-act="toggle"'));
  const off = ui.check(false, {});
  assert.ok(!off.includes('ck on'));
});

test('ui.bar 条形宽度与数值成比例', () => {
  const html = ui.bar([{ label: 'A', value: 100 }, { label: 'B', value: 50 }]);
  assert.ok(html.includes('width:100%'));
  assert.ok(html.includes('width:50%'));
  assert.ok(html.includes('A'));
});

test('ui.bar 空数据输出占位而不是空白', () => {
  assert.ok(ui.bar([]).includes('empty-sm'));
});

test('ui.bar 支持格式化函数', () => {
  const html = ui.bar([{ label: 'A', value: 90 }], { fmt: util.fmtDuration });
  assert.ok(html.includes('1h30m'));
});

test('ui.heatmap 生成月历格子，含休息日与今日标记', () => {
  const dayMap = {
    '2026-09-01': 2,
    '2026-09-02': 1,
    '2026-09-03': 0,
    '2026-09-04': 'rest'
  };
  const html = ui.heatmap(2026, 9, dayMap, { today: '2026-09-20', firstDay: 1, act: 'hmPick' });
  assert.ok(html.includes('hm-cell lv2'));
  assert.ok(html.includes('hm-cell lv1'));
  assert.ok(html.includes('hm-cell lv0'));
  assert.ok(html.includes('hm-cell rest'));
  assert.ok(html.includes('today'));
  assert.ok(html.includes('data-date="2026-09-20"'));
  assert.strictEqual(html.split('data-date=').length - 1, 30, '9 月应有 30 个真实日期格子');
  assert.ok(html.indexOf('hm-cell empty') >= 0, '首尾补位格应存在');
});

test('ui.heatmap 未提供的日期按 lv0 处理', () => {
  const html = ui.heatmap(2026, 9, {}, { firstDay: 1 });
  assert.ok(html.includes('hm-cell lv0'));
});

test('ui.filterBar 为每个字段输出控件', () => {
  const html = ui.filterBar([
    { key: 'status', label: '状态', type: 'select', value: 'all', options: [{ value: 'all', label: '全部' }] },
    { key: 'kw', label: '搜索', type: 'text', value: '' }
  ]);
  assert.ok(html.includes('data-fk="filter-status"'));
  assert.ok(html.includes('data-fk="filter-kw"'));
  assert.ok(html.includes('filterbar'));
});

test('ui.filterBar 空字段返回空字符串', () => {
  assert.strictEqual(ui.filterBar([]), '');
  assert.strictEqual(ui.filterBar(null), '');
});

test('ui.dateNav 显示中文日期并提供前后按钮', () => {
  const html = ui.dateNav('2026-09-20', { prevAct: 'prevDay', nextAct: 'nextDay' });
  assert.ok(html.includes('9月20日 周日'));
  assert.ok(html.includes('data-act="prevDay"'));
  assert.ok(html.includes('data-act="nextDay"'));
});

test('ui.tabs 标记当前页签', () => {
  const html = ui.tabs([{ id: 'a', label: '方向' }, { id: 'b', label: '学习项' }], 'b');
  const a = html.split('data-tab="a"')[0].split('<span').pop();
  assert.ok(!a.includes('tab on'));
  assert.ok(html.includes('class="tab on" data-act="tab" data-tab="b"'));
});

test('ui.md 支持标题、列表、粗体、行内代码', () => {
  const html = ui.md('# 标题\n- 第一项\n- 第二项\n\n**粗体** 与 `code`');
  assert.ok(html.includes('<h3>标题</h3>'));
  assert.ok(html.includes('<ul>'));
  assert.ok(html.includes('<li>第一项</li>'));
  assert.ok(html.includes('<strong>粗体</strong>'));
  assert.ok(html.includes('<code>code</code>'));
});

test('ui.md 转义 HTML，防止笔记里注入脚本', () => {
  const html = ui.md('<script>alert(1)</script>');
  assert.ok(!html.includes('<script>'), '不应输出可执行脚本');
  assert.ok(html.includes('&lt;script&gt;'));
});

test('ui.md 空内容有占位', () => {
  assert.ok(ui.md('').includes('md-empty'));
  assert.ok(ui.md(null).includes('md-empty'));
});

test('ui.toast 记录日志并支持撤销标记', () => {
  ui.log.length = 0;
  ui.toast('已删除 1 条', { undo: true });
  assert.strictEqual(ui.log.length, 1);
  assert.strictEqual(ui.log[0].type, 'toast');
  assert.strictEqual(ui.log[0].undo, true);
});

test('ui.toast 实际渲染到提示宿主容器', () => {
  ui.log.length = 0;
  ui.toast('保存成功');
  const host = ctx.document.getElementById('toast-host');
  assert.strictEqual(host.querySelectorAll('.toast').length >= 1, true, '应在页面上出现提示');
});

test('ui.confirm 记录待确认项并渲染对话框', () => {
  ui.log.length = 0;
  ui.confirm('确定删除？', () => {});
  assert.strictEqual(ui.log[0].type, 'confirm');
  assert.strictEqual(ui.log[0].msg, '确定删除？');
  const host = ctx.document.getElementById('overlay-host');
  assert.ok(host.querySelector('.modal'), '应出现确认框');
  ui.closeAll();
  assert.strictEqual(host.innerHTML, '');
});

test('ui.drawer 渲染抽屉并可关闭', () => {
  ui.log.length = 0;
  ui.drawer('新增项目', '<p>表单</p>');
  const host = ctx.document.getElementById('overlay-host');
  assert.ok(host.querySelector('.drawer'), '应出现抽屉');
  assert.ok(host.innerHTML.includes('新增项目'));
  ui.closeDrawer();
  assert.strictEqual(host.innerHTML, '');
});

test('ui.field 包装标签与控件', () => {
  const html = ui.field('名称', ui.input({}));
  assert.ok(html.includes('field-lb'));
  assert.ok(html.includes('名称'));
});
