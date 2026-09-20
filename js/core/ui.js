/* ui.js —— 通用组件。除浮层（toast / drawer / confirm）外全部是纯函数，返回 HTML 字符串。
   浮层在无 DOM 环境（Node 测试）下只记录到 ui.log，便于断言。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var util = App.util;

  function hasDom() { return typeof document !== 'undefined' && !!document.getElementById; }
  function esc(s) { return util.esc(s); }

  var ui = { log: [] };

  /* ---------- 基础控件 ---------- */

  ui.btn = function (text, o) {
    o = o || {};
    return '<button type="button" class="btn' + (o.tone ? ' btn-' + o.tone : '') +
      (o.small ? ' btn-sm' : '') + '"' +
      (o.id ? ' id="' + esc(o.id) + '"' : '') +
      (o.act ? ' data-act="' + esc(o.act) + '"' : '') +
      (o.id2 ? ' data-id="' + esc(o.id2) + '"' : '') +
      '>' + esc(text) + '</button>';
  };

  ui.input = function (o) {
    o = o || {};
    return '<input class="inp' + (o.cls ? ' ' + o.cls : '') + '" type="' + (o.type || 'text') + '"' +
      (o.id ? ' id="' + esc(o.id) + '"' : '') +
      (o.fk ? ' data-fk="' + esc(o.fk) + '"' : '') +
      (o.act ? ' data-act="' + esc(o.act) + '"' : '') +
      (o.id2 ? ' data-id2="' + esc(o.id2) + '"' : '') +
      (o.date ? ' data-date="' + esc(o.date) + '"' : '') +
      ' value="' + esc(o.value || '') + '"' +
      ' placeholder="' + esc(o.placeholder || '') + '"' +
      (o.step ? ' step="' + esc(o.step) + '" min="0"' : '') +
      (o.type === 'number' ? ' min="0"' : '') + '>';
  };

  ui.select = function (o) {
    o = o || {};
    var opts = (o.options || []).map(function (it) {
      var v = (typeof it === 'object') ? it.value : it;
      var l = (typeof it === 'object') ? it.label : it;
      return '<option value="' + esc(v) + '"' + (String(v) === String(o.value) ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
    return '<select class="inp sel' + (o.cls ? ' ' + o.cls : '') + '"' +
      (o.id ? ' id="' + esc(o.id) + '"' : '') +
      (o.fk ? ' data-fk="' + esc(o.fk) + '"' : '') +
      (o.act ? ' data-act="' + esc(o.act) + '"' : '') +
      (o.fkey ? ' data-fkey="' + esc(o.fkey) + '"' : '') +
      (o.key ? ' data-key="' + esc(o.key) + '"' : '') +
      (o.id2 ? ' data-id="' + esc(o.id2) + '"' : '') +
      (o.title ? ' title="' + esc(o.title) + '"' : '') +
      '>' + opts + '</select>';
  };

  ui.textarea = function (o) {
    o = o || {};
    return '<textarea class="inp ta' + (o.cls ? ' ' + o.cls : '') + '" rows="' + (o.rows || 4) + '"' +
      (o.id ? ' id="' + esc(o.id) + '"' : '') +
      (o.fk ? ' data-fk="' + esc(o.fk) + '"' : '') +
      (o.act ? ' data-act="' + esc(o.act) + '"' : '') +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
      '>' + esc(o.value || '') + '</textarea>';
  };

  ui.field = function (label, control) {
    return '<label class="field"><span class="field-lb">' + esc(label) + '</span>' + control + '</label>';
  };

  /* ---------- 容器类 ---------- */

  ui.card = function (title, body, o) {
    o = o || {};
    var attrs = '';
    if (o.module) attrs += ' data-act="open" data-module="' + esc(o.module) + '"';
    if (o.act) attrs += ' data-act="' + esc(o.act) + '"';
    if (o.cls) attrs += ' class="card ' + esc(o.cls) + '"'; else attrs += ' class="card"';
    var head = (title === null || title === undefined) ? '' :
      '<header class="card-hd"><h3>' + esc(title) + '</h3>' + (o.extra || '') + '</header>';
    return '<section' + attrs + '>' + head + '<div class="card-bd">' + body + '</div></section>';
  };

  ui.row = function (left, right, o) {
    o = o || {};
    var attrs = ' class="row' + (o.cls ? ' ' + o.cls : '') + (o.done ? ' done' : '') + '"';
    if (o.id) attrs += ' data-id="' + esc(o.id) + '"';
    if (o.drag) attrs += ' draggable="true"';
    return '<div' + attrs + '><div class="row-main">' + left + '</div>' +
      (right ? '<div class="row-side">' + right + '</div>' : '') + '</div>';
  };

  ui.board = function (cols) {
    return '<div class="board">' + cols.map(function (c) {
      var cards = (c.cards && c.cards.length) ? c.cards.join('') : '<div class="board-empty">暂无</div>';
      return '<div class="board-col" data-col="' + esc(c.id) + '">' +
        '<header class="board-hd"><span>' + esc(c.title) + '</span><span class="cnt">' + (c.count || 0) + '</span></header>' +
        '<div class="board-list" data-drop="' + esc(c.id) + '">' + cards + '</div></div>';
    }).join('') + '</div>';
  };

  ui.empty = function (text, actionHTML) {
    return '<div class="empty"><p>' + esc(text) + '</p>' + (actionHTML || '') + '</div>';
  };

  ui.tag = function (text, tone) {
    return '<span class="tag' + (tone ? ' tone-' + tone : '') + '">' + esc(text) + '</span>';
  };

  ui.progress = function (percent, o) {
    o = o || {};
    var p = util.clamp(percent, 0, 100);
    return '<span class="prog-wrap"><span class="prog"><span class="prog-bar" style="width:' + p + '%"></span></span>' +
      (o.showText ? '<span class="prog-txt">' + p + '%</span>' : '') + '</span>';
  };

  ui.check = function (checked, o) {
    o = o || {};
    return '<span class="ck' + (checked ? ' on' : '') + '"' +
      (o.act ? ' data-act="' + esc(o.act) + '"' : '') +
      (o.id ? ' data-id="' + esc(o.id) + '"' : '') +
      (o.id2 ? ' data-id2="' + esc(o.id2) + '"' : '') + '></span>';
  };

  ui.bar = function (items, o) {
    o = o || {};
    var max = o.max || Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    if (!items.length) return '<div class="empty-sm">暂无数据</div>';
    return '<div class="bars">' + items.map(function (it) {
      var w = Math.round(it.value / max * 100);
      return '<div class="bar-row"><span class="bar-lb">' + esc(it.label) + '</span>' +
        '<span class="bar-track"><span class="bar-val" style="width:' + w + '%"></span></span>' +
        '<span class="bar-num">' + esc(o.fmt ? o.fmt(it.value) : it.value) + '</span></div>';
    }).join('') + '</div>';
  };

  ui.heatmap = function (year, month, dayMap, o) {
    o = o || {};
    var first = o.firstDay === 0 ? 0 : 1;
    var weeks = util.monthMatrix(year, month, first);
    var names = first === 1 ? ['一', '二', '三', '四', '五', '六', '日'] : ['日', '一', '二', '三', '四', '五', '六'];
    var html = '<div class="hm"><div class="hm-hd">' + names.map(function (n) {
      return '<span>' + n + '</span>';
    }).join('') + '</div>';
    weeks.forEach(function (w) {
      html += '<div class="hm-row">' + w.map(function (d) {
        if (!d) return '<span class="hm-cell empty"></span>';
        var lv = dayMap[d];
        var cls = 'hm-cell';
        if (lv === 'rest') cls += ' rest';
        else if (lv === undefined || lv === null) cls += ' lv0';
        else cls += ' lv' + lv;
        if (o.today === d) cls += ' today';
        return '<span class="' + cls + '" data-act="' + esc(o.act || 'hmPick') + '" data-date="' + d + '" title="' + d + '"></span>';
      }).join('') + '</div>';
    });
    return html + '</div>';
  };

  ui.filterBar = function (fields) {
    if (!fields || !fields.length) return '';
    return '<div class="filterbar">' + fields.map(function (f) {
      if (f.type === 'text') {
        return ui.input({ cls: 'flt', act: 'filter', fk: 'filter-' + f.key, value: f.value || '', placeholder: f.label });
      }
      return ui.select({
        cls: 'flt', act: 'filter', fk: 'filter-' + f.key, fkey: f.key,
        value: f.value, options: f.options, title: f.label
      });
    }).join('') + '</div>';
  };

  ui.dateNav = function (date, o) {
    o = o || {};
    return '<div class="datenav">' +
      '<span class="dn-btn" data-act="' + esc(o.prevAct || 'prevDay') + '">‹</span>' +
      '<span class="dn-txt">' + esc(util.formatDateCN(date)) + (o.suffix ? ' ' + esc(o.suffix) : '') + '</span>' +
      '<span class="dn-btn" data-act="' + esc(o.nextAct || 'nextDay') + '">›</span></div>';
  };

  ui.tabs = function (tabs, active, o) {
    o = o || {};
    return '<div class="tabs">' + tabs.map(function (t) {
      return '<span class="tab' + (t.id === active ? ' on' : '') + '" data-act="' + esc(o.act || 'tab') +
        '" data-tab="' + esc(t.id) + '">' + esc(t.label) + '</span>';
    }).join('') + '</div>';
  };

  /* ---------- 极简 Markdown（只支持标题、列表、粗体、行内代码） ---------- */
  ui.md = function (text) {
    if (!text) return '<p class="md-empty">（空）</p>';
    var lines = String(text).replace(/\r\n/g, '\n').split('\n');
    var out = [], inList = false;
    function inline(s) {
      return esc(s)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    }
    lines.forEach(function (ln) {
      var m = /^(#{1,3})\s+(.*)$/.exec(ln);
      if (m) {
        if (inList) { out.push('</ul>'); inList = false; }
        var lv = m[1].length + 2;
        out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>');
        return;
      }
      if (/^\s*-\s+/.test(ln)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + inline(ln.replace(/^\s*-\s+/, '')) + '</li>');
        return;
      }
      if (inList) { out.push('</ul>'); inList = false; }
      if (!ln.trim()) { out.push(''); return; }
      out.push('<p>' + inline(ln) + '</p>');
    });
    if (inList) out.push('</ul>');
    return out.join('\n');
  };

  /* ---------- 浮层 ---------- */

  function host(id) {
    if (!hasDom()) return null;
    var el = document.getElementById(id);
    return el;
  }

  ui.toast = function (msg, o) {
    o = o || {};
    var entry = { type: 'toast', msg: msg, undo: !!o.undo };
    ui.log.push(entry);
    if (!hasDom()) return entry;
    var box = host('toast-host');
    if (!box) return entry;
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span>' + esc(msg) + '</span>' +
      (o.undo ? '<button type="button" class="toast-undo">撤销</button>' : '');
    box.appendChild(el);
    if (o.undo) {
      el.querySelector('.toast-undo').onclick = function () {
        var r = App.store.undo();
        ui.clearToast(el);
        if (r) { ui.toast('已撤销'); if (App.router && App.router.refreshCurrent) App.router.refreshCurrent(); }
      };
    }
    setTimeout(function () { ui.clearToast(el); }, o.duration || 5000);
    return entry;
  };

  ui.clearToast = function (el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };

  ui.drawer = function (title, bodyHTML, o) {
    o = o || {};
    var entry = { type: 'drawer', title: title, body: bodyHTML, opts: o };
    ui.log.push(entry);
    if (!hasDom()) return entry;
    ui.closeDrawer();
    var box = host('overlay-host');
    if (!box) return entry;
    var wrap = document.createElement('div');
    wrap.className = 'drawer-mask';
    wrap.innerHTML = '<div class="drawer"><header class="drawer-hd"><h3>' + esc(title) + '</h3>' +
      '<button type="button" class="drawer-x" data-act="closeDrawer">×</button></header>' +
      '<div class="drawer-bd">' + bodyHTML + '</div></div>';
    box.appendChild(wrap);
    wrap.onclick = function (e) {
      if (e.target === wrap || e.target.closest('[data-act="closeDrawer"]')) ui.closeDrawer();
    };
    entry.el = wrap;
    return entry;
  };

  ui.closeDrawer = function () {
    if (!hasDom()) return;
    var box = host('overlay-host');
    if (box) box.innerHTML = '';
  };

  ui.confirm = function (msg, onOk, o) {
    o = o || {};
    var entry = { type: 'confirm', msg: msg, onOk: onOk, opts: o };
    ui.log.push(entry);
    if (!hasDom()) return entry;
    var box = host('overlay-host');
    if (!box) return entry;
    var wrap = document.createElement('div');
    wrap.className = 'modal-mask';
    wrap.innerHTML = '<div class="modal"><p class="modal-msg">' + esc(msg) + '</p>' +
      '<div class="modal-ft">' + ui.btn(o.cancelText || '取消', { act: 'cfNo' }) +
      ui.btn(o.okText || '确定', { act: 'cfYes', tone: o.danger ? 'danger' : '' }) + '</div></div>';
    box.appendChild(wrap);
    wrap.onclick = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) return;
      if (t.dataset.act === 'cfYes') { ui.closeDrawer(); if (typeof onOk === 'function') onOk(); }
      if (t.dataset.act === 'cfNo') ui.closeDrawer();
    };
    entry.el = wrap;
    return entry;
  };

  ui.closeAll = function () {
    ui.closeDrawer();
  };

  /* ---------- 拖拽助手（列表排序 / 看板换列） ---------- */

  ui.initSortable = function (listEl, opts) {
    if (!listEl) return;
    opts = opts || {};
    var dragId = null;
    var sel = opts.itemSelector || '[data-id]';
    function items() { return Array.prototype.slice.call(listEl.querySelectorAll(sel)); }
    function clearTargets() { items().forEach(function (x) { x.classList.remove('drop-target'); }); }

    items().forEach(function (it) {
      it.setAttribute('draggable', 'true');
      it.ondragstart = function (e) {
        dragId = it.dataset.id;
        it.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (err) {}
      };
      it.ondragend = function () { it.classList.remove('dragging'); clearTargets(); };
      it.ondragover = function (e) {
        e.preventDefault();
        if (it.dataset.id === dragId) return;
        clearTargets();
        it.classList.add('drop-target');
      };
      it.ondrop = function (e) {
        e.preventDefault();
        clearTargets();
        var targetId = it.dataset.id;
        if (!dragId || dragId === targetId || !opts.onReorder) return;
        var ids = items().map(function (x) { return x.dataset.id; });
        var from = ids.indexOf(dragId), to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        dragId = null;
        opts.onReorder(ids);
      };
    });
  };

  ui.initBoardDrop = function (boardEl, opts) {
    if (!boardEl) return;
    opts = opts || {};
    var dragId = null;
    var lists = Array.prototype.slice.call(boardEl.querySelectorAll('[data-drop]'));

    Array.prototype.slice.call(boardEl.querySelectorAll('.board-card')).forEach(function (c) {
      c.setAttribute('draggable', 'true');
      c.ondragstart = function (e) {
        dragId = c.dataset.id;
        c.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (err) {}
      };
      c.ondragend = function () {
        c.classList.remove('dragging');
        lists.forEach(function (l) { l.classList.remove('drop-active'); });
      };
    });

    lists.forEach(function (l) {
      l.ondragover = function (e) { e.preventDefault(); l.classList.add('drop-active'); };
      l.ondragleave = function () { l.classList.remove('drop-active'); };
      l.ondrop = function (e) {
        e.preventDefault();
        l.classList.remove('drop-active');
        var id = dragId;
        dragId = null;
        if (id && opts.onDrop) opts.onDrop(id, l.dataset.drop);
      };
    });
  };

  /* 通用事件委托：容器上绑一次，按 data-act 分发 */
  /* 就地编辑：把元素临时换成输入框，回车/失焦保存，Esc 取消 */
  ui.inlineEdit = function (el, value, onSave) {
    if (!el || typeof document === 'undefined') return;
    var input = document.createElement('input');
    input.className = 'inp inline-edit';
    input.value = value == null ? '' : String(value);
    var parent = el.parentNode;
    if (!parent) return;
    parent.replaceChild(input, el);
    input.focus();
    if (input.select) input.select();
    var done = false;
    function commit(save) {
      if (done) return;
      done = true;
      var v = input.value;
      if (input.parentNode) input.parentNode.replaceChild(el, input);
      if (save && v !== value) onSave(v);
    }
    input.onblur = function () { commit(true); };
    input.onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
    };
  };

  ui.delegate = function (rootEl, handlers, eventName) {
    if (!rootEl) return;
    rootEl['on' + (eventName || 'click')] = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !rootEl.contains(t)) return;
      var fn = handlers[t.dataset.act];
      if (fn) fn(t, e);
    };
  };

  root.App.ui = ui;
})(typeof globalThis !== 'undefined' ? globalThis : this);
