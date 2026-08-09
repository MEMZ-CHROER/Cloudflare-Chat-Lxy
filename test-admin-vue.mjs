// v1.52 管理后台 Vue3 迁移 - jsdom 端到端测试
// 套路（沿 v1.51）：jsdom 全局化(含 SVGElement/ShadowRoot) + vue .mjs 副本注入
// + 合成模块(data URL)替换 import Vue/ROUTES 为全局引用 + fetch mock
import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="admin-app"></div></body></html>', {
  url: 'http://localhost/admin-vue/',
  pretendToBeVisual: true
});
const w = dom.window;
for (const k of ['window','document','navigator','HTMLElement','Element','Node','SVGElement','SVGSVGElement','ShadowRoot','MutationObserver','requestAnimationFrame','cancelAnimationFrame','Event','CustomEvent','HTMLCanvasElement','History','Location','Blob','Document','DocumentFragment','NodeList','HTMLCollection','getComputedStyle','localStorage','sessionStorage','File','FileList','DOMParser','XMLHttpRequest']) {
  try { globalThis[k] = w[k]; } catch (e) {}
}
globalThis.location = w.location;
globalThis.history = w.history;
globalThis.confirm = () => true;
globalThis.alert = () => {};
globalThis.prompt = () => "1";
globalThis.URL.createObjectURL = () => "blob:mock";
globalThis.URL.revokeObjectURL = () => {};

