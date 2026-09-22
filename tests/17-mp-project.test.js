/* 17-mp-project.test.js —— 小程序工程结构静态校验。
   小程序的很多错误不在运行时才暴露，而是「点了没反应」「白屏」，
   定位成本高。这里用静态检查把常见坑提前拦住：
     · 页面注册了但缺文件 / tabBar 指向不存在的页面
     · WXML 里 bindtap 写了个不存在的方法名（最常见的低级 bug）
     · require 路径打错
     · core 层不小心直接用了 wx，导致无法用 node 跑测试
     · 两套主题变量对不齐（深色下某处文字看不见）
     · WXML 标签没闭合
   微信开发者工具仍然要装（真机、编译、预览只能靠它），但这些不依赖模拟器。 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MP = path.resolve(__dirname, '..', 'miniprogram');

function read(p) { return fs.readFileSync(p, 'utf8'); }

function walk(dir, ext, out) {
  out = out || [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p, ext, out);
    else if (!ext || n.endsWith(ext)) out.push(p);
  }
  return out;
}

const APP = JSON.parse(read(path.join(MP, 'app.json')));

/* ============================================================
   1. 页面注册与文件完整性
   ============================================================ */

test('mp 工程：app.json 注册的每个页面文件都齐全', () => {
  assert.ok(APP.pages.length >= 3, '至少要有今天 / 账本 / 我的三个页面');
  APP.pages.forEach(p => {
    ['js', 'wxml', 'json'].forEach(ext => {
      const f = path.join(MP, p + '.' + ext);
      assert.ok(fs.existsSync(f), '缺文件：' + p + '.' + ext);
    });
  });
});

test('mp 工程：每个页面 json 都是合法 JSON 且带标题', () => {
  APP.pages.forEach(p => {
    const cfg = JSON.parse(read(path.join(MP, p + '.json')));
    assert.ok(cfg.navigationBarTitleText, p + ' 应设置 navigationBarTitleText');
    assert.ok(typeof cfg.usingComponents === 'object', p + ' 应显式声明 usingComponents');
  });
});

test('mp 工程：tabBar 自定义时组件必须存在，且指向已注册页面', () => {
  assert.strictEqual(APP.tabBar.custom, true);
  assert.ok(APP.tabBar.list.length >= 2);
  assert.ok(APP.tabBar.list.length <= 5, '微信 tabBar 最多 5 项');

  ['js', 'wxml', 'json', 'wxss'].forEach(ext => {
    const f = path.join(MP, 'custom-tab-bar', 'index.' + ext);
    assert.ok(fs.existsSync(f), 'custom:true 时必须提供 custom-tab-bar/index.' + ext);
  });

  APP.tabBar.list.forEach(t => {
    assert.ok(APP.pages.indexOf(t.pagePath) >= 0, 'tabBar 指向未注册页面：' + t.pagePath);
    assert.ok(t.text && t.text.length <= 4, 'tabBar 文案需简短：' + t.text);
  });
});

test('mp 工程：project.config.json 关键字段正确', () => {
  const cfg = JSON.parse(read(path.join(MP, 'project.config.json')));
  assert.strictEqual(cfg.compileType, 'miniprogram');
  assert.strictEqual(cfg.miniprogramRoot, './');
  assert.ok(cfg.appid, 'appid 不能为空（未注册前用 touristappid 占位）');
  assert.strictEqual(cfg.projectname, 'time-ledger');
});

/* ============================================================
   2. WXML：事件处理器必须真的有实现
   ============================================================ */

function handlersOf(wxml) {
  const names = new Set();
  const re = /(?:bind|catch)[:a-zA-Z]*\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(wxml))) {
    const v = m[1].trim();
    /* 只认纯方法名；带 {{}} 的动态绑定不参与静态检查 */
    if (/^[A-Za-z_$][\w$]*$/.test(v)) names.add(v);
  }
  return names;
}

function definesMethod(jsSrc, name) {
  return new RegExp('(?:^|[^\\w$.])' + name + '\\s*[(:]', 'm').test(jsSrc);
}

test('mp 工程：WXML 里绑定的事件处理器在对应 js 中都有实现', () => {
  const wxmls = walk(MP, '.wxml');
  assert.ok(wxmls.length >= 4, '至少 4 个 WXML');

  let checked = 0;
  wxmls.forEach(w => {
    const jsPath = w.replace(/\.wxml$/, '.js');
    assert.ok(fs.existsSync(jsPath), w + ' 缺少同名 js');
    const js = read(jsPath);
    const names = handlersOf(read(w));
    names.forEach(n => {
      assert.ok(definesMethod(js, n),
        path.relative(MP, w) + ' 绑定了 ' + n + '，但 ' + path.basename(jsPath) + ' 里没有这个方法');
      checked++;
    });
  });
  assert.ok(checked >= 10, '应至少校验到 10 个事件绑定，实际 ' + checked);
});

