// v1.55 账号纵深 - 验证脚本（可丢弃临时文件，不入库）
// Part 1: 后端多会话纯函数（utils.mjs findSession/ensureSessions/pushSession/tokenValid）
// Part 2: 前端 sessions Vue 弹窗渲染 + revoke 交互（jsdom + 真实 Vue）
// Part 3: settings 弹窗"多设备会话"入口 + admin users.js 重置密码按钮
import fs from 'fs';
import { JSDOM } from 'jsdom';
import { pushSession, findSession, tokenValid, ensureSessions } from './src/utils.mjs';

let passed = 0, failed = 0;
function assert(cond, name, extra = '') {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (extra ? ' :: ' + extra : '')); }
}

console.log('== Part 1: 后端多会话逻辑（utils.mjs） ==');
{
  const now = Date.now();
  const user = {};
  pushSession(user, 'tok1', 'PC-Chrome', '1.2.3.4');
  assert(Array.isArray(user.sessions) && user.sessions.length === 1, 'pushSession 首次创建 sessions 数组');
  const s0 = user.sessions[0];
  assert(s0.token === 'tok1' && s0.device === 'PC-Chrome' && s0.ip === '1.2.3.4', 'session 字段完整 (token/device/ip)');
  assert(!!s0.expiry && (s0.expiry - now) === 30 * 24 * 3600 * 1000, 'session expiry = 30 天');
  assert(!!s0.createdAt && !!s0.lastActive, 'createdAt/lastActive 有值');
  assert(!!findSession(user, 'tok1'), 'findSession 命中有效 token');
  assert(!findSession(user, 'tok2'), 'findSession 拒绝错误 token');
  assert(!findSession(user, ''), 'findSession 拒绝空 token');
  assert(tokenValid(user, 'tok1') === true, 'tokenValid 有效');
  assert(tokenValid(user, 'tokX') === false, 'tokenValid 无效');

  const u2 = {};
  pushSession(u2, 'exp1');
  u2.sessions[0].expiry = Date.now() - 1000;
  assert(!findSession(u2, 'exp1'), 'findSession 拒绝过期会话');

  const u3 = { token: 'oldtok', tokenExpiry: Date.now() + 3600 * 1000 };
  const f3 = findSession(u3, 'oldtok');
  assert(!!f3 && f3.token === 'oldtok', '旧单 token 兼容回退命中');
  assert(!findSession(u3, 'other'), '旧单 token 拒绝错误');

  const u4 = {};
  for (let i = 0; i < 12; i++) pushSession(u4, 'tok' + i, 'dev' + i);
  assert(u4.sessions.length === 10, '会话上限 10');
  assert(u4.sessions.some(s => s.token === 'tok11'), '保留最新 tok11');
  assert(!u4.sessions.some(s => s.token === 'tok0'), '淘汰最旧 tok0');

  const u5 = { token: 'legacy', tokenExpiry: 123, tokenCreatedAt: 456, tokenDevice: 'old-dev', tokenIp: '9.9.9.9' };
  const arr5 = ensureSessions(u5);
  assert(arr5.length === 1 && arr5[0].token === 'legacy' && arr5[0].device === 'old-dev', 'ensureSessions 迁移旧 token → sessions[0]');
  assert(u5.token === null, 'ensureSessions 迁移后清空旧 token 字段');
  console.log('');
}

// ---------- jsdom 环境 ----------
const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body><div id="chat-modals"></div></body></html>`, { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window','document','navigator','HTMLElement','Element','Node','SVGElement','SVGSVGElement','ShadowRoot','MutationObserver','requestAnimationFrame','cancelAnimationFrame','Event','CustomEvent','getComputedStyle','localStorage','sessionStorage','HTMLCanvasElement','DocumentFragment','NodeList','HTMLCollection','MouseEvent','InputEvent','KeyboardEvent']) {
  try { globalThis[k] = w[k]; } catch (e) {}
}
globalThis.location = w.location;
globalThis.confirm = () => true;
globalThis.alert = () => {};
globalThis.__vue = await import('file://' + process.cwd().replace(/\\/g, '/') + '/_vue-test.mjs');

function toDataUrl(src) { return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64'); }
async function loadModule(src) { return await import(toDataUrl(src)); }
const tick = () => new Promise(r => setTimeout(r, 0));
const tick2 = async () => { await tick(); await tick(); await tick(); };

// fetch mock：sessions list 返回 2 会话（1 当前 1 非当前）
const fetchCalls = [];
globalThis.fetch = (url, opts) => {
  fetchCalls.push({ url: String(url), body: JSON.parse((opts && opts.body) || '{}') });
  const body = JSON.parse((opts && opts.body) || '{}');
  if (body.action === 'list') return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, sessions: [
    { idx: 0, tokenPreview: 'abc12345…', device: 'Windows Chrome', ip: '1.2.3.4', createdAt: Date.now() - 86400000, lastActive: Date.now(), current: true, expired: false },
    { idx: 1, tokenPreview: 'def67890…', device: 'iPhone Safari', ip: '5.6.7.8', createdAt: Date.now() - 172800000, lastActive: Date.now() - 3600000, current: false, expired: false },
    { idx: 2, tokenPreview: 'xyz00000…', device: '旧设备', ip: '9.9.9.9', createdAt: Date.now() - 86400000, lastActive: 0, current: false, expired: true },
  ]}) });
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, revoked: true }) });
};

// 依赖桩
globalThis.__chatState = { t: (k) => k, getLang: () => 'zh', setLang: () => {}, showInfo: () => {}, showError: () => {}, showSuccess: () => {}, showWarning: () => {} };
globalThis.__chatSettings = {
  applyBgTint: () => 1, applyBgBlur: () => 18, applyUiColor: () => {}, resetUiColor: () => {},
  applyWallpaper: () => {}, restoreRandomWallpaper: () => {}, applyVideoWallpaper: () => {}, cancelVideoWallpaper: () => {},
  applyTheme: () => {}, applyCustomThemeVars: () => {}, loadCustomTheme: () => null, saveCustomTheme: () => {}, removeCustomThemeVars: () => {},
  CUSTOM_DEFAULTS: { primary: '#fff', text: '#000', textSecondary: '#888', bg: '#111', border: '#333', radius: 12, msgSelf: '#fff', msgOther: '#eee' },
};
globalThis.__chatModalStub = { injectCss: () => {}, registerModal: () => {}, openModal: () => {}, closeModal: () => {}, stack: [] };
globalThis.__adminStore = { store: { level: 'super', userModal: null }, toast: () => {}, TAG_COLORS: { red: '#e74c3c' } };

function loadModal(file) {
  let src = fs.readFileSync('src/client/chat/modals/' + file, 'utf8');
  src = src.replace("import * as Vue from '/static/chat/vendor/vue.js';", 'const Vue = globalThis.__vue;');
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/modal-manager\.js';/, (m, names) => `const { ${names} } = globalThis.__chatModalStub;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/settings\.js';/, (m, names) => `const { ${names} } = globalThis.__chatSettings;`);
  src = src.replace(/import\s+\{([^}]+)\}\s+from\s+'\.\.\/state\.js';/, (m, names) => `const { ${names} } = globalThis.__chatState;`);
  return loadModule(src);
}

