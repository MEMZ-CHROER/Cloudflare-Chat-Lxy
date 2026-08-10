// v1.53 批3B 导航壳 Vue 化 - jsdom 冒烟测试
// 验证 initNav 挂载 NavBar（浮钮/more-menu/bottom-bar）+ UserMenu（响应式显隐/定位）+ 双轨开关
import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
  <div id="chat-modals"></div>
  <div id="chat-nav"></div>
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
globalThis.__chatState = { state: { username: 'tester', soundMuted: false, blockedUsers: new Set() }, t: (k) => k, getLang: () => 'zh', setLang: () => {}, showToast: () => {}, showInfo: () => {}, showError: () => {}, showSuccess: () => {}, showWarning: () => {} };
globalThis.__chatMenu = { handleMenuAction: (action) => { globalThis.__lastMenuAction = action; } };

// modal-manager 真实加载（nav.js 的 injectCss 依赖）
function loadManager() {
  let src = fs.readFileSync('src/client/chat/modal-manager.js', 'utf8');
  src = src.replace("import * as Vue from '/static/chat/vendor/vue.js';", 'const Vue = globalThis.__vue;');
  return loadModule(src);
}
const mm = await loadManager();
globalThis.__chatModal = { injectCss: mm.injectCss, registerModal: mm.registerModal, openModal: mm.openModal, closeModal: mm.closeModal, closeTop: mm.closeTop, closeAll: mm.closeAll, stack: mm.stack };

