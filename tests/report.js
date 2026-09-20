'use strict';
/* report.js —— 解析 .workbuddy/test-raw.tap，生成测试报告。
   不做子进程调用（沙箱会拦），只读文件、算结果、写报告。 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '.workbuddy');
const rawPath = path.join(OUT_DIR, 'test-raw.tap');

if (!fs.existsSync(rawPath)) {
  console.error('缺少 ' + rawPath + '，请先运行 tests/run-tests.ps1');
  process.exit(2);
}

const raw = fs.readFileSync(rawPath, 'utf8').replace(/^\uFEFF/, '');
const blocks = raw.split(/^### FILE (.+)$/m);

const files = [];
let totalPass = 0, totalFail = 0, totalSkip = 0;
const failures = [];

for (let i = 1; i < blocks.length; i += 2) {
  const name = blocks[i].trim();
  const body = blocks[i + 1] || '';
  const lines = body.split(/\r?\n/);
  let pass = 0, fail = 0, skip = 0;
  let cur = null;

  lines.forEach(line => {
    let m = /^ok \d+ - (.*?)(?: # (SKIP|TODO).*)?$/.exec(line);
    if (m) {
      if (m[2]) { skip++; }
      else { pass++; }
      cur = null;
      return;
    }
    m = /^not ok \d+ - (.*)$/.exec(line);
    if (m) {
      fail++;
      cur = { file: name, name: m[1].trim(), detail: [] };
      failures.push(cur);
      return;
    }
    if (cur) {
      const t = line.replace(/^\s*/, '').replace(/\s*$/, '');
      if (t && !/^(---|\.\.\.|duration_ms|type:|location:|failureType:|code:|name:|stack: \|-)/.test(t)) {
        cur.detail.push(t);
      }
    }
  });

  files.push({ name: name, pass: pass, fail: fail, skip: skip });
  totalPass += pass; totalFail += fail; totalSkip += skip;
}

const lines = [];
lines.push('================ 测试报告 ================');
lines.push('生成时间：' + new Date().toLocaleString('zh-CN'));
lines.push('');
lines.push('测试文件：' + files.length + ' 个');
lines.push('通过：' + totalPass);
lines.push('失败：' + totalFail);
lines.push('跳过：' + totalSkip);
lines.push('结论：' + (totalFail === 0 ? '全部通过' : '存在失败'));
lines.push('');
lines.push('---- 分文件明细 ----');
files.forEach(f => {
  lines.push((f.fail === 0 ? '  OK   ' : '  FAIL ') + f.name + '  通过 ' + f.pass + ' / 失败 ' + f.fail + (f.skip ? ' / 跳过 ' + f.skip : ''));
});
lines.push('');
if (failures.length) {
  lines.push('---- 失败明细 ----');
  failures.forEach((f, i) => {
    lines.push((i + 1) + '. [' + f.file + '] ' + f.name);
    f.detail.slice(0, 12).forEach(d => lines.push('     ' + d));
    lines.push('');
  });
} else {
  lines.push('---- 失败明细 ----');
  lines.push('  无');
  lines.push('');
}

const report = lines.join('\n');
fs.writeFileSync(path.join(OUT_DIR, 'test-summary.txt'), report, 'utf8');

/* 通过清单单独存一份，便于核对 */
const passList = raw.split(/\r?\n/).filter(l => /^ok \d+ - /.test(l)).map(l => l.replace(/^ok \d+ - /, ''));
fs.writeFileSync(path.join(OUT_DIR, 'test-passed.txt'), passList.join('\n'), 'utf8');

process.exit(totalFail ? 1 : 0);
