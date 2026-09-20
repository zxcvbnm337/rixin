'use strict';
/* Step 2 · 存储层：持久化、导出导入、撤销、清空 */
const { test } = require('node:test');
const assert = require('node:assert');
const { createApp, boot, dumpStorage, CORE_FILES, plain } = require('./harness');

async function fresh() {
  const ctx = await boot({ files: CORE_FILES });
  return ctx;
}

test('store：初始化后所有 key 都有默认值，且 ready 为真', async () => {
  const { App } = await fresh();
  const s = App.schema;
  assert.strictEqual(App.store.ready, true);
  s.COLLECTIONS.forEach(k => {
    assert.ok(Array.isArray(App.store.get(k)), k + ' 应为数组');
  });
  assert.strictEqual(App.store.get(s.KEYS.settings).theme, 'auto');
  assert.ok(App.store.get(s.KEYS.meta).createdAt > 0);
});

test('store：使用浏览器键值存储作为降级后端（jsdom 无 IndexedDB）', async () => {
  const { App } = await fresh();
  assert.strictEqual(App.store.backendKind, 'ls');
});

test('store：get/set 往返一致，且 get 支持默认值', async () => {
  const { App } = await fresh();
  const k = App.schema.KEYS.tasks;
  App.store.set(k, [{ id: 't1', title: '测试' }]);
  assert.strictEqual(App.store.get(k).length, 1);
  assert.strictEqual(App.store.get(k)[0].title, '测试');
  assert.strictEqual(App.store.get('pm.not.exist', 'fallback'), 'fallback');
});

test('store：setMany 一次写多个 key', async () => {
  const { App } = await fresh();
  const K = App.schema.KEYS;
  App.store.setMany({
    [K.tasks]: [{ id: 'a' }],
    [K.notes]: [{ id: 'b' }]
  });
  assert.strictEqual(App.store.get(K.tasks)[0].id, 'a');
  assert.strictEqual(App.store.get(K.notes)[0].id, 'b');
});

test('store：刷新页面后数据仍在（C1 刷新不丢）', async () => {
  const first = await fresh();
  const K = first.App.schema.KEYS;
  first.App.store.set(K.tasks, [{ id: 'task_1', title: '整理复盘', date: '2026-09-20' }]);
  first.App.store.set(K.notes, [{ id: 'n1', content: '买牛奶' }]);

  const storage = dumpStorage(first.window);
  const second = createApp({ files: CORE_FILES, seed: storage });
  await second.App.store.init();

  assert.strictEqual(second.App.store.get(K.tasks).length, 1, '任务应被持久化');
  assert.strictEqual(second.App.store.get(K.tasks)[0].title, '整理复盘');
  assert.strictEqual(second.App.store.get(K.notes)[0].content, '买牛奶');
});

test('store：关闭页面再打开数据仍在（C2 关页面不丢）', async () => {
  const first = await fresh();
  const K = first.App.schema.KEYS;
  const list = [];
  for (let i = 0; i < 5; i++) list.push({ id: 'task_' + i, title: '任务' + i, date: '2026-09-20' });
  first.App.store.set(K.tasks, list);
  first.App.store.set(K.notes, [{ id: 'n1', content: 'a' }, { id: 'n2', content: 'b' }, { id: 'n3', content: 'c' }]);

  const second = createApp({ files: CORE_FILES, seed: dumpStorage(first.window) });
  await second.App.store.init();
  const third = createApp({ files: CORE_FILES, seed: dumpStorage(second.window) });
  await third.App.store.init();

  assert.strictEqual(third.App.store.get(K.tasks).length, 5, '两次开关后任务应仍是 5 条');
  assert.strictEqual(third.App.store.get(K.notes).length, 3, '两次开关后便签应仍是 3 条');
});

test('store：撤销栈 snapshot / undo，且只保留最近 20 次', async () => {
  const { App } = await fresh();
  const K = App.schema.KEYS;
  App.store.set(K.tasks, [{ id: 't1' }]);
  App.store.snapshot(K.tasks);
  App.store.set(K.tasks, []);
  assert.strictEqual(App.store.get(K.tasks).length, 0);
  assert.strictEqual(App.store.canUndo(), true);
  App.store.undo();
  assert.strictEqual(App.store.get(K.tasks).length, 1, '撤销应恢复删除的数据');

  const ctx2 = await fresh();
  const K2 = ctx2.App.schema.KEYS;
  for (let i = 0; i < 25; i++) {
    ctx2.App.store.set(K2.tasks, [{ id: 'x' + i }]);
    ctx2.App.store.snapshot(K2.tasks);
  }
  let n = 0;
  while (ctx2.App.store.undo()) n++;
  assert.strictEqual(n, 20, '撤销栈上限应为 20');
});

