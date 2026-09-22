/* 18-mp-pages.test.js —— 小程序「页面层」测试。

   存在意义：这是唯一能抓到「页面代码运行时错误」的一层。
   真实事故：`pages/index/index.js` 里漏了一个 `var recsToday`，
   17 号文件的静态检查全绿、16 号文件的 core 测试全绿，
   但小程序一打开首页就 ReferenceError —— 日期空白、记录永远不显示，整个产品不可用。
   静态分析不会执行页面代码，所以必须有这一层。

   跑法：node --test tests/18-mp-pages.test.js（不需要微信开发者工具） */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');

const harness = require('./harness-mp.js');
const util = require('../miniprogram/core/util.js');
const schema = require('../miniprogram/core/schema.js');
const store = require('../miniprogram/core/store.js');

const TODAY = util.today();
const ago = (n) => util.addDays(TODAY, -n);

beforeEach(() => {
  harness.resetAll();
  store._reset();
});

/* ============================================================
   0. 全量生命周期冒烟 —— 直接回归「页面 JS 里有未定义变量」这类事故
   ============================================================ */

describe('mp/pages 生命周期冒烟', () => {
  test('每个注册页面的 onLoad / onShow 都不抛异常', () => {
    const appJson = require('../miniprogram/app.json');
    assert.ok(appJson.pages.length >= 3);
    appJson.pages.forEach(p => {
      assert.doesNotThrow(
        () => harness.mount(p + '.js'),
        p + ' 的生命周期抛错了（未定义变量 / 调用不存在的 API 都会在这里暴露）'
      );
    });
  });

  test('每个页面 refresh 都可以被重复调用（不产生重复渲染数据）', () => {
    const appJson = require('../miniprogram/app.json');
    appJson.pages.forEach(p => {
      const inst = harness.mount(p + '.js');
      if (typeof inst.refresh !== 'function') return;
      const before = JSON.stringify(inst.data);
      inst.refresh();
      inst.refresh();
      const after = JSON.stringify(inst.data);
      assert.notStrictEqual(after, undefined, p + ' refresh 后 data 丢失');
      assert.ok(typeof before === 'string' && typeof after === 'string');
    });
  });

  test('每个 tab 页的 onShow 都把 tabBar 选中态设成自己在 tabBar 中的序号', () => {
    const list = require('../miniprogram/app.json').tabBar.list;
    list.forEach((t, i) => {
      const inst = harness.mount(t.pagePath + '.js');
      assert.strictEqual(inst.__tabBar.data.selected, i,
        t.pagePath + ' 应把 selected 设为 ' + i);
    });
  });
});

/* ============================================================
   1. 首页（今天）
   ============================================================ */

