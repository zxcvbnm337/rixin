'use strict';
/* Step 8 · 咨询工作：客户 / 项目 / 交付物 / 沟通纪要 / 工时 / 计时器 / 四维汇总。
   对应 PRD 验收：D5（计时 60 秒生成约 1 分钟记录）、D6（四组工时汇总）。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot, APP_FILES, ROOT, plain } = require('./harness');

async function startConsult(seed) {
  const ctx = await boot({ files: APP_FILES, seed: seed });
  await ctx.App.start();
  ctx.App.router.go('consult');
  return ctx;
}
function c(ctx) { return ctx.App.actions.consult; }
function fire(win, el, type) {
  el.dispatchEvent(new win.Event(type, { bubbles: true, cancelable: true }));
}

/* ---------- 结构 ---------- */

test('咨询工作：两个页签（客户 / 工时），默认停在客户', async () => {
  const ctx = await startConsult();
  const tabs = Array.prototype.slice.call(ctx.document.querySelectorAll('#consult-tabs .tab')).map(t => t.textContent);
  assert.deepStrictEqual(plain(tabs), ['客户', '工时']);
  assert.ok(ctx.document.querySelector('#consult-tabs .tab.on').textContent.indexOf('客户') >= 0);
});

test('咨询工作：切到工时页签能看到计时器与汇总', async () => {
  const ctx = await startConsult();
  ctx.document.querySelector('[data-act="tab"][data-tab="work"]').click();
  assert.strictEqual(ctx.App.pages.consult._state.tab, 'work');
  assert.ok(ctx.document.getElementById('timer-project'), '应有项目下拉');
  assert.ok(ctx.document.getElementById('timer-clock'), '应有计时显示');
  assert.ok(ctx.document.querySelector('.bars') || ctx.document.querySelector('.empty-sm'), '应有汇总区');
});

test('D10：两个页签在无数据时都有引导', async () => {
  const ctx = await startConsult();
  assert.ok(ctx.document.getElementById('consult-body').querySelector('.empty'));
  assert.ok(ctx.document.getElementById('consult-body').textContent.indexOf('新增客户') >= 0);
  ctx.document.querySelector('[data-act="tab"][data-tab="work"]').click();
  assert.ok(ctx.document.getElementById('consult-body').textContent.indexOf('还没有工时记录') >= 0);
});

/* ---------- 客户 ---------- */

test('客户：新增 / 编辑 / 状态流转 / 名称必填', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  assert.strictEqual(cs.addClient({ name: '  ' }), null);
  const cl = cs.addClient({ name: '王工', contact: '王工', phone: '138' });
  assert.strictEqual(cl.status, 'talking');
  cs.updateClient(cl.id, { phone: '139' });
  assert.strictEqual(cs.getClient(cl.id).phone, '139');
  cs.setClientStatus(cl.id, 'doing');
  assert.strictEqual(cs.getClient(cl.id).status, 'doing');
  assert.strictEqual(cs.setClientStatus(cl.id, '乱写'), null);
  assert.strictEqual(cs.clients().length, 1);
});

test('客户：删除时级联清掉项目 / 交付物 / 纪要 / 工时', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const cl = cs.addClient({ name: '待删客户' });
  const p = cs.addProject({ clientId: cl.id, name: '项目' });
  cs.addDeliverable({ projectId: p.id, name: '交付物' });
  cs.addWorklog({ projectId: p.id, minutes: 60, content: '干活' });
  cs.addMeeting({ clientId: cl.id, points: '聊了需求' });
  assert.strictEqual(cs.removeClient(cl.id), true);
  assert.strictEqual(cs.clients().length, 0);
  assert.strictEqual(cs.projects().length, 0);
  assert.strictEqual(cs.deliverables().length, 0);
  assert.strictEqual(cs.worklogs().length, 0);
  assert.strictEqual(cs.meetings().length, 0);
  assert.strictEqual(cs.removeClient('不存在'), false);
});

