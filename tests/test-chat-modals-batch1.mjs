// v1.53 批1 经济域 6 弹窗 Vue3 化 - jsdom 冒烟测试
// 验证 6 个真实 Vue 组件能被 modal-manager 挂载渲染（根元素/.cm-header/.cm-close）+ 关闭机制
// 依赖桩（state/auth/renderers/vip）替代真实模块；fetch 宽松 mock；modal-manager 真实加载
import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
  <div id="chat-modals"></div>
</body></html>`, {
  url: 'http://localhost/',
  pretendToBeVisual: true
});
const w = dom.window;
for (const k of ['window','document','navigator','HTMLElement','Element','Node','SVGElement','SVGSVGElement','ShadowRoot','MutationObserver','requestAnimationFrame','cancelAnimationFrame','Event','CustomEvent','HTMLCanvasElement','History','Location','Blob','Document','DocumentFragment','NodeList','HTMLCollection','getComputedStyle','localStorage','sessionStorage','File','FileList','DOMParser','XMLHttpRequest','MouseEvent','InputEvent','KeyboardEvent']) {
  try { globalThis[k] = w[k]; } catch (e) {}
}
globalThis.location = w.location;
globalThis.history = w.history;
globalThis.confirm = () => true;
globalThis.alert = () => {};
globalThis.prompt = () => "1";
globalThis.FileReader = w.FileReader;
globalThis.URL.createObjectURL = () => "blob:mock";
globalThis.URL.revokeObjectURL = () => {};
// fetch 宽松 mock：组件 onMounted 的请求返回 ok 空结构（try/catch 包裹下安全渲染错误/空态）
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });

// ---------- 合成模块 ----------
function toDataUrl(src) { return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64'); }
async function loadModule(src) { return await import(toDataUrl(src)); }
const tick = () => new Promise(r => setTimeout(r, 0));
const tick2 = async () => { await tick(); await tick(); await tick(); };

let passed = 0, failed = 0;
function assert(cond, name, extra = '') {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (extra ? ' :: ' + extra : '')); }
}

// vue .mjs 副本
globalThis.__vue = await import('file://' + process.cwd().replace(/\\/g, '/') + '/_vue-test.mjs');

// 依赖桩
globalThis.__chatState = { state: {}, t: (k) => k, getLang: () => 'zh', setLang: () => {}, showInfo: () => {}, showError: () => {}, showSuccess: () => {}, showWarning: () => {} };
globalThis.__chatAuth = { getAuthName: () => 'tester', getAuthToken: () => 'tok', isAuthenticated: () => true };
globalThis.__chatRenderers = { updatePointsDisplay: () => {}, escapeHtml: (s) => s };
globalThis.__chatVip = { TAG_COLORS: {} };

// modal-manager 真实加载
function loadManager() {
  let src = fs.readFileSync('src/client/chat/modal-manager.js', 'utf8');
  src = src.replace("import * as Vue from '/static/chat/vendor/vue.js';", 'const Vue = globalThis.__vue;');
  return loadModule(src);
}
const mm = await loadManager();
globalThis.__chatModal = {
  injectCss: mm.injectCss, registerModal: mm.registerModal, openModal: mm.openModal,
  closeModal: mm.closeModal, closeTop: mm.closeTop, closeAll: mm.closeAll, stack: mm.stack,
};

// 加载 6 个组件（替换依赖 import）
function loadModal(file) {
  let src = fs.readFileSync('src/client/chat/modals/' + file, 'utf8');
  src = src.replace("import * as Vue from '/static/chat/vendor/vue.js';", 'const Vue = globalThis.__vue;');
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/state\.js';/, (m, names) => `const { ${names} } = globalThis.__chatState;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/auth\.js';/, (m, names) => `const { ${names} } = globalThis.__chatAuth;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/renderers\.js';/, (m, names) => `const { ${names} } = globalThis.__chatRenderers;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/vip\.js';/, (m, names) => `const { ${names} } = globalThis.__chatVip;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/modal-manager\.js';/, (m, names) => `const { ${names} } = globalThis.__chatModal;`);
  return loadModule(src);
}

const MODALS = {
  shop: { file: 'shop.js', root: 'cm-shop' },
  market: { file: 'market.js', root: 'cm-market' },
  lottery: { file: 'lottery.js', root: 'cm-lottery' },
  tasks: { file: 'tasks.js', root: 'cm-tasks' },
  season: { file: 'season.js', root: 'cm-season' },
  relation: { file: 'relation.js', root: 'cm-relation' },
};

console.log('== 6 弹窗挂载渲染 ==');
for (const [name, info] of Object.entries(MODALS)) {
  const mod = (await loadModal(info.file)).default;
  mm.registerModal(name, () => Promise.resolve({ default: mod }));
  assert(mod && typeof mod.setup === 'function', name + ' 组件可加载 (setup 存在)');
  mm.openModal(name, { tab: 'buy' });
  await tick2();
  const root = document.querySelector('.' + info.root);
  assert(!!root, name + ' 渲染出 .' + info.root, document.querySelector('.cm-layer') ? '' : '  (无 .cm-layer)');
  if (root) {
    assert(!!root.querySelector('.cm-header'), name + ' 有 .cm-header');
    assert(!!root.querySelector('.cm-close'), name + ' 有 .cm-close 关闭按钮');
  }
  assert(mm.stack.length === 1, name + ' stack 长度 1');
  // 去重：重复打开不新增
  mm.openModal(name, { tab: 'friends' });
  await tick();
  assert(mm.stack.length === 1, name + ' 重复打开去重 stack 仍 1');
  // 关闭按钮
  const root2 = document.querySelector('.' + info.root);
  if (root2) { root2.querySelector('.cm-close').click(); await tick(); }
  assert(mm.stack.length === 0, name + ' 关闭按钮关闭 stack 空');
  console.log('');
}

console.log('== 关闭机制（以 lottery 为例） ==');
const lotMod = (await loadModal('lottery.js')).default;
mm.registerModal('lottery', () => Promise.resolve({ default: lotMod }));
mm.openModal('lottery');
await tick2();
assert(document.querySelector('.cm-lottery') !== null, 'lottery 打开');
document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
await tick();
assert(mm.stack.length === 0, 'Escape 关闭');
mm.openModal('lottery');
await tick2();
document.querySelector('.cm-backdrop').click();
await tick();
assert(mm.stack.length === 0, 'backdrop 关闭');

console.log('\n==== ' + passed + ' 通过 / ' + failed + ' 失败 ====');
if (failed) process.exit(1);
