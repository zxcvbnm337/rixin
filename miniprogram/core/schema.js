/* core/schema.js —— 小程序侧的数据结构定义。
   与网页版的关系：这是「做减法」之后的版本，网页版 23 个存储 key 收敛为 1 个核心集合 records。
   纯数据、无副作用，CommonJS 导出，可被 Node 直接加载跑测试。 */

var SCHEMA_VERSION = 1;

/* 存储 key 清单：全部走 tl.* 前缀，避免与未来其他模块冲突 */
var STORAGE_KEYS = {
  records: 'tl.records',
  pending: 'tl.pending',
  settings: 'tl.settings',
  meta: 'tl.meta'
};

/* 分类枚举：把网页版 9 个模块收敛成 6 类，录入时只需选一次。
   color 供图表与色点复用，深浅色主题下都能看清。 */
var KINDS = [
  { id: 'study', label: '学习', color: '#1f6feb' },
  { id: 'work', label: '工作', color: '#7c5cff' },
  { id: 'fitness', label: '运动', color: '#16a34a' },
  { id: 'diet', label: '饮食', color: '#f59e0b' },
  { id: 'fun', label: '娱乐', color: '#ec4899' },
  { id: 'other', label: '其他', color: '#8a8f98' }
];

var KIND_MAP = {};
KINDS.forEach(function (k) { KIND_MAP[k.id] = k; });

/* 网页版 → 小程序 的分类映射，留给将来「从网页版导入历史数据」用 */
var LEGACY_KIND_MAP = {
  study: 'study',
  dev: 'work',
  consult: 'work',
  fitness: 'fitness',
  diet: 'diet',
  game: 'fun'
};

function kindLabel(id) { return (KIND_MAP[id] || KIND_MAP.other).label; }
function kindColor(id) { return (KIND_MAP[id] || KIND_MAP.other).color; }

/* 常用时长快捷选项（分钟）：降低录入成本，点一下就完成 */
var QUICK_MINUTES = [15, 30, 45, 60, 90, 120];

/* 单条记录时长上限 24 小时，防止误输入把统计带偏 */
var MAX_MINUTES = 1440;

function defaultSettings() {
  return {
    weekStartsOn: 1,     // 1 = 一周从周一算起
    aiEnabled: false,    // AI 解析开关，默认关闭：个人主体下 AI 类目未开放，产品不依赖它
    reviewStyle: 'local',// local = 本地规则复盘；cloud = 云函数走大模型
    reminderOn: false    // 每日记录提醒，P5 接订阅消息
  };
}

function defaultMeta() {
  return { schemaVersion: SCHEMA_VERSION, createdAt: 0, lastSyncAt: null };
}

/* 云开发环境 ID：P2 阶段填真实值。留空时全部逻辑走本地，不影响运行与审核 */
var CLOUD_ENV = '';

/* 云端集合名（仅数据表名，与备案、类目无关） */
var COLLECTIONS = { records: 'records', reviews: 'reviews', users: 'users' };

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  STORAGE_KEYS: STORAGE_KEYS,
  KINDS: KINDS,
  KIND_MAP: KIND_MAP,
  LEGACY_KIND_MAP: LEGACY_KIND_MAP,
  kindLabel: kindLabel,
  kindColor: kindColor,
  QUICK_MINUTES: QUICK_MINUTES,
  MAX_MINUTES: MAX_MINUTES,
  defaultSettings: defaultSettings,
  defaultMeta: defaultMeta,
  CLOUD_ENV: CLOUD_ENV,
  COLLECTIONS: COLLECTIONS
};
