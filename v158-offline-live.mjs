// 📥 v1.58 离线消息线上冒烟：新房 → B上线→断开 → A发55条 → B重连
// 应收到：正常 backlog 最近50条 + 离线补发最早5条(offline:true) + marker count=5，且无重复 timestamp
// 用法：node v158-offline-live.mjs
import assert from "node:assert";

const BASE = "https://chat.liuxiyu.cn";
const WS = BASE.replace("https", "wss");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createRoom() {
  const r = await fetch(BASE + "/api/room", { method: "POST" });
  const id = (await r.text()).trim();
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("创建房间失败: " + id);
  return id;
}

function connect(room, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/api/room/${room}/websocket`);
    const frames = [];
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; reject(new Error("连接超时")); } }, 20000);
    ws.onopen = () => ws.send(JSON.stringify({ name }));
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      frames.push(d);
      if (d.ready === true && !done) {
        done = true; clearTimeout(timer);
        resolve({ frames, ws, close: () => { try { ws.close(); } catch (_) {} } });
      }
    };
    ws.onerror = () => { if (!done) { done = true; clearTimeout(timer); reject(new Error("ws error")); } };
  });
}

const room = await createRoom();
console.log("🏠 新房:", room.slice(0, 12) + "…");

const b1 = await connect(room, "v158b");
await sleep(300);
b1.close();
await sleep(800);

const a = await connect(room, "v158a");
await sleep(200);
for (let i = 1; i <= 55; i++) {
  a.ws.send(JSON.stringify({ message: "offline-" + i, channel: "general" }));
  await sleep(80);
}
await sleep(500);
a.close();
await sleep(500);

const b2 = await connect(room, "v158b");
await sleep(800);
b2.close();

const allMsgs = b2.frames.filter((f) => f.message && f.message.startsWith("offline-"));
const offline = allMsgs.filter((f) => f.offline === true);
const marker = b2.frames.find((f) => f.type === "offline-marker");
const tsAll = allMsgs.map((m) => m.timestamp);
const uniqueTs = new Set(tsAll);

console.log(`B 重连：消息 ${allMsgs.length} 条，其中离线补发 ${offline.length} 条，marker=${marker ? marker.count : "无"}`);
assert.strictEqual(allMsgs.length, 55, "应共收到 55 条消息（无重复）");
assert.strictEqual(uniqueTs.size, 55, "55 个 timestamp 全部唯一（无重复）");
assert.strictEqual(offline.length, 5, "离线补发应为最早 5 条");
assert.ok(marker && marker.count === 5, "marker count 应为 5");
assert.ok(offline.some((m) => m.message === "offline-1"), "含最早 offline-1");
assert.ok(offline.some((m) => m.message === "offline-5"), "含 offline-5");
assert.ok(!offline.some((m) => m.message === "offline-6"), "最新50条不应进离线补发");
console.log("✅ 线上离线消息冒烟通过：55条无重复，补发最早5条 + marker=5");
process.exit(0);
