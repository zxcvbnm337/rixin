/* app.js —— 应用入口。
   P0/P1 阶段纯本地运行，不依赖 AppID 与云开发，可直接用游客模式打开。 */
const store = require('./core/store.js');
const schema = require('./core/schema.js');

App({
  globalData: {
    openid: '',
    cloudReady: false,
    version: '0.1.0'
  },

  onLaunch() {
    store.init();

    /* P2 阶段启用云开发：
       if (wx.cloud) {
         wx.cloud.init({ env: schema.CLOUD_ENV, traceUser: true });
         this.globalData.cloudReady = true;
       }
    */
  },

  onShow() {
    /* 网络恢复后补传离线期间积压的写入 */
    store.flushPending();
  }
});
