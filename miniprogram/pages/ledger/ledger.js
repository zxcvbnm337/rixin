/* pages/ledger/ledger.js —— 「账本」页：把记录变成分布。
   用户愿意回来，靠的不是「记得多」，而是「看得见时间去了哪」。
   纯只读页面，不产生任何数据。 */

var store = require('../../core/store.js');
var schema = require('../../core/schema.js');
var util = require('../../core/util.js');

var RANGE_DAYS = 7;
var BAR_MAX_H = 260;   // rpx，柱状图最高高度

Page({
  data: {
    ranges: [
      { days: 7, label: '近 7 天' },
      { days: 30, label: '近 30 天' }
    ],
    days: RANGE_DAYS,
    filters: [],
    filter: 'all',
    totalText: '0m',
    avgText: '0m',
    recordCount: 0,
    bars: [],
    kinds: [],
    groups: []
  },

  onLoad() {
    var filters = [{ id: 'all', label: '全部', color: '' }].concat(
      schema.KINDS.map(function (k) { return { id: k.id, label: k.label, color: k.color }; })
    );
    this.setData({ filters: filters });
    this.refresh();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  pickRange(e) {
    this.setData({ days: Number(e.currentTarget.dataset.days) }, this.refresh);
  },

  pickFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.id }, this.refreshList);
  },

  /* 全量重算：范围、柱状图、分类分布、清单 */
  refresh() {
    var days = this.data.days;
    var from = util.addDays(util.today(), -(days - 1));
    var to = util.today();
    var recs = store.listBetween(from, to);

    var total = util.sum(recs, function (r) { return r.minutes; });
    var kindTotals = store.byKind(recs);

    /* 柱状图：高度按当期最大值归一，避免一天特别长把其他天压平 */
    var raw = store.recentDays(days, to);
    var max = raw.reduce(function (a, d) { return Math.max(a, d.minutes); }, 0);
    var bars = raw.map(function (d) {
      var pub = days <= 7;
      return {
        date: d.date,
        label: pub ? util.weekdayName(d.date).replace('周', '') : String(util.parseDate(d.date).getDate()),
        minutes: d.minutes,
        text: util.fmtDuration(d.minutes),
        h: max > 0 ? Math.max(4, Math.round((d.minutes / max) * BAR_MAX_H)) : 4,
        today: d.date === to
      };
    });

    /* 分类分布：按占比排序，只显示有投入的类别 */
    var kinds = schema.KINDS.map(function (k) {
      return {
        id: k.id,
        label: k.label,
        color: k.color,
        minutes: kindTotals[k.id] || 0,
        text: util.fmtDuration(kindTotals[k.id] || 0),
        pct: total ? Math.round(((kindTotals[k.id] || 0) / total) * 100) : 0
      };
    }).filter(function (k) { return k.minutes > 0; })
      .sort(function (a, b) { return b.minutes - a.minutes; });

    this.setData({
      totalText: util.fmtDuration(total),
      avgText: util.fmtDuration(Math.round(total / days)),
      recordCount: recs.length,
      bars: bars,
      kinds: kinds
    });

    this._recs = recs;
    this.refreshList();
  },

  /* 只重绘清单部分：切换筛选时不重算统计，也不打断其他区域的展示 */
  refreshList() {
    var filter = this.data.filter;
    var recs = this._recs || [];
    if (filter !== 'all') {
      recs = recs.filter(function (r) { return r.kind === filter; });
    }

    /* 按日期倒序分组，同一天内按录入时间倒序 */
    var byDate = util.groupBy(recs, function (r) { return r.date; });
    var groups = Object.keys(byDate)
      .sort(function (a, b) { return a < b ? 1 : -1; })
      .map(function (date) {
        var items = byDate[date].slice().sort(store.cmpTimeDesc)
          .map(function (r) {
            var t = new Date(r.createdAt || Date.now());
            return {
              id: r.id,
              title: r.title,
              kindLabel: schema.kindLabel(r.kind),
              kindColor: schema.kindColor(r.kind),
              timeText: util.pad2(t.getHours()) + ':' + util.pad2(t.getMinutes()),
              durText: util.fmtDuration(r.minutes)
            };
          });
        var dayTotal = util.sum(byDate[date], function (r) { return r.minutes; });
        return {
          date: date,
          dateCN: util.formatDateCN(date),
          totalText: util.fmtDuration(dayTotal),
          count: items.length,
          items: items
        };
      });

    this.setData({ groups: groups });
  },

  goToday() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