/* ============================================================
   3. WXML 标签闭合
   ============================================================ */

test('mp 工程：WXML 标签都正确闭合', () => {
  walk(MP, '.wxml').forEach(f => {
    let src = read(f).replace(/<!--[\s\S]*?-->/g, '');
    /* 去掉属性值再解析，避免 {{a > b}} 里的 > 被当成标签结束 */
    src = src.replace(/"[^"]*"/g, '""');

    const stack = [];
    const re = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"")*?)(\/?)>/g;
    let m;
    while ((m = re.exec(src))) {
      const closing = m[1] === '/';
      const tag = m[2];
      const selfClose = m[4] === '/';
      if (closing) {
        assert.strictEqual(stack.pop(), tag,
          path.relative(MP, f) + ' 标签闭合不匹配，遇到 </' + tag + '>');
      } else if (!selfClose) {
        stack.push(tag);
      }
    }
    assert.deepStrictEqual(stack, [], path.relative(MP, f) + ' 有未闭合标签：' + stack.join(', '));
  });
});

/* ============================================================
   4. 依赖路径
   ============================================================ */

test('mp 工程：所有 require 路径都能解析', () => {
  walk(MP, '.js').forEach(f => {
    const src = read(f);
    const re = /require\('([^']+)'\)/g;
    let m;
    while ((m = re.exec(src))) {
      const target = path.resolve(path.dirname(f), m[1]);
      assert.ok(fs.existsSync(target),
        path.relative(MP, f) + ' 引用了不存在的模块：' + m[1]);
    }
  });
});

/* ============================================================
   5. core 层必须与运行环境解耦（否则测试没法跑）
   ============================================================ */

test('mp 工程：core 层不直接依赖 wx，可以在 node 里跑测试', () => {
  walk(path.join(MP, 'core'), '.js').forEach(f => {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    const uses = [...src.matchAll(/\bwx\s*\./g)];
    if (!uses.length) return;
    /* 允许出现，但必须先用 typeof 探测，保证 Node 下自动降级 */
    assert.ok(/typeof\s+wx\s*!==\s*'undefined'/.test(src) || /typeof\s+wx\s*===\s*'undefined'/.test(src),
      path.relative(MP, f) + ' 用了 wx 但没有 typeof 探测，Node 下会直接抛错');
  });
});

test('mp 工程：core 层不出现 DOM / App 全局对象', () => {
  walk(path.join(MP, 'core'), '.js').forEach(f => {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\bdocument\s*\./.test(src), path.relative(MP, f) + ' 不应出现 document');
    assert.ok(!/\bwindow\s*\./.test(src), path.relative(MP, f) + ' 不应出现 window');
    assert.ok(!/[^.\w]App\s*[.=]/.test(src), path.relative(MP, f) + ' 不应依赖 App 全局对象');
  });
});

/* ============================================================
   6. 主题：两套变量必须一一对应
   ============================================================ */

function varsIn(block) {
  const out = [];
  const re = /(--[\w-]+)\s*:/g;
  let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}

/* 结构型 token：与主题无关，只应声明一次 */
const STRUCT_TOKENS = ['--r-sm', '--r-md', '--r-lg', '--sp'];

test('mp 工程：深浅两套主题色变量完全一致', () => {
  const css = read(path.join(MP, 'app.wxss'));

  /* 用显式标记切片，避免依赖 CSS 写法变化（媒体查询嵌套、样式重排都不会误判） */
  const lightMark = css.indexOf('THEME_TOKENS_LIGHT');
  const darkMark = css.indexOf('THEME_TOKENS_DARK');
  assert.ok(lightMark > 0, 'app.wxss 缺少 THEME_TOKENS_LIGHT 标记');
  assert.ok(darkMark > lightMark, 'app.wxss 缺少 THEME_TOKENS_DARK 标记');

  const light = varsIn(css.slice(lightMark, darkMark));
  const dark = varsIn(css.slice(darkMark));

  assert.ok(light.length >= 10, '浅色主题色变量太少，实际 ' + light.length);

  const missing = light.filter(v => dark.indexOf(v) < 0);
  const extra = dark.filter(v => light.indexOf(v) < 0);
  assert.deepStrictEqual(missing, [], '深色缺少变量（会悄悄退回浅色值）：' + missing.join(', '));
  assert.deepStrictEqual(extra, [], '深色多出变量（疑似拼错）：' + extra.join(', '));

  /* 结构型 token 混进主题块，就是「深色下抄重复一遍」的前兆 */
  STRUCT_TOKENS.forEach(v => {
    assert.ok(dark.indexOf(v) < 0, '结构型 token ' + v + ' 不应出现在深色主题块里，它本来就与主题无关');
  });
});

