/* util.js —— 纯工具函数，不依赖 DOM。可同时在浏览器与 Node 测试环境加载。 */
(function (root) {
  'use strict';
  var App = (root.App = root.App || {});
  var util = {};

  /* ---------- 数字与字符串 ---------- */
  util.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  util.clamp = function (n, min, max) {
    n = Number(n);
    if (isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  };

  util.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  util.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 6);
  };

  util.debounce = function (fn, wait) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, wait || 200);
    };
  };

  util.uniq = function (arr) {
    var out = [], seen = {};
    (arr || []).forEach(function (x) {
      var k = String(x);
      if (!seen[k]) { seen[k] = 1; out.push(x); }
    });
    return out;
  };

  util.sum = function (arr, fn) {
    return (arr || []).reduce(function (a, x) { return a + (fn ? fn(x) : x); }, 0);
  };

  util.groupBy = function (arr, fn) {
    var out = {};
    (arr || []).forEach(function (x) {
      var k = fn(x);
      (out[k] = out[k] || []).push(x);
    });
    return out;
  };

  util.sortBy = function (arr, fn, desc) {
    return (arr || []).slice().sort(function (a, b) {
      var va = fn(a), vb = fn(b);
      if (va < vb) return desc ? 1 : -1;
      if (va > vb) return desc ? -1 : 1;
      return 0;
    });
  };

  /* ---------- 日期（一律本地时区，禁止 toISOString） ---------- */
  util.fmtDate = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + util.pad2(d.getMonth() + 1) + '-' + util.pad2(d.getDate());
  };

  util.today = function () { return util.fmtDate(new Date()); };

  util.parseDate = function (s) {
    var p = String(s || '').split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) || 1);
  };

  util.isValidDate = function (s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  };

  util.addDays = function (dateStr, n) {
    var d = util.parseDate(dateStr);
    d.setDate(d.getDate() + Number(n));
    return util.fmtDate(d);
  };

  util.diffDays = function (a, b) {
    return Math.round((util.parseDate(a) - util.parseDate(b)) / 86400000);
  };

  util.hhmm = function (d) {
    d = d || new Date();
    return util.pad2(d.getHours()) + ':' + util.pad2(d.getMinutes());
  };

  util.WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  util.WEEKDAYS_MON = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  util.weekdayName = function (dateStr) {
    return util.WEEKDAYS[util.parseDate(dateStr).getDay()];
  };

  util.weekdayIndexMon = function (dateStr) {
    var g = util.parseDate(dateStr).getDay(); // 0=周日
    return g === 0 ? 7 : g;                   // 1..7，周一=1
  };

  util.startOfWeek = function (dateStr, weekStartsOn) {
    var d = util.parseDate(dateStr);
    var g = d.getDay();
    var start = (weekStartsOn === 0) ? g : (g === 0 ? 6 : g - 1);
    d.setDate(d.getDate() - start);
    return util.fmtDate(d);
  };

  util.monthKey = function (dateStr) { return String(dateStr).slice(0, 7); };

  util.daysInMonth = function (year, month /* 1-12 */) {
    return new Date(year, month, 0).getDate();
  };

  /* 返回 6 行 x 7 列的日期字符串矩阵，不足处补 null；firstDay: 1=周一开头 */
  util.monthMatrix = function (year, month, firstDay) {
    firstDay = firstDay === 0 ? 0 : 1;
    var total = util.daysInMonth(year, month);
    var firstDow = new Date(year, month - 1, 1).getDay(); // 0=周日
    var lead = firstDay === 1 ? (firstDow === 0 ? 6 : firstDow - 1) : firstDow;
    var cells = [];
    for (var i = 0; i < lead; i++) cells.push(null);
    for (var d = 1; d <= total; d++) cells.push(util.fmtDate(new Date(year, month - 1, d)));
    while (cells.length % 7 !== 0) cells.push(null);
    var weeks = [];
    for (var k = 0; k < cells.length; k += 7) weeks.push(cells.slice(k, k + 7));
    return weeks;
  };

  util.formatDateCN = function (dateStr) {
    var d = util.parseDate(dateStr);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + util.weekdayName(dateStr);
  };

  /* ---------- 时长（一律以分钟存储） ---------- */
  util.fmtDuration = function (minutes) {
    var m = Math.round(Number(minutes) || 0);
    if (m <= 0) return '0m';
    var h = Math.floor(m / 60), r = m % 60;
    if (h && r) return h + 'h' + r + 'm';
    if (h) return h + 'h';
    return r + 'm';
  };

  util.fmtDurationCN = function (minutes) {
    var m = Math.round(Number(minutes) || 0);
    if (m < 60) return m + ' 分钟';
    var h = m / 60;
    return (Math.round(h * 10) / 10) + ' 小时';
  };

  /* '90' -> 90 ; '1.5h' -> 90 ; '1h30m' -> 90 ; 非法 -> null */
  util.parseDuration = function (input) {
    if (input === null || input === undefined) return null;
    var s = String(input).trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
    /* 'm45' 这类漏写单位的写法按分钟收下；'h30' 属于含义歧义（30 小时还是 30 分钟？），
       一律拒绝，避免把数据记成 60 倍误差。 */
    if (/^m\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s.slice(1)));
    var m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?$/.exec(s);
    if (!m || (!m[1] && !m[2])) return null;
    var mins = 0;
    if (m[1]) mins += parseFloat(m[1]) * 60;
    if (m[2]) mins += parseFloat(m[2]);
    return Math.round(mins);
  };

  util.fmtClock = function (seconds) {
    var s = Math.max(0, Math.floor(Number(seconds) || 0));
    var h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60;
    return util.pad2(h) + ':' + util.pad2(mi) + ':' + util.pad2(se);
  };

  /* ---------- 金额 ---------- */
  util.fmtMoney = function (n) {
    var v = Number(n) || 0;
    return '¥' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  root.App.util = util;
})(typeof globalThis !== 'undefined' ? globalThis : this);