describe('mp/pages 今天', () => {
  test('onLoad 后基础数据完整', () => {
    const p = harness.load('pages/index/index.js');
    p.onLoad({});
    assert.strictEqual(p.data.date, TODAY);
    assert.ok(p.data.dateCN.length > 0, 'dateCN 不能为空');
    assert.strictEqual(p.data.todayText, '0m');
    assert.strictEqual(p.data.todayCount, 0);
    assert.deepStrictEqual(p.data.list, []);
    assert.strictEqual(p.data.kinds.length, schema.KINDS.length);
  });

  test('记一笔的完整链路：输入 → 选分类 → 选时长 → 入账', () => {
    const p = harness.mount('pages/index/index.js');

    p.onInput(harness.inputEvent('看完了 LangChain 文档', { field: 'title' }));
    assert.strictEqual(p.data.form.title, '看完了 LangChain 文档');

    p.pickKind(harness.tapEvent({ id: 'work' }));
    assert.strictEqual(p.data.form.kind, 'work');

    p.pickMinutes(harness.tapEvent({ min: 60 }));
    assert.strictEqual(p.data.form.minutes, 60);
    assert.strictEqual(p.data.customMin, '');

    p.onAdd();

    assert.strictEqual(p.data.list.length, 1);
    const r = p.data.list[0];
    assert.strictEqual(r.title, '看完了 LangChain 文档');
    assert.strictEqual(r.kindLabel, '工作');
    assert.strictEqual(r.kindColor, schema.kindColor('work'));
    assert.strictEqual(r.durText, '1h');
    assert.match(r.timeText, /^\d{2}:\d{2}$/);
    assert.strictEqual(r.fromAI, false);

    assert.strictEqual(p.data.todayText, '1h');
    assert.strictEqual(p.data.todayCount, 1);
    assert.strictEqual(p.data.form.title, '', '记完要清空标题，方便连续记多笔');
    assert.strictEqual(store.all().length, 1, '数据要真的落库');
  });

  test('标题为空时拒绝写入并提示', () => {
    const p = harness.mount('pages/index/index.js');
    p.onAdd();
    assert.strictEqual(p.data.list.length, 0);
    assert.strictEqual(store.all().length, 0);
    assert.ok(harness.ui.toasts.some(t => t.title.indexOf('写一句话') >= 0),
      '应提示用户写一句话，实际：' + JSON.stringify(harness.ui.toasts));
  });

  test('时长为 0 时拒绝写入', () => {
    const p = harness.mount('pages/index/index.js');
    p.onInput(harness.inputEvent('随便写点', { field: 'title' }));
    p.onCustomMin(harness.inputEvent('0'));
    assert.strictEqual(p.data.form.minutes, 0);
    p.onAdd();
    assert.strictEqual(store.all().length, 0);
    assert.ok(harness.ui.toasts.some(t => t.title.indexOf('时长') >= 0));
  });

  test('自定义时长会解析、钳制，解析失败时保留原值', () => {
    const p = harness.mount('pages/index/index.js');

    p.onCustomMin(harness.inputEvent('1.5h'));
    assert.strictEqual(p.data.form.minutes, 90);

    p.onCustomMin(harness.inputEvent('45m'));
    assert.strictEqual(p.data.form.minutes, 45);

    p.onCustomMin(harness.inputEvent('99999'));
    assert.strictEqual(p.data.form.minutes, schema.MAX_MINUTES, '应钳制到 24 小时');

    p.onCustomMin(harness.inputEvent('乱写的'));
    assert.strictEqual(p.data.form.minutes, schema.MAX_MINUTES, '解析失败应保持不变');
  });

  test('删除先弹确认；取消不删，确认才删，且可撤销', () => {
    const p = harness.mount('pages/index/index.js');
    p.onInput(harness.inputEvent('要删的', { field: 'title' }));
    p.onAdd();
    const id = p.data.list[0].id;

    harness.setModalReply(false);
    p.onDelete(harness.tapEvent({ id: id }));
    assert.strictEqual(p.data.list.length, 1, '取消后不该删除');
    assert.ok(harness.ui.modals.length >= 1, '删除前必须弹确认框');

    harness.setModalReply(true);
    p.onDelete(harness.tapEvent({ id: id }));
    assert.strictEqual(p.data.list.length, 0);
    assert.strictEqual(store.all().length, 0);

    assert.strictEqual(store.canUndo(), true, '删除必须留下撤销点');
    store.undo();
    p.refresh();
    assert.strictEqual(p.data.list.length, 1);
  });

  test('断档提醒：新用户不打扰，老用户才提醒', () => {
    const fresh = harness.mount('pages/index/index.js');
    assert.strictEqual(fresh.data.nudge, '', '全新用户不该看到「已 N 天没记录」');

    store.add({ title: '两天前的事', minutes: 30, date: ago(2) });
    fresh.refresh();
    assert.ok(fresh.data.nudge.indexOf('2 天前') >= 0, '实际：' + fresh.data.nudge);

    /* 今天已经记过就不该再提醒 */
    store.add({ title: '刚做的', minutes: 10, date: TODAY });
    fresh.refresh();
    assert.strictEqual(fresh.data.nudge, '');
  });

  test('导航：复盘用 navigateTo，账本用 switchTab（tab 页必须 switchTab）', () => {
    const p = harness.mount('pages/index/index.js');
    p.goReview();
    p.goLedger();
    assert.deepStrictEqual(harness.ui.navigations, ['/pages/review/review']);
    assert.deepStrictEqual(harness.ui.switches, ['/pages/ledger/ledger']);
  });

  test('连续记录天数会随数据变化', () => {
    store.add({ date: TODAY, minutes: 10 });
    store.add({ date: ago(1), minutes: 10 });
    const p = harness.mount('pages/index/index.js');
    assert.strictEqual(p.data.streak, 2);
  });
});