test('客户：累计工时与累计金额按项目汇总', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const cl = cs.addClient({ name: '甲方' });
  const p1 = cs.addProject({ clientId: cl.id, name: 'P1', quote: 20000 });
  const p2 = cs.addProject({ clientId: cl.id, name: 'P2', quote: 5000 });
  cs.addWorklog({ projectId: p1.id, minutes: 120 });
  cs.addWorklog({ projectId: p2.id, minutes: 30 });
  const st = cs.clientStats(cl.id);
  assert.strictEqual(st.projectCount, 2);
  assert.strictEqual(st.minutes, 150);
  assert.strictEqual(st.amount, 25000);
  assert.strictEqual(cs.clientMinutes(cl.id), 150);
  assert.strictEqual(cs.clientAmount(cl.id), 25000);
  assert.strictEqual(cs.projectMinutes(p1.id), 120);

  ctx.App.pages.consult._renderAll();
  const card = ctx.document.querySelector('.grid .card');
  assert.ok(card.textContent.indexOf('2.5 小时') >= 0, '应显示 2.5 小时累计工时');
  assert.ok(card.textContent.indexOf('¥25,000') >= 0, '应显示累计金额');
});

test('项目：报价按数字存储，删除级联清掉交付物与工时', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p = cs.addProject({ name: '乱写报价', quote: 'abc' });
  assert.strictEqual(p.quote, 0, '非法报价归零');
  cs.updateProject(p.id, { quote: '1234' });
  assert.strictEqual(cs.getProject(p.id).quote, 1234);

  const p2 = cs.addProject({ name: '待删' });
  cs.addDeliverable({ projectId: p2.id, name: 'd' });
  cs.addWorklog({ projectId: p2.id, minutes: 30 });
  assert.strictEqual(cs.removeProject(p2.id), true);
  assert.strictEqual(cs.deliverables().length, 0);
  assert.strictEqual(cs.worklogs().length, 0);
});

/* ---------- 交付物 ---------- */

test('交付物：新增 / 标记已交付自动盖日期 / 改回待交付清空 / 删除', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p = cs.addProject({ name: 'P' });
  const d = cs.addDeliverable({ projectId: p.id, name: '接口文档' });
  assert.strictEqual(d.status, 'pending');
  assert.strictEqual(d.deliveredAt, '');

  cs.setDeliverableStatus(d.id, 'delivered');
  assert.strictEqual(cs.getDeliverable(d.id).status, 'delivered');
  assert.strictEqual(cs.getDeliverable(d.id).deliveredAt, ctx.App.util.today(), '应盖交付日期');

  cs.setDeliverableStatus(d.id, 'pending');
  assert.strictEqual(cs.getDeliverable(d.id).deliveredAt, '', '改回待交付应清空日期');
  assert.strictEqual(cs.setDeliverableStatus(d.id, '乱写'), null);
  assert.strictEqual(cs.removeDeliverable(d.id), true);
  assert.strictEqual(cs.removeDeliverable('不存在'), false);
});

/* ---------- 纪要 ---------- */

test('纪要：要点或待跟进至少填一个，按日期倒序', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  assert.strictEqual(cs.addMeeting({ points: '', followUp: '' }), null, '全空不应创建');
  const t = ctx.App.util.today();
  cs.addMeeting({ points: '第一次沟通', date: ctx.App.util.addDays(t, -3) });
  cs.addMeeting({ points: '第二次沟通', date: t });
  const list = cs.meetings();
  assert.strictEqual(list[0].date, t, '应按日期倒序');
  assert.strictEqual(cs.meetings().length, 2);
  assert.strictEqual(cs.removeMeeting(list[0].id), true);
});

