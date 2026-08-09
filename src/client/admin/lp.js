// 🧪 v1.51 LuckPerms 权限编辑器（Vue 3 重写）
// 基于 LuckPermsWeb 源码（MIT）的 UI/组件结构，用 Vue 3 esm-browser（含编译器）重写：
//   EditorMenu（左侧 组/用户 分栏 + 搜索 + 折叠）
//   EditorMain（Header + NodeList + AddNode）
// 数据仍走 /api/admin/lp/data + /api/admin/lp/exec（super-only 双闸）；Vue 响应式天然增量写入（改 store 即重画，无整棵刷新）。
// 双形态：管理后台 /admin/lp 内嵌（#lp-section）+ 独立 /lp 全屏页（传入 container）。
// 全部模板字符串声明式渲染（无 v-html 用户输入，防 XSS）；样式复用 v1.50 lp-ed- 前缀 CSS。

import * as Vue from '/static/admin/vendor/vue.js';
import { state } from './state.js';
const { createApp, reactive, computed } = Vue;

// ---------- CSS（深色 navy，仿 LuckPermsWeb） ----------
const LP_CSS = `
.lp-ed-wrap { display:flex; gap:0; background:#17171e; border-radius:10px; overflow:hidden; min-height:520px; border:1px solid rgba(255,255,255,.08); color:#e6e6e6; font-size:13px; }
.lp-ed-menu { flex:0 0 300px; background:#0e0e14; border-right:1px solid rgba(255,255,255,.08); display:flex; flex-direction:column; max-height:640px; }
.lp-ed-filter { position:relative; border-bottom:1px solid rgba(255,255,255,.08); }
.lp-ed-filter input { width:100%; box-sizing:border-box; padding:10px 30px 10px 12px; background:rgba(255,255,255,.05); border:0; color:#fff; font-size:13px; outline:none; }
.lp-ed-filter input::placeholder { color:rgba(255,255,255,.35); }
.lp-ed-filter .lp-ed-filter-x { position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:0; color:rgba(255,255,255,.5); cursor:pointer; font-size:14px; }
.lp-ed-filter .lp-ed-filter-x:hover { color:#fff; }
.lp-ed-menu-body { flex:1; overflow-y:auto; }
.lp-ed-sec-h { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#12121a; border-bottom:1px solid rgba(255,255,255,.06); text-transform:uppercase; font-size:11px; font-weight:bold; letter-spacing:.5px; color:rgba(255,255,255,.7); cursor:pointer; position:sticky; top:0; z-index:2; }
.lp-ed-sec-h:hover { background:#16161f; }
.lp-ed-sec-h .lp-ed-sec-left { display:flex; align-items:center; gap:6px; }
.lp-ed-sec-h .lp-ed-caret { display:inline-block; width:0; height:0; border-left:5px solid rgba(255,255,255,.6); border-top:4px solid transparent; border-bottom:4px solid transparent; transition:transform .15s; }
.lp-ed-sec-h.open .lp-ed-caret { transform:rotate(90deg); }
.lp-ed-sec-h .lp-ed-count { opacity:.6; font-size:10px; }
.lp-ed-sec-h .lp-ed-sec-add { background:transparent; border:0; color:rgba(255,255,255,.5); cursor:pointer; font-size:15px; line-height:1; padding:0 4px; }
.lp-ed-sec-h .lp-ed-sec-add:hover { color:#7aa2ff; }
.lp-ed-sec-ul { margin:0; padding:0; list-style:none; }
.lp-ed-sec-ul.hidden { display:none; }
.lp-ed-sec-li { padding:7px 12px 7px 20px; border-bottom:1px solid rgba(255,255,255,.04); cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:8px; }
.lp-ed-sec-li:hover { background:rgba(255,255,255,.06); }
.lp-ed-sec-li.active { background:rgba(122,162,255,.14); border-left:2px solid #7aa2ff; }
.lp-ed-sec-li .lp-ed-sec-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; }
.lp-ed-sec-li .lp-ed-sec-name small { opacity:.45; font-size:11px; margin-left:4px; }
.lp-ed-sec-li .lp-ed-sec-meta { font-size:11px; color:rgba(255,255,255,.4); flex-shrink:0; }
.lp-ed-sec-li .lp-ed-sec-del { background:transparent; border:0; color:rgba(255,255,255,.3); cursor:pointer; font-size:13px; padding:0 2px; flex-shrink:0; opacity:0; }
.lp-ed-sec-li:hover .lp-ed-sec-del { opacity:1; }
.lp-ed-sec-li .lp-ed-sec-del:hover { color:#ff6b6b; }
.lp-ed-sec-li .lp-ed-sec-del[disabled] { opacity:0; cursor:default; }
.lp-ed-sec-empty { padding:12px 14px; color:rgba(255,255,255,.35); font-size:12px; }

.lp-ed-main { flex:1; min-width:0; display:flex; flex-direction:column; max-height:640px; }
.lp-ed-no-sel { flex:1; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.35); font-size:14px; flex-direction:column; gap:8px; }
.lp-ed-header { background:#2c2c39; padding:12px 16px; border-bottom:1px solid rgba(0,0,0,.3); display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.lp-ed-header .lp-ed-type-badge { text-transform:capitalize; font-size:12px; color:rgba(255,255,255,.6); }
.lp-ed-header code { font-family:"Source Code Pro",Consolas,monospace; font-size:15px; color:#fff; }
.lp-ed-header .lp-ed-sub { opacity:.5; font-size:12px; }
.lp-ed-header .lp-ed-header-actions { margin-left:auto; display:flex; gap:8px; }
.lp-ed-header button.lp-ed-btn { background:#7aa2ff; color:#0e0e14; border:0; border-radius:4px; padding:5px 14px; font-size:13px; font-weight:bold; cursor:pointer; }
.lp-ed-header button.lp-ed-btn:hover { opacity:.85; }
.lp-ed-header button.lp-ed-btn.ghost { background:rgba(255,255,255,.12); color:#fff; font-weight:normal; }
.lp-ed-header button.lp-ed-btn.ghost:hover { background:rgba(255,255,255,.2); }

.lp-ed-nodelist { flex:1; overflow-y:auto; background:rgba(255,255,255,.05); }
.lp-ed-nl-head { background:#43434e; border-bottom:1px solid rgba(0,0,0,.25); display:flex; position:sticky; top:0; z-index:2; }
.lp-ed-nl-head > div { padding:8px 10px; font-weight:bold; font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer; }
.lp-ed-nl-head > div:hover { background:rgba(255,255,255,.08); }
.lp-ed-nl-head .lp-ed-nl-cb { cursor:default; }
.lp-ed-nl-head .lp-ed-sort-arrow { font-size:10px; opacity:.7; }
.lp-ed-nl-head .lp-ed-col-perm { flex:3; }
.lp-ed-nl-head .lp-ed-col-val { flex:1; }
.lp-ed-nl-head .lp-ed-col-del { flex:0 0 40px; cursor:default; justify-content:center; }
.lp-ed-node { display:flex; align-items:center; border-bottom:1px solid rgba(0,0,0,.18); cursor:pointer; }
.lp-ed-node:hover { background:rgba(255,255,255,.07); }
.lp-ed-node > div { padding:7px 10px; }
.lp-ed-node .lp-ed-nl-cb { flex:0 0 34px; }
.lp-ed-node .lp-ed-col-perm { flex:3; word-break:break-all; display:flex; align-items:center; gap:8px; min-width:0; }
.lp-ed-node .lp-ed-col-val { flex:1; }
.lp-ed-node .lp-ed-col-del { flex:0 0 40px; text-align:center; color:rgba(255,255,255,.35); }
.lp-ed-node .lp-ed-col-del:hover { color:#ff6b6b; }
.lp-ed-node .lp-ed-nl-cb input { cursor:pointer; }
.lp-ed-node .lp-ed-badge { display:inline-block; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:bold; text-transform:uppercase; flex-shrink:0; }
.lp-ed-badge-perm { background:#6c757d; color:#fff; }
.lp-ed-badge-inh { background:#5470c6; color:#fff; }
.lp-ed-node code { font-family:"Source Code Pro",Consolas,monospace; font-size:12px; color:#e6e6e6; word-break:break-all; }
.lp-ed-node .lp-ed-val-code { font-family:"Source Code Pro",Consolas,monospace; font-size:12px; cursor:pointer; padding:2px 8px; border-radius:3px; display:inline-block; }
.lp-ed-node .lp-ed-val-code.true { color:#7dffb0; background:rgba(125,255,176,.08); }
.lp-ed-node .lp-ed-val-code.false { color:#ff8a8a; background:rgba(255,138,138,.08); }
.lp-ed-node .lp-ed-val-code:hover { opacity:.8; }

.lp-ed-addnode { background:#3a3a44; border-top:1px solid rgba(0,0,0,.35); padding:10px 12px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.lp-ed-addnode select, .lp-ed-addnode input { padding:6px 8px; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); border-radius:4px; color:#fff; font-family:"Source Code Pro",Consolas,monospace; font-size:12px; outline:none; }
.lp-ed-addnode select { min-width:110px; }
.lp-ed-addnode input.lp-ed-node-input { flex:1; min-width:120px; }
.lp-ed-addnode select.lp-ed-node-input { flex:1; min-width:120px; }
.lp-ed-addnode select option { background:#333; color:#fff; }
.lp-ed-addnode .lp-ed-val-switch { display:flex; align-items:center; gap:4px; }
.lp-ed-addnode .lp-ed-vbtn { background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.12); color:#fff; border-radius:4px; padding:6px 12px; cursor:pointer; font-family:"Source Code Pro",Consolas,monospace; font-size:12px; }
.lp-ed-addnode .lp-ed-vbtn.active.true { background:#7dffb0; color:#0a0a0a; border-color:#7dffb0; }
.lp-ed-addnode .lp-ed-vbtn.active.false { background:#ff8a8a; color:#0a0a0a; border-color:#ff8a8a; }
.lp-ed-addnode .lp-ed-add-btn { background:#7aa2ff; color:#0e0e14; border:0; border-radius:4px; padding:6px 16px; font-size:13px; font-weight:bold; cursor:pointer; }
.lp-ed-addnode .lp-ed-add-btn:hover { opacity:.85; }
.lp-ed-addnode .lp-ed-add-btn[disabled] { opacity:.4; cursor:not-allowed; }
.lp-ed-addnode .lp-ed-batch { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.lp-ed-addnode .lp-ed-batch .lp-ed-batch-count { color:rgba(255,255,255,.7); font-size:13px; }
.lp-ed-addnode .lp-ed-batch button { background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); color:#fff; border-radius:4px; padding:6px 12px; cursor:pointer; font-size:12px; }
.lp-ed-addnode .lp-ed-batch button:hover { background:rgba(0,0,0,.5); }
.lp-ed-addnode .lp-ed-batch button.danger { color:#ff8a8a; border-color:rgba(255,138,138,.4); }
.lp-ed-msg { padding:8px 12px; font-size:12px; }
.lp-ed-msg.ok { color:#7dffb0; background:rgba(125,255,176,.06); }
.lp-ed-msg.err { color:#ff8a8a; background:rgba(255,138,138,.08); }
.lp-ed-empty { padding:20px; text-align:center; color:rgba(255,255,255,.35); font-size:12px; }
.lp-ed-loading { padding:30px; text-align:center; color:rgba(255,255,255,.45); }
@media (max-width:900px) { .lp-ed-wrap { flex-direction:column; } .lp-ed-menu { flex:0 0 auto; max-height:300px; border-right:0; border-bottom:1px solid rgba(255,255,255,.08); } }
`;

