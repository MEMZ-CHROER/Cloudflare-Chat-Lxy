// v1.53 聊天室 Vue3 弹窗管理器 + settings 范式弹窗 - jsdom 端到端测试
// 套路（沿 v1.52）：jsdom 全局化 + vue .mjs 副本 + 合成模块(data URL)替换 import 为全局引用
// 覆盖：modal-manager 打开/去重/backdrop关闭/Escape关闭 + settings 弹窗主题切换/滑块/语言/关闭 + legacy 双轨回退
import { JSDOM } from 'jsdom';
import fs from 'fs';

// state.js 模块顶层会读 #name-form/#room-name/#go-public/#go-private/#chatroom/#chatlog/#chat-input/#roster
// 另需 #chat-modals（挂载点）+ #settings-overlay（legacy 测试）
const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
  <form id="name-form"></form>
  <input id="room-name"><button id="go-public"></button><button id="go-private"></button>
  <div id="chatroom"><div id="chatlog"></div></div>
  <input id="chat-input"><div id="roster"></div>
  <div id="settings-overlay"></div>
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

// ---------- 合成模块 ----------
function toDataUrl(src) { return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64'); }
async function loadModule(src) { return await import(toDataUrl(src)); }
const tick = () => new Promise(r => setTimeout(r, 0));

let passed = 0, failed = 0;
function assert(cond, name, extra = '') {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (extra ? ' :: ' + extra : '')); }
}

// vue .mjs 副本
globalThis.__vue = await import('file://' + process.cwd().replace(/\\/g, '/') + '/_vue-test.mjs');

// state.js（无 import，直接加载）
const stateMod = await loadModule(fs.readFileSync('src/client/chat/state.js', 'utf8'));
globalThis.__chatState = {
  state: stateMod.state, t: stateMod.t, getLang: stateMod.getLang, setLang: stateMod.setLang,
  applyI18n: stateMod.applyI18n, showInfo: stateMod.showInfo, showError: stateMod.showError, showSuccess: stateMod.showSuccess, showWarning: stateMod.showWarning,
};

// settings.js（替换 ./state.js import）
function loadSettings() {
  let src = fs.readFileSync('src/client/chat/settings.js', 'utf8');
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/state\.js';/, (m, names) => `const { ${names} } = globalThis.__chatState;`);
  return loadModule(src);
}
const settingsMod = await loadSettings();
globalThis.__chatSettings = {
  openSettings: settingsMod.openSettings, closeSettings: settingsMod.closeSettings, initSettings: settingsMod.initSettings,
  applyBgTint: settingsMod.applyBgTint, applyBgBlur: settingsMod.applyBgBlur, applyUiColor: settingsMod.applyUiColor, resetUiColor: settingsMod.resetUiColor,
  applyWallpaper: settingsMod.applyWallpaper, restoreRandomWallpaper: settingsMod.restoreRandomWallpaper,
  applyVideoWallpaper: settingsMod.applyVideoWallpaper, cancelVideoWallpaper: settingsMod.cancelVideoWallpaper,
  applyTheme: settingsMod.applyTheme, applyCustomThemeVars: settingsMod.applyCustomThemeVars,
  CUSTOM_DEFAULTS: settingsMod.CUSTOM_DEFAULTS, loadCustomTheme: settingsMod.loadCustomTheme,
  saveCustomTheme: settingsMod.saveCustomTheme, removeCustomThemeVars: settingsMod.removeCustomThemeVars,
};

// modal-manager.js（替换 vue import；模块加载即挂载到 #chat-modals）
function loadManager() {
  let src = fs.readFileSync('src/client/chat/modal-manager.js', 'utf8');
  src = src.replace("import * as Vue from '/static/chat/vendor/vue.js';", 'const Vue = globalThis.__vue;');
  return loadModule(src);
}
const mm = await loadManager();