test('纪要：待跟进一键加进今日计划，并带客户来源痕迹', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const cl = cs.addClient({ name: '乙方' });
  const m = cs.addMeeting({ clientId: cl.id, points: '聊了排期', followUp: '周五前发一版原型' });
  assert.strictEqual(m.followUpDone, false);

  const task = cs.followUpToToday(m.id);
  assert.ok(task, '应生成一条今日任务');
  assert.strictEqual(task.title, '周五前发一版原型');
  assert.strictEqual(task.date, ctx.App.util.today());
  assert.deepStrictEqual(plain(task.moduleRef), { module: 'consult', id: m.id });
  assert.strictEqual(cs.getMeeting(m.id).followUpDone, true, '应标记已处理');

  assert.strictEqual(cs.followUpToToday(m.id), null, '重复点不应再加一条');
  assert.strictEqual(ctx.App.actions.today.list(ctx.App.util.today()).length, 1);
});

test('纪要：DOM 里点「加进今日」按钮走通', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const cl = cs.addClient({ name: '客户A' });
  const m = cs.addMeeting({ clientId: cl.id, points: 'x', followUp: '回个电话' });
  ctx.App.router.go('consult', cl.id);
  ctx.document.querySelector('[data-act="followUpToday"][data-id="' + m.id + '"]').click();
  assert.strictEqual(ctx.App.actions.today.list(ctx.App.util.today()).length, 1);
  assert.strictEqual(cs.getMeeting(m.id).followUpDone, true);
  assert.ok(ctx.document.querySelector('.row').textContent.indexOf('已加进今日') >= 0);
});

/* ---------- 工时 ---------- */

test('工时：分钟数必须大于 0，按日期倒序，可改可删', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p = cs.addProject({ name: 'P' });
  assert.strictEqual(cs.addWorklog({ projectId: p.id, minutes: 0 }), null);
  assert.strictEqual(cs.addWorklog({ projectId: p.id, minutes: -5 }), null);

  const t = ctx.App.util.today();
  cs.addWorklog({ projectId: p.id, minutes: 30, date: ctx.App.util.addDays(t, -1) });
  const w = cs.addWorklog({ projectId: p.id, minutes: 45, date: t });
  assert.strictEqual(cs.worklogs()[0].date, t, '应按日期倒序');
  cs.updateWorklog(w.id, { minutes: 90 });
  assert.strictEqual(cs.getWorklog(w.id).minutes, 90);
  assert.strictEqual(cs.removeWorklog(w.id), true);
  assert.strictEqual(cs.removeWorklog('不存在'), false);
});

/* ---------- D5 计时器 ---------- */

test('D5：计时器必须选项目，且不能重复开始', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  assert.strictEqual(cs.startTimer('').ok, false);
  assert.strictEqual(cs.startTimer('不存在的项目').ok, false);
  assert.strictEqual(cs.stopTimer().ok, false, '没在计时时停止应失败');

  const p = cs.addProject({ name: '计时项目' });
  assert.strictEqual(cs.startTimer(p.id).ok, true);
  assert.strictEqual(cs.startTimer(p.id).ok, false, '已在计时不能重复开始');
});

test('D5：跑 60 秒停止 → 生成一条约 1 分钟的工时记录', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p = cs.addProject({ name: '计时项目' });
  let fake = 1000000;
  cs._setClock(function () { return fake; });

  cs.startTimer(p.id);
  fake += 60000;
  const r = cs.stopTimer();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.seconds, 60);
  assert.strictEqual(r.minutes, 1, '60 秒应记 1 分钟');
  assert.strictEqual(cs.worklogs().length, 1);
  assert.strictEqual(cs.worklogs()[0].minutes, 1);
  assert.strictEqual(cs.worklogs()[0].projectId, p.id);
  assert.strictEqual(cs.timerState().running, false, '停止后不应还在计时');
});

test('D5：不足 1 分钟也至少记 1 分钟', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p = cs.addProject({ name: 'P' });
  let fake = 1000;
  cs._setClock(function () { return fake; });
  cs.startTimer(p.id);
  fake += 5000;
  const r = cs.stopTimer();
  assert.strictEqual(r.minutes, 1);
});

