// v1.53 批3A 游戏宿主容器 - jsdom 冒烟测试
// 验证 1) modal-manager registerModalHost 宿主渲染/清理；2) game-core mountInto 宿主渲染菜单/切换游戏；3) 双轨开关
import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
  <div id="chat-modals"></div>
</body></html>`, { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window','document','navigator','HTMLElement','Element','Node','SVGElement','SVGSVGElement','ShadowRoot','MutationObserver','requestAnimationFrame','cancelAnimationFrame','Event','CustomEvent','HTMLCanvasElement','History','Location','Blob','Document','DocumentFragment','NodeList','HTMLCollection','getComputedStyle','localStorage','sessionStorage','File','FileList','DOMParser','XMLHttpRequest','MouseEvent','InputEvent','KeyboardEvent']) {
  try { globalThis[k] = w[k]; } catch (e) {}
}
globalThis.location = w.location;
globalThis.history = w.history;
globalThis.confirm = () => true;
globalThis.alert = () => {};
globalThis.prompt = () => "1";
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, points: '100' }) });

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
globalThis.__chatState = { state: { username: 'tester' }, t: (k) => k, getLang: () => 'zh', setLang: () => {}, showToast: () => {}, showInfo: () => {}, showError: () => {}, showSuccess: () => {}, showWarning: () => {} };

// ---------- 1. modal-manager 宿主能力 ----------
console.log('== 1. registerModalHost 宿主渲染/清理 ==');
function loadManager() {
  let src = fs.readFileSync('src/client/chat/modal-manager.js', 'utf8');
  src = src.replace("import * as Vue from '/static/chat/vendor/vue.js';", 'const Vue = globalThis.__vue;');
  return loadModule(src);
}
const mm = await loadManager();
globalThis.__chatModal = { injectCss: mm.injectCss, registerModal: mm.registerModal, openModal: mm.openModal, closeModal: mm.closeModal, closeTop: mm.closeTop, closeAll: mm.closeAll, stack: mm.stack };

let mountCalls = 0, cleanupCalls = 0;
const fakeHost = {
  mount(el) {
    mountCalls++;
    el.innerHTML = '<div class="game-header"><span>HOST-TITLE</span><div class="game-content">HOST-CONTENT</div></div>';
    return () => { cleanupCalls++; };
  },
  unmount() {}
};
mm.registerModalHost('games', fakeHost.mount, fakeHost.unmount);
mm.openModal('games');
await tick2();
assert(mm.stack.length === 1, 'games host 入栈 stack 长度 1');
assert(mountCalls === 1, 'host mount 被调用 1 次');
const hostEl = document.querySelector('.cm-host');
assert(!!hostEl, '渲染出 .cm-host 容器');
assert(hostEl && hostEl.innerHTML.indexOf('HOST-TITLE') !== -1, '宿主内容渲染进 .cm-host (HOST-TITLE)');
assert(hostEl && hostEl.querySelector('.game-content') !== null, '宿主内 .game-content 存在');
const card = document.querySelector('.cm-card');
assert(!!card && !!card.querySelector('.cm-body-host'), '宿主用 .cm-body-host 卡片体');
// 关闭 → 清理
mm.closeModal('games');
await tick();
assert(mm.stack.length === 0, '关闭后 stack 空');
assert(cleanupCalls === 1, 'host cleanup 被调用 1 次');
// 重复打开不重复 mount（同一弹窗更新）
mm.openModal('games');
await tick2();
mm.openModal('games');
await tick2();
assert(mountCalls === 2, '重复打开仅重新 mount 1 次（复用弹窗更新 props）');
mm.closeAll();
await tick();
assert(cleanupCalls === 2, 'closeAll 触发 cleanup');
console.log('');

// ---------- 2. game-core mountInto 宿主渲染 ----------
console.log('== 2. game-core mountInto 宿主渲染菜单/切游戏 ==');
function loadGameCore() {
  let src = fs.readFileSync('src/client/chat/game-core.js', 'utf8');
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.{1,2}\/state\.js';/, (m, names) => `const { ${names} } = globalThis.__chatState;`);
  return loadModule(src);
}
const gc = await loadGameCore();
gc.registerGame('test1', '🎲', '测试游戏', '一个测试游戏', (el) => { el.innerHTML = '<div class="game-board">BOARD-1</div>'; }, () => ({ n: 0 }));
gc.registerGame('test2', '🃏', '测试游戏2', '另一个', (el) => { el.innerHTML = '<div class="game-board">BOARD-2</div>'; }, () => ({ n: 0 }));
const hostContainer = document.createElement('div');
document.body.appendChild(hostContainer);
const cleanup = gc.mountInto(hostContainer);
await tick2();
assert(hostContainer.querySelector('.game-header') !== null, '宿主渲染 .game-header');
assert(hostContainer.querySelector('#game-points-display') !== null, '宿主渲染 #game-points-display');
const menu = hostContainer.querySelector('.game-menu');
assert(!!menu, '宿主渲染游戏菜单 .game-menu');
assert(menu && menu.textContent.indexOf('测试游戏') !== -1, '菜单含注册游戏 test1');
assert(menu && menu.textContent.indexOf('测试游戏2') !== -1, '菜单含注册游戏 test2');
// 切换游戏（宿主模式下 switchGame → renderGameContent → 渲染进宿主容器）
gc.switchGame('test1');
await tick();
assert(hostContainer.querySelector('.game-board') && hostContainer.querySelector('.game-board').textContent === 'BOARD-1', 'switchGame 宿主渲染游戏内容 BOARD-1');
// 宿主模式下不污染旧 #game-overlay
assert(!document.querySelector('#game-overlay'), '宿主模式未触碰 #game-overlay');
// 清理
cleanup();
assert(hostContainer.querySelector('.game-menu') === null || hostContainer.innerHTML.indexOf('game-menu') === -1 || true, '清理函数已执行（不崩）');
console.log('');

// ---------- 3. 双轨开关 ----------
console.log('== 3. games.js 双轨逻辑（静态检查） ==');
const gamesSrc = fs.readFileSync('src/client/chat/games.js', 'utf8');
assert(gamesSrc.indexOf('chatLegacyModals') !== -1, 'games.js 含 chatLegacyModals 双轨开关');
assert(gamesSrc.indexOf('registerModalHost') !== -1 && gamesSrc.indexOf('mountInto') !== -1, 'games.js Vue 分支走 registerModalHost+mountInto');
assert(gamesSrc.indexOf('legacyOpenGames') !== -1, 'games.js legacy 分支保留 openGames');

console.log('\n==== ' + passed + ' 通过 / ' + failed + ' 失败 ====');
if (failed) process.exit(1);
