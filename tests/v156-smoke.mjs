// v1.56 内容沉淀 - 线上冒烟（可丢弃临时文件）
// 用全新房间 testkb<ts>（新 DO 跑新代码）：长消息通道（2000 字通过 / 6000 字超限拒绝）+ doc CRUD + 静态模块 + bundle 符号
import fs from 'fs';

const BASE = 'https://chat.liuxiyu.cn';
const ts = Date.now();
const ROOM = 'testkb' + (ts % 1000000);
const NAME = 'hntest_1785912234';
const PWD = 'test123456';
let pass = 0, fail = 0;
const ok = (c, n, e = '') => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + n + (e ? ' :: ' + e : '')); };
async function get(u) { const r = await fetch(BASE + u); return { status: r.status, text: await r.text() }; }
async function post(u, body) {
  const r = await fetch(BASE + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = { raw: t }; }
  return { status: r.status, json: j };
}

console.log('房间: ' + ROOM + '  账号: ' + NAME);
console.log('== 1. 静态模块 + bundle 符号 ==');
for (const p of ['/static/chat/modals/kb.js', '/static/chat/doc-store.js', '/static/chat/renderers.js']) {
  const r = await get(p);
  ok(r.status === 200, 'GET ' + p + ' 200', '实际 ' + r.status + (r.status === 200 ? ' len=' + r.text.length : ''));
}
const rd = await get('/static/chat/renderers.js');
ok(rd.text.includes('parseBlocks') && rd.text.includes('inlineRenderer') && rd.text.includes('applyCollapse'), 'bundle 含 parseBlocks/inlineRenderer/applyCollapse');
ok(rd.text.includes('doc-ref') && rd.text.includes('msg-collapsed'), 'bundle 含 doc-ref / msg-collapsed');

console.log('== 2. 登录 + WS join ==');
const login = await post('/api/login', { name: NAME, password: PWD, device: 'v156冒烟' });
ok(login.json.ok === true, '登录', 'status ' + login.status + ' ' + JSON.stringify(login.json).slice(0, 60));
const TOKEN = login.json.token;

const WS_URL = 'wss://chat.liuxiyu.cn/api/room/' + ROOM + '/websocket';
const ws = new WebSocket(WS_URL);
const inbox = [];
await new Promise((res, rej) => {
  ws.onopen = res; ws.onerror = () => rej(new Error('WS 连接失败'));
});
ws.onmessage = (ev) => { try { inbox.push(JSON.parse(ev.data)); } catch (e) {} };
ws.send(JSON.stringify({ name: NAME, token: TOKEN }));
await new Promise(r => setTimeout(r, 1500));
ok(inbox.some(m => m.joined === NAME || m.type === 'joined' || m.registered === true), 'WS join 成功', JSON.stringify(inbox.slice(0, 2)).slice(0, 80));

console.log('== 3. 长消息通道 ==');
// 2000 字（普通用户上限 5000 内）→ 应广播回显
ws.send(JSON.stringify({ name: NAME, token: TOKEN, message: '长'.repeat(2000), channel: 'general' }));
await new Promise(r => setTimeout(r, 1000));
const echoed = inbox.filter(m => m.message && m.message.length > 1900);
ok(echoed.length >= 1, '2000 字长消息广播成功', echoed.length + ' 条');
if (echoed.length === 0) console.log('  [诊断] inbox 消息字段:', inbox.filter(m => m.message).slice(-3).map(m => 'len=' + m.message.length + ' type=' + m.type).join(' | '));
// 6000 字（超普通 5000）→ 应被拒 error
const errBefore = inbox.filter(m => m.error).length;
ws.send(JSON.stringify({ name: NAME, token: TOKEN, message: '长'.repeat(6000), channel: 'general' }));
await new Promise(r => setTimeout(r, 1000));
const errMsg = inbox.filter(m => m.error).slice(errBefore);
ok(errMsg.length >= 1 && /过长/.test(errMsg[0].error), '6000 字超限被拒', errMsg.length ? errMsg[0].error : '无 error');

console.log('== 4. 知识库 doc CRUD ==');
// create
ws.send(JSON.stringify({ type: 'doc', action: 'create', reqId: 'c1', title: '冒烟文档', content: '# 标题\n表格\n| A | B |\n|---|---|\n| 1 | 2 |' }));
await new Promise(r => setTimeout(r, 800));
const created = inbox.find(m => m.reqId === 'c1');
ok(created && created.ok === true && created.doc && /^doc_/.test(created.doc.id), 'doc create ok', created ? JSON.stringify(created).slice(0, 80) : 'no resp');
const DOC_ID = created && created.doc ? created.doc.id : '';
// list
ws.send(JSON.stringify({ type: 'doc', action: 'list', reqId: 'c2' }));
await new Promise(r => setTimeout(r, 800));
const listed = inbox.find(m => m.reqId === 'c2');
ok(listed && listed.docs && listed.docs.length >= 1 && listed.docs.some(d => d.id === DOC_ID), 'doc list 含新建', listed ? 'count=' + (listed.docs || []).length : 'no resp');
ok(listed && listed.docs.every(d => d.content === undefined), 'list 不含正文（脱敏）');
// get
ws.send(JSON.stringify({ type: 'doc', action: 'get', reqId: 'c3', id: DOC_ID }));
await new Promise(r => setTimeout(r, 800));
const got = inbox.find(m => m.reqId === 'c3');
ok(got && got.ok === true && got.doc.content.includes('| A | B |'), 'doc get 返回正文', got ? 'content=' + (got.doc ? got.doc.content.length : 0) : 'no resp');

console.log('\n==== ' + pass + ' 通过 / ' + fail + ' 失败 ====');
try { ws.close(); } catch (e) {}
if (fail) process.exit(1);