test('D5：计时状态写进 sessionStorage，刷新也能接着算', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p = cs.addProject({ name: 'P' });
  let fake = 500000;
  cs._setClock(function () { return fake; });
  cs.startTimer(p.id);

  const raw = ctx.window.sessionStorage.getItem('pm.timer');
  assert.ok(raw, '应把计时状态写进 sessionStorage');
  const parsed = JSON.parse(raw);
  assert.strictEqual(parsed.projectId, p.id);
  assert.strictEqual(parsed.startedAt, 500000);

  fake += 125000; /* 过了 125 秒，相当于刷新后再打开 */
  assert.strictEqual(cs.timerState().running, true, '状态应还在');
  assert.strictEqual(cs.timerState().seconds, 125, '时长应接着算');

  cs.cancelTimer();
  assert.strictEqual(ctx.window.sessionStorage.getItem('pm.timer'), null, '取消后应清掉');
});

test('D5：DOM —— 选项目 → 开始 → 走 60 秒 → 停止，记录与汇总同步变化', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p = cs.addProject({ name: '看板项目' });
  let fake = 2000;
  cs._setClock(function () { return fake; });
  ctx.document.querySelector('[data-act="tab"][data-tab="work"]').click();

  const sel = ctx.document.getElementById('timer-project');
  sel.value = p.id;
  ctx.document.querySelector('[data-act="timerStart"]').click();
  assert.strictEqual(cs.timerState().running, true);
  assert.strictEqual(cs.timerState().projectId, p.id);

  fake += 60000;
  ctx.document.querySelector('[data-act="timerStop"]').click();
  assert.strictEqual(cs.worklogs().length, 1);
  assert.strictEqual(cs.worklogs()[0].minutes, 1);

  /* 右侧「按项目」汇总应出现这个项目，数值 1m */
  ctx.document.querySelector('[data-act="sumKind"][data-kind="project"]').click();
  const bars = ctx.document.querySelector('.bars');
  assert.ok(bars, '应有条形图');
  assert.ok(bars.textContent.indexOf('看板项目') >= 0, '汇总应出现该项目');
  assert.ok(bars.textContent.indexOf('1m') >= 0, '数值应为 1m');
});

test('D5：超过 4 小时弹一次「还在计时，要停吗」', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p = cs.addProject({ name: '长跑项目' });
  let fake = 3000;
  cs._setClock(function () { return fake; });
  ctx.document.querySelector('[data-act="tab"][data-tab="work"]').click();
  cs.startTimer(p.id);

  fake += 5 * 3600 * 1000; /* 5 小时 */
  ctx.App.pages.consult._tickOnce();
  const modal = ctx.document.querySelector('#overlay-host .modal');
  assert.ok(modal, '应弹出提醒');
  assert.ok(modal.textContent.indexOf('4 小时') >= 0);

  ctx.document.querySelector('#overlay-host [data-act="cfYes"]').click();
  assert.strictEqual(cs.timerState().running, false, '确认后应停止计时');
  assert.strictEqual(cs.worklogs().length, 1, '并生成一条记录');
  assert.strictEqual(cs.worklogs()[0].minutes, 300, '5 小时 = 300 分钟');
});

test('D5：不足 4 小时不打扰', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p = cs.addProject({ name: 'P' });
  let fake = 3000;
  cs._setClock(function () { return fake; });
  ctx.document.querySelector('[data-act="tab"][data-tab="work"]').click();
  cs.startTimer(p.id);
  fake += 3 * 3600 * 1000;
  ctx.App.pages.consult._tickOnce();
  assert.strictEqual(ctx.document.querySelector('#overlay-host .modal'), null, '不应弹提醒');
});

/* ---------- D6 四维汇总 ---------- */

