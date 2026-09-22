/* core/util.js —— 纯工具函数，不依赖 wx 与 DOM。
   从网页版 js/core/util.js 迁移；去掉了 DOM 相关的转义函数（WXML 自带转义）。 */

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function clamp(n, min, max) {
  n = Number(n);
  if (isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 6);
}

function sum(arr, fn) {
  return (arr || []).reduce(function (a, x) { return a + (fn ? fn(x) : x); }, 0);
}

function groupBy(arr, fn) {
  var out = {};
  (arr || []).forEach(function (x) {
    var k = fn(x);
    (out[k] = out[k] || []).push(x);
  });
  return out;
}

function sortBy(arr, fn, desc) {
  return (arr || []).slice().sort(function (a, b) {
    var va = fn(a), vb = fn(b);
    if (va < vb) return desc ? 1 : -1;
    if (va > vb) return desc ? -1 : 1;
    return 0;
  });
}

/* ---------- 日期（一律本地时区，禁止 toISOString） ---------- */
function fmtDate(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function today() { return fmtDate(new Date()); }

function parseDate(s) {
  var p = String(s || '').split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) || 1);
}

function isValidDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

function addDays(dateStr, n) {
  var d = parseDate(dateStr);
  d.setDate(d.getDate() + Number(n));
  return fmtDate(d);
}

function diffDays(a, b) {
  return Math.round((parseDate(a) - parseDate(b)) / 86400000);
}

var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekdayName(dateStr) { return WEEKDAYS[parseDate(dateStr).getDay()]; }

/* 周一 = 1 ... 周日 = 7 */
function weekdayIndexMon(dateStr) {
  var g = parseDate(dateStr).getDay();
  return g === 0 ? 7 : g;
}

function startOfWeek(dateStr, weekStartsOn) {
  var d = parseDate(dateStr);
  var g = d.getDay();
  var start = (weekStartsOn === 0) ? g : (g === 0 ? 6 : g - 1);
  d.setDate(d.getDate() - start);
  return fmtDate(d);
}

function monthKey(dateStr) { return String(dateStr).slice(0, 7); }

function formatDateCN(dateStr) {
  var d = parseDate(dateStr);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekdayName(dateStr);
}

/* ---------- 时长（一律以分钟存储） ---------- */
function fmtDuration(minutes) {
  var m = Math.round(Number(minutes) || 0);
  if (m <= 0) return '0m';
  var h = Math.floor(m / 60), r = m % 60;
  if (h && r) return h + 'h' + r + 'm';
  if (h) return h + 'h';
  return r + 'm';
}

function fmtDurationCN(minutes) {
  var m = Math.round(Number(minutes) || 0);
  if (m < 60) return m + ' 分钟';
  var h = m / 60;
  return (Math.round(h * 10) / 10) + ' 小时';
}

/* '90' -> 90 ; '1.5h' -> 90 ; '1h30m' -> 90 ; 非法 -> null */
function parseDuration(input) {
  if (input === null || input === undefined) return null;
  var s = String(input).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  if (/^m\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s.slice(1)));
  var m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?$/.exec(s);
  if (!m || (!m[1] && !m[2])) return null;
  var mins = 0;
  if (m[1]) mins += parseFloat(m[1]) * 60;
  if (m[2]) mins += parseFloat(m[2]);
  return Math.round(mins);
}

module.exports = {
  pad2: pad2,
  clamp: clamp,
  uid: uid,
  sum: sum,
  groupBy: groupBy,
  sortBy: sortBy,
  fmtDate: fmtDate,
  today: today,
  parseDate: parseDate,
  isValidDate: isValidDate,
  addDays: addDays,
  diffDays: diffDays,
  WEEKDAYS: WEEKDAYS,
  weekdayName: weekdayName,
  weekdayIndexMon: weekdayIndexMon,
  startOfWeek: startOfWeek,
  monthKey: monthKey,
  formatDateCN: formatDateCN,
  fmtDuration: fmtDuration,
  fmtDurationCN: fmtDurationCN,
  parseDuration: parseDuration
};