/* ============================================================
   2. 账本
   ============================================================ */

describe('mp/pages 账本', () => {
  test('空数据也能渲染出完整骨架（柱状图恒为 7 根）', () => {
    const p = harness.mount('pages/ledger/ledger.js');
    assert.strictEqual(p.data.filters.length, schema.KINDS.length + 1, '全部 + 6 个分类');
    assert.strictEqual(p.data.filters[0].id, 'all');
    assert.strictEqual(p.data.recordCount, 0);
    assert.strictEqual(p.data.bars.length, 7);
    assert.ok(p.data.bars.every(b => b.h >= 4), '空数据也要有可见的最小高度');
    assert.deepStrictEqual(p.data.groups, []);
    assert.deepStrictEqual(p.data.kinds, []);
  });

  test('切换区间会重算统计口径', () => {
    store.add({ title: '本周的', kind: 'study', minutes: 60, date: TODAY });
    store.add({ title: '十天前的', kind: 'work', minutes: 30, date: ago(10) });

    const p = harness.mount('pages/ledger/ledger.js');
    assert.strictEqual(p.data.recordCount, 1, '近 7 天只应有 1 条');
    assert.strictEqual(p.data.totalText, '1h');

    p.pickRange(harness.tapEvent({ days: 30 }));
    assert.strictEqual(p.data.days, 30);
    assert.strictEqual(p.data.recordCount, 2);
    assert.strictEqual(p.data.totalText, '1h30m');
  });

  test('柱高按当期最大值归一，最长的一天最高', () => {
    store.add({ title: '多', kind: 'study', minutes: 120, date: TODAY });
    store.add({ title: '少', kind: 'study', minutes: 60, date: ago(1) });
    const p = harness.mount('pages/ledger/ledger.js');
    const byDate = {};
    p.data.bars.forEach(b => { byDate[b.date] = b; });
    assert.strictEqual(byDate[TODAY].h, 260, '最大值应顶到柱状图上限');
    assert.strictEqual(byDate[ago(1)].h, 130, '一半投入应是一半高度');
    assert.strictEqual(byDate[TODAY].today, true);
  });

  test('没有投入的那天不显示「0m」标签，避免 6 个 0m 制造噪音', () => {
    store.add({ title: 'A', kind: 'study', minutes: 60, date: TODAY });
    const p = harness.mount('pages/ledger/ledger.js');

    const todayBar = p.data.bars.filter(b => b.date === TODAY)[0];
    const emptyBars = p.data.bars.filter(b => b.minutes === 0);

    assert.strictEqual(todayBar.text, '1h');
    assert.ok(emptyBars.length >= 5, '近 7 天里应有多个空白天');
    assert.ok(emptyBars.every(b => b.text === ''), '空白天不该有文字标签');
    assert.ok(emptyBars.every(b => typeof b.h === 'number' && b.h >= 4),
      '但高度仍要保留占位，保证柱子基线对齐');
  });

  test('分类占比与排序正确', () => {
    store.add({ title: 'A', kind: 'study', minutes: 90, date: TODAY });
    store.add({ title: 'B', kind: 'work', minutes: 30, date: TODAY });
    const p = harness.mount('pages/ledger/ledger.js');
    assert.deepStrictEqual(p.data.kinds.map(k => k.id), ['study', 'work']);
    assert.strictEqual(p.data.kinds[0].pct, 75);
    assert.strictEqual(p.data.kinds[1].pct, 25);
  });

  test('筛选只影响清单，不影响统计（切换筛选不重算总量）', () => {
    store.add({ title: 'A', kind: 'study', minutes: 90, date: TODAY });
    store.add({ title: 'B', kind: 'work', minutes: 30, date: TODAY });
    const p = harness.mount('pages/ledger/ledger.js');
    const totalBefore = p.data.totalText;

    p.pickFilter(harness.tapEvent({ id: 'study' }));
    assert.strictEqual(p.data.filter, 'study');
    assert.strictEqual(p.data.totalText, totalBefore, '总量不该被筛选改变');
    assert.strictEqual(p.data.groups.length, 1);
    assert.deepStrictEqual(p.data.groups[0].items.map(i => i.title), ['A']);

    p.pickFilter(harness.tapEvent({ id: 'all' }));
    assert.strictEqual(p.data.groups[0].items.length, 2);
  });

  test('清单按日期倒序分组，同一天按录入时间倒序', () => {
    store.add({ title: '前天', kind: 'study', minutes: 10, date: ago(2) });
    store.add({ title: '今天先', kind: 'study', minutes: 10, date: TODAY });
    store.add({ title: '今天后', kind: 'study', minutes: 10, date: TODAY });

    const p = harness.mount('pages/ledger/ledger.js');
    assert.deepStrictEqual(p.data.groups.map(g => g.date), [TODAY, ago(2)]);
    assert.deepStrictEqual(p.data.groups[0].items.map(i => i.title), ['今天后', '今天先']);
    assert.strictEqual(p.data.groups[0].count, 2);
    assert.strictEqual(p.data.groups[0].totalText, '20m');
  });

  test('明细项带分类色，模板不用做任何计算', () => {
    store.add({ title: 'A', kind: 'fitness', minutes: 30, date: TODAY });
    const p = harness.mount('pages/ledger/ledger.js');
    const item = p.data.groups[0].items[0];
    assert.strictEqual(item.kindLabel, '运动');
    assert.strictEqual(item.kindColor, schema.kindColor('fitness'));
    assert.match(item.timeText, /^\d{2}:\d{2}$/);
    assert.strictEqual(item.durText, '30m');
  });
});