// modals/settings.js（替换全部 4 个 import）
function loadSettingsModal() {
  let src = fs.readFileSync('src/client/chat/modals/settings.js', 'utf8');
  src = src.replace("import * as Vue from '/static/chat/vendor/vue.js';", 'const Vue = globalThis.__vue;');
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/state\.js';/, (m, names) => `const { ${names} } = globalThis.__chatState;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/modal-manager\.js';/, (m, names) => `const { ${names} } = globalThis.__chatModal;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/settings\.js';/, (m, names) => `const { ${names} } = globalThis.__chatSettings;`);
  return loadModule(src);
}
globalThis.__chatModal = {
  injectCss: mm.injectCss, registerModal: mm.registerModal, openModal: mm.openModal,
  closeModal: mm.closeModal, closeTop: mm.closeTop, closeAll: mm.closeAll, stack: mm.stack,
};
const settingsModal = (await loadSettingsModal()).default;

// 注册 settings 加载器（测试注入合成模块；生产走约定路径 ./modals/settings.js）
mm.registerModal('settings', () => Promise.resolve({ default: settingsModal }));

console.log('== 弹窗管理器基础 ==');
// 打开前 stack 空
assert(mm.stack.length === 0, '初始 stack 为空');
assert(document.getElementById('chat-modals').children.length === 0, '#chat-modals 初始为空');

// 打开 settings
mm.openModal('settings');
await tick(); await tick();
assert(mm.stack.length === 1, 'openModal 后 stack 长度 1');
const layer = document.querySelector('.cm-layer');
assert(!!layer, '渲染出 .cm-layer（Teleport 到 body）');
assert(document.querySelector('.cm-card') !== null, '渲染出 .cm-card');
let settingsEl = document.querySelector('.cm-settings');
assert(!!settingsEl, '渲染出 .cm-settings');
assert(settingsEl.querySelector('.cm-header') !== null, '有 .cm-header');

// 去重：重复 open 不新增
mm.openModal('settings', { foo: 1 });
await tick();
assert(mm.stack.length === 1, '重复 openModal 去重 stack 仍 1');

// 主题卡片 6 个
const cards = settingsEl.querySelectorAll('.theme-card');
assert(cards.length === 6, '主题卡片 6 个', String(cards.length));

console.log('== 主题切换 ==');
cards[3].click(); // neon
await tick();
assert(document.body.classList.contains('theme-neon'), '点击 neon 卡片 body 加 theme-neon');
assert(localStorage.getItem('chatTheme') === 'neon', 'localStorage chatTheme=neon', String(localStorage.getItem('chatTheme')));
assert(document.querySelector('.cm-settings .theme-card-active').dataset.theme === undefined || document.querySelector('.cm-settings .theme-card-active').textContent.includes('深空'), 'active 卡片随动');
const customItem = () => [...settingsEl.querySelectorAll('.cm-item')].find(el => el.querySelector('.ct-row'));
assert(!!customItem() && customItem().style.display === 'none', '非 custom 时自定义区隐藏', customItem() && customItem().style.display);

cards[5].click(); // custom
await tick();
const ctRows = settingsEl.querySelectorAll('.ct-row');
assert(ctRows.length === 7, 'custom 主题显示 7 行色板', String(ctRows.length));
assert(customItem().style.display !== 'none', 'custom 时自定义区显示');
assert(localStorage.getItem('chatTheme') === 'custom', 'localStorage chatTheme=custom');
assert(!!document.getElementById('custom-theme-vars'), 'applyCustomThemeVars 注入 style');

console.log('== 滑块 / 色调 / 语言 ==');
const tintSlider = settingsEl.querySelector('.cm-range');
tintSlider.value = '50';
tintSlider.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick();
assert(document.body.style.getPropertyValue('--bg-tint') === '0.5', '透明度滑块 → --bg-tint=0.5', JSON.stringify(document.body.style.getPropertyValue('--bg-tint')));
assert(localStorage.getItem('bgTint') === '0.5', 'localStorage bgTint=0.5');
assert(settingsEl.querySelector('.cm-item-value').textContent === '50%', '透明度值显示 50%');

const colorInput = settingsEl.querySelector('.cm-color-row input[type="color"]');
colorInput.value = '#123456';
colorInput.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick();
assert(document.body.style.getPropertyValue('--frosted-r') === '18', '色调 input → --frosted-r=18', document.body.style.getPropertyValue('--frosted-r'));
assert(document.body.style.getPropertyValue('--frosted-g') === '52', '色调 input → --frosted-g=52');
assert(document.body.style.getPropertyValue('--frosted-b') === '86', '色调 input → --frosted-b=86');
assert(localStorage.getItem('uiColor') === '#123456', 'localStorage uiColor=#123456');
assert(!!settingsEl.querySelector('.cm-btn-danger'), '有颜色则显示恢复默认按钮');

// 语言切换 en
const langBtns = settingsEl.querySelectorAll('.cm-btn-secondary');
langBtns[1].click(); // English
await tick();
assert(globalThis.__chatState.getLang() === 'en', '语言切换 en 生效');
assert(settingsEl.querySelector('.cm-header span').textContent.includes('Settings'), 'labels 响应式更新为英文', settingsEl.querySelector('.cm-header span').textContent);
langBtns[0].click(); // 切回 zh
await tick();
assert(globalThis.__chatState.getLang() === 'zh', '语言切回 zh');

console.log('== 关闭 ==');
// backdrop 关闭
mm.openModal('settings');
await tick(); await tick();
assert(mm.stack.length === 1, '再次打开 stack 1');
document.querySelector('.cm-backdrop').click();
await tick();
assert(mm.stack.length === 0, 'backdrop 点击关闭，stack 空');

// Escape 关闭
mm.openModal('settings');
await tick(); await tick();
document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
await tick();
assert(mm.stack.length === 0, 'Escape 关闭最上层弹窗');

// 关闭按钮（$emit close）关闭
mm.openModal('settings');
await tick(); await tick();
settingsEl = document.querySelector('.cm-settings');
settingsEl.querySelector('.cm-close').click();
await tick();
assert(mm.stack.length === 0, '关闭按钮 emit close 关闭');

console.log('== legacy 双轨回退 ==');
localStorage.setItem('chatLegacyModals', '1');
globalThis.__chatSettings.openSettings();
assert(document.getElementById('settings-overlay').classList.contains('show'), 'chatLegacyModals=1 回退旧 overlay');
globalThis.__chatSettings.closeSettings();
assert(!document.getElementById('settings-overlay').classList.contains('show'), 'legacy 关闭恢复');
localStorage.removeItem('chatLegacyModals');

console.log('\n==== ' + passed + ' 通过 / ' + failed + ' 失败 ====');
if (failed) process.exit(1);
