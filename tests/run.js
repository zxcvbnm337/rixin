'use strict';
/* 测试运行器：由 Node 自己拉起测试进程，统计结果并落盘报告。
   用法： node tests/run.js */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '.workbuddy');

function listTestFiles() {
  return fs.readdirSync(__dirname)
    .filter(f => /^\d.*\.test\.js$/.test(f))
    .sort();
}

const files = listTestFiles();

function safeWrite(name, content) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), content, 'utf8');
}

safeWrite('run-step.txt', 'step1: files=' + files.join(',') + '\n');

try {
  main();
} catch (err) {
  safeWrite('runner-error.txt', String(err && err.stack || err));
  process.exit(2);
}

function main() {
const steps = [];
function mark(t) { steps.push(t); safeWrite('run-step.txt', 'step1: files=' + files.join(',') + '\n' + steps.join('\n') + '\n'); }
mark('enter-main');
const args = ['--test', '--test-reporter=tap'].concat(files.map(f => path.join('tests', f)));
mark('args=' + JSON.stringify(args));

let r;
try {
  r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  mark('spawn done status=' + r.status + ' outlen=' + (r.stdout || '').length + ' errlen=' + (r.stderr || '').length);
} catch (e) {
  mark('spawn THROW ' + e.message);
  throw e;
}
const raw = (r.stdout || '') + '\n' + (r.stderr || '');

safeWrite('test-raw.tap', raw);
mark('raw written, len=' + raw.length);

const lines = raw.split(/\r?\n/);
const passed = [], failed = [], skipped = [];
let current = null;

lines.forEach(line => {
  let m = /^ok \d+ - (.*)$/.exec(line);
  if (m) { passed.push(m[1].trim()); current = null; return; }
  m = /^not ok \d+ - (.*)$/.exec(line);
  if (m) { failed.push({ name: m[1].trim(), detail: [] }); current = failed[failed.length - 1]; return; }
  m = /^# (?:SKIP|skip) /.exec(line);
  if (m && current) return;
  if (current && /^(error:|  ---|  \.\.\.)/.test(line)) current.detail.push(line.trim());
  else if (current && line.trim()) current.detail.push(line.trim());
});

const byFile = {};
files.forEach(f => { byFile[f] = { pass: 0, fail: 0 }; });

fs.writeFileSync(path.join(OUT_DIR, 'test-summary.txt'),
  '测试文件：' + files.length + '\n' +
  '通过：' + passed.length + '\n' +
  '失败：' + failed.length + '\n' +
  '退出码：' + r.status + '\n\n' +
  (failed.length
    ? '失败明细：\n' + failed.map(f => '✖ ' + f.name + '\n  ' + f.detail.slice(0, 14).join('\n  ')).join('\n\n')
    : '失败明细：无\n') +
  '\n通过清单：\n' + passed.map(p => '✓ ' + p).join('\n'),
  'utf8');

safeWrite('run-console.txt', '测试文件 ' + files.length + ' 个 ｜ 通过 ' + passed.length + ' ｜ 失败 ' + failed.length + ' ｜ 退出码 ' + r.status + '\n' +
  (failed.length ? failed.map(f => '  ✖ ' + f.name).join('\n') + '\n' : ''));
process.exit(failed.length ? 1 : 0);
}