// ---------- 状态（Vue reactive：改 store 即自动重画 = 增量写入） ----------
const store = reactive({
  groups: [],            // {name, permissions:[[node,val]...], parents:[], members:[]}
  users: [],             // {name, permissions:[[node,val]...], groups:[]}
  filter: "",
  openSecs: {groups: true, users: true},
  current: null,         // {type:'group'|'user', name}
  selected: [],          // [{key, kind, value, groupName}]
  sort: {method: "key", desc: false},
  addType: "perm",       // 添加栏节点类型
  addVal: true,          // 添加默认值
  addInput: "",          // 权限节点输入（可空格/逗号多节点）
  addInh: "",            // 继承组选择
  busy: false,
});

const NAME_RE = /^[A-Za-z0-9_-]{1,24}$/;
const NODE_RE = /^[A-Za-z0-9_.*-]{1,64}$/;
function validNode(n) {
  if (!NODE_RE.test(n)) return false;
  if (n.includes("*") && n !== "*" && !n.endsWith(".*")) return false;
  return true;
}

// ---------- 工具 ----------
function makeEl(tag, attrs, text) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null) continue;
      if (k === "style") n.style.cssText = v;
      else if (k === "className") n.className = v;
      else if (k === "onclick") n.onclick = v;
      else if (k === "checked") n.checked = v;
      else if (k === "disabled") n.disabled = v;
      else n.setAttribute(k, v);
    }
  }
  if (text !== undefined) n.textContent = text;
  return n;
}
function ensureCss() {
  if (document.getElementById("lp-ed-css")) return;
  const el = makeEl("style", {id: "lp-ed-css"}, LP_CSS);
  document.head.appendChild(el);
}

