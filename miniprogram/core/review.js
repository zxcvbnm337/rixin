/* core/review.js —— 周复盘生成器。
   设计原则：AI 是增强项，不是前置依赖。
   没有云开发、没有大模型额度、审核没批 AI 类目时，这里用纯规则产出
   「有信息量」的复盘结论，保证产品在任何情况下都能给用户一个看得见的交付。

   buildLocalReview 返回结构化结果，WXML 直接遍历渲染，不在模板里算逻辑。 */

var util = require('./util.js');
var schema = require('./schema.js');

/* 规则阈值集中放这里，便于将来调参或做成可配置 */
var RULE = {
  lowDailyMinutes: 30,     // 日均低于 30 分钟：记录习惯还没建立
  highSingleKindPct: 70,   // 单一分类占比超过 70%：结构失衡
  breakDays: 2             // 连续 2 天没记录：断档提醒
};

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function buildLocalReview(records, opts) {
  opts = opts || {};
  var today = opts.today || util.today();
  var recs = records || [];
  var lastRecs = opts.lastWeekRecords || null;

  var totalMinutes = util.sum(recs, function (r) { return r.minutes; });
  var kindMap = {};
  schema.KINDS.forEach(function (k) {
    kindMap[k.id] = { id: k.id, label: k.label, color: k.color, minutes: 0, count: 0 };
  });
  var dayMap = {};
  recs.forEach(function (r) {
    if (!r) return;
    var k = kindMap[r.kind] || kindMap.other;
    k.minutes += (r.minutes || 0);
    k.count += 1;
    dayMap[r.date] = true;
  });

  var activeDays = Object.keys(dayMap).length;
  var range = opts.range || null;
  var spanDays = range ? (util.diffDays(range.to, range.from) + 1) : 7;
  var dailyAvg = spanDays > 0 ? Math.round(totalMinutes / spanDays) : 0;

  /* 按投入时长排序的分类分布，零时长的类别不展示，避免刷屏 */
  var kinds = schema.KINDS.map(function (k) { return kindMap[k.id]; })
    .filter(function (k) { return k.minutes > 0; })
    .sort(function (a, b) { return b.minutes - a.minutes; })
    .map(function (k) {
      return {
        id: k.id,
        label: k.label,
        color: k.color,
        minutes: k.minutes,
        count: k.count,
        text: util.fmtDuration(k.minutes),
        pct: pct(k.minutes, totalMinutes)
      };
    });

  var topKind = kinds[0] || null;
  var restPct = topKind ? (100 - topKind.pct) : 0;

  /* 与上周对比：只有拿到上周数据时才输出，避免编造 */
  var compare = null;
  if (lastRecs) {
    var lastTotal = util.sum(lastRecs, function (r) { return r.minutes; });
    var delta = totalMinutes - lastTotal;
    compare = {
      lastMinutes: lastTotal,
      lastText: util.fmtDuration(lastTotal),
      delta: delta,
      deltaText: (delta >= 0 ? '+' : '-') + util.fmtDuration(Math.abs(delta)),
      up: delta >= 0,
      pct: lastTotal ? Math.round((Math.abs(delta) / lastTotal) * 100) : null
    };
  }

  /* 结论头：一句话概括这一周的时间去了哪 */
  var headline;
  if (!totalMinutes) {
    headline = '这一周还没有记录。';
  } else if (topKind) {
    headline = '这一周投入最多的是「' + topKind.label + '」，' + topKind.text +
      '，占 ' + topKind.pct + '%。';
  } else {
    headline = '这一周共记录 ' + util.fmtDuration(totalMinutes) + '。';
  }

  /* 事实行：只陈述可验证的数字 */
  var lines = [];
  if (totalMinutes) {
    lines.push('本周共记录 ' + recs.length + ' 条，合计 ' + util.fmtDuration(totalMinutes) + '，日均 ' + util.fmtDuration(dailyAvg) + '。');
    lines.push('有记录的天数 ' + activeDays + ' / ' + spanDays + ' 天。');
    if (topKind) lines.push('记录条数最多的分类是「' + topKind.label + '」，共 ' + topKind.count + ' 条。');
    if (compare) {
      lines.push('相比上周' + (compare.up ? '增加' : '减少') + ' ' + util.fmtDuration(Math.abs(compare.delta)) +
        '（上周 ' + compare.lastText + '）。');
    }
  }

  /* 建议：按优先级只给一条，说多了等于没说 */
  var suggestion;
  if (!totalMinutes) {
    suggestion = '先记一件事试试：写下一句话加上时长就够了，不用分类得很准。';
  } else if (activeDays <= 2 && spanDays >= 5) {
    suggestion = '这周只在 ' + activeDays + ' 天留下了记录。与其追求每天记满，不如固定一个时间点（比如睡前）打开一次。';
  } else if (dailyAvg < RULE.lowDailyMinutes) {
    suggestion = '日均投入 ' + util.fmtDuration(dailyAvg) + '，还比较零散。可以挑一件最想推进的事，明天先给它留出 30 分钟。';
  } else if (topKind && topKind.pct >= RULE.highSingleKindPct && restPct <= 30) {
    suggestion = '「' + topKind.label + '」占了 ' + topKind.pct + '%，注意力相当集中。留意一下运动和休息有没有被挤掉。';
  } else if (compare && compare.up) {
    suggestion = '比上周多投入 ' + util.fmtDuration(Math.abs(compare.delta)) + '，节奏是往上的，保持住。';
  } else if (compare && !compare.up) {
    suggestion = '比上周少 ' + util.fmtDuration(Math.abs(compare.delta)) + '。如果是有意为之的休息就没问题，否则下周先补回一半。';
  } else {
    suggestion = '分布比较均衡，继续累积记录，数据越多后面的趋势判断越准。';
  }

  return {
    hasData: totalMinutes > 0,
    totalMinutes: totalMinutes,
    totalText: util.fmtDuration(totalMinutes),
    dailyAvg: dailyAvg,
    dailyAvgText: util.fmtDuration(dailyAvg),
    activeDays: activeDays,
    spanDays: spanDays,
    records: recs.length,
    headline: headline,
    lines: lines,
    kinds: kinds,
    compare: compare,
    suggestion: suggestion,
    generator: 'local'   // 便于将来区分 local / cloud 两种来源
  };
}

/* 断档检测：距离最后一条记录过了几天。
   语义刻意选「距最后一条记录的天数」，而不是「空档天数」——
   对用户来说，昨天记过、今天刚打开不该被催；上次记录在两天前才该被提醒。
   全新用户（一条都没有）不提醒，否则首屏就会出现「你已经 60 天没记录了」这种蠢话。 */
function breakInfo(records, todayStr) {
  var today = todayStr || util.today();
  var latest = null;
  (records || []).forEach(function (r) {
    if (r && r.date && (!latest || r.date > latest)) latest = r.date;
  });

  if (!latest) {
    return { days: 0, lastDate: null, hasHistory: false, needNudge: false };
  }

  var gap = util.diffDays(today, latest);
  if (gap < 0) gap = 0;   // 存在未来日期的记录时，不产生负数
  return {
    days: gap,
    lastDate: latest,
    hasHistory: true,
    needNudge: gap >= RULE.breakDays
  };
}

module.exports = {
  RULE: RULE,
  buildLocalReview: buildLocalReview,
  breakInfo: breakInfo
};
