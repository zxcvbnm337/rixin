/* pages/review/review.js —— 周复盘页。
   这是「用户能拿走什么」的答案：把一周的零散记录收敛成一段结论 + 一条建议。
   生成方式做成可切换的：默认本地规则（不依赖网络与大模型，随开随有），
   P3 阶段云函数就绪后可在「我的」页切到云端大模型版本。 */

var store = require('../../core/store.js');
var schema = require('../../core/schema.js');
var util = require('../../core/util.js');
var review = require('../../core/review.js');

Page({
  data: {
    rangeText: '',
    isThisWeek: true,
    result: null,
    weekOffset: 0,          // 0 = 本周，-1 = 上周
    aiEnabled: false,
    generatorLabel: '本地规则',
    pending: 0
  },

  onLoad() {
    this.build();
  },

  onShow() {
    this.build();
  },

  /* 上一周 / 下一周。不允许翻到未来 */
  shiftWeek(e) {
    var delta = Number(e.currentTarget.dataset.delta);
    var next = this.data.weekOffset + delta;
    if (next > 0) return;
    this.setData({ weekOffset: next });
    this.build();
  },

  build() {
    var settings = store.settings();
    var endDate = util.addDays(util.today(), this.data.weekOffset * 7);

    var range = store.weekRange(endDate);
    var recs = store.listBetween(range.from, range.to);

    /* 上周数据用于环比。翻到历史上某周时，同样取它前一周 */
    var prevRange = store.weekRange(util.addDays(range.from, -1));
    var prevRecs = store.listBetween(prevRange.from, prevRange.to);

    var result = review.buildLocalReview(recs, {
      today: util.today(),
      range: range,
      lastWeekRecords: prevRecs
    });

    this.setData({
      rangeText: this.rangeLabel(range, this.data.weekOffset),
      isThisWeek: this.data.weekOffset === 0,
      result: result,
      aiEnabled: !!settings.aiEnabled,
      generatorLabel: settings.aiEnabled ? '本地规则（AI 未接入）' : '本地规则',
      pending: store.pendingCount()
    });
  },

  rangeLabel(range, offset) {
    var a = util.parseDate(range.from);
    var b = util.parseDate(range.to);
    var tail = offset === 0 ? '（本周）' : '';
    return (a.getMonth() + 1) + '月' + a.getDate() + '日 — ' + (b.getMonth() + 1) + '月' + b.getDate() + '日' + tail;
  },

  /* 把复盘结论复制出去，方便贴到自己的笔记里。不引入分享/转发，避免社交类目风险 */
  copyResult() {
    var r = this.data.result;
    if (!r || !r.hasData) {
      wx.showToast({ title: '还没有可复制的内容', icon: 'none' });
      return;
    }
    var lines = [this.data.rangeText, r.headline].concat(r.lines).concat(['建议：' + r.suggestion]);
    wx.setClipboardData({
      data: lines.join('\n'),
      success() { wx.showToast({ title: '已复制', icon: 'none' }); }
    });
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  }
});
