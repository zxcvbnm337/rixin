/* 16-mp-core.test.js —— 小程序核心层测试。
   核心层刻意不依赖 wx / DOM，因此可以直接用 node --test 跑，
   不需要微信开发者工具在跑，也不需要模拟器。 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');

const util = require('../miniprogram/core/util.js');
const schema = require('../miniprogram/core/schema.js');
const store = require('../miniprogram/core/store.js');
const review = require('../miniprogram/core/review.js');

const TODAY = util.today();
const ago = (n) => util.addDays(TODAY, -n);

beforeEach(() => { store._reset(); });

/* ============================================================
   1. util：从网页版迁移过来的纯函数
   ============================================================ */

describe('mp/util 时长解析', () => {
  test('纯数字按分钟', () => {
    assert.strictEqual(util.parseDuration('90'), 90);
    assert.strictEqual(util.parseDuration(45), 45);
    assert.strictEqual(util.parseDuration('7.5'), 8);
  });

  test('带单位', () => {
    assert.strictEqual(util.parseDuration('1.5h'), 90);
    assert.strictEqual(util.parseDuration('1h30m'), 90);
    assert.strictEqual(util.parseDuration('45m'), 45);
    assert.strictEqual(util.parseDuration('2H'), 120);
    assert.strictEqual(util.parseDuration('m20'), 20);
  });

  test('非法输入返回 null', () => {
    assert.strictEqual(util.parseDuration(''), null);
    assert.strictEqual(util.parseDuration('abc'), null);
    assert.strictEqual(util.parseDuration('h'), null);
    assert.strictEqual(util.parseDuration(null), null);
    assert.strictEqual(util.parseDuration(undefined), null);
  });
});

describe('mp/util 时长格式化', () => {
  test('fmtDuration 紧凑格式', () => {
    assert.strictEqual(util.fmtDuration(0), '0m');
    assert.strictEqual(util.fmtDuration(30), '30m');
    assert.strictEqual(util.fmtDuration(60), '1h');
    assert.strictEqual(util.fmtDuration(90), '1h30m');
    assert.strictEqual(util.fmtDuration(125), '2h5m');
  });

  test('fmtDurationCN 口语格式', () => {
    assert.strictEqual(util.fmtDurationCN(30), '30 分钟');
    assert.strictEqual(util.fmtDurationCN(60), '1 小时');
    assert.strictEqual(util.fmtDurationCN(90), '1.5 小时');
  });
});

describe('mp/util 日期', () => {
  test('周一起算的一周', () => {
    /* 2026-09-20 是周日 */
    assert.strictEqual(util.weekdayIndexMon('2026-09-20'), 7);
    assert.strictEqual(util.startOfWeek('2026-09-20', 1), '2026-09-14');
    assert.strictEqual(util.weekdayName('2026-09-20'), '周日');
  });

  test('周日起算的一周', () => {
    assert.strictEqual(util.startOfWeek('2026-09-20', 0), '2026-09-20');
    assert.strictEqual(util.startOfWeek('2026-09-19', 0), '2026-09-13');
  });

  test('addDays / diffDays 跨月正确', () => {
    assert.strictEqual(util.addDays('2026-09-20', 11), '2026-10-01');
    assert.strictEqual(util.addDays('2026-09-20', -20), '2026-08-31');
    assert.strictEqual(util.diffDays('2026-09-20', '2026-09-14'), 6);
    assert.strictEqual(util.diffDays('2026-10-01', '2026-09-20'), 11);
  });

  test('isValidDate 严格校验', () => {
    assert.strictEqual(util.isValidDate('2026-09-20'), true);
    assert.strictEqual(util.isValidDate('2026-9-20'), false);
    assert.strictEqual(util.isValidDate(''), false);
    assert.strictEqual(util.isValidDate(null), false);
  });

  test('formatDateCN', () => {
    assert.strictEqual(util.formatDateCN('2026-09-20'), '9月20日 周日');
  });
});

