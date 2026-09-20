/* dev.js —— 开发工作：项目 → 任务（看板）→ Bug → 踩坑笔记。
   对应 PRD 5.3 与页面结构设计 4.4：三页签 + 项目看板拖拽 + Bug 转任务 + Markdown 笔记。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var util = App.util, ui = App.ui, store = App.store, schema = App.schema;
  var K = schema.KEYS;
  var L = schema.LABELS;

  function trim(v) { return String(v == null ? '' : v).trim(); }
  function idxOf(list, id) {
    var i = -1;
    list.forEach(function (x, k) { if (x.id === id) i = k; });
    return i;
  }
  /* 'rag, llm  agent' -> ['rag','llm','agent']，去重保序 */
  function splitTags(v) {
    if (Array.isArray(v)) return util.uniq(v.map(trim).filter(Boolean));
    return util.uniq(String(v == null ? '' : v).split(/[,，\s]+/).map(trim).filter(Boolean));
  }

  var dev = {
    /* ================= 项目 ================= */
    projects: function () {
      return util.sortBy(store.get(K.devProjects).slice(), function (p) {
        return p.updatedAt || p.createdAt || 0;
      }, true);
    },

    getProject: function (id) {
      return store.get(K.devProjects).filter(function (p) { return p.id === id; })[0] || null;
    },

    addProject: function (opts) {
      opts = opts || {};
      var name = trim(opts.name);
      if (!name) return null;
      var now = Date.now();
      var p = {
        id: util.uid('proj'), name: name,
        desc: String(opts.desc || ''),
        stack: splitTags(opts.stack),
        status: L.projectStatus[opts.status] ? opts.status : 'doing',
        createdAt: now, updatedAt: now
      };
      var all = store.get(K.devProjects).slice();
      all.push(p);
      store.set(K.devProjects, all);
      return p;
    },

    updateProject: function (id, patch) {
      var all = store.get(K.devProjects).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      var next = Object.assign({}, all[i], patch);
      if (patch && patch.stack !== undefined) next.stack = splitTags(patch.stack);
      next.updatedAt = Date.now();
      all[i] = next;
      store.set(K.devProjects, all);
      return next;
    },

    setProjectStatus: function (id, status) {
      if (!L.projectStatus[status]) return null;
      return dev.updateProject(id, { status: status });
    },

    touchProject: function (id) { return dev.updateProject(id, {}); },

    /* 删项目时连带删掉它的任务与 Bug */
    removeProject: function (id) {
      var all = store.get(K.devProjects);
      if (!all.some(function (p) { return p.id === id; })) return false;
      var ts = store.get(K.devTasks);
      var hasTasks = ts.some(function (t) { return t.projectId === id; });
      var bs = store.get(K.devBugs);
      var hasBugs = bs.some(function (b) { return b.projectId === id; });
      var group = [K.devProjects];
      if (hasTasks) group.push(K.devTasks);
      if (hasBugs) group.push(K.devBugs);
      store.snapshotMany(group);

      store.set(K.devProjects, all.filter(function (p) { return p.id !== id; }));
      if (hasTasks) store.set(K.devTasks, ts.filter(function (t) { return t.projectId !== id; }));
      if (hasBugs) store.set(K.devBugs, bs.filter(function (b) { return b.projectId !== id; }));
      return true;
    },

    projectStats: function (id) {
      var ts = dev.tasks({ projectId: id });
      var done = ts.filter(function (t) { return t.status === 'done'; }).length;
      var bs = dev.bugs({ projectId: id });
      return {
        taskCount: ts.length,
        doneCount: done,
        ratio: ts.length ? Math.round(done / ts.length * 100) : 0,
        openBugs: bs.filter(function (b) { return b.status !== 'resolved'; }).length
      };
    },

    /* ================= 任务 ================= */
    tasks: function (filter) {
      filter = filter || {};
      var list = store.get(K.devTasks).slice();
      if (filter.projectId) list = list.filter(function (t) { return t.projectId === filter.projectId; });
      if (filter.status) list = list.filter(function (t) { return t.status === filter.status; });
      if (filter.priority) list = list.filter(function (t) { return t.priority === filter.priority; });
      if (filter.q) {
        var kw = String(filter.q).toLowerCase();
        list = list.filter(function (t) {
          return String(t.title || '').toLowerCase().indexOf(kw) >= 0 ||
            String(t.desc || '').toLowerCase().indexOf(kw) >= 0;
        });
      }
      return list;
    },

    /* 看板三列：待办 / 进行中 / 已完成 */
    board: function (projectId) {
      var ts = dev.tasks({ projectId: projectId });
      var by = { todo: [], doing: [], done: [] };
      ts.forEach(function (t) {
        (by[L.taskStatus[t.status] ? t.status : 'todo']).push(t);
      });
      return by;
    },

    getTask: function (id) {
      return store.get(K.devTasks).filter(function (t) { return t.id === id; })[0] || null;
    },

    addTask: function (opts) {
      opts = opts || {};
      var title = trim(opts.title);
      if (!title) return null;
      var t = {
        id: util.uid('dtask'),
        projectId: opts.projectId || '',
        title: title,
        desc: String(opts.desc || ''),
        priority: L.priority[opts.priority] ? opts.priority : 'mid',
        status: L.taskStatus[opts.status] ? opts.status : 'todo',
        tags: splitTags(opts.tags),
        createdAt: Date.now(),
        doneAt: opts.status === 'done' ? Date.now() : null
      };
      var all = store.get(K.devTasks).slice();
      all.push(t);
      store.set(K.devTasks, all);
      if (t.projectId) dev.touchProject(t.projectId);
      return t;
    },

    updateTask: function (id, patch) {
      var all = store.get(K.devTasks).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      var next = Object.assign({}, all[i], patch);
      if (patch && patch.tags !== undefined) next.tags = splitTags(patch.tags);
      all[i] = next;
      store.set(K.devTasks, all);
      if (next.projectId) dev.touchProject(next.projectId);
      return next;
    },

    /* 改状态：落到「已完成」自动盖完成时间，离开「已完成」清掉 */
    setTaskStatus: function (id, status) {
      if (!L.taskStatus[status]) return null;
      var patch = { status: status };
      patch.doneAt = status === 'done' ? Date.now() : null;
      return dev.updateTask(id, patch);
    },

    removeTask: function (id) {
      var all = store.get(K.devTasks);
      var cur = all.filter(function (t) { return t.id === id; })[0];
      if (!cur) return false;
      store.snapshot(K.devTasks);
      store.set(K.devTasks, all.filter(function (t) { return t.id !== id; }));
      if (cur.projectId) dev.touchProject(cur.projectId);
      return true;
    },

    /* ================= Bug ================= */
    bugs: function (filter) {
      filter = filter || {};
      var list = store.get(K.devBugs).slice();
      if (filter.projectId) list = list.filter(function (b) { return b.projectId === filter.projectId; });
      if (filter.status) list = list.filter(function (b) { return b.status === filter.status; });
      if (filter.level) list = list.filter(function (b) { return b.level === filter.level; });
      if (filter.q) {
        var kw = String(filter.q).toLowerCase();
        list = list.filter(function (b) {
          return String(b.title || '').toLowerCase().indexOf(kw) >= 0 ||
            String(b.steps || '').toLowerCase().indexOf(kw) >= 0;
        });
      }
      return util.sortBy(list, function (b) { return b.createdAt || 0; }, true);
    },

    getBug: function (id) {
      return store.get(K.devBugs).filter(function (b) { return b.id === id; })[0] || null;
    },

    addBug: function (opts) {
      opts = opts || {};
      var title = trim(opts.title);
      if (!title) return null;
      var b = {
        id: util.uid('bug'),
        projectId: opts.projectId || '',
        title: title,
        level: L.bugLevel[opts.level] ? opts.level : 'mid',
        status: L.bugStatus[opts.status] ? opts.status : 'open',
        steps: String(opts.steps || ''),
        solution: String(opts.solution || ''),
        createdAt: Date.now()
      };
      var all = store.get(K.devBugs).slice();
      all.push(b);
      store.set(K.devBugs, all);
      return b;
    },

    updateBug: function (id, patch) {
      var all = store.get(K.devBugs).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      all[i] = Object.assign({}, all[i], patch);
      store.set(K.devBugs, all);
      return all[i];
    },

    setBugStatus: function (id, status) {
      if (!L.bugStatus[status]) return null;
      return dev.updateBug(id, { status: status });
    },

    removeBug: function (id) {
      var all = store.get(K.devBugs);
      if (!all.some(function (b) { return b.id === id; })) return false;
      store.snapshot(K.devBugs);
      store.set(K.devBugs, all.filter(function (b) { return b.id !== id; }));
      return true;
    },

    /* Bug「转成任务」：往该项目待办加一张卡，同时把 Bug 标成已解决（一次动两个 key） */
    bugToTask: function (id) {
      var b = dev.getBug(id);
      if (!b) return null;
      var t = dev.addTask({
        projectId: b.projectId, title: b.title,
        desc: b.steps, priority: b.level, status: 'todo',
        tags: ['来自Bug']
      });
      if (!t) return null;
      dev.setBugStatus(id, 'resolved');
      return { task: t, bug: dev.getBug(id) };
    },

    /* ================= 踩坑笔记 ================= */
    notes: function (filter) {
      filter = filter || {};
      var list = store.get(K.devNotes).slice();
      if (filter.tag) {
        list = list.filter(function (n) { return (n.tags || []).indexOf(filter.tag) >= 0; });
      }
      if (filter.q) {
        var kw = String(filter.q).toLowerCase();
        list = list.filter(function (n) {
          return (String(n.title || '') + ' ' + String(n.body || '')).toLowerCase().indexOf(kw) >= 0;
        });
      }
      return util.sortBy(list, function (n) { return n.updatedAt || n.createdAt || 0; }, true);
    },

    getNote: function (id) {
      return store.get(K.devNotes).filter(function (n) { return n.id === id; })[0] || null;
    },

    allTags: function () {
      var out = [];
      store.get(K.devNotes).forEach(function (n) {
        (n.tags || []).forEach(function (t) { out.push(t); });
      });
      return util.uniq(out);
    },

    addNote: function (opts) {
      opts = opts || {};
      var title = trim(opts.title);
      if (!title) return null;
      var now = Date.now();
      var n = {
        id: util.uid('dnote'), title: title,
        body: String(opts.body || ''),
        tags: splitTags(opts.tags),
        createdAt: now, updatedAt: now
      };
      var all = store.get(K.devNotes).slice();
      all.push(n);
      store.set(K.devNotes, all);
      return n;
    },

    updateNote: function (id, patch) {
      var all = store.get(K.devNotes).slice();
      var i = idxOf(all, id);
      if (i < 0) return null;
      var next = Object.assign({}, all[i], patch);
      if (patch && patch.tags !== undefined) next.tags = splitTags(patch.tags);
      next.updatedAt = Date.now();
      all[i] = next;
      store.set(K.devNotes, all);
      return next;
    },

    removeNote: function (id) {
      var all = store.get(K.devNotes);
      if (!all.some(function (n) { return n.id === id; })) return false;
      store.snapshot(K.devNotes);
      store.set(K.devNotes, all.filter(function (n) { return n.id !== id; }));
      return true;
    },

    /* ================= 统计（供首页取数） ================= */
    summary: function () {
      var ps = dev.projects(), ts = dev.tasks(), bs = dev.bugs();
      return {
        projects: ps.length,
        doing: ps.filter(function (p) { return p.status === 'doing'; }).length,
        tasks: ts.length,
        doneTasks: ts.filter(function (t) { return t.status === 'done'; }).length,
        doingTasks: ts.filter(function (t) { return t.status === 'doing'; }).length,
        openBugs: bs.filter(function (b) { return b.status !== 'resolved'; }).length,
        notes: dev.notes().length
      };
    }
  };
  App.actions = App.actions || {};
  App.actions.dev = dev;

  /* ================= 页面 ================= */
  var state = {
    tab: 'projects',
    projectId: null,
    bugFilter: { projectId: '', status: '', level: '', q: '' },
    noteFilter: { tag: '', q: '' },
    noteId: null
  };

  function statusTone(s) {
    if (s === 'done' || s === 'resolved' || s === 'delivered') return 'ok';
    if (s === 'paused' || s === 'fixing') return 'warn';
    return 'info';
  }

  /* ---------- 项目卡片 ---------- */
  function projectCardHTML(p) {
    var s = dev.projectStats(p.id);
    var body =
      '<div class="muted2">' + (p.desc ? util.esc(p.desc) : '（没写描述）') + '</div>' +
      (p.stack && p.stack.length ? '<div class="mt8">' + p.stack.map(function (t) { return ui.tag(t); }).join('') + '</div>' : '') +
      '<div class="mt8">' + ui.progress(s.ratio, { showText: true }) + '</div>' +
      '<div class="muted">任务 ' + s.doneCount + ' / ' + s.taskCount + ' 完成' +
      (s.openBugs ? ' · 待修 Bug ' + s.openBugs : '') + '</div>' +
      '<div class="muted">最近更新 ' + util.esc(util.fmtDate(new Date(p.updatedAt || p.createdAt))) + '</div>' +
      '<div class="list-actions mt8">' +
      '<span class="ico-btn" data-act="openBoard" data-id="' + util.esc(p.id) + '">打开看板</span>' +
      '<span class="ico-btn" data-act="editProject" data-id="' + util.esc(p.id) + '">编辑</span>' +
      '<span class="ico-btn" data-act="delProject" data-id="' + util.esc(p.id) + '">删除</span>' +
      '</div>';
    return ui.card(p.name, body, { extra: ui.tag(L.projectStatus[p.status] || p.status, statusTone(p.status)) });
  }

  function projectsHTML() {
    var list = dev.projects();
    if (!list.length) {
      return ui.empty('还没有项目，先把手上在做的东西建一个', ui.btn('新建项目', { act: 'newProject', small: true }));
    }
    return '<div class="grid grid-3">' + list.map(projectCardHTML).join('') + '</div>' +
      '<div class="mt8">' + ui.btn('＋ 新建项目', { act: 'newProject' }) + '</div>';
  }

  /* ---------- 看板 ---------- */
  function boardCardHTML(t) {
    return '<div class="board-card" data-id="' + util.esc(t.id) + '">' +
      '<div class="bc-title">' + util.esc(t.title) + '</div>' +
      (t.desc ? '<div class="muted2">' + util.esc(t.desc) + '</div>' : '') +
      '<div class="bc-foot">' +
      '<span class="prio ' + util.esc(t.priority) + '"></span>' + util.esc(L.priority[t.priority] || '') +
      (t.tags && t.tags.length ? t.tags.map(function (x) { return ui.tag(x); }).join('') : '') +
      '<span class="ico-btn" data-act="editTask" data-id="' + util.esc(t.id) + '">编辑</span>' +
      '<span class="ico-btn" data-act="delTask" data-id="' + util.esc(t.id) + '">×</span>' +
      '</div></div>';
  }

  function boardHTML(projectId) {
    var b = dev.board(projectId);
    return ui.board([
      { id: 'todo', title: '待办', count: b.todo.length, cards: b.todo.map(boardCardHTML) },
      { id: 'doing', title: '进行中', count: b.doing.length, cards: b.doing.map(boardCardHTML) },
      { id: 'done', title: '已完成', count: b.done.length, cards: b.done.map(boardCardHTML) }
    ]);
  }

  function boardPageHTML() {
    var p = dev.getProject(state.projectId);
    if (!p) {
      return '<div class="page-head"><h2>项目看板</h2><p>这个项目可能已经被删掉了</p></div>' +
        ui.empty('找不到这个项目', ui.btn('回到项目列表', { act: 'backToList', small: true }));
    }
    var s = dev.projectStats(p.id);
    return '<div class="page-head"><h2>' + util.esc(p.name) + '</h2><p>' +
      util.esc(p.desc || '三列拖拽改状态') + '</p></div>' +
      '<div class="rowflex" style="margin-bottom:12px;">' +
      '<span class="ico-btn" data-act="backToList">‹ 返回项目列表</span>' +
      ui.tag(L.projectStatus[p.status] || p.status, statusTone(p.status)) +
      '<span class="muted">任务 ' + s.doneCount + ' / ' + s.taskCount + ' 完成</span>' +
      '<span class="right">' + ui.btn('＋ 新增任务', { act: 'newTask', small: true }) + '</span>' +
      '</div>' +
      '<div id="dev-board">' + boardHTML(p.id) + '</div>';
  }

  /* ---------- Bug 表格 ---------- */
  function bugRowHTML(b) {
    var p = dev.getProject(b.projectId);
    return '<tr data-id="' + util.esc(b.id) + '">' +
      '<td class="tbl-name" data-act="editBug" data-id="' + util.esc(b.id) + '">' + util.esc(b.title) + '</td>' +
      '<td>' + (p ? util.esc(p.name) : '<span class="muted">未归属</span>') + '</td>' +
      '<td>' + ui.tag(L.bugLevel[b.level] || b.level) + '</td>' +
      '<td>' + ui.tag(L.bugStatus[b.status] || b.status, statusTone(b.status)) + '</td>' +
      '<td class="muted">' + util.esc(util.fmtDate(new Date(b.createdAt || 0))) + '</td>' +
      '<td class="list-actions">' +
      '<span class="ico-btn" data-act="bugToTask" data-id="' + util.esc(b.id) + '">转成任务</span>' +
      (b.status !== 'resolved'
        ? '<span class="ico-btn" data-act="bugStatus" data-id="' + util.esc(b.id) + '" data-status="fixing">开始修</span>'
        : '<span class="ico-btn" data-act="bugStatus" data-id="' + util.esc(b.id) + '" data-status="open">重新打开</span>') +
      '<span class="ico-btn" data-act="editBug" data-id="' + util.esc(b.id) + '">编辑</span>' +
      '<span class="ico-btn" data-act="delBug" data-id="' + util.esc(b.id) + '">删除</span>' +
      '</td></tr>';
  }

  function bugTableHTML(list) {
    if (!list.length) return ui.empty('没有匹配的 Bug', ui.btn('新建 Bug', { act: 'newBug', small: true }));
    return '<table class="tbl"><thead><tr>' +
      ['标题', '项目', '严重级别', '状态', '创建时间', '操作']
        .map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + list.map(bugRowHTML).join('') + '</tbody></table>';
  }

  function bugsHTML() {
    var f = state.bugFilter;
    var projOptions = [{ value: '', label: '全部项目' }].concat(dev.projects().map(function (p) {
      return { value: p.id, label: p.name };
    }));
    return ui.filterBar([
      { type: 'select', key: 'projectId', label: '项目', value: f.projectId, options: projOptions },
      {
        type: 'select', key: 'status', label: '状态', value: f.status,
        options: [{ value: '', label: '全部状态' }].concat(Object.keys(L.bugStatus).map(function (k) {
          return { value: k, label: L.bugStatus[k] };
        }))
      },
      {
        type: 'select', key: 'level', label: '级别', value: f.level,
        options: [{ value: '', label: '全部级别' }].concat(Object.keys(L.bugLevel).map(function (k) {
          return { value: k, label: L.bugLevel[k] };
        }))
      },
      { type: 'text', key: 'q', label: '搜索 Bug', value: f.q }
    ]) +
      '<div id="bug-table">' + bugTableHTML(dev.bugs(f)) + '</div>' +
      '<div class="mt8">' + ui.btn('＋ 新建 Bug', { act: 'newBug' }) + '</div>';
  }

  /* ---------- 踩坑笔记 ---------- */
  function notePaneHTML() {
    var f = state.noteFilter;
    var list = dev.notes(f);
    var picked = state.noteId ? dev.getNote(state.noteId) : null;
    if (state.noteId && !picked) state.noteId = null;
    if (!picked && list.length) { picked = list[0]; state.noteId = picked.id; }

    var left = list.length
      ? list.map(function (n) {
        return '<div class="note-list-item' + (picked && n.id === picked.id ? ' on' : '') +
          '" data-act="pickNote" data-id="' + util.esc(n.id) + '">' +
          '<div class="ni-title">' + util.esc(n.title) + '</div>' +
          '<div class="muted">' + util.esc(util.fmtDate(new Date(n.updatedAt || n.createdAt))) +
          (n.tags && n.tags.length ? ' · ' + util.esc(n.tags.join(' ')) : '') + '</div></div>';
      }).join('')
      : ui.empty('没有匹配的笔记', '');

    var right = picked
      ? '<div class="rowflex" style="margin-bottom:8px;">' +
      '<span class="muted">' + util.esc(util.fmtDate(new Date(picked.updatedAt || picked.createdAt))) + '</span>' +
      '<span class="right list-actions">' +
      '<span class="ico-btn" data-act="editNote" data-id="' + util.esc(picked.id) + '">编辑</span>' +
      '<span class="ico-btn" data-act="delNote" data-id="' + util.esc(picked.id) + '">删除</span></span></div>' +
      '<div class="md">' + ui.md(picked.body) + '</div>'
      : ui.empty('左边选一条笔记看正文');

    return '<div class="note-pane">' +
      '<div class="card"><div class="list">' + left + '</div></div>' +
      '<div class="card">' + right + '</div>' +
      '</div>';
  }

  function notesHTML() {
    var f = state.noteFilter;
    var tags = dev.allTags();
    var head = '<div class="rowflex" style="margin-bottom:10px;">' +
      ui.input({ cls: 'flt', act: 'filter', fk: 'filter-q', value: f.q, placeholder: '全文搜索标题与正文' }) +
      ui.btn('＋ 新增笔记', { act: 'newNote', small: true }) + '</div>' +
      (tags.length ? '<div class="tag-pick">' +
        '<span class="tag' + (f.tag ? '' : ' on') + '" data-act="tagPick" data-tag="">全部</span>' +
        tags.map(function (t) {
          return '<span class="tag' + (t === f.tag ? ' on' : '') + '" data-act="tagPick" data-tag="' +
            util.esc(t) + '">' + util.esc(t) + '</span>';
        }).join('') + '</div>' : '');

    if (!dev.notes().length) {
      return head + ui.empty('还没有踩坑笔记，记一条以后别再踩', ui.btn('＋ 新增笔记', { act: 'newNote', small: true }));
    }
    return head + '<div id="note-pane">' + notePaneHTML() + '</div>';
  }

  /* ---------- 装配 ---------- */
  function listBodyHTML() {
    var tabs = '<div id="dev-tabs">' + ui.tabs([
      { id: 'projects', label: '项目' },
      { id: 'bugs', label: 'Bug 记录' },
      { id: 'notes', label: '踩坑笔记' }
    ], state.tab, { act: 'tab' }) + '</div>';
    var content = state.tab === 'projects' ? projectsHTML()
      : state.tab === 'bugs' ? bugsHTML()
        : notesHTML();
    var sub = state.tab === 'projects' ? '在做的项目，点进看板看任务'
      : state.tab === 'bugs' ? '现在要修的，修完可以一键转成任务'
        : '以后别再踩的，正文支持极简 Markdown';
    return '<div class="page-head"><h2>开发工作</h2><p>' + sub + '</p></div>' +
      tabs + '<div id="dev-body">' + content + '</div>';
  }

  function bodyHTML() {
    return state.projectId ? boardPageHTML() : listBodyHTML();
  }

  /* ---------- 表单抽屉 ---------- */
  function drawerForm(rows) {
    return '<div class="form">' + rows.join('') + '</div>' +
      '<div class="modal-ft">' + ui.btn('保存', { act: 'formSave' }) + ui.btn('取消', { act: 'closeDrawer' }) + '</div>';
  }

  function collect(el) {
    var v = {};
    Array.prototype.slice.call(el.querySelectorAll('[data-fk]')).forEach(function (n) {
      v[n.dataset.fk] = n.value;
    });
    return v;
  }

  function openForm(mode, title, rows) {
    var entry = ui.drawer(title, drawerForm(rows));
    if (entry && entry.el) {
      entry.el.addEventListener('click', function (e) {
        var t = e.target.closest('[data-act]');
        if (!t || t.dataset.act !== 'formSave') return;
        saveForm(mode, collect(entry.el));
      });
    }
    return entry;
  }

  function projectOptions(selected, withEmpty) {
    var opts = (withEmpty ? [{ value: '', label: '（不归属任何项目）' }] : []).concat(
      dev.projects().map(function (p) { return { value: p.id, label: p.name }; }));
    return opts.map(function (o) {
      return { value: o.value, label: o.label };
    });
  }

  function openProjectForm(id) {
    var p = id ? dev.getProject(id) : null;
    var rows = [
      ui.field('项目名称', ui.input({ fk: 'name', value: p ? p.name : '', placeholder: '如：个人工作台' })),
      ui.field('描述（可空）', ui.input({ fk: 'desc', value: p ? p.desc : '', placeholder: '一句话说清做什么' })),
      ui.field('技术栈（逗号分隔）', ui.input({ fk: 'stack', value: p ? (p.stack || []).join(', ') : '', placeholder: 'Vue, Node, MySQL' })),
      ui.field('状态', ui.select({
        fk: 'status', value: p ? p.status : 'doing',
        options: Object.keys(L.projectStatus).map(function (k) { return { value: k, label: L.projectStatus[k] }; })
      }))
    ];
    return openForm(p ? ('editProject:' + p.id) : 'project', p ? '编辑项目' : '新建项目', rows);
  }

  function openTaskForm(id, projectId) {
    var t = id ? dev.getTask(id) : null;
    var rows = [
      ui.field('任务标题', ui.input({ fk: 'title', value: t ? t.title : '', placeholder: '要做的具体一件事' })),
      ui.field('所属项目', ui.select({ fk: 'projectId', value: t ? t.projectId : (projectId || ''), options: projectOptions(null, true) })),
      ui.field('优先级', ui.select({
        fk: 'priority', value: t ? t.priority : 'mid',
        options: Object.keys(L.priority).map(function (k) { return { value: k, label: L.priority[k] }; })
      })),
      ui.field('状态', ui.select({
        fk: 'status', value: t ? t.status : 'todo',
        options: L.taskStatusOrder.map(function (k) { return { value: k, label: L.taskStatus[k] }; })
      })),
      ui.field('标签（可空）', ui.input({ fk: 'tags', value: t ? (t.tags || []).join(', ') : '', placeholder: '前端, 重构' })),
      ui.field('描述（可空）', ui.textarea({ fk: 'desc', rows: 3, value: t ? t.desc : '' }))
    ];
    return openForm(t ? ('editTask:' + t.id) : 'task', t ? '编辑任务' : '新增任务', rows);
  }

  function openBugForm(id) {
    var b = id ? dev.getBug(id) : null;
    var rows = [
      ui.field('Bug 标题', ui.input({ fk: 'title', value: b ? b.title : '', placeholder: '一句话说清现象' })),
      ui.field('所属项目', ui.select({ fk: 'projectId', value: b ? b.projectId : (state.projectId || ''), options: projectOptions(null, true) })),
      ui.field('严重级别', ui.select({
        fk: 'level', value: b ? b.level : 'mid',
        options: Object.keys(L.bugLevel).map(function (k) { return { value: k, label: L.bugLevel[k] }; })
      })),
      ui.field('状态', ui.select({
        fk: 'status', value: b ? b.status : 'open',
        options: Object.keys(L.bugStatus).map(function (k) { return { value: k, label: L.bugStatus[k] }; })
      })),
      ui.field('复现步骤', ui.textarea({ fk: 'steps', rows: 4, value: b ? b.steps : '', placeholder: '1. …\n2. …' })),
      ui.field('解决方式（可空）', ui.textarea({ fk: 'solution', rows: 3, value: b ? b.solution : '' }))
    ];
    return openForm(b ? ('editBug:' + b.id) : 'bug', b ? '编辑 Bug' : '新建 Bug', rows);
  }

  function openNoteForm(id) {
    var n = id ? dev.getNote(id) : null;
    var rows = [
      ui.field('标题', ui.input({ fk: 'title', value: n ? n.title : '', placeholder: '踩了什么坑' })),
      ui.field('标签（逗号分隔）', ui.input({ fk: 'tags', value: n ? (n.tags || []).join(', ') : '', placeholder: 'Vue, 构建' })),
      ui.field('正文（支持 # 标题 / - 列表 / **粗体** / `代码`）', ui.textarea({ fk: 'body', rows: 10, value: n ? n.body : '' }))
    ];
    return openForm(n ? ('editNote:' + n.id) : 'note', n ? '编辑踩坑笔记' : '新增踩坑笔记', rows);
  }

  function saveForm(mode, v) {
    if (mode === 'project') {
      if (!dev.addProject(v)) { ui.toast('项目名称不能为空'); return; }
      ui.closeDrawer(); ui.toast('已新建项目'); renderAll(); return;
    }
    if (mode.indexOf('editProject:') === 0) {
      if (!trim(v.name)) { ui.toast('项目名称不能为空'); return; }
      dev.updateProject(mode.slice('editProject:'.length), v);
      ui.closeDrawer(); ui.toast('项目已更新'); renderAll(); return;
    }
    if (mode === 'task') {
      var t = dev.addTask(Object.assign({}, v, { projectId: v.projectId || state.projectId }));
      if (!t) { ui.toast('任务标题不能为空'); return; }
      ui.closeDrawer(); ui.toast('已新增任务'); renderAll(); return;
    }
    if (mode.indexOf('editTask:') === 0) {
      if (!trim(v.title)) { ui.toast('任务标题不能为空'); return; }
      var et = Object.assign({}, v);
      if (v.status === 'done') et.doneAt = Date.now();
      else if (v.status !== 'done') et.doneAt = null;
      dev.updateTask(mode.slice('editTask:'.length), et);
      ui.closeDrawer(); ui.toast('任务已更新'); renderAll(); return;
    }
    if (mode === 'bug') {
      if (!dev.addBug(v)) { ui.toast('Bug 标题不能为空'); return; }
      ui.closeDrawer(); ui.toast('已新建 Bug'); renderAll(); return;
    }
    if (mode.indexOf('editBug:') === 0) {
      if (!trim(v.title)) { ui.toast('Bug 标题不能为空'); return; }
      dev.updateBug(mode.slice('editBug:'.length), v);
      ui.closeDrawer(); ui.toast('Bug 已更新'); renderAll(); return;
    }
    if (mode === 'note') {
      var n = dev.addNote(v);
      if (!n) { ui.toast('笔记标题不能为空'); return; }
      state.noteId = n.id;
      ui.closeDrawer(); ui.toast('已新增笔记'); renderAll(); return;
    }
    if (mode.indexOf('editNote:') === 0) {
      if (!trim(v.title)) { ui.toast('笔记标题不能为空'); return; }
      dev.updateNote(mode.slice('editNote:'.length), v);
      ui.closeDrawer(); ui.toast('笔记已更新'); renderAll(); return;
    }
  }

  /* ---------- 渲染与事件 ---------- */
  var ctxRoot = null;

  function renderAll() {
    if (!ctxRoot) return;
    ctxRoot.innerHTML = bodyHTML();
    bind(ctxRoot);
    if (state.projectId) {
      ui.initBoardDrop(document.getElementById('dev-board'), {
        onDrop: function (id, col) {
          dev.setTaskStatus(id, col);
          renderAll();
        }
      });
    }
  }

  function refreshBugTable() {
    var bt = document.getElementById('bug-table');
    if (bt) bt.innerHTML = bugTableHTML(dev.bugs(state.bugFilter));
  }

  /* 只换笔记的两栏正文，保住搜索框焦点 */
  function refreshNotePane() {
    var np = document.getElementById('note-pane');
    if (np) np.innerHTML = notePaneHTML();
  }

  /* 标签筛选会改变顶部标签的高亮，需要整体重绘笔记页签 */
  function rerenderNotesBody() {
    var bd = document.getElementById('dev-body');
    if (bd && state.tab === 'notes') bd.innerHTML = notesHTML();
  }

  function bind(rootEl) {
    rootEl.onclick = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !rootEl.contains(t)) return;
      var act = t.dataset.act, id = t.dataset.id;

      if (act === 'backToList') { state.projectId = null; return renderAll(); }
      if (act === 'openBoard') { state.projectId = id; return renderAll(); }
      if (act === 'tab') { state.tab = t.dataset.tab; return renderAll(); }
      if (act === 'pickNote') { state.noteId = id; return refreshNotePane(); }
      if (act === 'tagPick') {
        state.noteFilter.tag = t.dataset.tag || '';
        return rerenderNotesBody();
      }

      if (act === 'newProject') return openProjectForm(null);
      if (act === 'editProject') return openProjectForm(id);
      if (act === 'newTask') return openTaskForm(null, state.projectId);
      if (act === 'editTask') return openTaskForm(id, null);
      if (act === 'newBug') return openBugForm(null);
      if (act === 'editBug') return openBugForm(id);
      if (act === 'newNote') return openNoteForm(null);
      if (act === 'editNote') return openNoteForm(id);

      if (act === 'bugStatus') { dev.setBugStatus(id, t.dataset.status); return renderAll(); }
      if (act === 'bugToTask') {
        var r = dev.bugToTask(id);
        if (r) { ui.toast('已转成任务，落在待办列'); return renderAll(); }
        return;
      }
      if (act === 'delTask') { dev.removeTask(id); ui.toast('已删除任务', { undo: true }); return renderAll(); }
      if (act === 'delBug') {
        var b = dev.getBug(id);
        if (!b) return;
        ui.confirm('删除 Bug「' + b.title + '」？', function () {
          dev.removeBug(id); ui.toast('已删除 Bug', { undo: true }); renderAll();
        }, { danger: true, okText: '删除' });
        return;
      }
      if (act === 'delProject') {
        var p = dev.getProject(id);
        if (!p) return;
        ui.confirm('删除项目「' + p.name + '」？它的任务和 Bug 会一并删除。', function () {
          dev.removeProject(id); ui.toast('已删除项目', { undo: true }); renderAll();
        }, { danger: true, okText: '删除' });
        return;
      }
      if (act === 'delNote') {
        var n = dev.getNote(id);
        if (!n) return;
        ui.confirm('删除笔记「' + n.title + '」？', function () {
          dev.removeNote(id);
          if (state.noteId === id) state.noteId = null;
          ui.toast('已删除笔记', { undo: true });
          renderAll();
        }, { danger: true, okText: '删除' });
        return;
      }
    };

    rootEl.onchange = function (e) {
      var t = e.target;
      if (!t.dataset || t.dataset.act !== 'filter') return;
      var key = t.dataset.fkey || String(t.dataset.fk || '').replace(/^filter-/, '');
      if (!key) return;
      if (state.tab === 'bugs') { state.bugFilter[key] = t.value; refreshBugTable(); }
    };

    rootEl.oninput = function (e) {
      var t = e.target;
      if (!t.dataset || t.dataset.act !== 'filter') return;
      var key = t.dataset.fkey || String(t.dataset.fk || '').replace(/^filter-/, '');
      if (key !== 'q') return;
      if (state.tab === 'bugs') { state.bugFilter.q = t.value; refreshBugTable(); }
      else if (state.tab === 'notes') { state.noteFilter.q = t.value; refreshNotePane(); }
    };
  }

  App.pages.dev = {
    id: 'dev',
    title: '开发工作',
    subtitle: '项目、Bug 与踩坑笔记',

    render: function (rootEl, param) {
      ctxRoot = rootEl;
      state.projectId = param || null;
      renderAll();
    },

    refresh: function () { renderAll(); },

    primaryAdd: function () {
      if (state.projectId) return openTaskForm(null, state.projectId);
      if (state.tab === 'projects') return openProjectForm(null);
      if (state.tab === 'bugs') return openBugForm(null);
      return openNoteForm(null);
    },

    destroy: function () { ctxRoot = null; },

    /* 供测试使用 */
    _state: state,
    _bodyHTML: function () { return bodyHTML(); },
    _boardHTML: function (pid) { return boardHTML(pid); },
    _renderAll: renderAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
