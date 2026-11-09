// v1.53 批4 消息流 DocumentFragment 批量 - jsdom 冒烟测试
// 验证 beginBatch/endBatch：连续 N 条消息只触发 1 次上屏 + 1 次滚动（取代逐条 appendChild+scrollBy）
import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
  <div id="chatlog"></div>
</body></html>`, { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window','document','navigator','HTMLElement','Element','Node','SVGElement','SVGSVGElement','ShadowRoot','MutationObserver','requestAnimationFrame','cancelAnimationFrame','Event','CustomEvent','HTMLCanvasElement','History','Location','Blob','Document','DocumentFragment','NodeList','HTMLCollection','getComputedStyle','localStorage','sessionStorage','File','FileList','DOMParser','XMLHttpRequest','MouseEvent','InputEvent','KeyboardEvent','IntersectionObserver']) {
  try { globalThis[k] = w[k]; } catch (e) {}
}
globalThis.location = w.location;
globalThis.history = w.history;
globalThis.confirm = () => true;
globalThis.alert = () => {};
globalThis.prompt = () => "1";
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({}) });

function toDataUrl(src) { return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64'); }
async function loadModule(src) { return await import(toDataUrl(src)); }
const tick = () => new Promise(r => setTimeout(r, 0));

let passed = 0, failed = 0;
function assert(cond, name, extra = '') {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (extra ? ' :: ' + extra : '')); }
}

// chatlog 桩：记录 appendChild / scrollBy 次数
const chatlog = document.getElementById('chatlog');
let appendCount = 0, scrollCount = 0;
const origAppend = chatlog.appendChild.bind(chatlog);
chatlog.appendChild = (n) => { appendCount++; return origAppend(n); };
chatlog.scrollBy = () => { scrollCount++; };

// state 桩（renderers/addChatMessage 路径所需字段）
const state = {
  chatlog,
  username: 'tester',
  currentWebSocket: null,
  roomname: 'test-room',
  blockedUsers: new Set(),
  selectedColor: '#000000',
  channels: [],
  currentChannel: 'general',
  channelCache: {},
  pinnedMessages: {},
  channelUnread: {},
  unreadCount: 0,
};
globalThis.__chatState = {
  state,
  t: (k) => k,
  getUserBio: () => Promise.resolve(null),
  showToast: () => {}, showSuccess: () => {}, showError: () => {}, showInfo: () => {},
};
globalThis.__chatVip = { TAG_COLORS: {}, getVipLevel: () => null, createVipBadge: () => null };
globalThis.__chatUi = {
  modifyOwnTag: () => {}, startReply: () => {}, recallMessage: () => {}, deleteMessage: () => {},
  checkAtMention: () => {}, showLightbox: () => {}, getAdminKey: () => 'k', showTyping: () => {},
};
globalThis.__chatMenu = { showUserMenu: () => {}, showProfile: () => {} };
globalThis.__chatFav = { isFavorited: () => false, toggleFavorite: () => {} };

// 加载真实 renderers.js（替换相对 import 为桩）
function loadRenderers() {
  let src = fs.readFileSync('src/client/chat/renderers.js', 'utf8');
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/state\.js';/g, (m, names) => `const { ${names} } = globalThis.__chatState;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/vip\.js';/, (m, names) => `const { ${names} } = globalThis.__chatVip;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/ui\.js';/, (m, names) => `const { ${names} } = globalThis.__chatUi;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/menu\.js';/, (m, names) => `const { ${names} } = globalThis.__chatMenu;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/favorites\.js';/, (m, names) => `const { ${names} } = globalThis.__chatFav;`);
  return loadModule(src);
}
const render = await loadRenderers();
globalThis.__chatRender = render;