// ---------- 网络 ----------
async function apiData() {
  const r = await fetch("/api/admin/lp/data?key=" + encodeURIComponent(state.adminKey));
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || "加载失败");
  return d;
}
async function apiExec(cmd) {
  const r = await fetch("/api/admin/lp/exec?key=" + encodeURIComponent(state.adminKey), {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({cmd})
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || "执行失败");
  return d;
}

// ---------- 节点构建（权限 + 继承统一为节点列表） ----------
function sessionNodes(type, name) {
  const nodes = [];
  if (type === "group") {
    const g = store.groups.find(x => x.name === name);
    if (!g) return nodes;
    for (const [key, value] of g.permissions) nodes.push({id: "p|" + key, kind: "perm", key, value, tag: "permission"});
    for (const p of (g.parents || [])) nodes.push({id: "i|" + p, kind: "inh", key: "group." + p, value: true, tag: "inheritance", groupName: p});
  } else {
    const u = store.users.find(x => x.name === name);
    if (!u) return nodes;
    for (const [key, value] of u.permissions) nodes.push({id: "p|" + key, kind: "perm", key, value, tag: "permission"});
    for (const gr of (u.groups || [])) nodes.push({id: "i|" + gr, kind: "inh", key: "group." + gr, value: true, tag: "inheritance", groupName: gr});
  }
  return nodes;
}

// 当前会话的记录对象（用户或组）
function curRec() {
  if (!store.current) return null;
  if (store.current.type === "group") return store.groups.find(g => g.name === store.current.name);
  return store.users.find(u => u.name === store.current.name);
}

// ---------- 提示条（body 级 toast，固定顶部） ----------
function flashMsg(text, ok) {
  let box = document.getElementById("lp-ed-toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "lp-ed-toast";
    box.style.cssText = "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none;max-width:80vw;";
    document.body.appendChild(box);
  }
  const msg = document.createElement("div");
  msg.className = "lp-ed-msg " + (ok ? "ok" : "err");
  msg.textContent = text;
  box.appendChild(msg);
  setTimeout(() => msg.remove(), 2500);
}

// 写操作统一入口：成功后 applyLocal 直接改 store（Vue 响应式自动重画，无网络整棵刷新）
async function runCmd(cmd, okText, applyLocal) {
  if (store.busy) return false;
  store.busy = true;
  try {
    const d = await apiExec(cmd);
    flashMsg((d && d.text) || okText || "完成", true);
    if (typeof applyLocal === "function") applyLocal();
    return true;
  } catch (e) {
    flashMsg(e.message, false);
    return false;
  } finally {
    store.busy = false;
  }
}

// ---------- 操作流程 ----------
function addGroupFlow() {
  const name = prompt("新建权限组，组名（字母数字下划线连字符，1-24位）：", "");
  if (name === null) return;
  if (!NAME_RE.test(name)) { flashMsg("组名仅限字母数字下划线连字符，1-24位", false); return; }
  runCmd("/lp creategroup " + name, "已创建权限组 " + name, () => {
    if (!store.groups.some(g => g.name === name)) store.groups.push({name, permissions: [], parents: [], members: []});
  });
}

function deleteGroupFlow(name) {
  if (!confirm("确定删除权限组 " + name + " ？将同时移除所有用户对该组的引用。")) return;
  runCmd("/lp deletegroup " + name, "已删除权限组 " + name, () => {
    store.groups = store.groups.filter(g => g.name !== name);
    for (const g of store.groups) g.parents = (g.parents || []).filter(p => p !== name);
    for (const u of store.users) if (u.groups) u.groups = u.groups.filter(g => g !== name);
    if (store.current && store.current.name === name) { store.current = null; store.selected = []; }
  });
}

function deleteUserFlow(name) {
  if (!confirm("确定清除用户 " + name + " 的全部权限记录？（仅权限数据，聊天账号不受影响）")) return;
  runCmd("/lp user " + name + " delete", "已清除用户 " + name + " 的权限记录", () => {
    const u = store.users.find(x => x.name === name);
    if (u) { u.permissions = []; u.groups = []; }
    if (store.current && store.current.type === "user" && store.current.name === name) { store.current = null; store.selected = []; }
  });
}

function toggleNodeValue(node) {
  if (node.kind !== "perm") return;
  const nv = !node.value;
  const cmd = "/lp " + store.current.type + " " + store.current.name + " permission set " + node.key + " " + nv;
  runCmd(cmd, "已设置 " + node.key + " = " + nv, () => {
    const rec = curRec();
    if (!rec) return;
    const i = rec.permissions.findIndex(p => p[0] === node.key);
    if (i >= 0) rec.permissions[i][1] = nv;
    else rec.permissions.push([node.key, nv]);
  });
}

function deleteNodeFlow(node) {
  let cmd;
  if (node.kind === "perm") {
    cmd = "/lp " + store.current.type + " " + store.current.name + " permission unset " + node.key;
  } else {
    if (store.current.type === "group") cmd = "/lp group " + store.current.name + " parent remove " + node.groupName;
    else cmd = "/lp user " + store.current.name + " parent remove " + node.groupName;
  }
  runCmd(cmd, "已删除节点 " + node.key, () => {
    const rec = curRec();
    if (!rec) return;
    if (node.kind === "perm") rec.permissions = rec.permissions.filter(p => p[0] !== node.key);
    else if (store.current.type === "group") rec.parents = (rec.parents || []).filter(p => p !== node.groupName);
    else rec.groups = (rec.groups || []).filter(g => g !== node.groupName);
    store.selected = store.selected.filter(s => !(s.kind === node.kind && s.key === node.key));
  });
}

// 权限节点增量更新 helper
function applyPermLocal(key, value) {
  const rec = curRec();
  if (!rec) return;
  const i = rec.permissions.findIndex(p => p[0] === key);
  if (i >= 0) rec.permissions[i][1] = value;
  else rec.permissions.push([key, value]);
}
// 继承节点增量更新 helper（组→parents，用户→groups）
function applyInhLocal(groupName) {
  const rec = curRec();
  if (!rec) return;
  if (store.current.type === "group") { if (!(rec.parents || []).includes(groupName)) rec.parents.push(groupName); }
  else { if (!(rec.groups || []).includes(groupName)) rec.groups.push(groupName); }
}

function addPermNodes(input) {
  const raw = (input || "").trim();
  if (!raw) { flashMsg("请输入权限节点", false); return; }
  const parts = raw.split(/[\s,，]+/).filter(Boolean);
  for (const p of parts) {
    if (!validNode(p)) { flashMsg("无效权限节点: " + p, false); return; }
  }
  const v = store.addVal;
  (async () => {
    for (const p of parts) {
      const c = "/lp " + store.current.type + " " + store.current.name + " permission set " + p + " " + v;
      const ok = await runCmd(c, "已添加 " + p, () => applyPermLocal(p, v));
      if (!ok) break;
    }
  })();
}

function addInhNode(groupName) {
  if (!groupName) { flashMsg("请选择要继承的组", false); return; }
  let cmd;
  if (store.current.type === "group") cmd = "/lp group " + store.current.name + " parent add " + groupName;
  else cmd = "/lp user " + store.current.name + " parent add " + groupName;
  runCmd(cmd, "已添加继承 " + groupName, () => applyInhLocal(groupName));
}

async function batchSetValue(v) {
  const sel = store.selected.filter(s => s.kind === "perm");
  if (sel.length === 0) { flashMsg("选中的都是继承节点（继承由组决定，不可直接改值）", false); return; }
  if (!confirm("将选中的 " + sel.length + " 个权限节点设为 " + v + " ？")) return;
  for (const s of sel) {
    const cmd = "/lp " + store.current.type + " " + store.current.name + " permission set " + s.key + " " + v;
    const ok = await runCmd(cmd, "已设置 " + s.key, () => applyPermLocal(s.key, v));
    if (!ok) break;
  }
}

async function batchDelete() {
  if (!confirm("确定删除选中的 " + store.selected.length + " 个节点？")) return;
  for (const s of [...store.selected]) {
    let cmd;
    if (s.kind === "perm") cmd = "/lp " + store.current.type + " " + store.current.name + " permission unset " + s.key;
    else {
      if (store.current.type === "group") cmd = "/lp group " + store.current.name + " parent remove " + s.groupName;
      else cmd = "/lp user " + store.current.name + " parent remove " + s.groupName;
    }
    const ok = await runCmd(cmd, "已删除 " + s.key, () => {
      const rec = curRec();
      if (!rec) return;
      if (s.kind === "perm") rec.permissions = rec.permissions.filter(p => p[0] !== s.key);
      else if (store.current.type === "group") rec.parents = (rec.parents || []).filter(p => p !== s.groupName);
      else rec.groups = (rec.groups || []).filter(g => g !== s.groupName);
    });
    if (!ok) break;
  }
}

// ---------- Vue 组件（Vue 3 options/setup 混合，template 字符串，贴近 lpweb 组件划分） ----------

// 左侧导航：组/用户 分栏 + 搜索过滤 + 折叠 + 新建组/删除
const EditorMenu = {
  setup() {
    const groups = computed(() => {
      const q = store.filter.toLowerCase();
      return store.groups.filter(g => g.name.toLowerCase().includes(q));
    });
    const users = computed(() => {
      const q = store.filter.toLowerCase();
      return store.users.filter(u => u.name.toLowerCase().includes(q));
    });
    // 搜索时自动展开全部分区（仿 lpweb）
    Vue.watch(() => store.filter, (v) => {
      if (v !== "") { store.openSecs.groups = true; store.openSecs.users = true; }
    });
    function isCurrent(type, name) {
      return store.current && store.current.type === type && store.current.name === name;
    }
    function select(type, name) {
      store.current = {type, name};
      store.selected = [];
      store.addInput = "";
      store.addInh = "";
    }
    function hasLp(u) { return u.permissions.length > 0 || (u.groups && u.groups.length > 0); }
    return {store, groups, users, isCurrent, select, hasLp, addGroup: addGroupFlow, delGroup: deleteGroupFlow, delUser: deleteUserFlow};
  },
  template: `
  <div class="lp-ed-menu">
    <div class="lp-ed-filter">
      <input type="text" placeholder="搜索..." v-model="store.filter"/>
      <button v-if="store.filter" class="lp-ed-filter-x" @click="store.filter=''">✕</button>
    </div>
    <div class="lp-ed-menu-body">
      <div>
        <div class="lp-ed-sec-h" :class="{open:store.openSecs.groups}" @click="store.openSecs.groups=!store.openSecs.groups">
          <span class="lp-ed-sec-left"><span class="lp-ed-caret"></span><span>权限组</span><span class="lp-ed-count">({{groups.length}})</span></span>
          <button class="lp-ed-sec-add" title="新建权限组" @click.stop="addGroup">+</button>
        </div>
        <ul class="lp-ed-sec-ul" :class="{hidden:!store.openSecs.groups}">
          <li v-if="!groups.length" class="lp-ed-sec-empty">（无）</li>
          <li v-for="g in groups" :key="'g'+g.name" class="lp-ed-sec-li" :class="{active:isCurrent('group',g.name)}" @click="select('group',g.name)">
            <span class="lp-ed-sec-name">{{g.name}}<small v-if="g.parents && g.parents.length">{{g.parents.join(', ')}}</small></span>
            <span class="lp-ed-sec-meta">{{g.permissions.length}}权限/{{(g.members||[]).length}}成员</span>
            <button class="lp-ed-sec-del" title="删除组" @click.stop="delGroup(g.name)">🗑</button>
          </li>
        </ul>
      </div>
      <div>
        <div class="lp-ed-sec-h" :class="{open:store.openSecs.users}" @click="store.openSecs.users=!store.openSecs.users">
          <span class="lp-ed-sec-left"><span class="lp-ed-caret"></span><span>用户</span><span class="lp-ed-count">({{users.length}})</span></span>
          <span class="lp-ed-sec-h-spacer" style="width:19px"></span>
        </div>
        <ul class="lp-ed-sec-ul" :class="{hidden:!store.openSecs.users}">
          <li v-if="!users.length" class="lp-ed-sec-empty">（无）</li>
          <li v-for="u in users" :key="'u'+u.name" class="lp-ed-sec-li" :class="{active:isCurrent('user',u.name)}" @click="select('user',u.name)">
            <span class="lp-ed-sec-name">{{u.name}}</span>
            <span class="lp-ed-sec-meta">{{u.permissions.length}}权限/{{(u.groups||[]).length}}组</span>
            <button class="lp-ed-sec-del" :disabled="!hasLp(u)" title="清除该用户权限记录" @click.stop="delUser(u.name)">🗑</button>
          </li>
        </ul>
      </div>
    </div>
  </div>`,
};

// 单行权限节点：勾选 / badge / key / value 点击切换 / 删除
const NodeRow = {
  props: ["node"],
  setup(props) {
    // 注意：不要用 `const node = props.node` 捕获引用后再模板直读 node.value——
    // 父组件 sessionNodes 每次重建新对象，props.node 更新但 setup 闭包仍指旧引用，
    // value 永不刷新（Vue3 解构 props 陷阱）。value 必须走 computed 响应 props.node。
    const node = props.node;
    const isSelected = computed(() => store.selected.some(s => s.kind === node.kind && s.key === node.key));
    const val = computed(() => String(props.node.value));
    function toggleSelect() {
      if (isSelected.value) store.selected = store.selected.filter(s => !(s.kind === node.kind && s.key === node.key));
      else store.selected.push({key: node.key, kind: node.kind, value: node.value, groupName: node.groupName});
    }
    function toggleValue() { toggleNodeValue(props.node); }
    function del() { deleteNodeFlow(props.node); }
    return {node, val, isSelected, toggleSelect, toggleValue, del};
  },
  template: `
  <div class="lp-ed-node">
    <div class="lp-ed-nl-cb"><input type="checkbox" :checked="isSelected" @change="toggleSelect"/></div>
    <div class="lp-ed-col-perm">
      <span class="lp-ed-badge" :class="node.kind==='perm' ? 'lp-ed-badge-perm' : 'lp-ed-badge-inh'">{{node.tag}}</span>
      <code>{{node.kind==='perm' ? node.key : node.groupName}}</code>
    </div>
    <div class="lp-ed-col-val">
      <span class="lp-ed-val-code" :class="val" :title="node.kind==='perm' ? '切换值' : '继承（由所属组决定）'" @click="toggleValue">{{val}}</span>
    </div>
    <div class="lp-ed-col-del" title="删除" @click="del">✕</div>
  </div>`,
};

// 权限表：列头排序 + 全选
const NodeList = {
  props: ["nodes"],
  components: {NodeRow},
  setup(props) {
    const sortedNodes = computed(() => {
      const arr = [...props.nodes];
      if (store.sort.method === "key") arr.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      else if (store.sort.method === "value") arr.sort((a, b) => (String(a.value) < String(b.value) ? -1 : String(a.value) > String(b.value) ? 1 : 0));
      if (store.sort.desc) arr.reverse();
      return arr;
    });
    const allSelected = computed(() => props.nodes.length > 0 && store.selected.length === props.nodes.length);
    function changeSort(method) {
      if (store.sort.method === method) store.sort.desc = !store.sort.desc;
      else { store.sort.method = method; store.sort.desc = true; }
    }
    function toggleAll() {
      if (allSelected.value) store.selected = [];
      else store.selected = props.nodes.map(n => ({key: n.key, kind: n.kind, value: n.value, groupName: n.groupName}));
    }
    return {store, sortedNodes, allSelected, changeSort, toggleAll};
  },
  template: `
  <div class="lp-ed-nodelist">
    <div class="lp-ed-nl-head">
      <div class="lp-ed-nl-cb"><input type="checkbox" :checked="allSelected" @change="toggleAll"/></div>
      <div class="lp-ed-col-perm" @click="changeSort('key')"><span>权限</span><span v-if="store.sort.method==='key'" class="lp-ed-sort-arrow">{{store.sort.desc ? '▲' : '▼'}}</span></div>
      <div class="lp-ed-col-val" @click="changeSort('value')"><span>值</span><span v-if="store.sort.method==='value'" class="lp-ed-sort-arrow">{{store.sort.desc ? '▲' : '▼'}}</span></div>
      <div class="lp-ed-col-del"></div>
    </div>
    <div v-if="!sortedNodes.length" class="lp-ed-empty">该{{store.current && store.current.type === 'group' ? '权限组' : '用户'}}暂无节点，用底部栏添加</div>
    <template v-else>
      <node-row v-for="n in sortedNodes" :key="n.id" :node="n"/>
    </template>
  </div>`,
};

// 底部添加栏 / 批量操作栏
const AddNode = {
  setup() {
    const types = [{v: "perm", t: "权限节点"}, {v: "inh", t: "继承节点"}];
    const hasSelection = computed(() => store.selected.length > 0);
    const canAdd = computed(() => {
      if (store.addType === "perm") return store.addInput.trim() !== "";
      return store.addInh !== "";
    });
    const groupOptions = computed(() => store.groups
      .filter(g => g.name !== (store.current && store.current.name))
      .map(g => g.name));
    function doAdd() {
      if (store.addType === "perm") addPermNodes(store.addInput);
      else addInhNode(store.addInh);
    }
    return {store, types, hasSelection, canAdd, groupOptions, doAdd, batchSet: batchSetValue, batchDel: batchDelete, clearSel: () => { store.selected = []; }};
  },
  template: `
  <div class="lp-ed-addnode">
    <template v-if="!hasSelection">
      <select v-model="store.addType">
        <option v-for="t in types" :key="t.v" :value="t.v">{{t.t}}</option>
      </select>
      <div style="display:flex;gap:8px;align-items:center;flex:1;min-width:0;">
        <input v-if="store.addType==='perm'" class="lp-ed-node-input" v-model="store.addInput"
          :placeholder="store.current && store.current.type === 'group' ? 'chat.admin.kickUser 或 chat.admin.*（空格/逗号可一次多个）' : 'chat.admin.kickUser（空格/逗号可一次多个）'"
          @keydown.enter="doAdd"/>
        <select v-else class="lp-ed-node-input" v-model="store.addInh">
          <option value="">{{store.current && store.current.type === 'group' ? '继承父组：选组...' : '继承组：选组...'}}</option>
          <option v-for="g in groupOptions" :key="g" :value="g">{{g}}</option>
        </select>
        <div v-if="store.addType==='perm'" class="lp-ed-val-switch">
          <button class="lp-ed-vbtn true" :class="{active:store.addVal}" @click="store.addVal=true">true</button>
          <button class="lp-ed-vbtn false" :class="{active:!store.addVal}" @click="store.addVal=false">false</button>
        </div>
      </div>
      <button class="lp-ed-add-btn" :disabled="!canAdd" @click="doAdd">添加</button>
    </template>
    <template v-else>
      <div class="lp-ed-batch">
        <span class="lp-ed-batch-count">已选 {{store.selected.length}} 项</span>
        <button @click="batchSet(true)">设为 true</button>
        <button @click="batchSet(false)">设为 false</button>
        <button class="danger" @click="batchDel">删除选中</button>
        <button @click="clearSel">取消选择</button>
      </div>
    </template>
  </div>`,
};

// 主区：Header + NodeList + AddNode / 空状态
const EditorMain = {
  components: {NodeList, AddNode},
  setup() {
    const nodes = computed(() => sessionNodes(store.current ? store.current.type : null, store.current ? store.current.name : null));
    const typeLabel = computed(() => store.current ? store.current.type : "");
    const memberCount = computed(() => {
      if (!store.current || store.current.type !== "group") return 0;
      const g = store.groups.find(x => x.name === store.current.name);
      return g && g.members ? g.members.length : 0;
    });
    return {store, nodes, typeLabel, memberCount, refresh: () => loadLpSection()};
  },
  template: `
  <div class="lp-ed-main">
    <template v-if="!store.current">
      <div class="lp-ed-no-sel">
        <div style="font-size:28px">🔑</div>
        <div>选择左侧权限组或用户开始编辑</div>
        <div style="font-size:12px;color:rgba(255,255,255,.3)">LuckPerms 权限编辑器</div>
      </div>
    </template>
    <template v-else>
      <div class="lp-ed-header">
        <span class="lp-ed-type-badge">{{typeLabel}}:</span>
        <code>{{store.current.name}}</code>
        <span v-if="memberCount" class="lp-ed-sub">{{memberCount}} 名成员</span>
        <div class="lp-ed-header-actions">
          <button class="lp-ed-btn ghost" @click="refresh">刷新</button>
        </div>
      </div>
      <node-list :nodes="nodes"/>
      <add-node/>
    </template>
  </div>`,
};

// 根组件：左侧导航 + 主区
const App = {
  components: {EditorMenu, EditorMain},
  template: `
  <div class="lp-ed-wrap">
    <editor-menu/>
    <editor-main/>
  </div>`,
};

// ---------- 入口（双形态：admin 内嵌 + 独立 /lp 全屏页） ----------
let _app = null;
let _root = null;

export async function loadLpSection(container) {
  ensureCss();
  const root = container || document.getElementById("lp-section") || _root;
  if (!root) return;
  _root = root;

  if (_app) { try { _app.unmount(); } catch (e) {} _app = null; }

  root.textContent = "";
  root.appendChild(makeEl("div", {className: "lp-ed-loading"}, "加载权限数据中..."));

  let data;
  try { data = await apiData(); }
  catch (e) {
    root.textContent = "";
    root.appendChild(makeEl("div", {className: "lp-ed-msg err"}, "加载失败：" + e.message));
    return;
  }

  store.groups = data.groups || [];
  store.users = data.users || [];
  store.current = null;
  store.selected = [];
  store.filter = "";
  store.addInput = "";
  store.addInh = "";
  store.busy = false;

  root.textContent = "";
  _app = createApp(App);
  _app.mount(root);
}
