/* custom-tab-bar/index.js —— 纯文字自定义导航栏。
   不用图标：省掉两套切图与选中态维护，视觉更安静，也更符合「记录工具」的定位。 */
Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '今天' },
      { pagePath: '/pages/ledger/ledger', text: '账本' },
      { pagePath: '/pages/me/me', text: '我的' }
    ]
  },
  methods: {
    onTap(e) {
      var idx = Number(e.currentTarget.dataset.index);
      var item = this.data.list[idx];
      if (!item || idx === this.data.selected) return;
      wx.switchTab({ url: item.pagePath });
    }
  }
});