// nav.js 加载（替换依赖 import）
function loadNav() {
  let src = fs.readFileSync('src/client/chat/nav.js', 'utf8');
  src = src.replace("import * as Vue from '/static/chat/vendor/vue.js';", 'const Vue = globalThis.__vue;');
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/state\.js';/, (m, names) => `const { ${names} } = globalThis.__chatState;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/modal-manager\.js';/, (m, names) => `const { ${names} } = globalThis.__chatModal;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/menu\.js';/, (m, names) => `const { ${names} } = globalThis.__chatMenu;`);
  return loadModule(src);
}
const nav = await loadNav();

console.log('== 1. initNav 挂载 NavBar ==');
localStorage.clear();
nav.initNav();
await tick2();
const navInner = document.querySelector('.cm-nav-inner');
assert(!!navInner, 'initNav 挂载渲染 .cm-nav-inner');
assert(document.querySelectorAll('#chat-nav .floating-btn').length === 7, 'Vue 浮钮 7 个');
assert(!document.querySelector('#chat-nav #more-menu-panel'), '初始 more-menu 收起（v-if 未挂载）');
assert(document.querySelectorAll('#chat-nav #mobile-bottom-bar .mbb-btn').length === 4, 'Vue mobile-bottom-bar 4 个按钮');
assert(!!window.__navSetUserMenu, '注册 __navSetUserMenu 双轨桥');
console.log('');

console.log('== 2. more-menu 开合 ==');
const moreBtns = document.querySelectorAll('#chat-nav .floating-btn');
const moreBtn = moreBtns[moreBtns.length - 1]; // 最后一个 = 更多
moreBtn.click();
await tick();
const panel = document.querySelector('#chat-nav #more-menu-panel');
assert(!!panel && panel.classList.contains('show'), '点更多 → more-menu 展开');
// 点面板项触发动作 + 收起
const item = panel.querySelector('.more-menu-item');
assert(!!item, 'more-menu 有 8 项渲染');
item.click();
await tick();
assert(!document.querySelector('#chat-nav #more-menu-panel'), '点面板项后自动收起');
console.log('');

console.log('== 3. 浮钮动作 ==');
// 声音切换
const soundBtn = document.querySelectorAll('#chat-nav .floating-btn')[0];
soundBtn.click();
await tick();
assert(globalThis.__chatState.state.soundMuted === true, '声音钮切换 state.soundMuted');
// 暗色切换
const darkBtn = document.querySelectorAll('#chat-nav .floating-btn')[1];
darkBtn.click();
await tick();
assert(document.body.classList.contains('dark'), '暗色钮切换 body.dark');
console.log('');

console.log('== 4. UserMenu 响应式显隐/权限 ==');
window.__navSetUserMenu({ visible: true, name: 'Bob', x: 20, y: 30, label: 'Bob', blocked: false, hasAdmin: true, relButtons: {} });
await tick2();
const userMenu = document.querySelector('#user-menu');
assert(!!userMenu && userMenu.classList.contains('show'), 'showUserMenu → #user-menu 显示');
const itemBy = (a) => { for (const el of userMenu.querySelectorAll('.user-menu-item')) { if (el.textContent.indexOf(a) !== -1 || el.getAttribute('style')) { if (el.__key === a) return el; } } return null; };
const menuItems = Array.from(userMenu.querySelectorAll('.user-menu-item'));
const kickItem = menuItems.find(el => el.textContent.indexOf('踢出') !== -1);
const atItem = menuItems.find(el => el.textContent.indexOf('@ 提及') !== -1);
assert(!!kickItem && kickItem.style.display === 'flex', 'hasAdmin → 踢出显示');
assert(!!atItem && atItem.style.display === 'flex', 'at 始终显示');
// 无 admin
window.__navSetUserMenu({ visible: true, name: 'Bob', x: 20, y: 30, label: 'Bob', blocked: false, hasAdmin: false, relButtons: {} });
await tick();
const kickItem2 = Array.from(userMenu.querySelectorAll('.user-menu-item')).find(el => el.textContent.indexOf('踢出') !== -1);
assert(kickItem2.style.display === 'none', '无 admin → 踢出隐藏');
// blocked
window.__navSetUserMenu({ visible: true, name: 'Bob', x: 20, y: 30, label: 'Bob', blocked: true, hasAdmin: true, relButtons: {} });
await tick();
const blockItem = Array.from(userMenu.querySelectorAll('.user-menu-item')).find(el => el.textContent.indexOf('屏蔽') !== -1 && el.textContent.indexOf('取消') === -1);
const unblockItem = Array.from(userMenu.querySelectorAll('.user-menu-item')).find(el => el.textContent.indexOf('取消屏蔽') !== -1);
assert(blockItem.style.display === 'none', 'blocked → 屏蔽隐藏');
assert(unblockItem.style.display === 'flex', 'blocked → 取消屏蔽显示');
// 关系按钮显隐
window.__navSetUserMenu({ visible: true, name: 'Bob', x: 20, y: 30, label: 'Bob', blocked: false, hasAdmin: false, relButtons: { 'rel-follow': true } });
await tick();
const relBtn = Array.from(userMenu.querySelectorAll('.menu-btn')).find(el => el.textContent.indexOf('关注') !== -1);
assert(!!relBtn && relBtn.style.display === 'block', 'relButtons 控制关系按钮显隐');
// 点击动作 → handleMenuAction
const kickItem3 = Array.from(userMenu.querySelectorAll('.user-menu-item')).find(el => el.textContent.indexOf('踢出') !== -1);
kickItem3.click();
await tick();
assert(globalThis.__lastMenuAction === 'kick', '点击操作项 → handleMenuAction(kick)');
// 隐藏
window.__navSetUserMenu({ visible: false });
await tick();
assert(!document.querySelector('#user-menu.show'), 'hideUserMenu → #user-menu 隐藏');
console.log('');

console.log('== 5. 双轨：legacy 开关不挂载 ==');
localStorage.setItem('chatLegacyModals', '1');
document.getElementById('chat-nav').innerHTML = '';
nav.initNav();
await tick();
assert(!document.querySelector('#chat-nav .cm-nav-inner'), 'chatLegacyModals=1 → 不挂载 Vue 导航');
localStorage.clear();

console.log('\n==== ' + passed + ' 通过 / ' + failed + ' 失败 ====');
if (failed) process.exit(1);