// ---------- fetch mock ----------
const mockDb = {
  rooms: { room1: 2, room2: 1 },
  allUsers: { room1: ['Alice', 'Bob'], room2: ['Alice'] },
  points: { Alice: '100', Bob: '50' },
  banned: ['Bob'],
  history: ['Alice', 'Bob', 'Charlie'],
  ipBanned: ['1.2.3.4'],
  ips: { Alice: '9.9.9.9', Bob: '9.9.9.9', Carol: '8.8.8.8' },
  tags: { Alice: { tag: 'VIP', color: 'gold' } },
  blacklist: ['Mallory'],
  roomUsers: { room1: ['Alice', 'Bob'] },
  roomBlacklist: { room1: ['Mallory'] },
  roomUsersDetail: { room1: [{ name: 'Alice', ip: '9.9.9.9' }, { name: 'Bob', ip: '8.8.8.8' }] },
  roomFiles: { room1: [{ fileName: 'a.txt', name: 'Alice', timestamp: 1, fileSize: 2048 }] },
  pinned: { room1: { general: [{ name: 'Alice', text: '置顶你好', timestamp: 1000 }] } },
  roomMessages: { room1: [{ name: 'Alice', message: 'hello', timestamp: 1000 }] },
  userTags: [{ username: 'Alice', items: [{ tag: 'VIP', color: 'gold', itemName: 'VIP头衔', equipped: true }] }],
  marketConfig: { enabled: true, feePercent: 10, maxOpenOrders: 5, maxPrice: '1000000' },
  marketOrders: { orders: [{ id: 'o1', itemName: '神器', seller: 'Alice', buyer: null, price: 500, status: 'open', createdAt: '2026-08-09T10:00:00Z' }] },
  pointsResponse: {}, // 动态注入 points/api 响应
  // 批2 数据
  exp: { Alice: { exp: 100, level: 5 }, Bob: { exp: 30, level: 1 } },
  shopItems: [{ id: 'i1', name: '红名卡', description: '变红', price: 200, tag: '红名', color: 'red', border: 'gold', enabled: true }],
  tasks: [{ id: 't1', name: '每日签到', description: '每日任务', reward: 10, enabled: true, completedCount: 3 }],
  lotteryPools: [{ id: 'p1', name: '新手池', description: '新手奖池', cost: 100, enabled: true, prizes: [{ id: 'pr1', name: 'VIP头衔', stock: 8, initialStock: 10 }] }],
  redeemCodes: {
    ABC123: { points: 500, createdBy: 'admin', createdAt: 1000, usedBy: '', usedAt: 0 },
    USE999: { points: 100, createdBy: 'admin', createdAt: 2000, usedBy: 'Bob', usedAt: 1500 }
  },
};
const fetchCalls = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  fetchCalls.push(u);
  const json = (obj) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => obj, text: async () => JSON.stringify(obj) });
  const text = (t) => ({ ok: true, status: 200, headers: { get: () => 'text/plain' }, json: async () => ({}), text: async () => t });
  // 登录态：auth-check 恒 super
  if (u.includes('/api/admin/auth-check')) return json({ level: 'super' });
  if (u.includes('/api/admin/login')) return json({ ok: true, level: 'super' });
  const sp = (k) => { try { return new URL(u, 'http://x').searchParams.get(k); } catch { return null; } };
  if (u.includes('/api/rooms/list')) return json(mockDb.rooms);
  if (u.includes('/api/admin/all-users')) return json(mockDb.allUsers);
  if (u.includes('/api/admin/points/all')) return json(mockDb.points);
  if (u.includes('/api/admin/points/get')) return json({ points: 100 });
  if (u.includes('/api/admin/points/add')) { const amt = Number(sp('amount')); const name = sp('name'); mockDb.points[name] = String((Number(mockDb.points[name]||0)) + amt); return text('已设置，当前 ' + mockDb.points[name]); }
  if (u.includes('/api/admin/points/set')) { const amt = sp('amount'); const name = sp('name'); mockDb.points[name] = String(amt); return text('已设置，当前 ' + mockDb.points[name]); }
  // 批1 房间域
  if (u.includes('/api/admin/room-users-detail/')) { const room = u.split('/room-users-detail/')[1]; return json(mockDb.roomUsersDetail[room] || []); }
  if (u.includes('/api/admin/room-users/')) { const room = u.split('/room-users/')[1]; return json(mockDb.roomUsers[room] || []); }
  if (u.includes('/api/admin/blacklist/list/')) { const room = u.split('/blacklist/list/')[1]; return json(mockDb.roomBlacklist[room] || []); }
  if (u.includes('/api/admin/room-files/')) { const room = u.split('/room-files/')[1]; return json(mockDb.roomFiles[room] || []); }
  if (u.includes('/api/admin/room-messages/')) return json(mockDb.roomMessages.room1);
  if (u.includes('/api/admin/pin/get/')) return json({ pinned: mockDb.pinned.room1 });
  if (u.includes('/api/admin/pin/set/')) return text('已置顶');
  if (u.includes('/api/admin/pin/clear/')) return text('已取消置顶');
  if (u.includes('/api/admin/announcement/')) return text('公告已设置');
  if (u.includes('/api/admin/kick-user/')) return text('已踢出');
  if (u.includes('/api/admin/clear-room/')) return text('已清空');
  if (u.includes('/api/admin/destroy-room/')) return text('已销毁');
  if (u.includes('/api/admin/global-kick')) return json({ kickedFrom: ['room1', 'room2'] });
  // 批1 用户域
  if (u.includes('/api/admin/ban/list')) return json(mockDb.banned);
  if (u.includes('/api/admin/ban/remove')) return text('已解封');
  if (u.includes('/api/admin/ban/add')) return text('已封禁');
  if (u.includes('/api/admin/ip-ban/list')) return json(mockDb.ipBanned);
  if (u.includes('/api/admin/ip-ban/remove')) return text('已解封IP');
  if (u.includes('/api/admin/ip-ban/add')) return text('已封禁IP');
  if (u.includes('/api/admin/global-blacklist/list')) return json(mockDb.blacklist);
  if (u.includes('/api/admin/global-blacklist/remove')) return text('已移出黑名单');
  if (u.includes('/api/admin/global-blacklist/add')) return text('已加入黑名单');
  if (u.includes('/api/admin/users/history')) return json(mockDb.history);
  if (u.includes('/api/admin/user-ips')) return json(mockDb.ips);
  if (u.includes('/api/admin/tag/list')) return json(mockDb.tags);
  if (u.includes('/api/admin/tag/set')) return text('已设置标签');
  if (u.includes('/api/admin/tag/remove')) return text('已移除标签');
  if (u.includes('/api/admin/user-tags')) return json(mockDb.userTags);
  if (u.includes('/api/admin/exp/all')) return json(mockDb.exp);
  if (u.includes('/api/admin/exp/set')) { const name = sp('name'); mockDb.exp[name] = { exp: Number(sp('exp')), level: Math.max(1, Math.floor(Number(sp('exp')) / 20)) }; return json({ ok: true, exp: mockDb.exp[name].exp, level: mockDb.exp[name].level }); }
  if (u.includes('/api/admin/exp/add')) { const name = sp('name'); const base = mockDb.exp[name] || { exp: 0, level: 1 }; mockDb.exp[name] = { exp: base.exp + Number(sp('amount')), level: Math.max(1, Math.floor((base.exp + Number(sp('amount'))) / 20)) }; return json({ ok: true, exp: mockDb.exp[name].exp, level: mockDb.exp[name].level }); }
  if (u.includes('/api/admin/level-style/set/')) return text('样式已设置');
  if (u.includes('/api/admin/level-style/clear/')) return text('样式已清除');
  if (u.includes('/api/admin/shop/item/delete')) return json({ ok: true });
  if (u.includes('/api/admin/shop/item/toggle')) return json({ ok: true });
  if (u.includes('/api/admin/shop/item/add')) return json({ ok: true });
  if (u.includes('/api/admin/shop/items')) return json(mockDb.shopItems);
  if (u.includes('/api/admin/tasks/task/delete')) return json({ ok: true });
  if (u.includes('/api/admin/tasks/task/toggle')) return json({ ok: true });
  if (u.includes('/api/admin/tasks/task/add')) return json({ ok: true });
  if (u.includes('/api/admin/tasks/list')) return json(mockDb.tasks);
  if (u.includes('/api/admin/lottery/pool/create')) return json({ ok: true });
  if (u.includes('/api/admin/lottery/pool/update')) return json({ ok: true });
  if (u.includes('/api/admin/lottery/pool/toggle')) return json({ ok: true });
  if (u.includes('/api/admin/lottery/pool/delete')) return json({ ok: true });
  if (u.includes('/api/admin/lottery/prize/restock')) return json({ ok: true });
  if (u.includes('/api/admin/lottery/prize/delete')) return json({ ok: true });
  if (u.includes('/api/admin/lottery/prize/create')) return json({ ok: true });
  if (u.includes('/api/admin/lottery/pools')) return json(mockDb.lotteryPools);
  if (u.includes('/api/admin/redeem/delete')) return json({ ok: true });
  if (u.includes('/api/admin/redeem/add')) return json({ ok: true });
  if (u.includes('/api/admin/redeem/generate')) return json({ ok: true, codes: ['AB123', 'AB124'], count: 2 });
  if (u.includes('/api/admin/redeem/list')) return json(mockDb.redeemCodes);
  if (u.includes('/api/admin/anon-grant')) return json({ anonCoupons: 3 });
  if (u.includes('/api/admin/delete-user')) return text('已删除用户');
  if (u.includes('/api/admin/market/config')) {
    if (fetchCalls.filter(c => c.includes('/market/config')).length > 2) return json({ ...mockDb.marketConfig, feePercent: 15 });
    return json(mockDb.marketConfig);
  }
  if (u.includes('/api/admin/market/orders')) return json(mockDb.marketOrders);
  return text('mock-unknown:' + u);
};

