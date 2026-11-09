// v1.54 运营数据看板 - 线上端到端埋点验证
// 全新房间名 → 新 DO 实例跑新代码 → join 触发 registry 峰值 + 发消息触发 msgByDay 日桶
// 然后查房间 /stats 与 ops-stats 确认埋点闭环
import { readFileSync } from "node:fs";

const BASE = "https://chat.liuxiyu.cn";
const SESS = JSON.parse(readFileSync("I:/Cloudflare-Workers-Chat-master/.hn-sess.json", "utf8"));

const NAME = "hntest_1785912234";
const TOKEN = SESS[NAME];
const ROOM = "v154-smoke-" + Date.now();
const WS_URL = "wss://chat.liuxiyu.cn/api/room/" + ROOM + "/websocket";

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getStats() {
  const r = await fetch(BASE + "/api/room/" + ROOM + "/stats");
  return { status: r.status, d: await r.json().catch(() => ({})) };
}

async function getOps() {
  const r = await fetch(BASE + "/api/room/" + ROOM + "/ops");
  return { status: r.status, d: await r.json().catch(() => ({})) };
}

let passed = 0, failed = 0;
function assert(cond, name, extra = "") {
  if (cond) { passed++; console.log("  ✅ " + name); }
  else { failed++; console.log("  ❌ " + name + (extra ? " :: " + extra : "")); }
}

function run() {
  return new Promise(async (resolve) => {
    const ws = new WebSocket(WS_URL);
    const got = [];
    const timer = setTimeout(() => { ws.close(); resolve({ got }); }, 20000);

    ws.onopen = () => {
      console.log("WS 已连接", ROOM);
      ws.send(JSON.stringify({ name: NAME, token: TOKEN }));
    };
    ws.onmessage = (ev) => {
      let m = {};
      try { m = JSON.parse(ev.data); } catch (e) {}
      got.push(m);
      if (m.ready) {
        ws.send(JSON.stringify({ name: NAME, token: TOKEN, message: "v1.54 埋点端到端验证", channel: "general" }));
      }
      if (m.type === "message" || m.type === "text" || (m.name && m.message && m.message.indexOf("v1.54") !== -1)) {
        if (m.type === "message" || m.type === "text") { /* 广播 */ }
        setTimeout(() => { clearTimeout(timer); ws.close(); resolve({ got }); }, 800);
      }
    };
    ws.onerror = (e) => { console.log("WS 错误", e.message || e); };
  });
}

const { got } = await run();
console.log("== 1. WS join + 消息广播 ==");
assert(got.some(m => m.joined === NAME), "收到 joined 广播（join 成功）");
assert(got.some(m => m.ready === true), "收到 ready");
const ack = got.find(m => m.type === "message" || m.type === "text") || got.find(m => m.name === NAME && typeof m.message === "string");
assert(!!ack, "收到消息广播回执", JSON.stringify(got).slice(0, 300));

console.log("== 2. 房间 /stats 消息日桶（公开直连应被白名单 403 = 安全设计）==");
const st = await getStats();
const today = new Date().toISOString().slice(0, 10);
console.log("  /stats status:", st.status, "(403 = 不在 PUBLIC_ROOM_ENDPOINTS 白名单，仅内部聚合可达，符合设计)");
assert(st.status === 403, "/stats 公开直连被白名单拦截（403 安全设计）");

console.log("== 3. ops-stats 聚合（房间峰值 + 全局消息聚合）==");
await sleep(500);
const SECRET = (process.env.ADMIN_SECRET_KEY || "");
if (SECRET) {
  const r = await fetch(BASE + "/api/admin/ops-stats?key=" + SECRET);
  const d = await r.json();
  const room = (d.rooms || []).find(x => x.name === ROOM);
  console.log("  目标房间:", room ? JSON.stringify(room) : "未出现");
  assert(!!room, "ops-stats 含目标房间");
  assert(room && room.count >= 1, "房间 count >= 1");
  assert(room && room.peak >= 1, "房间 peak >= 1（峰值埋点生效）", "peak=" + (room && room.peak));
  assert(d.msgByDay && d.msgByDay[today] >= 1, "全局 msgByDay 含今天键 >= 1", "今日=" + (d.msgByDay && d.msgByDay[today]));
  assert(d.online >= 1, "全局 online >= 1");
} else {
  console.log("  跳过：未提供 ADMIN_SECRET_KEY 环境变量");
}

console.log("\n==== " + passed + " 通过 / " + failed + " 失败 ====");
process.exit(failed ? 1 : 0);