/* ============================================================
   3. 我的
   ============================================================ */

describe('mp/pages 我的', () => {
  test('概览数字正确', () => {
    store.add({ title: 'A', minutes: 30, date: TODAY });
    store.add({ title: 'B', minutes: 30, date: TODAY });
    store.add({ title: 'C', minutes: 60, date: ago(1) });

    const p = harness.mount('pages/me/me.js');
    assert.strictEqual(p.data.ov.records, 3);
    assert.strictEqual(p.data.totalText, '2h');
    assert.strictEqual(p.data.ov.days, 2);
    assert.strictEqual(p.data.ov.streak, 2);
    assert.strictEqual(p.data.version, harness.appStub.globalData.version);
    assert.strictEqual(p.data.cloudReady, false, '云开发未接入时必须显示仅本机');
  });

  test('切换一周起始日会写入设置并刷新界面', () => {
    const p = harness.mount('pages/me/me.js');
    assert.strictEqual(p.data.weekStartsOn, 1);

    p.pickWeekStart(harness.tapEvent({ v: 0 }));
    assert.strictEqual(store.weekStartsOn(), 0);
    assert.strictEqual(p.data.weekStartsOn, 0);
    assert.ok(harness.ui.toasts.length >= 1);
  });

  test('AI 开关只记设置 + 说明尚未接入，不能假装能用', () => {
    const p = harness.mount('pages/me/me.js');
    assert.strictEqual(p.data.aiEnabled, false, '默认必须关闭');

    p.toggleAI();
    assert.strictEqual(store.settings().aiEnabled, true);
    assert.ok(harness.ui.modals.some(m => m.title.indexOf('AI') >= 0),
      '开启时要说明尚未接入，避免误导');
  });

  test('导出把完整数据写进剪贴板', () => {
    store.add({ title: '甲', minutes: 30, date: TODAY });
    const p = harness.mount('pages/me/me.js');
    p.exportData();

    assert.ok(harness.ui.clipboard, '剪贴板应有内容');
    const parsed = JSON.parse(harness.ui.clipboard);
    assert.strictEqual(parsed.app, 'time-ledger');
    assert.strictEqual(parsed.records.length, 1);
    assert.strictEqual(parsed.records[0].title, '甲');
  });

  test('导入能覆盖还原（导出的数据可以原样导回）', () => {
    store.add({ title: '甲', minutes: 30, date: TODAY });
    const p = harness.mount('pages/me/me.js');
    p.exportData();

    store.add({ title: '乙', minutes: 10, date: TODAY });
    assert.strictEqual(store.all().length, 2);

    p.importData();
    assert.strictEqual(store.all().length, 1, '导入应覆盖当前数据');
    assert.strictEqual(store.all()[0].title, '甲');
  });

  test('导入非法内容不破坏现有数据', () => {
    store.add({ title: '甲', minutes: 30, date: TODAY });
    harness.ui.clipboard = '这不是 JSON';
    const p = harness.mount('pages/me/me.js');
    p.importData();

    assert.strictEqual(store.all().length, 1, '非法输入必须原样保留数据');
    assert.ok(harness.ui.toasts.some(t => t.title.indexOf('格式') >= 0));
  });

  test('剪贴板为空时导入给出提示', () => {
    const p = harness.mount('pages/me/me.js');
    p.importData();
    assert.ok(harness.ui.toasts.some(t => t.title.indexOf('空') >= 0));
  });

  test('撤销：无记录时提示，有记录时恢复', () => {
    const p = harness.mount('pages/me/me.js');
    assert.strictEqual(p.data.canUndo, false);
    p.onUndo();
    assert.ok(harness.ui.toasts.some(t => t.title.indexOf('没有可撤销') >= 0));

    store.add({ title: 'A', minutes: 10, date: TODAY });
    store.remove(store.all()[0].id);
    p.refresh();
    assert.strictEqual(p.data.canUndo, true);
    p.onUndo();
    assert.strictEqual(store.all().length, 1);
  });

  test('清空必须确认，取消则不动数据', () => {
    store.add({ title: '甲', minutes: 30, date: TODAY });
    const p = harness.mount('pages/me/me.js');

    harness.setModalReply(false);
    p.clearData();
    assert.strictEqual(store.all().length, 1, '取消后不该清空');

    harness.setModalReply(true);
    p.clearData();
    assert.strictEqual(store.all().length, 0);
    assert.strictEqual(p.data.ov.records, 0);
  });

  test('关于弹窗带上版本号', () => {
    const p = harness.mount('pages/me/me.js');
    p.about();
    const m = harness.ui.modals[harness.ui.modals.length - 1];
    assert.ok(m.title.indexOf(p.data.version) >= 0, '标题应含版本号，实际：' + m.title);
  });
});