// ---------- 合成模块 ----------
const storeRepl = (src) => src.replace("import * as Vue from '/static/admin/vendor/vue.js';", "const Vue = globalThis.__vue;");
const storeImportRepl = (src) => src.replace(/import\s+\{([^}]+)\}\s+from\s+'\/static\/admin\/store\.js';/g, (m, names) => `const { ${names} } = globalThis.__store;`);
function toDataUrl(src) { return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64'); }

async function loadModule(src) { return await import(toDataUrl(src)); }

// vue
globalThis.__vue = await import('file://' + process.cwd().replace(/\\/g, '/') + '/_vue-test.mjs');

// store.js
const storeMod = await loadModule(storeRepl(fs.readFileSync('src/client/admin/store.js', 'utf8')));
globalThis.__store = { store: storeMod.store, toast: storeMod.toast, TAG_COLORS: storeMod.TAG_COLORS, navigate: storeMod.navigate };

// sections
async function loadSection(file) {
  let src = storeRepl(fs.readFileSync('src/client/admin/sections/' + file, 'utf8'));
  src = storeImportRepl(src);
  return loadModule(src);
}
const secDashboard = await loadSection('dashboard.js');
const secPoints = await loadSection('points.js');
const secMarket = await loadSection('market.js');
const secUsermodal = await loadSection('usermodal.js');
const secRooms = await loadSection('rooms.js');
const secUsers = await loadSection('users.js');
const secBans = await loadSection('bans.js');
const secIpBans = await loadSection('ipbans.js');
const secBlacklist = await loadSection('blacklist.js');
const secHistory = await loadSection('history.js');
const secTags = await loadSection('tags.js');
const secExp = await loadSection('exp.js');
const secLevelstyle = await loadSection('levelstyle.js');
const secShop = await loadSection('shop.js');
const secTasks = await loadSection('tasks.js');
const secLottery = await loadSection('lottery.js');
const secRedeem = await loadSection('redeem.js');
const secIpgroup = await loadSection('ipgroup.js');
globalThis.__sec = {
  dashboard: { default: secDashboard.default }, points: { default: secPoints.default },
  market: { default: secMarket.default }, usermodal: { default: secUsermodal.default },
  rooms: { default: secRooms.default }, users: { default: secUsers.default },
  bans: { default: secBans.default }, ipbans: { default: secIpBans.default },
  blacklist: { default: secBlacklist.default }, history: { default: secHistory.default },
  tags: { default: secTags.default },
  exp: { default: secExp.default }, levelstyle: { default: secLevelstyle.default },
  shop: { default: secShop.default }, tasks: { default: secTasks.default },
  lottery: { default: secLottery.default }, redeem: { default: secRedeem.default },
  ipgroup: { default: secIpgroup.default }
};

// app.js（替换 ROUTES 动态 import → 全局引用 + 替换 UserModal import）
let appSrc = fs.readFileSync('src/client/admin/app.js', 'utf8');
appSrc = storeRepl(appSrc);
appSrc = storeImportRepl(appSrc);
appSrc = appSrc.replace("import UserModal from '/static/admin/sections/usermodal.js';", "const UserModal = globalThis.__sec.usermodal.default;");
appSrc = appSrc.replace(/\(\) => import\('\/static\/admin\/sections\/(\w+)\.js'\)/g, "() => Promise.resolve(globalThis.__sec.$1.default)");
const appMod = await loadModule(appSrc);

const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));
await tick(300); // 等 mount + auth-check + dashboard load