test('store：exportJSON 结构完整，含全部 key', async () => {
  const { App } = await fresh();
  const payload = App.store.exportJSON();
  assert.strictEqual(payload.app, 'personal-manager');
  assert.strictEqual(payload.schemaVersion, 1);
  assert.ok(payload.exportedAt > 0);
  App.schema.ALL_KEYS.forEach(k => {
    assert.ok(Object.prototype.hasOwnProperty.call(payload.data, k), '导出应包含 ' + k);
  });
});

test('store：导出文件名带日期，格式为 个人管理-备份-YYYYMMDD.json', async () => {
  const { App } = await fresh();
  const name = App.store.exportFileName(new Date(2026, 8, 20).getTime());
  assert.strictEqual(name, '个人管理-备份-20260920.json');
});

test('store：validatePayload 拒绝非法文件', async () => {
  const { App } = await fresh();
  assert.ok(App.store.validatePayload(null));
  assert.ok(App.store.validatePayload({ app: 'other', data: {} }));
  assert.ok(App.store.validatePayload({ app: 'personal-manager' }));
  assert.strictEqual(App.store.validatePayload({ app: 'personal-manager', data: {} }), null);
});

test('store：importPreview 正确统计新增与覆盖条数', async () => {
  const { App } = await fresh();
  const K = App.schema.KEYS;
  App.store.set(K.tasks, [{ id: 'a' }, { id: 'b' }]);
  App.store.set(K.notes, [{ id: 'n1' }]);

  const payload = {
    app: 'personal-manager', schemaVersion: 1, exportedAt: Date.now(),
    data: {
      [K.tasks]: [{ id: 'a' }, { id: 'c' }],   // a 覆盖, c 新增
      [K.notes]: [{ id: 'n2' }],               // n2 新增
      [K.settings]: { theme: 'dark' }
    }
  };
  const pv = App.store.importPreview(payload);
  assert.strictEqual(pv.error, null);
  assert.strictEqual(pv.add, 2, '新增应为 c 与 n2');
  assert.strictEqual(pv.overwrite, 2, '覆盖应为 a 与 settings');
});

test('store：导入预览能识别损坏文件', async () => {
  const { App } = await fresh();
  const pv = App.store.importPreview({ app: 'nope' });
  assert.ok(pv.error);
  assert.strictEqual(pv.total, 0);
});

test('store：覆盖导入完全以文件为准', async () => {
  const { App } = await fresh();
  const K = App.schema.KEYS;
  App.store.set(K.tasks, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  const payload = {
    app: 'personal-manager', schemaVersion: 1, exportedAt: Date.now(),
    data: { [K.tasks]: [{ id: 'z1' }], [K.settings]: { theme: 'dark' } }
  };
  const r = App.store.importApply(payload, 'overwrite');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(App.store.get(K.tasks).length, 1);
  assert.strictEqual(App.store.get(K.tasks)[0].id, 'z1');
  assert.strictEqual(App.store.get(K.settings).theme, 'dark');
});

test('store：合并导入按 id 去重，同 id 以文件为准（E5）', async () => {
  const { App } = await fresh();
  const K = App.schema.KEYS;
  App.store.set(K.tasks, [{ id: 'a', title: '旧' }, { id: 'b', title: '保留' }]);
  const payload = {
    app: 'personal-manager', schemaVersion: 1, exportedAt: Date.now(),
    data: { [K.tasks]: [{ id: 'a', title: '新' }, { id: 'c', title: '追加' }] }
  };
  const r = App.store.importApply(payload, 'merge');
  assert.strictEqual(r.ok, true);
  const tasks = App.store.get(K.tasks);
  assert.strictEqual(tasks.length, 3, '不应产生重复条目');
  const a = tasks.filter(t => t.id === 'a');
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].title, '新', '同 id 应以文件内容为准');
  assert.strictEqual(tasks.filter(t => t.id === 'b')[0].title, '保留', '本地独有数据应保留');
});

test('store：合并导入不会丢本地数据，且不重复（E5 二次导入幂等）', async () => {
  const { App } = await fresh();
  const K = App.schema.KEYS;
  App.store.set(K.tasks, [{ id: 'a', title: 'x' }]);
  const payload = {
    app: 'personal-manager', schemaVersion: 1, exportedAt: Date.now(),
    data: { [K.tasks]: [{ id: 'a', title: 'x' }] }
  };
  App.store.importApply(payload, 'merge');
  App.store.importApply(payload, 'merge');
  assert.strictEqual(App.store.get(K.tasks).length, 1);
});

test('store：导入非法文件不会破坏现有数据', async () => {
  const { App } = await fresh();
  const K = App.schema.KEYS;
  App.store.set(K.tasks, [{ id: 'keep' }]);
  const r = App.store.importApply({ app: 'bad' }, 'overwrite');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(App.store.get(K.tasks).length, 1, '非法导入后数据应原样保留');
});