test('D6：四组维度（客户 / 项目 / 本周 / 本月）数值都正确', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const util = ctx.App.util;
  const c1 = cs.addClient({ name: '甲方' });
  const c2 = cs.addClient({ name: '乙方' });
  const p1 = cs.addProject({ clientId: c1.id, name: '甲项目' });
  const p2 = cs.addProject({ clientId: c2.id, name: '乙项目' });

  /* 固定参照日（周日 2026-09-20），本周 = 09-14 ~ 09-20。
     这里刻意不用 util.today()：原先假设「wkStart - 20 天必落在上月」，
     当月边界不同就会不成立（例如 9/21 是周一，减 20 天回到 9/1，仍在同一月），
     导致月初/月末跑测试随机失败。改成固定日期后与运行时间完全解耦。 */
  const t = '2026-09-20';
  const wkStart = util.startOfWeek(t, 1);
  /* 本周内：p1 120 分钟；上月且在本周之外：p2 60 分钟 */
  cs.addWorklog({ projectId: p1.id, minutes: 120, date: util.addDays(wkStart, 1) });
  const lastMonth = util.addDays(wkStart, -20);
  cs.addWorklog({ projectId: p2.id, minutes: 60, date: lastMonth });

  /* 前置条件断言：固定日期下这条必须真的落在上月，否则后面的口径断言就没有意义 */
  assert.strictEqual(util.monthKey(t), '2026-09');
  assert.strictEqual(util.monthKey(lastMonth), '2026-08', 'p2 必须在上月');

  const byClient = cs.summaryItems('client');
  assert.deepStrictEqual(plain(byClient.map(i => i.label)), ['甲方', '乙方']);
  assert.deepStrictEqual(plain(byClient.map(i => i.value)), [120, 60]);

  const byProject = cs.summaryItems('project');
  assert.deepStrictEqual(plain(byProject.map(i => i.value)), [120, 60]);

  const wk = cs.summaryItems('week', t);
  assert.deepStrictEqual(plain(wk.map(i => i.label)), ['甲项目']);
  assert.deepStrictEqual(plain(wk.map(i => i.value)), [120]);

  const mo = cs.summaryItems('month', t);
  assert.deepStrictEqual(plain(mo.map(i => i.label)), ['甲项目'], '上月那条不计入本月');
  assert.deepStrictEqual(plain(mo.map(i => i.value)), [120]);
});

test('D6：条形图宽度与数值比例一致', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p1 = cs.addProject({ name: '大项目' });
  const p2 = cs.addProject({ name: '小项目' });
  cs.addWorklog({ projectId: p1.id, minutes: 120 });
  cs.addWorklog({ projectId: p2.id, minutes: 30 });
  ctx.document.querySelector('[data-act="tab"][data-tab="work"]').click();
  ctx.document.querySelector('[data-act="sumKind"][data-kind="project"]').click();

  const rows = Array.prototype.slice.call(ctx.document.querySelectorAll('.bar-row'));
  assert.strictEqual(rows.length, 2);
  const byLabel = {};
  rows.forEach(r => {
    byLabel[r.querySelector('.bar-lb').textContent] = {
      w: r.querySelector('.bar-val').style.width,
      n: r.querySelector('.bar-num').textContent
    };
  });
  assert.strictEqual(byLabel['大项目'].w, '100%', '最大值应占满');
  assert.strictEqual(byLabel['小项目'].w, '25%', '30/120 = 25%');
  assert.strictEqual(byLabel['大项目'].n, '2h');
  assert.strictEqual(byLabel['小项目'].n, '30m');
});

test('D6：切换汇总维度只重绘数值，不报错', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p = cs.addProject({ name: 'P' });
  cs.addWorklog({ projectId: p.id, minutes: 45 });
  ctx.document.querySelector('[data-act="tab"][data-tab="work"]').click();
  ['client', 'project', 'week', 'month'].forEach(function (k) {
    ctx.document.querySelector('[data-act="sumKind"][data-kind="' + k + '"]').click();
    assert.strictEqual(ctx.App.pages.consult._state.summaryKind, k);
    assert.ok(ctx.document.querySelector('.bars'), k + ' 应仍渲染条形图');
  });
});

/* ---------- 路由 ---------- */

