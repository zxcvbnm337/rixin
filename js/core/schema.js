/* schema.js —— 数据结构定义、存储 key 清单、默认值与枚举标签。纯数据，无副作用。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});

  var KEYS = {
    meta: 'pm.meta',
    settings: 'pm.settings',
    tasks: 'pm.tasks',
    notes: 'pm.notes',
    studyDirections: 'pm.study.directions',
    studyItems: 'pm.study.items',
    studyLogs: 'pm.study.logs',
    devProjects: 'pm.dev.projects',
    devTasks: 'pm.dev.tasks',
    devBugs: 'pm.dev.bugs',
    devNotes: 'pm.dev.notes',
    consultClients: 'pm.consult.clients',
    consultProjects: 'pm.consult.projects',
    consultDeliverables: 'pm.consult.deliverables',
    consultMeetings: 'pm.consult.meetings',
    consultWorklogs: 'pm.consult.worklogs',
    fitnessPlan: 'pm.fitness.plan',
    fitnessLogs: 'pm.fitness.logs',
    dietRecords: 'pm.diet.records',
    dietFavorites: 'pm.diet.favorites',
    gameGames: 'pm.game.games',
    gameLogs: 'pm.game.logs'
  };

  /* 数组类型的集合（导入导出、条数统计按此遍历） */
  var COLLECTIONS = [
    KEYS.tasks, KEYS.notes,
    KEYS.studyDirections, KEYS.studyItems, KEYS.studyLogs,
    KEYS.devProjects, KEYS.devTasks, KEYS.devBugs, KEYS.devNotes,
    KEYS.consultClients, KEYS.consultProjects, KEYS.consultDeliverables,
    KEYS.consultMeetings, KEYS.consultWorklogs,
    KEYS.fitnessPlan, KEYS.fitnessLogs,
    KEYS.dietRecords, KEYS.dietFavorites,
    KEYS.gameGames, KEYS.gameLogs
  ];

  var ALL_KEYS = COLLECTIONS.concat([KEYS.meta, KEYS.settings]);

  var defaultSettings = {
    theme: 'auto',            // auto | light | dark
    dayStart: '06:00',
    dayEnd: '18:00',
    weekStartsOn: 1,          // 1 = 周一
    defaultPage: 'home',
    backupRemindDays: 7
  };

  var defaultMeta = {
    schemaVersion: 1,
    createdAt: 0,
    lastBackupAt: null,
    lastExportAt: null,
    backupTipClosedAt: null
  };

  /* 各枚举的中文标签 */
  var LABELS = {
    priority: { high: '高', mid: '中', low: '低' },
    priorityOrder: { high: 0, mid: 1, low: 2 },
    studyItemType: { course: '课程', book: '书', doc: '文档', video: '视频', other: '其他' },
    studyItemStatus: { todo: '未开始', doing: '进行中', done: '已完成', paused: '搁置' },
    studyDirectionStatus: { active: '进行中', done: '已达成', archived: '已归档' },
    projectStatus: { doing: '进行中', paused: '暂停', done: '已完成' },
    taskStatus: { todo: '待办', doing: '进行中', done: '已完成' },
    taskStatusOrder: ['todo', 'doing', 'done'],
    bugLevel: { high: '高', mid: '中', low: '低' },
    bugStatus: { open: '待修', fixing: '修复中', resolved: '已解决' },
    clientStatus: { talking: '洽谈中', doing: '进行中', closed: '已结束' },
    deliverableStatus: { pending: '待交付', delivered: '已交付' },
    gamePlatform: { pc: 'PC', console: '主机', mobile: '手机' },
    gameStatus: { wish: '想玩', playing: '在玩', cleared: '已通关', dropped: '弃坑' },
    gameStatusOrder: ['playing', 'wish', 'cleared', 'dropped'],
    meal: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' },
    mealOrder: ['breakfast', 'lunch', 'dinner', 'snack'],
    theme: { auto: '跟随时间', light: '白天', dark: '晚上' }
  };

  /* 模块中文名，用于「关联模块」标签与全局搜索的来源标注 */
  var MODULE_LABELS = {
    home: '首页总览',
    today: '今日',
    study: '学习计划',
    dev: '开发工作',
    consult: '咨询工作',
    fitness: '健身计划',
    diet: '饮食计划',
    game: '游戏娱乐',
    settings: '数据与设置'
  };

  /* 取默认值：集合返回 []，对象返回副本 */
  function defaults(key) {
    if (key === KEYS.settings) return JSON.parse(JSON.stringify(defaultSettings));
    if (key === KEYS.meta) return JSON.parse(JSON.stringify(defaultMeta));
    return [];
  }

  /* 健身周计划初始模板：7 天全空、非休息日 */
  function defaultFitnessPlan() {
    var out = [];
    for (var i = 1; i <= 7; i++) {
      out.push({ id: 'fp_' + i, weekday: i, content: '', rest: false });
    }
    return out;
  }

  root.App.schema = {
    KEYS: KEYS,
    COLLECTIONS: COLLECTIONS,
    ALL_KEYS: ALL_KEYS,
    defaultSettings: defaultSettings,
    defaultMeta: defaultMeta,
    LABELS: LABELS,
    MODULE_LABELS: MODULE_LABELS,
    defaults: defaults,
    defaultFitnessPlan: defaultFitnessPlan
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