// 加载真实 channels.js（替换 state/renderers/ui import）
function loadChannels() {
  let src = fs.readFileSync('src/client/chat/channels.js', 'utf8');
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/state\.js';/, (m, names) => `const { ${names} } = globalThis.__chatState;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/renderers\.js';/, (m, names) => `const { ${names} } = globalThis.__chatRender;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\/ui\.js';/, (m, names) => `const { ${names} } = globalThis.__chatUi;`);
  return loadModule(src);
}
const ch = await loadChannels();

console.log('== 1. 单条消息（非批量）回归：append+scroll 各 1 ==');
appendCount = 0; scrollCount = 0;
render.addChatMessage('Alice', 'hello 单条', null, null, null, 1723200000000);
await tick();
assert(appendCount === 1, '单条 addChatMessage → appendChild 1 次', 'got ' + appendCount);
assert(scrollCount === 1, '单条 addChatMessage → scrollBy 1 次', 'got ' + scrollCount);
assert(chatlog.querySelectorAll('.chat-msg').length === 1, '单条渲染出 .chat-msg');
console.log('');

console.log('== 2. beginBatch/endBatch：N 条只入 fragment，上屏 1 次 ==');
appendCount = 0; scrollCount = 0;
const frag = render.beginBatch();
for (let i = 0; i < 50; i++) render.addChatMessage('User' + (i % 5), '批量消息 ' + i, null, null, null, 1723200000000 + i * 1000);
await tick();
assert(appendCount === 0, '批量中 50 条 → 0 次上屏（全在 fragment）', 'got ' + appendCount);
assert(scrollCount === 0, '批量中 50 条 → 0 次滚动', 'got ' + scrollCount);
assert(frag.childNodes.length === 50, 'fragment 攒了 50 条', 'got ' + frag.childNodes.length);
assert(chatlog.querySelectorAll('.chat-msg').length === 1, 'fragment 未上屏前 chatlog 只有 1 条旧消息');
render.endBatch();
chatlog.appendChild(frag);
appendCount = 0;
assert(chatlog.querySelectorAll('.chat-msg').length === 51, 'fragment 上屏 → chatlog 51 条', 'got ' + chatlog.querySelectorAll('.chat-msg').length);
console.log('');

console.log('== 3. renderChannelBatch（websocket 切频道历史入口）：100 条一次上屏 ==');
appendCount = 0; scrollCount = 0;
state.chatlog.innerHTML = '<div id="spacer"></div>';
render.resetMsgDate();
const msgs = [];
for (let i = 0; i < 100; i++) {
  msgs.push({ name: 'User' + (i % 7), message: '频道消息 ' + i, timestamp: 1723200000000 + i * 86400000 });
}
ch.renderChannelBatch(msgs);
await tick();
assert(appendCount === 1, 'renderChannelBatch 100 条 → appendChild 仅 1 次（DocumentFragment 一次上屏）', 'got ' + appendCount);
assert(scrollCount === 0, 'renderChannelBatch 内部 0 次 scrollBy（滚动由调用方统一做）', 'got ' + scrollCount);
assert(chatlog.querySelectorAll('.chat-msg').length === 100, '100 条全部上屏', 'got ' + chatlog.querySelectorAll('.chat-msg').length);
assert(chatlog.querySelectorAll('.date-divider').length >= 1, '跨天消息日期分隔线正常渲染', 'got ' + chatlog.querySelectorAll('.date-divider').length);
console.log('');

console.log('== 4. 空消息批 / 单条混合 ==');
appendCount = 0; scrollCount = 0;
state.chatlog.innerHTML = '<div id="spacer"></div>';
render.resetMsgDate();
ch.renderChannelBatch([]);
await tick();
assert(appendCount === 0, '空批 → 不 append 不崩', 'got ' + appendCount);
assert(chatlog.querySelectorAll('.chat-msg').length === 0, '空批 → 无消息渲染');
appendCount = 0; scrollCount = 0;
ch.renderChannelBatch(msgs.slice(0, 1));
await tick();
assert(appendCount === 1, '单条批 → 1 次上屏', 'got ' + appendCount);
assert(chatlog.querySelectorAll('.chat-msg').length === 1, '单条批渲染 1 条');
console.log('');

console.log('== 5. 批量后仍可单条追加（batch 状态清理） ==');
appendCount = 0; scrollCount = 0;
render.addChatMessage('Bob', '批量结束后单条', null, null, null, 1723200000000);
await tick();
assert(appendCount === 1 && scrollCount === 1, 'endBatch 后单条恢复 append+scroll 正常', 'got append=' + appendCount + ' scroll=' + scrollCount);
console.log('');

console.log('\n==== ' + passed + ' 通过 / ' + failed + ' 失败 ====');
if (failed) process.exit(1);
