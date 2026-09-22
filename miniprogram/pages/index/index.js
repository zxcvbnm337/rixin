/* pages/index/index.js —— 「今天」页：整条链路里唯一必须顺手的页面。
   设计目标：从打开小程序到记完一笔，不超过 3 次点击 + 一句话。 */

var store = require('../../core/store.js');
var schema = require('../../core/schema.js');
var util = require('../../core/util.js');
var review = require('../../core/review.js');

var EMPTY_FORM = { title: '', kind: 'study', minutes: 30 };

Page({
  data: {
    date: '',
    dateCN: '',
    kinds: schema.KINDS,
    quickMinutes: schema.QUICK_MINUTES,
    form: Object.assign({}, EMPTY_FORM),
    customMin: '',
    list: [],
    todayText: '0m',
    todayCount: 0,
    streak: 0,
    nudge: '',
    saving: false
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    /* 自定义 tabBar 的选中态由页面自己同步 */
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  /* 把原始记录加工成模板可直接渲染的形状。
     原则：渲染层不做任何计算，WXML 里不出现函数调用。 */
  decorate(rec) {
    var t = new Date(rec.createdAt || Date.now());
    return Object.assign({}, rec, {
      kindLabel: schema.kindLabel(rec.kind),
      kindColor: schema.kindColor(rec.kind),
      durText: util.fmtDuration(rec.minutes),
      timeText: util.pad2(t.getHours()) + ':' + util.pad2(t.getMinutes()),
      fromAI: rec.source === 'ai'
    });
  },

  refresh() {
    var today = util.today();
    var recs = store.listByDate(today);
    var total = store.minutesOn(today);

    /* 断档两天以上、且本来就有记录习惯，才提醒一次；新用户不打扰 */
    var brk = review.breakInfo(store.all(), today);
    var nudge = '';
    if (!recsToday && brk.needNudge) {
      nudge = '上一次记录是 ' + brk.days + ' 天前了，先补一笔把节奏接上。';
    }

    this.setData({
      date: today,
      dateCN: util.formatDateCN(today),
      list: recs.map(this.decorate),
      todayText: util.fmtDuration(total),
      todayCount: recs.length,
      streak: store.streak(),
      nudge: nudge
    });
  },

  /* ---------- 表单 ---------- */

  onInput(e) {
    var key = e.currentTarget.dataset.field;
    var patch = {};
    patch['form.' + key] = e.detail.value;
    this.setData(patch);
  },

  pickKind(e) {
    this.setData({ 'form.kind': e.currentTarget.dataset.id });
  },

  pickMinutes(e) {
    var m = Number(e.currentTarget.dataset.min);
    this.setData({ 'form.minutes': m, customMin: '' });
  },

  onCustomMin(e) {
    var v = e.detail.value;
    var n = util.parseDuration(v);
    this.setData({
      customMin: v,
      'form.minutes': (n === null ? this.data.form.minutes : util.clamp(n, 0, schema.MAX_MINUTES))
    });
  },

  /* ---------- 核心动作 ---------- */

  onAdd() {
    var f = this.data.form;
    var title = String(f.title || '').trim();
    if (!title) {
      wx.showToast({ title: '写一句话再记', icon: 'none' });
      return;
    }
    if (!(f.minutes > 0)) {
      wx.showToast({ title: '选一个时长', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.data.saving = true;

    store.add({
      date: this.data.date,
      kind: f.kind,
      title: title,
      minutes: f.minutes,
      raw: title,
      source: 'manual'
    });

    /* 保留分类与时长，只清标题：连续记多笔时少点几下 */
    this.setData({
      'form.title': '',
      customMin: '',
      saving: false
    });
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    this.refresh();
  },

  onDelete(e) {
    var id = e.currentTarget.dataset.id;
    var self = this;
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后可以在「我的」页撤销。',
      confirmText: '删除',
      confirmColor: '#dc2626',
      success(res) {
        if (!res.confirm) return;
        store.remove(id);
        self.refresh();
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  },

  goReview() {
    wx.navigateTo({ url: '/pages/review/review' });
  },

  goLedger() {
    wx.switchTab({ url: '/pages/ledger/ledger' });
  }
});