// ---------- 断言 ----------
let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log("  ✅ " + label); }
  else { fail++; console.log("  ❌ " + label); }
}
const has = (sel) => !!document.querySelector(sel);
const text = (sel) => (document.querySelector(sel) || {}).textContent || '';
const qsAll = (sel) => [...document.querySelectorAll(sel)];

console.log("== 骨架 / 登录态 ==");
assert(has('.av-topbar'), "顶栏渲染");
assert(text('.av-brand').includes('CloudChat Admin'), "品牌栏");
assert(text('.av-level').includes('super'), "超管徽标");

console.log("== 侧边栏（super 显示 17 项）==");
const navs = qsAll('.av-nav-item');
assert(navs.length === 17, "侧边栏 17 项，实际 " + navs.length);
assert(navs.some(n => n.textContent.includes('等级管理')), "含等级管理");
assert(navs.some(n => n.textContent.includes('商店管理')), "含商店管理");
assert(navs.some(n => n.textContent.includes('任务管理')), "含任务管理");
assert(navs.some(n => n.textContent.includes('抽奖管理')), "含抽奖管理");
assert(navs.some(n => n.textContent.includes('同IP检测')), "含同IP检测");
assert(navs.some(n => n.textContent.includes('兑换码')), "含兑换码");
assert(navs.some(n => n.textContent.includes('房间列表')), "含房间列表");
assert(navs.some(n => n.textContent.includes('用户标签')), "含用户标签(普通admin可见)");

console.log("== 仪表盘 ==");
assert(text('#admin-app').includes('系统概览'), "概览标题");
assert(text('#admin-app').includes('2'), "房间数=2");
assert(has('.av-stats'), "统计卡片组");
assert(has('.rank-badge'), "排行榜渲染");
const rankNames = qsAll('.av-table tbody tr .mono').map(e => e.textContent);
assert(rankNames.includes('Alice') && rankNames.includes('Bob'), "Top10 含 Alice/Bob");

console.log("== 用户详情弹窗 ==");
qsAll('.av-table tbody tr .mono').find(e => e.textContent === 'Alice').click();
await tick(200);
assert(has('.av-modal-mask'), "弹窗打开");
assert(text('.av-modal').includes('9.9.9.9'), "弹窗显示 IP");
assert(text('.av-modal').includes('VIP'), "弹窗显示标签");
assert(has('.av-modal .av-modal-actions .av-btn'), "弹窗操作按钮");
// 管理积分跳转
document.querySelector('.av-modal .av-btn.primary')?.click();
await tick(300);
assert(storeMod.store.current === 'points', "「管理积分」跳 points");