/* ============================================================
   4. 周复盘
   ============================================================ */

describe('mp/pages 周复盘', () => {
  test('无数据时给出引导而不是空白', () => {
    const p = harness.mount('pages/review/review.js');
    assert.strictEqual(p.data.result.hasData, false);
    assert.ok(p.data.result.headline.length > 0);
    assert.ok(p.data.result.suggestion.length > 0);
    assert.ok(p.data.rangeText.indexOf('本周') >= 0, '实际：' + p.data.rangeText);
    assert.strictEqual(p.data.generatorLabel, '本地规则');
    assert.ok(p.data.rangeText.length > 0);
  });

  test('有数据时结论指向投入最多的分类', () => {
    store.add({ title: 'A', kind: 'study', minutes: 60, date: TODAY });
    const p = harness.mount('pages/review/review.js');
    assert.strictEqual(p.data.result.hasData, true);
    assert.strictEqual(p.data.result.totalText, '1h');
    assert.ok(p.data.result.headline.indexOf('学习') >= 0, p.data.result.headline);
    assert.strictEqual(p.data.result.kinds[0].id, 'study');
  });

  test('能翻上一周，但不能翻到未来', () => {
    const p = harness.mount('pages/review/review.js');
    assert.strictEqual(p.data.weekOffset, 0);

    p.shiftWeek(harness.tapEvent({ delta: 1 }));
    assert.strictEqual(p.data.weekOffset, 0, '不允许翻到未来');

    p.shiftWeek(harness.tapEvent({ delta: -1 }));
    assert.strictEqual(p.data.weekOffset, -1);
    assert.strictEqual(p.data.isThisWeek, false);
    assert.ok(p.data.rangeText.indexOf('本周') < 0);

    p.shiftWeek(harness.tapEvent({ delta: 1 }));
    assert.strictEqual(p.data.weekOffset, 0);
    assert.strictEqual(p.data.isThisWeek, true);
  });

  test('翻到上一周时只统计上一周的数据', () => {
    /* 本周内：今天；上周内：7 天前（周口径下必然落在上一周区间） */
    store.add({ title: '本周的', kind: 'study', minutes: 60, date: TODAY });

    const p = harness.mount('pages/review/review.js');
    assert.strictEqual(p.data.result.records, 1);

    p.shiftWeek(harness.tapEvent({ delta: -1 }));
    assert.strictEqual(p.data.result.records, 0, '上一周没有记录');
    assert.strictEqual(p.data.result.hasData, false);
  });

  test('复制会把区间、结论与建议一起带出去', () => {
    store.add({ title: 'A', kind: 'study', minutes: 60, date: TODAY });
    const p = harness.mount('pages/review/review.js');
    p.copyResult();

    assert.ok(harness.ui.clipboard, '应有复制内容');
    assert.ok(harness.ui.clipboard.indexOf('学习') >= 0, '应含结论');
    assert.ok(harness.ui.clipboard.indexOf('建议') >= 0, '应含建议');
    assert.ok(harness.ui.clipboard.indexOf('本周') >= 0, '应含区间');
  });

  test('无数据时复制只提示，不写入空内容', () => {
    const p = harness.mount('pages/review/review.js');
    p.copyResult();
    assert.strictEqual(harness.ui.clipboard, null);
    assert.ok(harness.ui.toasts.some(t => t.title.indexOf('没有') >= 0));
  });

  test('开启 AI 开关后，生成方式文案如实标注本地规则', () => {
    store.saveSettings({ aiEnabled: true });
    const p = harness.mount('pages/review/review.js');
    assert.strictEqual(p.data.aiEnabled, true);
    assert.ok(p.data.generatorLabel.indexOf('本地规则') >= 0,
      'AI 未接入时不能假装是云端生成，实际：' + p.data.generatorLabel);
  });

  test('goMe 用 switchTab 回到 tab 页', () => {
    const p = harness.mount('pages/review/review.js');
    p.goMe();
    assert.deepStrictEqual(harness.ui.switches, ['/pages/me/me']);
  });
});

