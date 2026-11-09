// v1.53 批2 工具域 8 弹窗/面板 Vue3 化 - jsdom 冒烟测试
// 验证 8 个真实 Vue 组件能被 modal-manager 挂载渲染 + drawer 模式 + 关闭机制
// 依赖桩（state/renderers/dm/favorites/achievements/channels）；fetch 宽松 mock；modal-manager 真实加载
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
// 组件 onMounted 可能 fetch；宽松 mock（try/catch 包裹下安全渲染错误/空态）
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
// audio 相关 mock（music 组件用）
if (!globalThis.HTMLAudioElement) { try { globalThis.HTMLAudioElement = class {}; } catch (e) {} }
try { globalThis.Audio = class { play() { return Promise.resolve(); } pause() {} }; } catch (e) {}

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

globalThis.__vue = await import('file://' + process.cwd().replace(/\\/g, '/') + '/_vue-test.mjs');

// 依赖桩
globalThis.__chatState = { state: {}, t: (k) => k, getLang: () => 'zh', setLang: () => {}, showToast: () => {}, showInfo: () => {}, showError: () => {}, showSuccess: () => {}, showWarning: () => {} };
globalThis.__chatRenderers = { formatTime: () => '', resetMsgDate: () => {}, refreshReplyCounts: () => {}, escapeHtml: (s) => s, updatePointsDisplay: () => {} };
globalThis.__chatDm = { addToDMCache: () => {} };
globalThis.__chatFavorites = { loadFavorites: () => [] };
globalThis.__chatAchievements = { ACH_DEFS: [] };
globalThis.__chatChannels = { renderChannelMessage: () => {} };

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

// 加载组件（替换依赖 import）
function loadModal(file) {
  let src = fs.readFileSync('src/client/chat/modals/' + file, 'utf8');
  src = src.replace("import * as Vue from '/static/chat/vendor/vue.js';", 'const Vue = globalThis.__vue;');
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/state\.js';/g, (m, names) => `const { ${names} } = globalThis.__chatState;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/renderers\.js';/, (m, names) => `const { ${names} } = globalThis.__chatRenderers;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/dm\.js';/, (m, names) => `const { ${names} } = globalThis.__chatDm;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/favorites\.js';/, (m, names) => `const { ${names} } = globalThis.__chatFavorites;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/achievements\.js';/, (m, names) => `const { ${names} } = globalThis.__chatAchievements;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/channels\.js';/, (m, names) => `const { ${names} } = globalThis.__chatChannels;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/modal-manager\.js';/, (m, names) => `const { ${names} } = globalThis.__chatModal;`);
  return loadModule(src);
}

const MODALS = [
  { name: 'music', file: 'music.js', root: 'cm-music' },
  { name: 'dm', file: 'dm.js', root: 'cm-dm' },
  { name: 'favorites', file: 'favorites.js', root: 'cm-fav' },
  { name: 'achievements', file: 'achievements.js', root: 'cm-achv' },
  { name: 'highlights', file: 'highlights.js', root: 'cm-hl' },
  { name: 'roominfo', file: 'roominfo.js', root: 'cm-roominfo' },
  { name: 'filespanel', file: 'filespanel.js', root: 'cm-filespanel' },
  { name: 'search', file: 'search.js', root: 'cm-search' },
];

console.log('== 8 弹窗/面板挂载渲染 ==');
for (const m of MODALS) {
  const mod = (await loadModal(m.file)).default;
  mm.registerModal(m.name, () => Promise.resolve({ default: mod }));
  assert(mod && typeof mod.setup === 'function', m.name + ' 组件可加载 (setup 存在)');
  mm.openModal(m.name, m.name === 'dm' ? { user: 'tester' } : {});
  await tick2();
  const root = document.querySelector('.' + m.root);
  assert(!!root, m.name + ' 渲染出 .' + m.root);
  if (root) {
    assert(!!root.querySelector('.cm-header'), m.name + ' 有 .cm-header');
    assert(!!root.querySelector('.cm-close'), m.name + ' 有 .cm-close 关闭按钮');
  }
  assert(mm.stack.length === 1, m.name + ' stack 长度 1');
  // 去重
  mm.openModal(m.name, {});
  await tick();
  assert(mm.stack.length === 1, m.name + ' 重复打开去重 stack 仍 1');
  // 关闭按钮
  const root2 = document.querySelector('.' + m.root);
  if (root2) { root2.querySelector('.cm-close').click(); await tick(); }
  assert(mm.stack.length === 0, m.name + ' 关闭按钮关闭 stack 空');
  console.log('');
}

console.log('== drawer 模式（dm） ==');
const dmMod = (await loadModal('dm.js')).default;
mm.registerModal('dm', () => Promise.resolve({ default: dmMod }));
mm.openModal('dm', { user: 'tester' }, { mode: 'drawer' });
await tick2();
const layer = document.querySelector('.cm-layer');
assert(!!layer, 'drawer 打开 .cm-layer 存在');
assert(layer.classList.contains('cm-layer-drawer'), 'drawer layer 有 cm-layer-drawer 类');
const card = document.querySelector('.cm-card');
assert(!!card && card.classList.contains('cm-card-drawer'), 'drawer card 有 cm-card-drawer 类');
document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
await tick();
assert(mm.stack.length === 0, 'drawer Escape 关闭');

console.log('== drawer 模式（search） ==');
const sMod = (await loadModal('search.js')).default;
mm.registerModal('search', () => Promise.resolve({ default: sMod }));
mm.openModal('search', {}, { mode: 'drawer' });
await tick2();
assert(document.querySelector('.cm-layer-drawer') !== null, 'search drawer 打开');
document.querySelector('.cm-backdrop').click();
await tick();
assert(mm.stack.length === 0, 'search backdrop 关闭');

console.log('\n==== ' + passed + ' 通过 / ' + failed + ' 失败 ====');
if (failed) process.exit(1);