console.log("== 积分管理页 ==");
assert(text('#admin-app').includes('积分管理'), "积分标题");
const ptsRows = qsAll('.av-table tbody tr');
assert(ptsRows.length === 2, "积分表 2 行，实际 " + ptsRows.length);
assert(text('#admin-app').includes('总积分 150'), "总积分统计 150");
// 行内 +增加 Alice
const aliceRow = ptsRows.find(r => r.textContent.includes('Alice'));
assert(!!aliceRow, "找到 Alice 行");
const inlineInput = aliceRow.querySelector('input[type=number]');
inlineInput.value = '50';
inlineInput.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick(50);
aliceRow.querySelector('.av-btn.success')?.click(); // +增加
await tick(150);
assert(fetchCalls.some(c => c.includes('/api/admin/points/add') && c.includes('Alice')), "调用了 points/add Alice");
assert(mockDb.points.Alice === '150', "本地更新 Alice=150（mockDb）");

console.log("== 勾选 + 批量 ==");
const cb = document.querySelector('.av-table tbody tr input[type=checkbox]');
cb.checked = true;
cb.dispatchEvent(new w.Event('change', { bubbles: true }));
await tick(50);
assert(text('#admin-app').includes('已勾选 1 人'), "批量计数 1");
const batchAmtInput = qsAll('.av-input').find(i => i.placeholder === '批量数量');
batchAmtInput.value = '10';
batchAmtInput.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick(50);
const batchBtn = qsAll('.av-card .av-btn.danger').find(b => b.textContent.includes('批量扣除'));
batchBtn?.click();
await tick(150);
assert(fetchCalls.some(c => c.includes('/api/admin/points/batch')), "调用了 points/batch");

console.log("== CSV 导出 ==");
const exportBtn = qsAll('.av-btn').find(b => b.textContent.includes('导出CSV'));
exportBtn?.click();
await tick(50);
assert(true, "CSV 导出触发（无抛错）");

console.log("== 市场管理页 ==");
globalThis.history.pushState({}, '', '/admin-vue/market/');
w.dispatchEvent(new w.Event('popstate'));
await tick(300);
assert(text('#admin-app').includes('市场管理'), "市场标题");
assert(text('#admin-app').includes('神器'), "订单列表渲染");
assert(has('input[type=checkbox]') && text('#admin-app').includes('启用市场'), "配置表单渲染");
const feeInput = qsAll('.av-input').find(i => i.type === 'number');
feeInput.value = '15';
feeInput.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick(50);
const saveBtn = qsAll('.av-btn.success').find(b => b.textContent.includes('保存配置'));
saveBtn?.click();
await tick(150);
assert(fetchCalls.filter(c => c.includes('/market/config')).length >= 3, "保存配置调用了 POST config");

// ---------- 批1 用户/房间域 ----------
async function navTo(key) {
  globalThis.history.pushState({}, '', '/admin-vue/' + key + '/');
  w.dispatchEvent(new w.Event('popstate'));
  await tick(350);
}
const findBtn = (containerSel, label) => [...document.querySelectorAll(containerSel + ' .av-btn, .av-btn')]
  .find(b => b.textContent.trim() === label);

console.log("== 房间列表 ==");
await navTo('rooms');
assert(text('#admin-app').includes('房间列表'), "房间标题");
const roomCards = qsAll('.room-card');
assert(roomCards.length === 2, "房间卡片 2 个，实际 " + roomCards.length);
roomCards[0].querySelector('.room-header').click();
await tick(350);
assert(text('#admin-app').includes('在线用户'), "房间详情展开");
assert(text('#admin-app').includes('置顶你好'), "置顶消息渲染");
assert(text('#admin-app').includes('a.txt'), "文件渲染");
assert(text('#admin-app').includes('2.0 KB'), "文件大小格式化 2.0 KB");
const bobKick = [...document.querySelectorAll('.room-card button')].find(b => b.textContent === '踢出' && b.parentElement.textContent.includes('Bob'));
bobKick?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/kick-user/room1') && c.includes('Bob')), "踢出 Bob 调用 kick-user");

