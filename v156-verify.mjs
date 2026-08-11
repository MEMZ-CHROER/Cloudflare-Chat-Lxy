// v1.56 内容沉淀 - 本地验证（可丢弃临时文件）
// Part 1: markdownToHtml 块级增强断言 M1-M12（jsdom + stub 加载真实 renderers.js）
// Part 2: 长消息折叠 M13-M14（jsdom 渲染 addChatMessage）
// Part 3: doc.mjs 后端 CRUD + 权限 + 持久化（fake room）
import fs from 'fs';
import { JSDOM } from 'jsdom';

let passed = 0, failed = 0;
function assert(cond, name, extra = '') {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (extra ? ' :: ' + extra : '')); }
}

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="chatlog"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window','document','navigator','HTMLElement','Element','Node','SVGElement','SVGSVGElement','ShadowRoot','MutationObserver','requestAnimationFrame','cancelAnimationFrame','Event','CustomEvent','getComputedStyle','localStorage','sessionStorage','HTMLCanvasElement','DocumentFragment','NodeList','HTMLCollection','MouseEvent','InputEvent','KeyboardEvent','ClipboardEvent']) {
  try { globalThis[k] = w[k]; } catch (e) {}
}
globalThis.location = w.location;
globalThis.confirm = () => true;
globalThis.alert = () => {};
globalThis.navigator.clipboard = { writeText: async () => {} };
globalThis.hljs = undefined;
globalThis.katex = undefined;
// 渲染期需要用到的 window 原生
w.Element.prototype.scrollBy = function() {};
w.Element.prototype.scrollIntoView = function() {};