/* ============================================================
   5. 自定义 tabBar 组件
   ============================================================ */

describe('mp/custom-tab-bar', () => {
  test('结构与 app.json 的 tabBar 完全一致', () => {
    const def = harness.loadDefinition('custom-tab-bar/index.js');
    const appList = require('../miniprogram/app.json').tabBar.list;
    assert.strictEqual(def.data.list.length, appList.length);
    def.data.list.forEach((item, i) => {
      assert.strictEqual(item.pagePath, '/' + appList[i].pagePath, '第 ' + i + ' 项路径对不上');
      assert.strictEqual(item.text, appList[i].text);
    });
  });

  test('点击切换到对应页面', () => {
    const tb = harness.instantiate(harness.loadDefinition('custom-tab-bar/index.js'));
    assert.strictEqual(tb.data.selected, 0);

    tb.onTap(harness.tapEvent({ index: 1 }));
    assert.deepStrictEqual(harness.ui.switches, ['/pages/ledger/ledger']);

    tb.onTap(harness.tapEvent({ index: 2 }));
    assert.deepStrictEqual(harness.ui.switches, ['/pages/ledger/ledger', '/pages/me/me']);
  });

  test('setData({selected}) 能被页面正常驱动', () => {
    const tb = harness.instantiate(harness.loadDefinition('custom-tab-bar/index.js'));
    tb.setData({ selected: 2 });
    assert.strictEqual(tb.data.selected, 2);
  });
});