console.log('== Part 2: sessions Vue 弹窗 ==');
{
  const mod = (await loadModal('sessions.js')).default;
  assert(!!mod && typeof mod.setup === 'function' && mod.props.name, 'sessions 组件可加载 (setup+props)');

  // 挂载真实 Vue 到临时容器（模拟 modal-manager 渲染 <component :is>）
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = globalThis.__vue.createApp({ components: { SessionsModal: mod }, template: `<SessionsModal name="testuser" token="tok1" />` });
  app.mount(host);
  await tick2();
  assert(!!host.querySelector('.cm-sessions'), '渲染出 .cm-sessions');
  assert(!!host.querySelector('.cm-header'), '有 .cm-header');
  const items = host.querySelectorAll('.cm-session-item');
  assert(items.length === 3, '渲染 3 个会话项，实际 ' + items.length);
  assert(!!host.querySelector('.cm-session-current'), '当前会话有"当前"标记');
  assert(!!host.querySelector('.cm-session-expired'), '过期会话有"已过期"标记');
  const revokeBtns = host.querySelectorAll('.cm-session-item .cm-btn-danger');
  assert(revokeBtns.length === 2, '非当前会话各 1 个退出按钮（共 2），实际 ' + revokeBtns.length);
  const revokeAllBtn = host.querySelector('.cm-sessions-revokeall');
  assert(!!revokeAllBtn, '有"退出所有设备"按钮');
  const preview = host.querySelector('.cm-session-preview');
  assert(!!preview && preview.textContent.startsWith('abc12345'), '显示脱敏 tokenPreview 前8位');

  // 点击"退出"（第 2 个会话，非当前）
  fetchCalls.length = 0;
  revokeBtns[0].click();
  await tick2();
  const revokeCall = fetchCalls.find(c => c.body.action === 'revoke');
  assert(!!revokeCall, '点击退出触发 /api/auth/user-sessions revoke 请求');
  assert(revokeCall && revokeCall.body.revokeIdx === 1, 'revoke 按索引 (revokeIdx=1)，实际 ' + (revokeCall && revokeCall.body.revokeIdx));
  app.unmount(); host.remove();
  console.log('');
}

console.log('== Part 3: settings 入口 + admin users.js 重置密码 ==');
{
  const setMod = (await loadModal('settings.js')).default;
  assert(!!setMod && typeof setMod.setup === 'function', 'settings 组件可加载');
  const src = fs.readFileSync('src/client/chat/modals/settings.js', 'utf8');
  assert(src.includes('多设备会话') && src.includes('openSessions'), 'settings 模板含"多设备会话"管理入口');
  assert(src.includes("localStorage.getItem('chat_token')") && src.includes("localStorage.getItem('chat_user')"), 'openSessions 读取本地凭据');
  assert(src.includes('openModal(\'sessions\'') || src.includes('openModal("sessions"'), 'openSessions 打开 sessions 弹窗');

  let adminSrc = fs.readFileSync('src/client/admin/sections/users.js', 'utf8');
  adminSrc = adminSrc.replace("import * as Vue from '/static/admin/vendor/vue.js';", 'const Vue = globalThis.__vue;');
  adminSrc = adminSrc.replace(/import\s+\{([^}]+)\}\s+from\s+'\/static\/admin\/store\.js';/, (m, names) => `const { ${names} } = globalThis.__adminStore;`);
  const adminMod = (await loadModule(adminSrc)).default;
  assert(typeof adminMod.setup === 'function', 'admin users.js 组件可加载');
  const setupRet = adminMod.setup();
  await tick2();
  assert(typeof setupRet.resetPassword === 'function', 'setup 返回含 resetPassword 函数');
  assert(adminSrc.includes('🔑重置密码'), 'template 含 🔑重置密码 按钮');
  assert(adminSrc.includes("store.level === 'super'"), '重置密码按钮仅 super 可见');
  assert(adminSrc.includes('/api/admin/reset-password'), 'resetPassword 调 /api/admin/reset-password (POST)');
  console.log('');
}

console.log('\n==== ' + passed + ' 通过 / ' + failed + ' 失败 ====');
if (failed) process.exit(1);