test('mp 工程：结构型 token 与主题色 token 分层声明', () => {
  const css = read(path.join(MP, 'app.wxss'));
  const darkMark = css.indexOf('THEME_TOKENS_DARK');

  /* 结构型 token 必须声明在深色块之前（即只声明一次），后续页面样式才能共用 */
  STRUCT_TOKENS.forEach(v => {
    const at = css.indexOf(v + ':');
    assert.ok(at > 0, 'app.wxss 缺少结构型 token ' + v);
    assert.ok(at < darkMark, v + ' 应声明在主题块之前');
  });

  /* 每个结构型 token 只能声明一次 */
  STRUCT_TOKENS.forEach(v => {
    const n = css.split(v + ':').length - 1;
    assert.strictEqual(n, 1, v + ' 被声明了 ' + n + ' 次，应只声明一次');
  });
});

test('mp 工程：页面容器为固定的自定义 tabBar 预留了高度与安全区', () => {
  const css = read(path.join(MP, 'app.wxss'));
  const m = /\.page-wrap\s*\{[\s\S]*?\}/.exec(css);
  assert.ok(m, 'app.wxss 应定义 .page-wrap');

  const rule = m[0];
  assert.ok(/padding\s*:/.test(rule), '.page-wrap 应设置 padding');

  /* 自定义 tabBar 是 position:fixed，页面必须自己留出底部空间，
     否则最后一屏内容会被压住（本机实测在带 Home Indicator 的机型上差一点）。 */
  assert.ok(/env\(\s*safe-area-inset-bottom\s*\)/.test(rule),
    '.page-wrap 的底部内边距必须叠加 env(safe-area-inset-bottom)，否则刘海机型会被 tabBar 压住');

  const bottom = /padding[^;]*?([\d.]+)rpx[^;]*;/.exec(rule);
  assert.ok(bottom && Number(bottom[1]) >= 110,
    '底部留白应不小于自定义 tabBar 的 110rpx，实际：' + (bottom && bottom[1] + 'rpx'));
});

test('mp 工程：页面样式只引用已声明的变量（跨文件不共享变量）', () => {
  const css = read(path.join(MP, 'app.wxss'));
  const declared = new Set(varsIn(css));

  walk(MP, '.wxss').forEach(f => {
    if (f === path.join(MP, 'app.wxss')) return;
    const src = read(f);
    const used = new Set();
    const re = /var\(\s*(--[\w-]+)/g;
    let m;
    while ((m = re.exec(src))) used.add(m[1]);
    used.forEach(v => {
      assert.ok(declared.has(v),
        path.relative(MP, f) + ' 引用了未声明的变量 ' + v + '（且没给 fallback）');
    });
  });
});

/* ============================================================
   7. 产品约束：个人主体下的能力边界
   ============================================================ */

test('mp 工程：AI 默认关闭，不把上架押在未开放的类目上', () => {
  const schema = require('../miniprogram/core/schema.js');
  assert.strictEqual(schema.defaultSettings().aiEnabled, false);
  assert.strictEqual(schema.defaultSettings().reviewStyle, 'local');
});

test('mp 工程：未填云环境 ID 时应用仍可运行（纯本地兜底）', () => {
  const schema = require('../miniprogram/core/schema.js');
  assert.strictEqual(typeof schema.CLOUD_ENV, 'string');

  const app = read(path.join(MP, 'app.js'));
  assert.ok(/store\.init\(\)/.test(app), 'app.js 启动时必须初始化本地存储');

  /* 关键：先去掉注释再检查。app.js 里确实写了 wx.cloud.init，
     但它必须在注释里——CLOUD_ENV 还是空串时真正调用会直接报错。 */
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(code.indexOf('wx.cloud.init') < 0,
    '云开发未接入前不应真正调用 wx.cloud.init（应保持在注释里）');

  if (!schema.CLOUD_ENV) {
    assert.ok(code.indexOf('wx.cloud') < 0,
      'CLOUD_ENV 为空时不应有任何生效的云开发调用');
  }
});

test('mp 工程：不引入社交 / 电商等个人主体不可用的能力', () => {
  const banned = [
    ['open-type="share"', '分享给好友（个人主体可用但需谨慎，这里刻意不用）'],
    ['onShareAppMessage', '转发（同上）'],
    ['wx.requestPayment', '微信支付（个人主体不可用）'],
    ['wx.login', '登录（当前不做账号体系）'],
    ['live-player', '直播（需资质）']
  ];
  walk(MP, null).forEach(f => {
    if (!/\.(js|wxml|json)$/.test(f)) return;
    const src = read(f);
    banned.forEach(([needle, why]) => {
      assert.ok(src.indexOf(needle) < 0, path.relative(MP, f) + ' 出现了 ' + why);
    });
  });
});
