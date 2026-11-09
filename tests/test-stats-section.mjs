// v1.54 运营数据看板 - jsdom 渲染测试
// 套路（沿 v1.52 admin test）：jsdom 全局化 + vue .mjs 副本注入 + 合成模块替换 import Vue + fetch mock
import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/admin/stats/',
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

// 动态生成近 7 日内的 mock 日期（避免与真实今天耦合）
let today = new Date();
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
let todayStr = iso(today);
let yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
let yestStr = iso(yesterday);
let fiveAgo = new Date(today); fiveAgo.setDate(today.getDate() - 5);
let fiveStr = iso(fiveAgo);

const opsData = {
  online: 3,
  todayPeak: 5,
  todayPeakTs: 1723200000000,
  todayPeakDate: todayStr,
  globalPeak: 8,
  globalPeakTs: 1723000000000,
  registeredUsers: 42,
  totalPoints: '12345',
  ledgerByDay: {
    [todayStr]: { checkin: { count: 12, total: 120 }, task: { count: 3, total: 45 }, game: { count: 5, total: -30 } },
    [yestStr]: { checkin: { count: 9, total: 90 } }
  },
  msgByDay: { [todayStr]: 100, [yestStr]: 80, [fiveStr]: 50 },
  rooms: [
    { name: 'general', count: 2, peak: 5, peakTs: 1723200000000 },
    { name: 'hacknet', count: 1, peak: 3, peakTs: 1723000000000 }
  ]
};
globalThis.fetch = async (url) => ({
  ok: true, status: 200,
  headers: { get: () => 'application/json' },
  json: async () => opsData,
  text: async () => JSON.stringify(opsData)
});

globalThis.__vue = await import('file://' + process.cwd().replace(/\\/g, '/') + '/_vue-test.mjs');
const Vue = globalThis.__vue;

function toDataUrl(src) { return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64'); }
async function loadStats() {
  let src = fs.readFileSync('src/client/admin/sections/stats.js', 'utf8');
  src = src.replace("import * as Vue from '/static/admin/vendor/vue.js';", 'const Vue = globalThis.__vue;');
  return (await import(toDataUrl(src))).default;
}
const tick = () => new Promise(r => setTimeout(r, 0));
const tick3 = async () => { await tick(); await tick(); await tick(); };

let passed = 0, failed = 0;
function assert(cond, name, extra = '') {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (extra ? ' :: ' + extra : '')); }
}

console.log('== 1. 挂载渲染 ==');
const Stats = await loadStats();
const app = Vue.createApp({ components: { Stats }, template: '<Stats />' });
const host = document.createElement('div');
document.body.appendChild(host);
app.mount(host);
await tick3();
const txt = () => host.textContent || '';
const has = (s) => txt().indexOf(s) !== -1;
assert(has('运营数据'), '页面标题渲染');
assert(has('当前在线'), '当前在线标签');
assert(has('今日峰值'), '今日峰值标签');
assert(has('历史峰值'), '历史峰值标签');
console.log('');

console.log('== 2. 大数字卡 ==');
assert(has('3'), '当前在线 = 3');
assert(has('5'), '今日峰值 = 5');
assert(has('8'), '历史峰值 = 8');
assert(has('42'), '注册用户 = 42');
assert(has('12345'), '总积分 = 12345');
console.log('');

console.log('== 3. 消息趋势（近 7 日柱状） ==');
const barCols = host.querySelectorAll('div[title]');
assert(barCols.length === 7, '7 个消息柱（近 7 日）');
assert(has('100') && has('80') && has('50'), '消息柱含 100/80/50（今日/昨日/5日前）');
console.log('');

console.log('== 4. 积分吞吐（近 7 日按 type 汇总） ==');
assert(has('签到'), 'checkin → 签到标签');
assert(has('任务'), 'task → 任务标签');
assert(has('游戏'), 'game → 游戏标签');
// checkin 12+9=21 笔 210 分；task 3 笔 45；game 5 笔 -30
assert(has('21'), 'checkin 汇总 21 笔');
assert(has('+210'), 'checkin 净变动 +210');
assert(has('+45'), 'task 净变动 +45');
assert(has('-30'), 'game 净变动 -30');
console.log('');

console.log('== 5. 房间活跃度表 ==');
assert(has('general'), '房间表含 general');
assert(has('hacknet'), '房间表含 hacknet');
const allTables = host.querySelectorAll('.av-table');
const roomTable = allTables[allTables.length - 1]; // 最后一个表 = 房间活跃度
const rows = roomTable.querySelectorAll('tbody tr');
assert(rows.length === 2, '房间表 2 行');
assert(has('峰值时间'), '峰值时间列头');
console.log('');

console.log('\n==== ' + passed + ' 通过 / ' + failed + ' 失败 ====');
if (failed) process.exit(1);