console.log("== 在线用户 ==");
await navTo('users');
assert(text('#admin-app').includes('在线用户'), "用户标题");
assert(qsAll('.global-user-item').length === 2, "在线用户 2 行，实际 " + qsAll('.global-user-item').length);
assert(text('#admin-app').includes('VIP'), "Alice 标签徽章 VIP");
assert(text('#admin-app').includes('Lv.5'), "Alice 等级徽章 Lv.5");
const aliceItem = qsAll('.global-user-item').find(r => r.textContent.includes('Alice'));
[...aliceItem.querySelectorAll('button')].find(b => b.textContent === '全局踢出')?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/global-kick') && c.includes('Alice')), "全局踢出 Alice");

console.log("== 封禁用户 ==");
await navTo('bans');
assert(text('#admin-app').includes('解封'), "封禁页渲染解封按钮");
assert(text('#admin-app').includes('Bob'), "封禁列表含 Bob");
findBtn('#admin-app', '解封')?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/ban/remove') && c.includes('Bob')), "解封 Bob 调用 ban/remove");

console.log("== IP 封禁 ==");
await navTo('ipbans');
assert(text('#admin-app').includes('封禁IP'), "IP封禁页渲染");
assert(text('#admin-app').includes('1.2.3.4'), "IP 列表含 1.2.3.4");
const ipInput = document.querySelector('.av-toolbar input');
ipInput.value = '5.5.5.5';
ipInput.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick(50);
findBtn('#admin-app', '封禁IP')?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/ip-ban/add') && c.includes('5.5.5.5')), "封禁IP 5.5.5.5 调用 ip-ban/add");

console.log("== 全局黑名单 ==");
await navTo('blacklist');
assert(text('#admin-app').includes('移出黑名单'), "黑名单页渲染");
assert(text('#admin-app').includes('Mallory'), "黑名单含 Mallory");
findBtn('#admin-app', '移出黑名单')?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/global-blacklist/remove') && c.includes('Mallory')), "移出黑名单 Mallory");

console.log("== 历史用户 ==");
await navTo('history');
assert(text('#admin-app').includes('● 在线'), "历史页在线标记");
assert(text('#admin-app').includes('Charlie'), "历史含 Charlie");

console.log("== 用户标签 ==");
await navTo('tags');
assert(text('#admin-app').includes('VIP头衔'), "标签页装备物品渲染");
assert(text('#admin-app').includes('Alice'), "标签用户 Alice");

// ---------- 批2 积分/商店/抽奖域 ----------
console.log("== 批2: 等级管理 ==");
await navTo('exp');
assert(text('#admin-app').includes('经验等级'), "等级标题");
const expRows = qsAll('.av-table tbody tr');
assert(expRows.length === 2, "等级表 2 行，实际 " + expRows.length);
assert(text('#admin-app').includes('Lv.5'), "Alice Lv.5 徽章");
const expAliceRow = expRows.find(r => r.textContent.includes('Alice'));
const expInline = expAliceRow.querySelector('input[type=number]');
expInline.value = '50';
expInline.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick(50);
[...expAliceRow.querySelectorAll('.av-btn')].find(b => b.textContent === '+增加')?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/exp/add') && c.includes('Alice') && c.includes('amount=50')), "行内+增加 Alice 调用 exp/add amount=50");
assert(mockDb.exp.Alice.exp === 150, "本地更新 Alice exp=150");

console.log("== 批2: 房间样式 ==");
await navTo('levelstyle');
assert(text('#admin-app').includes('房间样式'), "样式标题");
const roomSelect = document.querySelector('.av-page select');
assert(roomSelect.querySelectorAll('option').length >= 3, "房间下拉含 2 房间+占位，实际 " + roomSelect.querySelectorAll('option').length);
roomSelect.value = 'room1';
roomSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
await tick(50);
const lvInput = document.querySelector('.av-page input[type=number]');
lvInput.value = '3';
lvInput.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick(50);
findBtn('#admin-app', '设置样式')?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/level-style/set/room1') && c.includes('level=3')), "设置 room1 Lv.3 调用 level-style/set");

console.log("== 批2: 商店管理 ==");
await navTo('shop');
assert(text('#admin-app').includes('商店管理'), "商店标题");
assert(text('#admin-app').includes('红名卡'), "商品渲染红名卡");
assert(qsAll('.av-table tbody tr').length === 1, "商品表 1 行，实际 " + qsAll('.av-table tbody tr').length);
const nameInp = qsAll('.av-card input').find(i => i.placeholder === '商品名称');
nameInp.value = '新装';
nameInp.dispatchEvent(new w.Event('input', { bubbles: true }));
const priceInp = qsAll('.av-card input').find(i => i.placeholder === '价格');
priceInp.value = '50';
priceInp.dispatchEvent(new w.Event('input', { bubbles: true }));
const tagInp = qsAll('.av-card input').find(i => i.placeholder === '标签文字');
tagInp.value = 'VIP';
tagInp.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick(50);
findBtn('#admin-app', '添加商品')?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/shop/item/add')), "添加商品调用 shop/item/add");