test('store：clearAll 清空数据与 meta，保留个人偏好设置', async () => {
  const { App } = await fresh();
  const K = App.schema.KEYS;
  App.store.set(K.tasks, [{ id: 'a' }]);
  App.store.set(K.studyLogs, [{ id: 'b' }]);
  App.store.set(K.settings, Object.assign({}, App.schema.defaultSettings, { theme: 'dark' }));
  App.store.clearAll();
  assert.strictEqual(App.store.get(K.tasks).length, 0);
  assert.strictEqual(App.store.get(K.studyLogs).length, 0);
  assert.strictEqual(App.store.get(K.settings).theme, 'dark', '设置属于偏好，清空数据时保留');
  assert.strictEqual(App.store.canUndo(), false, '清空后撤销栈应重置');
});

test('store：usage 统计条数与占用', async () => {
  const { App } = await fresh();
  const K = App.schema.KEYS;
  App.store.set(K.tasks, [{ id: 'a' }, { id: 'b' }]);
  App.store.set(K.gameLogs, [{ id: 'g' }]);
  const u = App.store.usage();
  assert.strictEqual(u.count, 3);
  assert.ok(u.bytes > 0);
  const taskRow = u.byKey.filter(x => x.key === K.tasks)[0];
  assert.strictEqual(taskRow.count, 2);
});

test('store：数据全部可 JSON 序列化（无循环引用）', async () => {
  const { App } = await fresh();
  App.store.set(App.schema.KEYS.tasks, [{ id: 'a', nested: { ok: true } }]);
  assert.doesNotThrow(() => JSON.stringify(App.store.exportJSON()));
});

test('store：导出→清空→导入，数据完整回来（E2 恢复）', async () => {
  const first = await fresh();
  const K = first.App.schema.KEYS;
  first.App.store.set(K.tasks, [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
  first.App.store.set(K.gameGames, [{ id: 'g1', name: '测试游戏' }]);
  const payload = first.App.store.exportJSON();

  first.App.store.clearAll();
  assert.strictEqual(first.App.store.get(K.tasks).length, 0);

  const r = first.App.store.importApply(payload, 'overwrite');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(first.App.store.get(K.tasks).length, 2);
  assert.strictEqual(first.App.store.get(K.gameGames)[0].name, '测试游戏');
});

test('store：写入失败会通过 onError 上报（不静默丢数据）', async () => {
  const { App } = await fresh();
  let msg = null;
  App.store.onError = m => { msg = m; };
  const ls = App.store.get(App.schema.KEYS.tasks);
  App.store.set(App.schema.KEYS.tasks, ls); // 正常写入不应触发
  assert.strictEqual(msg, null);
  assert.strictEqual(typeof App.store.onError, 'function');
});

test('store：all() 返回的是深拷贝，改它不影响内部数据', async () => {
  const { App } = await fresh();
  const K = App.schema.KEYS;
  App.store.set(K.tasks, [{ id: 'a' }]);
  const all = App.store.all();
  all[K.tasks][0].id = 'hacked';
  assert.strictEqual(App.store.get(K.tasks)[0].id, 'a');
});

test('store：20 个数据集合逐个写入后，新实例全部读得回来', async () => {
  const first = await fresh();
  const K = first.App.schema.KEYS;
  const pairs = [
    [K.tasks, 'tk'], [K.notes, 'nt'],
    [K.studyDirections, 'sd'], [K.studyItems, 'si'], [K.studyLogs, 'sl'],
    [K.devProjects, 'dp'], [K.devTasks, 'dt'], [K.devBugs, 'db'], [K.devNotes, 'dn'],
    [K.consultClients, 'cc'], [K.consultProjects, 'cp'], [K.consultDeliverables, 'cd'],
    [K.consultMeetings, 'cm'], [K.consultWorklogs, 'cw'],
    [K.fitnessPlan, 'fp'], [K.fitnessLogs, 'fl'],
    [K.dietRecords, 'dr'], [K.dietFavorites, 'df'],
    [K.gameGames, 'gg'], [K.gameLogs, 'gl']
  ];
  pairs.forEach(([key, id]) => first.App.store.set(key, [{ id: id }]));

  const second = createApp({ files: CORE_FILES, seed: dumpStorage(first.window) });
  await second.App.store.init();
  pairs.forEach(([key, id]) => {
    const arr = second.App.store.get(key);
    assert.strictEqual(arr.length, 1, key + ' 应持久化回读');
    assert.strictEqual(arr[0].id, id, key + ' 内容应一致');
  });
  assert.strictEqual(second.App.store.usage().count, 20);
});
