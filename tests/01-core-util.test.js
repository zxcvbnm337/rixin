'use strict';
/* Step 1 · 基础层：util.js 与 schema.js 的单元测试 */
const { test } = require('node:test');
const assert = require('node:assert');
const { createApp, CORE_FILES, plain } = require('./harness');

const ctx = createApp({ files: CORE_FILES });
const App = ctx.App;
const util = App.util;
const schema = App.schema;

test('util：加载成功且命名空间完整', () => {
  assert.ok(App.util, 'App.util 应存在');
  assert.ok(App.schema, 'App.schema 应存在');
});

test('util.pad2 补零', () => {
  assert.strictEqual(util.pad2(0), '00');
  assert.strictEqual(util.pad2(9), '09');
  assert.strictEqual(util.pad2(12), '12');
});

test('util.fmtDate / today 使用本地时区，不出现时区偏移', () => {
  const d = new Date(2026, 8, 20, 0, 30); // 2026-09-20 00:30 本地
  assert.strictEqual(util.fmtDate(d), '2026-09-20');
  const late = new Date(2026, 8, 20, 23, 59);
  assert.strictEqual(util.fmtDate(late), '2026-09-20');
  assert.strictEqual(util.today(), util.fmtDate(new Date()));
});

test('util.parseDate / addDays 跨月跨年正确', () => {
  assert.strictEqual(util.addDays('2026-09-20', 1), '2026-09-21');
  assert.strictEqual(util.addDays('2026-09-30', 1), '2026-10-01');
  assert.strictEqual(util.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(util.addDays('2026-01-01', -1), '2025-12-31');
});

test('util.diffDays 计算天数差', () => {
  assert.strictEqual(util.diffDays('2026-09-21', '2026-09-20'), 1);
  assert.strictEqual(util.diffDays('2026-09-20', '2026-09-20'), 0);
  assert.strictEqual(util.diffDays('2026-09-20', '2026-09-25'), -5);
});

test('util.weekdayName / weekdayIndexMon', () => {
  assert.strictEqual(util.weekdayName('2026-09-20'), '周日');
  assert.strictEqual(util.weekdayIndexMon('2026-09-20'), 7); // 周日 -> 7
  assert.strictEqual(util.weekdayIndexMon('2026-09-21'), 1); // 周一 -> 1
});

test('util.startOfWeek 周一起算与周日起算', () => {
  assert.strictEqual(util.startOfWeek('2026-09-20', 1), '2026-09-14'); // 周日 -> 上一个周一
  assert.strictEqual(util.startOfWeek('2026-09-20', 0), '2026-09-20');
  assert.strictEqual(util.startOfWeek('2026-09-23', 1), '2026-09-21');
});

test('util.monthMatrix 生成整齐的周矩阵', () => {
  const weeks = util.monthMatrix(2026, 9, 1); // 2026 年 9 月
  weeks.forEach(w => assert.strictEqual(w.length, 7, '每周应为 7 格'));
  const flat = weeks.reduce((a, w) => a.concat(w), []);
  const real = flat.filter(Boolean);
  assert.strictEqual(real.length, 30, '9 月应有 30 天');
  assert.strictEqual(real[0], '2026-09-01');
  assert.strictEqual(real[real.length - 1], '2026-09-30');
});

test('util.esc 转义 HTML 特殊字符', () => {
  assert.strictEqual(util.esc('<script>"a"&\'b\''), '&lt;script&gt;&quot;a&quot;&amp;&#39;b&#39;');
  assert.strictEqual(util.esc(null), '');
  assert.strictEqual(util.esc(undefined), '');
});

test('util.uid 生成的 id 唯一且带前缀', () => {
  const a = util.uid('task'), b = util.uid('task');
  assert.notStrictEqual(a, b);
  assert.ok(a.startsWith('task_'));
});

test('util.clamp 边界处理', () => {
  assert.strictEqual(util.clamp(150, 0, 100), 100);
  assert.strictEqual(util.clamp(-5, 0, 100), 0);
  assert.strictEqual(util.clamp('abc', 0, 100), 0);
  assert.strictEqual(util.clamp(42, 0, 100), 42);
});

test('util.fmtDuration 时长格式化', () => {
  assert.strictEqual(util.fmtDuration(0), '0m');
  assert.strictEqual(util.fmtDuration(45), '45m');
  assert.strictEqual(util.fmtDuration(60), '1h');
  assert.strictEqual(util.fmtDuration(90), '1h30m');
  assert.strictEqual(util.fmtDuration(120), '2h');
});

test('util.parseDuration 支持 90 / 1.5h / 1h30m 三种写法', () => {
  assert.strictEqual(util.parseDuration('90'), 90);
  assert.strictEqual(util.parseDuration('1.5h'), 90);
  assert.strictEqual(util.parseDuration('1h30m'), 90);
  assert.strictEqual(util.parseDuration('1h'), 60);
  assert.strictEqual(util.parseDuration('30m'), 30);
  assert.strictEqual(util.parseDuration(' 2H '), 120);
  assert.strictEqual(util.parseDuration('m45'), 45);
  assert.strictEqual(util.parseDuration('abc'), null);
  assert.strictEqual(util.parseDuration(''), null);
  /* 'h30' 含义歧义（30 小时 vs 30 分钟），必须拒绝，避免 60 倍误差 */
  assert.strictEqual(util.parseDuration('h30'), null);
});

test('util.fmtClock 秒转计时显示', () => {
  assert.strictEqual(util.fmtClock(0), '00:00:00');
  assert.strictEqual(util.fmtClock(61), '00:01:01');
  assert.strictEqual(util.fmtClock(3661), '01:01:01');
});

test('util.fmtMoney 千分位', () => {
  assert.strictEqual(util.fmtMoney(0), '¥0');
  assert.strictEqual(util.fmtMoney(12000), '¥12,000');
});

test('util.groupBy / sortBy / sum / uniq', () => {
  const arr = [{ k: 'a', v: 1 }, { k: 'b', v: 2 }, { k: 'a', v: 3 }];
  assert.strictEqual(util.groupBy(arr, x => x.k).a.length, 2);
  assert.strictEqual(util.sum(arr, x => x.v), 6);
  assert.strictEqual(util.sortBy(arr, x => x.v, true)[0].v, 3);
  assert.deepStrictEqual(plain(util.uniq([1, 1, 2, 3, 3])), [1, 2, 3]);
});

test('schema：存储 key 前缀统一为 pm.', () => {
  Object.keys(schema.KEYS).forEach(k => {
    assert.ok(schema.KEYS[k].startsWith('pm.'), k + ' 应以 pm. 开头');
  });
});

test('schema：COLLECTIONS 全部是数组默认值，meta/settings 是对象', () => {
  schema.COLLECTIONS.forEach(k => {
    assert.ok(Array.isArray(schema.defaults(k)), k + ' 默认值应为数组');
  });
  assert.strictEqual(typeof schema.defaults(schema.KEYS.settings), 'object');
  assert.ok(!Array.isArray(schema.defaults(schema.KEYS.settings)));
  assert.strictEqual(typeof schema.defaults(schema.KEYS.meta), 'object');
});

test('schema：ALL_KEYS = 集合 + meta + settings，共 22 条', () => {
  assert.strictEqual(schema.ALL_KEYS.length, 22);
  assert.strictEqual(schema.COLLECTIONS.length, 20);
  assert.ok(schema.ALL_KEYS.includes(schema.KEYS.meta));
  assert.ok(schema.ALL_KEYS.includes(schema.KEYS.settings));
});

test('schema：默认设置符合 PRD 要求', () => {
  const s = schema.defaultSettings;
  assert.strictEqual(s.theme, 'auto');
  assert.strictEqual(s.dayStart, '06:00');
  assert.strictEqual(s.dayEnd, '18:00');
  assert.strictEqual(s.weekStartsOn, 1);
  assert.strictEqual(s.defaultPage, 'home');
  assert.strictEqual(s.backupRemindDays, 7);
});

test('schema：defaults 返回独立副本，互不影响', () => {
  const a = schema.defaults(schema.KEYS.settings);
  a.theme = 'dark';
  const b = schema.defaults(schema.KEYS.settings);
  assert.strictEqual(b.theme, 'auto', '默认值不能被调用方改坏');
});

test('schema：健身周计划初始为 7 天且互不相同', () => {
  const plan = schema.defaultFitnessPlan();
  assert.strictEqual(plan.length, 7);
  const days = plan.map(p => p.weekday);
  assert.deepStrictEqual(plain(days), [1, 2, 3, 4, 5, 6, 7]);
});

test('schema：标签表覆盖全部枚举值', () => {
  assert.deepStrictEqual(plain(Object.keys(schema.LABELS.taskStatus)), ['todo', 'doing', 'done']);
  assert.deepStrictEqual(plain(schema.LABELS.mealOrder), ['breakfast', 'lunch', 'dinner', 'snack']);
  assert.strictEqual(schema.LABELS.priority.high, '高');
  assert.deepStrictEqual(plain(schema.LABELS.gameStatusOrder), ['playing', 'wish', 'cleared', 'dropped']);
});
