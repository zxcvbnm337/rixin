/* pages/me/me.js —— 「我的」页：设置 + 数据管理 + 说明。
   数据迁移走剪贴板 JSON，不依赖文件系统与网络，同时天然打通了
   「网页版导出 → 小程序导入」这条路径（分类用 LEGACY_KIND_MAP 自动转换）。 */

var store = require('../../core/store.js');
var schema = require('../../core/schema.js');
var util = require('../../core/util.js');

Page({
  data: {
    version: '0.1.0',
    ov: null,
    totalText: '0m',
    weekOptions: [
      { v: 1, label: '周一' },
      { v: 0, label: '周日' }
    ],
    weekStartsOn: 1,
    aiEnabled: false,
    canUndo: false,
    cloudReady: false,
    pending: 0
  },

  onLoad() { this.refresh(); },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.refresh();
  },

  refresh() {
    var app = getApp();
    var ov = store.overview();
    this.setData({
      version: (app && app.globalData && app.globalData.version) || '0.1.0',
      cloudReady: !!(app && app.globalData && app.globalData.cloudReady),
      ov: ov,
      totalText: util.fmtDuration(ov.minutes),
      weekStartsOn: store.weekStartsOn(),
      aiEnabled: !!store.settings().aiEnabled,
      canUndo: store.canUndo(),
      pending: ov.pending
    });
  },

  /* ---------- 设置 ---------- */

  pickWeekStart(e) {
    var v = Number(e.currentTarget.dataset.v);
    store.saveSettings({ weekStartsOn: v });
    this.refresh();
    wx.showToast({ title: '已更新，统计口径同步调整', icon: 'none' });
  },

  toggleAI() {
    var next = !this.data.aiEnabled;
    store.saveSettings({ aiEnabled: next });
    this.refresh();
    if (next) {
      wx.showModal({
        title: 'AI 解析尚未接入',
        content: '开关已记下。云端大模型解析需要小程序类目审核通过后开放，当前记录与复盘全部由本地规则完成，不受影响。',
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  /* ---------- 撤销 ---------- */

  onUndo() {
    if (!store.canUndo()) {
      wx.showToast({ title: '没有可撤销的操作', icon: 'none' });
      return;
    }
    store.undo();
    this.refresh();
    wx.showToast({ title: '已撤销', icon: 'none' });
  },

  /* ---------- 数据 ---------- */

  exportData() {
    var data = store.exportAll();
    wx.setClipboardData({
      data: JSON.stringify(data),
      success() {
        wx.showModal({
          title: '已复制到剪贴板',
          content: '共 ' + data.records.length + ' 条记录。建议粘贴到备忘录或聊天窗口保存，换手机时可以用「导入」恢复。',
          showCancel: false,
          confirmText: '好'
        });
      }
    });
  },

  importData() {
    var self = this;
    wx.getClipboardData({
      success(res) {
        var raw = String(res.data || '').trim();
        if (!raw) {
          wx.showToast({ title: '剪贴板是空的', icon: 'none' });
          return;
        }
        var data = null;
        try { data = JSON.parse(raw); } catch (e) { data = null; }
        if (!data || !Array.isArray(data.records)) {
          wx.showToast({ title: '格式不对，需要导出的 JSON', icon: 'none' });
          return;
        }
        wx.showModal({
          title: '导入 ' + data.records.length + ' 条记录？',
          content: '导入会覆盖当前全部记录，覆盖前建议先导出备份。',
          confirmText: '导入',
          success(r) {
            if (!r.confirm) return;
            var n = store.replaceAll(data);
            self.refresh();
            wx.showToast({ title: '已导入 ' + n + ' 条', icon: 'none' });
          }
        });
      }
    });
  },

  clearData() {
    var self = this;
    wx.showModal({
      title: '清空全部记录？',
      content: '此操作不可恢复。清空前建议先「导出数据」留一份备份。',
      confirmText: '清空',
      confirmColor: '#dc2626',
      success(res) {
        if (!res.confirm) return;
        store.snapshotMany([schema.STORAGE_KEYS.records]);
        store.write(schema.STORAGE_KEYS.records, []);
        self.refresh();
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  },

  about() {
    wx.showModal({
      title: '时间账本 v' + this.data.version,
      content: '记录你真正花掉的时间。\n\n所有数据默认只存在这台手机上，不上传、不需要登录，也没有广告。',
      showCancel: false,
      confirmText: '好'
    });
  }
});