test('路由：#/consult/client/:id 进入客户详情，返回列表', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const cl = cs.addClient({ name: '详情客户' });
  cs.addProject({ clientId: cl.id, name: '客户的项目' });
  ctx.App.router.go('consult', cl.id);
  assert.strictEqual(ctx.window.location.hash, '#/consult/client/' + cl.id);
  assert.strictEqual(ctx.App.pages.consult._state.clientId, cl.id);
  assert.ok(ctx.document.getElementById('page-host').textContent.indexOf('客户的项目') >= 0);

  ctx.document.querySelector('[data-act="backToClients"]').click();
  assert.strictEqual(ctx.App.pages.consult._state.clientId, null);
  assert.ok(ctx.document.getElementById('consult-tabs'), '应回到列表');
});

test('路由：客户不存在时详情页兜底', async () => {
  const ctx = await startConsult();
  ctx.App.router.go('consult', '不存在');
  assert.ok(ctx.document.getElementById('page-host').textContent.indexOf('找不到') >= 0);
});

/* ---------- 表单 / 落库 / 静态 ---------- */

test('DOM：抽屉表单新增客户', async () => {
  const ctx = await startConsult();
  ctx.document.querySelector('[data-act="newClient"]').click();
  ctx.document.querySelector('#overlay-host [data-fk="name"]').value = '新客户';
  ctx.document.querySelector('#overlay-host [data-fk="contact"]').value = '李工';
  ctx.document.querySelector('#overlay-host [data-act="formSave"]').click();
  assert.strictEqual(c(ctx).clients().length, 1);
  assert.strictEqual(c(ctx).clients()[0].contact, '李工');
  assert.strictEqual(ctx.document.getElementById('overlay-host').innerHTML, '');
});

test('DOM：工时页签里「记一笔工时」，时长为 0 时被拒', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const p = cs.addProject({ name: 'P' });
  ctx.document.querySelector('[data-act="tab"][data-tab="work"]').click();

  ctx.document.querySelector('[data-act="newWorklog"]').click();
  ctx.document.querySelector('#overlay-host [data-fk="minutes"]').value = '0';
  ctx.document.querySelector('#overlay-host [data-act="formSave"]').click();
  assert.strictEqual(cs.worklogs().length, 0, '0 分钟不应落库');
  assert.ok(ctx.document.querySelector('#overlay-host .drawer'), '出错时抽屉应保持打开');

  ctx.document.querySelector('#overlay-host [data-fk="minutes"]').value = '45';
  ctx.document.querySelector('#overlay-host [data-fk="projectId"]').value = p.id;
  ctx.document.querySelector('#overlay-host [data-act="formSave"]').click();
  assert.strictEqual(cs.worklogs().length, 1);
  assert.strictEqual(cs.worklogs()[0].minutes, 45);
});

test('落库：咨询数据写进存储层，导出备份里能看到（C4）', async () => {
  const ctx = await startConsult();
  const cs = c(ctx);
  const K = ctx.App.schema.KEYS;
  const cl = cs.addClient({ name: '持久化客户' });
  const p = cs.addProject({ clientId: cl.id, name: 'P' });
  cs.addDeliverable({ projectId: p.id, name: 'D' });
  cs.addMeeting({ clientId: cl.id, points: 'M' });
  cs.addWorklog({ projectId: p.id, minutes: 30 });

  assert.strictEqual(ctx.App.store.get(K.consultClients).length, 1);
  assert.strictEqual(ctx.App.store.get(K.consultProjects).length, 1);
  assert.strictEqual(ctx.App.store.get(K.consultDeliverables).length, 1);
  assert.strictEqual(ctx.App.store.get(K.consultMeetings).length, 1);
  assert.strictEqual(ctx.App.store.get(K.consultWorklogs).length, 1);
  const dump = ctx.App.store.exportJSON();
  assert.strictEqual(dump.data[K.consultClients][0].name, '持久化客户');
});

test('咨询工作：模块文件已接入 index.html，样式类齐备', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/modules/consult.js') >= 0, 'index.html 应加载 consult.js');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ['.timer-clock', '.cols-side', '.kv', '.bars', '.tabs'].forEach(cls => {
    assert.ok(css.indexOf(cls) >= 0, '缺少样式 ' + cls);
  });
});