/* ============================================================
   2. schema：分类枚举与默认值
   ============================================================ */

describe('mp/schema', () => {
  test('6 个分类，id 唯一且都有颜色', () => {
    assert.strictEqual(schema.KINDS.length, 6);
    const ids = schema.KINDS.map(k => k.id);
    assert.strictEqual(new Set(ids).size, 6);
    schema.KINDS.forEach(k => {
      assert.ok(k.label, k.id + ' 缺 label');
      assert.match(k.color, /^#[0-9a-f]{6}$/i, k.id + ' 颜色格式不对');
    });
  });

  test('未知分类兜底到「其他」', () => {
    assert.strictEqual(schema.kindLabel('nope'), '其他');
    assert.strictEqual(schema.kindLabel(''), '其他');
    assert.strictEqual(schema.kindLabel('study'), '学习');
    assert.strictEqual(schema.kindColor('nope'), schema.KIND_MAP.other.color);
  });

  test('网页版分类映射覆盖全部模块', () => {
    ['study', 'dev', 'consult', 'fitness', 'diet', 'game'].forEach(k => {
      assert.ok(schema.KIND_MAP[schema.LEGACY_KIND_MAP[k]], k + ' 映射目标不存在');
    });
    assert.strictEqual(schema.LEGACY_KIND_MAP.dev, 'work');
    assert.strictEqual(schema.LEGACY_KIND_MAP.consult, 'work');
    assert.strictEqual(schema.LEGACY_KIND_MAP.game, 'fun');
  });

  test('默认设置：AI 默认关闭，避免依赖未开放的类目', () => {
    const s = schema.defaultSettings();
    assert.strictEqual(s.aiEnabled, false);
    assert.strictEqual(s.weekStartsOn, 1);
    assert.strictEqual(s.reviewStyle, 'local');
  });

  test('默认设置返回新对象，互不污染', () => {
    const a = schema.defaultSettings();
    a.weekStartsOn = 0;
    assert.strictEqual(schema.defaultSettings().weekStartsOn, 1);
  });
});

/* ============================================================
   3. store：本地数据层
   ============================================================ */

describe('mp/store 初始化', () => {
  test('init 后设置与元信息就位', () => {
    store.init();
    const s = store.settings();
    assert.strictEqual(s.weekStartsOn, 1);
    assert.ok(store.read(schema.STORAGE_KEYS.meta).createdAt > 0);
  });

  test('重复 init 不覆盖已有设置', () => {
    store.init();
    store.saveSettings({ weekStartsOn: 0 });
    store.init();
    assert.strictEqual(store.weekStartsOn(), 0);
  });
});

describe('mp/store 新增', () => {
  test('新记录字段齐全', () => {
    const r = store.add({ kind: 'study', title: '看书', minutes: 45 });
    assert.match(r.id, /^rec_/);
    assert.strictEqual(r.date, TODAY);
    assert.strictEqual(r.kind, 'study');
    assert.strictEqual(r.title, '看书');
    assert.strictEqual(r.minutes, 45);
    assert.strictEqual(r.source, 'manual');
    assert.strictEqual(r.deleted, false);
    assert.strictEqual(r.synced, false);
    assert.deepStrictEqual(r.tags, []);
  });

  test('标题为空时用分类名兜底', () => {
    const r = store.add({ kind: 'fitness', title: '   ', minutes: 30 });
    assert.strictEqual(r.title, '运动');
  });

  test('非法分类落到「其他」', () => {
    assert.strictEqual(store.add({ kind: 'zzz', minutes: 10 }).kind, 'other');
    assert.strictEqual(store.add({ kind: undefined, minutes: 10 }).kind, 'other');
  });

  test('时长上限 24 小时', () => {
    assert.strictEqual(store.add({ minutes: 99999 }).minutes, schema.MAX_MINUTES);
    assert.strictEqual(store.add({ minutes: -5 }).minutes, 0);
    assert.strictEqual(store.add({ minutes: 'abc' }).minutes, 0);
  });

  test('非法日期回落到今天', () => {
    assert.strictEqual(store.add({ date: '2026-9-1', minutes: 10 }).date, TODAY);
    assert.strictEqual(store.add({ date: ago(3), minutes: 10 }).date, ago(3));
  });

  test('标签最多 6 个', () => {
    const r = store.add({ minutes: 10, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
    assert.strictEqual(r.tags.length, 6);
  });
});

describe('mp/store 查询与统计', () => {
  test('listByDate 只返回当天且按时间倒序', () => {
    const a = store.add({ date: TODAY, title: 'A', minutes: 10 });
    const b = store.add({ date: TODAY, title: 'B', minutes: 20 });
    store.add({ date: ago(1), title: 'C', minutes: 30 });

    const list = store.listByDate(TODAY);
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].id, b.id);
    assert.strictEqual(list[1].id, a.id);
  });

  test('同一毫秒内连记两笔，顺序由 seq 保证（不依赖排序实现）', () => {
    const first = store.add({ date: TODAY, title: '先', minutes: 10 });
    const second = store.add({ date: TODAY, title: '后', minutes: 10 });
    /* 强制时间戳相同，模拟快速连点 */
    const raw = store.read(schema.STORAGE_KEYS.records).map(r =>
      Object.assign({}, r, { createdAt: 1700000000000 })
    );
    store.write(schema.STORAGE_KEYS.records, raw);

    const list = store.listByDate(TODAY);
    assert.strictEqual(list[0].id, second.id);
    assert.strictEqual(list[1].id, first.id);
    assert.ok(second.seq > first.seq);
  });

  test('seq 在重置后重新计数，不与历史记录冲突', () => {
    const a = store.add({ minutes: 10 });
    store._reset();
    const b = store.add({ minutes: 10 });
    assert.strictEqual(b.seq, 1);
    assert.ok(a.id !== b.id);
  });

  test('minutesOn / countOn', () => {
    store.add({ date: TODAY, minutes: 30 });
    store.add({ date: TODAY, minutes: 45 });
    store.add({ date: ago(1), minutes: 100 });
    assert.strictEqual(store.minutesOn(TODAY), 75);
    assert.strictEqual(store.minutesOn(ago(1)), 100);
    assert.strictEqual(store.countOn(TODAY), 2);
    assert.strictEqual(store.countOn(ago(5)), 0);
  });

  test('byKind 始终返回全部 6 个分类', () => {
    store.add({ date: TODAY, kind: 'study', minutes: 60 });
    store.add({ date: TODAY, kind: 'study', minutes: 30 });
    store.add({ date: TODAY, kind: 'work', minutes: 20 });
    const m = store.byKind(store.listByDate(TODAY));
    assert.strictEqual(Object.keys(m).length, 6);
    assert.strictEqual(m.study, 90);
    assert.strictEqual(m.work, 20);
    assert.strictEqual(m.fun, 0);
  });

  test('recentDays 长度与顺序正确，末位是今天', () => {
    store.add({ date: TODAY, minutes: 30 });
    store.add({ date: ago(2), minutes: 60 });
    const days = store.recentDays(7);
    assert.strictEqual(days.length, 7);
    assert.strictEqual(days[6].date, TODAY);
    assert.strictEqual(days[6].minutes, 30);
    assert.strictEqual(days[4].date, ago(2));
    assert.strictEqual(days[4].minutes, 60);
    assert.strictEqual(days[0].date, ago(6));
  });

  test('listBetween 闭区间', () => {
    store.add({ date: ago(3), minutes: 10 });
    store.add({ date: ago(10), minutes: 10 });
    assert.strictEqual(store.listBetween(ago(4), TODAY).length, 1);
  });
});

describe('mp/store 周口径跟随设置', () => {
  test('weekRange 周一起算', () => {
    store.init();
    const r = store.weekRange('2026-09-20');
    assert.strictEqual(r.from, '2026-09-14');
    assert.strictEqual(r.to, '2026-09-20');
  });

  test('改成周日起算后，同一天归属不同的周', () => {
    store.saveSettings({ weekStartsOn: 0 });
    assert.strictEqual(store.weekStartsOn(), 0);
    const r = store.weekRange('2026-09-20');
    assert.strictEqual(r.from, '2026-09-20');
    assert.strictEqual(r.to, '2026-09-26');
  });

  test('weekRecords 只取本周', () => {
    store.init();
    store.add({ date: TODAY, minutes: 10 });
    store.add({ date: ago(30), minutes: 10 });
    assert.strictEqual(store.weekRecords(TODAY).length, 1);
  });
});

describe('mp/store 软删除与撤销', () => {
  test('remove 后查询不到，但底层数据仍在', () => {
    const r = store.add({ minutes: 30 });
    assert.strictEqual(store.remove(r.id), true);
    assert.strictEqual(store.all().length, 0);
    assert.strictEqual(store.get(r.id).deleted, true);
  });

  test('撤销恢复删除', () => {
    const r = store.add({ minutes: 30 });
    store.remove(r.id);
    assert.strictEqual(store.canUndo(), true);
    assert.strictEqual(store.undo(), true);
    assert.strictEqual(store.all().length, 1);
  });

  test('撤销后再撤销返回 false（栈已空）', () => {
    const r = store.add({ minutes: 30 });
    store.remove(r.id);
    store.undo();
    assert.strictEqual(store.undo(), false);
  });

  test('快照是深拷贝，撤销拿到的是删除前的原始值', () => {
    const r = store.add({ minutes: 30, title: '原始' });
    store.remove(r.id);
    store.update(r.id, { title: '改过了' });
    store.undo();   // 回到 update 之前
    assert.strictEqual(store.get(r.id).title, '原始');
  });

  test('删除不存在的 id 返回 false 且不压栈', () => {
    assert.strictEqual(store.remove('nope'), false);
    assert.strictEqual(store.canUndo(), false);
  });
});

describe('mp/store 修改', () => {
  test('update 合并字段并刷新时间戳', () => {
    const r = store.add({ title: 'A', minutes: 30 });
    const u = store.update(r.id, { minutes: 60, title: 'B' });
    assert.strictEqual(u.minutes, 60);
    assert.strictEqual(u.title, 'B');
    assert.strictEqual(u.id, r.id);
    assert.ok(u.updatedAt >= r.updatedAt);
    assert.strictEqual(u.synced, false);
  });

  test('update 同样钳制时长', () => {
    const r = store.add({ minutes: 30 });
    assert.strictEqual(store.update(r.id, { minutes: 5000 }).minutes, schema.MAX_MINUTES);
  });

  test('update 不存在的 id 返回 null', () => {
    assert.strictEqual(store.update('nope', { minutes: 1 }), null);
  });
});

describe('mp/store 待同步队列', () => {
  test('每次写入都压入一条待同步', () => {
    assert.strictEqual(store.pendingCount(), 0);
    const r = store.add({ minutes: 10 });
    assert.strictEqual(store.pendingCount(), 1);
    store.update(r.id, { minutes: 20 });
    assert.strictEqual(store.pendingCount(), 2);
    store.remove(r.id);
    assert.strictEqual(store.pendingCount(), 3);
  });

  test('云开发未就绪时 flushPending 不清空队列', () => {
    store.add({ minutes: 10 });
    assert.strictEqual(store.flushPending(), 0);
    assert.strictEqual(store.pendingCount(), 1);
  });

  test('markSynced 清掉指定 id 的待同步并打标记', () => {
    const a = store.add({ minutes: 10 });
    const b = store.add({ minutes: 20 });
    assert.strictEqual(store.markSynced([a.id]), 1);
    assert.strictEqual(store.pendingCount(), 1);
    assert.strictEqual(store.get(a.id).synced, true);
    assert.strictEqual(store.get(b.id).synced, false);
    assert.ok(store.read(schema.STORAGE_KEYS.meta).lastSyncAt > 0);
  });
});

describe('mp/store 连续天数', () => {
  test('今天、昨天、前天都有记录 → 3 天', () => {
    store.add({ date: TODAY, minutes: 10 });
    store.add({ date: ago(1), minutes: 10 });
    store.add({ date: ago(2), minutes: 10 });
    assert.strictEqual(store.streak(), 3);
  });

  test('今天还没记，从昨天往前算', () => {
    store.add({ date: ago(1), minutes: 10 });
    store.add({ date: ago(2), minutes: 10 });
    assert.strictEqual(store.streak(), 2);
  });

  test('断档则从断点重新计数', () => {
    store.add({ date: TODAY, minutes: 10 });
    store.add({ date: ago(3), minutes: 10 });
    assert.strictEqual(store.streak(), 1);
  });

  test('完全没有记录 → 0', () => {
    assert.strictEqual(store.streak(), 0);
  });
});

describe('mp/store overview', () => {
  test('汇总条数、天数、总时长', () => {
    store.add({ date: TODAY, minutes: 30 });
    store.add({ date: TODAY, minutes: 30 });
    store.add({ date: ago(1), minutes: 60 });
    const o = store.overview();
    assert.strictEqual(o.records, 3);
    assert.strictEqual(o.days, 2);
    assert.strictEqual(o.minutes, 120);
    assert.strictEqual(o.streak, 2);
  });
});

describe('mp/store 导入导出', () => {
  test('导出结构完整', () => {
    store.add({ minutes: 30 });
    const d = store.exportAll();
    assert.strictEqual(d.app, 'time-ledger');
    assert.strictEqual(d.version, schema.SCHEMA_VERSION);
    assert.strictEqual(d.records.length, 1);
    assert.ok(d.settings);
  });

  test('导入时把网页版分类翻译成小程序分类', () => {
    const n = store.replaceAll({
      records: [
        { id: 'a', date: TODAY, kind: 'dev', title: '写代码', minutes: 60 },
        { id: 'b', date: TODAY, kind: 'game', title: '打游戏', minutes: 30 },
        { id: 'c', date: TODAY, kind: 'unknown', title: '?', minutes: 10 }
      ]
    });
    assert.strictEqual(n, 3);
    assert.strictEqual(store.get('a').kind, 'work');
    assert.strictEqual(store.get('b').kind, 'fun');
    assert.strictEqual(store.get('c').kind, 'other');
  });

  test('导入覆盖旧数据', () => {
    store.add({ minutes: 30 });
    store.replaceAll({ records: [] });
    assert.strictEqual(store.all().length, 0);
  });

  test('导入设置时与默认值合并，缺字段不丢', () => {
    store.replaceAll({ records: [], settings: { weekStartsOn: 0 } });
    const s = store.settings();
    assert.strictEqual(s.weekStartsOn, 0);
    assert.strictEqual(s.aiEnabled, false);
  });

  test('导出再导入可以完整还原', () => {
    store.add({ date: TODAY, kind: 'study', title: 'A', minutes: 30 });
    store.add({ date: ago(1), kind: 'fitness', title: 'B', minutes: 45 });
    const dump = JSON.parse(JSON.stringify(store.exportAll()));

    store._reset();
    assert.strictEqual(store.all().length, 0);

    store.replaceAll(dump);
    const back = store.all();
    assert.strictEqual(back.length, 2);
    assert.strictEqual(store.minutesOn(TODAY), 30);
    assert.strictEqual(store.minutesOn(ago(1)), 45);
  });
});

/* ============================================================
   4. review：本地规则复盘（不依赖 AI，也要有信息量）
   ============================================================ */

describe('mp/review 空数据', () => {
  test('无记录时给出引导而不是空白', () => {
    const r = review.buildLocalReview([]);
    assert.strictEqual(r.hasData, false);
    assert.strictEqual(r.totalText, '0m');
    assert.deepStrictEqual(r.kinds, []);
    assert.ok(r.headline.length > 0);
    assert.ok(r.suggestion.length > 0);
    assert.strictEqual(r.generator, 'local');
  });
});

describe('mp/review 有数据', () => {
  test('结论指向投入最多的分类', () => {
    const recs = [
      { date: TODAY, kind: 'study', title: 'A', minutes: 60 },
      { date: TODAY, kind: 'work', title: 'B', minutes: 30 }
    ];
    const r = review.buildLocalReview(recs, { today: TODAY });
    assert.strictEqual(r.hasData, true);
    assert.strictEqual(r.totalText, '1h30m');
    assert.strictEqual(r.kinds[0].id, 'study');
    assert.strictEqual(r.kinds[0].pct, 67);
    assert.ok(r.headline.includes('学习'), r.headline);
    assert.ok(r.headline.includes('67%'), r.headline);
  });

  test('分类按投入降序且过滤掉零投入', () => {
    const recs = [
      { date: TODAY, kind: 'fun', minutes: 10 },
      { date: TODAY, kind: 'fitness', minutes: 80 },
      { date: TODAY, kind: 'study', minutes: 30 }
    ];
    const r = review.buildLocalReview(recs, { today: TODAY });
    assert.deepStrictEqual(r.kinds.map(k => k.id), ['fitness', 'study', 'fun']);
    assert.ok(r.kinds.every(k => k.minutes > 0));
  });

  test('没有上周数据时不编造环比', () => {
    const r = review.buildLocalReview([{ date: TODAY, kind: 'study', minutes: 60 }], { today: TODAY });
    assert.strictEqual(r.compare, null);
  });

  test('有上周数据时输出环比', () => {
    const r = review.buildLocalReview(
      [{ date: TODAY, kind: 'study', minutes: 120 }],
      { today: TODAY, lastWeekRecords: [{ date: ago(7), kind: 'study', minutes: 60 }] }
    );
    assert.strictEqual(r.compare.lastMinutes, 60);
    assert.strictEqual(r.compare.delta, 60);
    assert.strictEqual(r.compare.up, true);
    assert.strictEqual(r.compare.deltaText, '+1h');
    assert.strictEqual(r.compare.pct, 100);
  });

  test('环比下降时 up 为 false', () => {
    const r = review.buildLocalReview(
      [{ date: TODAY, kind: 'study', minutes: 30 }],
      { today: TODAY, lastWeekRecords: [{ date: ago(7), kind: 'study', minutes: 90 }] }
    );
    assert.strictEqual(r.compare.up, false);
    assert.strictEqual(r.compare.deltaText, '-1h');
  });
});

describe('mp/review 建议分支', () => {
  test('记录天数太少 → 提醒固定时间点', () => {
    const recs = [
      { date: TODAY, kind: 'study', minutes: 120 },
      { date: ago(1), kind: 'study', minutes: 120 }
    ];
    const r = review.buildLocalReview(recs, { today: TODAY });
    assert.ok(r.suggestion.includes('固定一个时间点'), r.suggestion);
  });

  test('天数够但日均低 → 提醒先给 30 分钟', () => {
    const recs = [];
    for (let i = 0; i < 7; i++) recs.push({ date: ago(i), kind: 'study', minutes: 10 });
    const r = review.buildLocalReview(recs, { today: TODAY });
    assert.strictEqual(r.activeDays, 7);
    assert.ok(r.suggestion.includes('30 分钟'), r.suggestion);
  });

  test('单一分类占比过高 → 提醒别挤掉休息', () => {
    const recs = [];
    for (let i = 0; i < 7; i++) recs.push({ date: ago(i), kind: 'work', minutes: 60 });
    recs.push({ date: TODAY, kind: 'study', minutes: 10 });
    const r = review.buildLocalReview(recs, { today: TODAY });
    assert.ok(r.kinds[0].pct >= 70, String(r.kinds[0].pct));
    assert.ok(r.suggestion.includes('注意力相当集中'), r.suggestion);
  });

  test('分布均衡 → 鼓励继续累积', () => {
    const recs = [];
    for (let i = 0; i < 7; i++) {
      recs.push({ date: ago(i), kind: 'study', minutes: 40 });
      recs.push({ date: ago(i), kind: 'fitness', minutes: 40 });
      recs.push({ date: ago(i), kind: 'work', minutes: 40 });
    }
    const r = review.buildLocalReview(recs, { today: TODAY });
    assert.ok(r.suggestion.includes('分布比较均衡'), r.suggestion);
  });

  test('spanDays 跟随传入的 range', () => {
    const recs = [{ date: TODAY, kind: 'study', minutes: 60 }];
    const r = review.buildLocalReview(recs, {
      today: TODAY,
      range: { from: TODAY, to: TODAY }
    });
    assert.strictEqual(r.spanDays, 1);
    assert.strictEqual(r.dailyAvg, 60);
    assert.strictEqual(r.dailyAvgText, '1h');
  });

  test('事实行只在有数据时输出，且都是陈述句', () => {
    const r0 = review.buildLocalReview([], { today: TODAY });
    assert.strictEqual(r0.lines.length, 0);
    const r1 = review.buildLocalReview(
      [{ date: TODAY, kind: 'study', minutes: 30 }],
      { today: TODAY, lastWeekRecords: [] }
    );
    assert.ok(r1.lines.length >= 3);
    assert.ok(r1.lines.every(l => typeof l === 'string' && l.length > 0));
  });
});

describe('mp/review 断档检测', () => {
  test('上次记录在两天前 → 提醒', () => {
    const recs = [{ date: ago(2), kind: 'study', minutes: 30 }];
    const info = review.breakInfo(recs, TODAY);
    assert.strictEqual(info.days, 2);
    assert.strictEqual(info.lastDate, ago(2));
    assert.strictEqual(info.hasHistory, true);
    assert.strictEqual(info.needNudge, true);
  });

  test('昨天记过就不提醒（今天刚打开不该被催）', () => {
    const recs = [{ date: ago(1), kind: 'study', minutes: 30 }];
    const info = review.breakInfo(recs, TODAY);
    assert.strictEqual(info.days, 1);
    assert.strictEqual(info.needNudge, false);
  });

  test('今天记过 → 0 天', () => {
    const info = review.breakInfo([{ date: TODAY, kind: 'study', minutes: 30 }], TODAY);
    assert.strictEqual(info.days, 0);
    assert.strictEqual(info.needNudge, false);
  });

  test('全新用户不提醒，避免首屏出现「你已 60 天没记录」', () => {
    const info = review.breakInfo([], TODAY);
    assert.strictEqual(info.days, 0);
    assert.strictEqual(info.hasHistory, false);
    assert.strictEqual(info.needNudge, false);
  });

  test('取最近的一条记录作为基准，与顺序无关', () => {
    const recs = [
      { date: ago(30), kind: 'study', minutes: 30 },
      { date: ago(2), kind: 'study', minutes: 30 },
      { date: ago(9), kind: 'study', minutes: 30 }
    ];
    assert.strictEqual(review.breakInfo(recs, TODAY).days, 2);
  });

  test('存在未来日期记录时不产生负数', () => {
    const info = review.breakInfo([{ date: util.addDays(TODAY, 3), minutes: 10 }], TODAY);
    assert.strictEqual(info.days, 0);
  });
});