// renderers.js 依赖桩（把 import 行替换为全局桩，顶层只定义函数不碰 DOM）
globalThis.__stub = {
  state: { customEmoji: null, username: 'me', chatlog: null, currentWebSocket: null, roomname: 'testroom', currentChannel: 'general', levelStyles: null },
  t: (k) => k, getUserBio: async () => null, showToast: () => {}, showSuccess: () => {}, showError: () => {}, showInfo: () => {},
  TAG_COLORS: {}, getVipLevel: () => 0, createVipBadge: () => null,
  modifyOwnTag: () => {}, startReply: () => {}, recallMessage: () => {}, deleteMessage: () => {}, checkAtMention: () => {}, showLightbox: () => {}, getAdminKey: () => '',
  showUserMenu: () => {}, isFavorited: () => false, toggleFavorite: () => {},
};
function toDataUrl(src) { return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64'); }
async function loadModule(src) { return await import(toDataUrl(src)); }
function loadRenderers() {
  let src = fs.readFileSync('src/client/chat/renderers.js', 'utf8');
  // v1.57 prettier 可能把 import 拆多行/改双引号：块匹配整个 import 语句（到分号）
  src = src.replace(/import\s[\s\S]*?;\s*/g, '');
  src = 'const { state, t, getUserBio, showToast, showSuccess, showError, showInfo, TAG_COLORS, getVipLevel, createVipBadge, modifyOwnTag, startReply, recallMessage, deleteMessage, checkAtMention, showLightbox, getAdminKey, showUserMenu, isFavorited, toggleFavorite } = globalThis.__stub;\n' + src;
  return loadModule(src);
}
const tick = () => new Promise(r => setTimeout(r, 0));
const tick2 = async () => { await tick(); await tick(); await tick(); };

console.log('== Part 1: markdownToHtml 块级增强 ==');
const R = await loadRenderers();
const md = (t) => R.markdownToHtml(t);

{
  let h = md('# 标题');
  assert(h.includes('<h1>标题</h1>'), 'M1a 一级标题 # 标题', h);
  h = md('### 三级');
  assert(h.includes('<h3>三级</h3>'), 'M1b 三级标题 ### 三级', h);
  h = md('#标题'); // 无空格不算标题
  assert(!h.includes('<h1'), 'M1c #标题（无空格）不转标题', h);

  h = md('> 引用');
  assert(h.includes('<blockquote><p>引用</p></blockquote>'), 'M2 引用 >', h);

  h = md('- a\n- b');
  assert(h.includes('<ul><li>a</li><li>b</li></ul>'), 'M3a 无序列表 -', h);
  h = md('* c');
  assert(h.includes('<ul><li>c</li></ul>'), 'M3b 无序列表 *（块级剥离不斜体）', h);
  h = md('1. x\n2. y');
  assert(h.includes('<ol><li>x</li><li>y</li></ol>'), 'M3c 有序列表 1.', h);

  h = md('| 名称 | 数值 |\n|---|---|\n| A | 1 |\n| B | 2 |');
  assert(h.includes('<table>') && h.includes('<th>名称</th>') && h.includes('<td>A</td>') && h.includes('<td>2</td>'), 'M4 表格', h);

  h = md('~~删~~');
  assert(h.includes('<del>删</del>'), 'M5 删除线 ~~', h);

  h = md('---');
  assert(h.includes('<hr>'), 'M6 水平线 ---', h);

  h = md('```js\n# 不是标题\n- 不是列表\n* 不斜体\n```');
  assert(h.includes('<pre><code') && h.includes('class="language-js"'), 'M7a fence 生成 pre/code', h);
  assert(!h.includes('<h1') && !h.includes('<li>') && !h.includes('<em>'), 'M7b fence 内 #/-/* 原样不误转', h);
  assert(h.includes('# 不是标题') && h.includes('- 不是列表') && h.includes('* 不斜体'), 'M7c fence 内容保留', h);

  h = md('`**不粗**`');
  assert(h.includes('<code>**不粗**</code>') && !h.includes('<strong>'), 'M8 行内代码内 ** 不加粗', h);

  h = md('*真斜体*');
  assert(h.includes('<em>真斜体</em>'), 'M9a 真斜体 *x*', h);
  h = md('* 列表项');
  assert(h.includes('<li>列表项</li>') && !h.includes('<em>'), 'M9b 列表 * 不斜体', h);

  h = md('[[doc_ab12cd34:入门指南]]');
  assert(h.includes('class="doc-ref"') && h.includes('data-docid="doc_ab12cd34"') && h.includes('📄 入门指南'), 'M10 [[docId:标题]] → doc-ref', h);

  h = md('<script>alert(1)</script>');
  assert(!h.includes('<script>') && h.includes('&lt;script&gt;'), 'M11 XSS 全转义', h);

  h = md('点这里 https://example.com/a 看看');
  assert((h.match(/<a /g) || []).length === 1, 'M12 URL 只包一次', h);
  h = md('`https://example.com` 代码内URL');
  assert(!h.includes('<a '), 'M12b 行内代码内 URL 不包裹', h);

  // 回归：原有语法不破坏
  h = md('**加粗** 和 `code` 和 @user');
  assert(h.includes('<strong>加粗</strong>') && h.includes('<code>code</code>') && h.includes('data-mention="user"'), 'M13 回归 加粗/行内代码/@提及', h);
  console.log('');
}

// ========== Part 2: 长消息折叠（真实 addChatMessage 走 jsdom DOM） ==========
console.log('== Part 2: 超长折叠 ==');
{
  // 挂一个真实 chatlog + 让 state 指向它
  const chatlog = document.getElementById('chatlog');
  globalThis.__stub.state.chatlog = chatlog;
  globalThis.__stub.state.username = 'me';
  // addChatMessage 长文本
  const long = '#' + '长文'.repeat(800);
  R.addChatMessage('me', long, null, null, null, Date.now());
  await tick2();
  const collapsed = chatlog.querySelector('.msg-collapsed');
  assert(!!collapsed, 'M14a 超长消息折叠 .msg-collapsed', String(!!collapsed));
  const btn = chatlog.querySelector('.msg-fold-btn');
  assert(!!btn && /展开全部/.test(btn.textContent), 'M14b 折叠按钮存在', btn && btn.textContent);
  // 点击展开
  const before = collapsed.classList.contains('msg-collapsed');
  btn.click();
  await tick2();
  assert(!collapsed.classList.contains('msg-collapsed'), 'M14c 点击展开移除折叠类', String(collapsed.classList.contains('msg-collapsed')));
  // 短文不折叠
  const chatlog2 = document.createElement('div');
  document.body.appendChild(chatlog2);
  globalThis.__stub.state.chatlog = chatlog2;
  R.addChatMessage('me', '短消息', null, null, null, Date.now());
  await tick2();
  assert(!chatlog2.querySelector('.msg-collapsed'), 'M14d 短文不折叠', String(!!chatlog2.querySelector('.msg-collapsed')));
  console.log('');
}

// ========== Part 3: doc.mjs 后端 ==========
console.log('== Part 3: 房间知识库后端 ==');
{
  const { handleDoc } = await import('./src/chatroom/doc.mjs');
  function makeRoom() {
    const store = new Map();
    return {
      documents: new Map(),
      _loadDocuments: null,
      storage: {
        get: async k => store.get(k),
        put: async (k, v) => { store.set(k, v); },
        delete: async k => { store.delete(k); },
        list: async () => [...store.entries()].map(([key, val]) => [key, val]),
      },
      broadcasted: [],
      broadcast(m) { this.broadcasted.push(m); },
      containsProfanity: () => false,
      hasPerm: async (s, node) => s.name === 'admin_user',
    };
  }
  const room = makeRoom();
  const ws = { send: () => {} };
  let sent = [];
  const wsCapture = { send: (s) => sent.push(JSON.parse(s)) };
  const sessionAuth = { name: 'alice', authenticated: true };
  const sessionGuest = { name: null, authenticated: false };
  const sessionOther = { name: 'bob', authenticated: true };

  // create
  sent = [];
  const ok1 = await handleDoc(room, sessionAuth, { type: 'doc', action: 'create', reqId: 'r1', title: ' 指南 ', content: '# 标题\n内容' }, wsCapture);
  assert(ok1 === true, 'D1 create 返回 true');
  assert(room.documents.size === 1, 'D2 documents 有 1 篇', String(room.documents.size));
  const docId = [...room.documents.keys()][0];
  assert(/^doc_[a-z0-9_]{6,}$/.test(docId), 'D3 docId 格式 doc_xxx', docId);
  assert(room.documents.get(docId).title === '指南', 'D4 标题 trim', room.documents.get(docId).title);
  const res1 = sent.find(s => s.reqId === 'r1');
  assert(res1 && res1.ok === true && res1.doc && res1.doc.id === docId, 'D5 create 响应 ok+doc', JSON.stringify(res1));
  assert(room.broadcasted.some(b => b.type === 'doc' && b.action === 'created'), 'D6 create 广播 created');

  // get
  sent = [];
  await handleDoc(room, sessionGuest, { type: 'doc', action: 'get', reqId: 'r2', id: docId }, wsCapture);
  const res2 = sent.find(s => s.reqId === 'r2');
  assert(res2 && res2.ok === true && res2.doc.content.includes('# 标题'), 'D7 get 返回正文（游客可读）', JSON.stringify(res2).slice(0, 60));

  // update 作者
  sent = [];
  await handleDoc(room, sessionAuth, { type: 'doc', action: 'update', reqId: 'r3', id: docId, content: '新内容' }, wsCapture);
  const res3 = sent.find(s => s.reqId === 'r3');
  assert(res3 && res3.ok === true, 'D8 update 作者 ok', JSON.stringify(res3));
  assert(room.documents.get(docId).content === '新内容' && room.documents.get(docId).updatedBy === 'alice', 'D9 update 内容+updatedBy', room.documents.get(docId).content);

  // update 非作者非管理员 → 拒绝
  sent = [];
  await handleDoc(room, sessionOther, { type: 'doc', action: 'update', reqId: 'r4', id: docId, content: 'hack' }, wsCapture);
  const res4 = sent.find(s => s.reqId === 'r4');
  assert(res4 && res4.ok === false && /无权限/.test(res4.error), 'D10 update 非作者被拒', JSON.stringify(res4));

  // 游客 create → 拒绝
  sent = [];
  await handleDoc(room, sessionGuest, { type: 'doc', action: 'create', reqId: 'r5', title: 'x', content: 'y' }, wsCapture);
  const res5 = sent.find(s => s.reqId === 'r5');
  assert(res5 && res5.ok === false && /登录/.test(res5.error), 'D11 游客 create 被拒', JSON.stringify(res5));

  // 超长内容拒绝
  sent = [];
  await handleDoc(room, sessionAuth, { type: 'doc', action: 'create', reqId: 'r6', title: 't', content: 'x'.repeat(20001) }, wsCapture);
  const res6 = sent.find(s => s.reqId === 'r6');
  assert(res6 && res6.ok === false && /过长/.test(res6.error), 'D12 超长内容被拒', JSON.stringify(res6).slice(0, 50));

  // delete 非作者被拒 + 作者删除
  sent = [];
  await handleDoc(room, sessionOther, { type: 'doc', action: 'delete', reqId: 'r7', id: docId }, wsCapture);
  assert(sent.find(s => s.reqId === 'r7').ok === false, 'D13 delete 非作者被拒');
  sent = [];
  await handleDoc(room, sessionAuth, { type: 'doc', action: 'delete', reqId: 'r8', id: docId }, wsCapture);
  const res8 = sent.find(s => s.reqId === 'r8');
  assert(res8 && res8.ok === true && room.documents.size === 0, 'D14 delete 作者 ok + 移除', JSON.stringify(res8));

  // 管理员（hasPerm chat.admin.messageDelete）可删任意
  const room2 = makeRoom();
  await handleDoc(room2, sessionOther, { type: 'doc', action: 'create', reqId: 'a', title: 'admin test', content: 'body' }, wsCapture);
  const id2 = [...room2.documents.keys()][0];
  sent = [];
  await handleDoc(room2, { name: 'admin_user', authenticated: true }, { type: 'doc', action: 'delete', reqId: 'r9', id: id2 }, wsCapture);
  assert(sent.find(s => s.reqId === 'r9').ok === true, 'D15 管理员可删任意文档');

  // list 返回元数据（无 content）
  const room3 = makeRoom();
  await handleDoc(room3, sessionAuth, { type: 'doc', action: 'create', reqId: 'b', title: 'l1', content: 'secret-content' }, wsCapture);
  sent = [];
  await handleDoc(room3, sessionGuest, { type: 'doc', action: 'list', reqId: 'r10' }, wsCapture);
  const res10 = sent.find(s => s.reqId === 'r10');
  assert(res10 && res10.docs.length === 1 && res10.docs[0].content === undefined && res10.docs[0].title === 'l1', 'D16 list 只回元数据不含正文', JSON.stringify(res10));
  console.log('');
}

// ========== Part 4: kb.js Vue 弹窗渲染 ==========
console.log('== Part 4: 知识库弹窗渲染 ==');
{
  globalThis.__vue = await import('file://' + process.cwd().replace(/\\/g, '/') + '/_vue-test.mjs');
  globalThis.__modalStub = { injectCss: () => {} };
  globalThis.__docStore = {
    getDocs: () => [{ id: 'doc_ab12cd34', title: '入门指南', tags: ['教程'], createdBy: 'alice', createdAt: Date.now(), updatedAt: Date.now() }],
    getCached: () => null,
    send: async (action) => action === 'list' ? { docs: [{ id: 'doc_ab12cd34', title: '入门指南', tags: ['教程'], createdBy: 'alice', createdAt: Date.now(), updatedAt: Date.now() }] } : { ok: true, doc: {} },
    onChange: () => () => {},
  };
  let kbSrc = fs.readFileSync('src/client/chat/modals/kb.js', 'utf8');
  kbSrc = kbSrc.replace(/import \* as Vue from ['"].*?['"];\s*/, 'const Vue = globalThis.__vue;');
  kbSrc = kbSrc.replace(/import\s+\{([^}]+)\}\s+from\s+['"]\.\.\/modal-manager\.js['"];\s*/, (m, names) => `const { ${names} } = globalThis.__modalStub;`);
  kbSrc = kbSrc.replace(/import\s+\{([^}]+)\}\s+from\s+['"]\.\.\/doc-store\.js['"];\s*/, (m, names) => `const { ${names} } = globalThis.__docStore;`);
  kbSrc = kbSrc.replace(/import\s+\{([^}]+)\}\s+from\s+['"]\.\.\/state\.js['"];\s*/, (m, names) => `const { ${names} } = globalThis.__stub;`);
  const kbMod = (await loadModule(kbSrc)).default;
  assert(!!kbMod && typeof kbMod.setup === 'function' && kbMod.props.room, 'K1 kb 组件可加载 (setup+props)');

  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = globalThis.__vue.createApp({ components: { KBModal: kbMod }, template: `<KBModal room="testroom" />` });
  app.mount(host);
  await tick2();
  assert(!!host.querySelector('.cm-kb'), 'K2 弹窗挂载 .cm-kb');
  assert(!!host.querySelector('.cm-kb-item'), 'K3 文档列表项渲染');
  assert(host.querySelector('.cm-kb-item-title').textContent.includes('入门指南'), 'K4 标题显示', host.querySelector('.cm-kb-item-title') && host.querySelector('.cm-kb-item-title').textContent);
  assert(!!host.querySelector('.cm-btn-primary'), 'K5 新建按钮存在');
  app.unmount(); host.remove();
  console.log('');
}

console.log('\n==== ' + passed + ' 通过 / ' + failed + ' 失败 ====');
if (failed) process.exit(1);