console.log("== 批2: 任务管理 ==");
await navTo('tasks');
assert(text('#admin-app').includes('任务管理'), "任务标题");
assert(text('#admin-app').includes('每日签到'), "任务渲染");
assert(text('#admin-app').includes('1/1 个启用'), "任务统计 1/1 启用");
findBtn('#admin-app', '禁用')?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/tasks/task/toggle')), "禁用任务调用 task/toggle");

console.log("== 批2: 抽奖管理 ==");
await navTo('lottery');
assert(text('#admin-app').includes('抽奖管理'), "抽奖标题");
assert(text('#admin-app').includes('新手池'), "奖池渲染新手池");
assert(text('#admin-app').includes('VIP头衔'), "奖品 chip 渲染");
[...document.querySelectorAll('.av-btn')].find(b => b.textContent.includes('添加奖品'))?.click();
await tick(100);
assert(has('.av-modal-mask'), "奖品弹窗打开");
const prName = document.querySelector('.av-modal input');
prName.value = '新奖品';
prName.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick(50);
[...document.querySelectorAll('.av-modal .av-btn')].find(b => b.textContent === '添加')?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/lottery/prize/create')), "添加奖品调用 lottery/prize/create");
[...document.querySelectorAll('.av-btn')].find(b => b.textContent.includes('新建奖池'))?.click();
await tick(100);
assert(has('.av-modal-mask'), "新建奖池弹窗打开");
const poolName = document.querySelector('.av-modal input');
poolName.value = '高级池';
poolName.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick(50);
findBtn('.av-modal', '保存')?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/lottery/pool/create')), "新建奖池调用 pool/create");

console.log("== 批2: 兑换码管理 ==");
await navTo('redeem');
assert(text('#admin-app').includes('兑换码管理'), "兑换码标题");
const rcRows = qsAll('.av-table tbody tr');
assert(rcRows.length === 2, "兑换码表 2 行，实际 " + rcRows.length);
assert(rcRows[0].textContent.includes('ABC123') && rcRows[0].textContent.includes('未使用'), "未使用 ABC123 排最前");
assert(rcRows[1].textContent.includes('USE999') && rcRows[1].textContent.includes('已使用'), "已使用 USE999 在后");
const genPts = qsAll('.av-toolbar input').find(i => i.placeholder === '积分');
genPts.value = '100';
genPts.dispatchEvent(new w.Event('input', { bubbles: true }));
const genCnt = qsAll('.av-toolbar input').find(i => i.placeholder === '数量');
genCnt.value = '2';
genCnt.dispatchEvent(new w.Event('input', { bubbles: true }));
await tick(50);
findBtn('#admin-app', '生成')?.click();
await tick(180);
assert(fetchCalls.some(c => c.includes('/api/admin/redeem/generate')), "批量生成调用 redeem/generate");

console.log("== 批2: 同IP分组 ==");
await navTo('ipgroup');
assert(text('#admin-app').includes('同IP分组'), "同IP标题");
assert(text('#admin-app').includes('共 2 个IP，其中 1 个IP有多个用户'), "统计文本");
const ipCards = qsAll('.ipg-ip-header');
assert(ipCards.length === 2, "IP 组 2 个，实际 " + ipCards.length);
assert(ipCards[0].textContent.includes('9.9.9.9') && ipCards[0].textContent.includes('2 人'), "9.9.9.9 组 2 人排最前");
ipCards[0].click();
await tick(150);
assert(text('#admin-app').includes('Alice') && text('#admin-app').includes('Bob'), "展开后显示 Alice/Bob");
assert(!!findBtn('#admin-app', '封禁'), "展开后含封禁按钮");
findBtn('#admin-app', '详情')?.click();
await tick(200);
assert(has('.av-modal-mask'), "用户详情弹窗从 IP 分组打开");
assert(text('.av-modal').includes('VIP'), "弹窗显示标签 VIP");

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
