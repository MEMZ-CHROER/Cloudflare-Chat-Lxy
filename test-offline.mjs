// 📥 v1.58 离线消息逻辑单测：deliverOfflineMessagesImpl / recordLastSeenImpl
// 关键行为：只补发「离线窗口内」且「不在最近50条 normal backlog」里的更早消息（避免重复显示）
// 用法：node test-offline.mjs
import assert from "node:assert";
import { deliverOfflineMessagesImpl, recordLastSeenImpl } from "./src/chatroom/offline.mjs";

/** 内存版 storage（近似 CF DO storage.list/get/put，list 默认升序、start 含端点；reverse 取字典序最大） */
function makeStorage(entries) {
  const map = new Map(entries);
  return {
    map,
    async get(k) { return map.get(k); },
    async put(k, v) { map.set(k, v); },
    async list({ start, limit, reverse }) {
      let keys = [...map.keys()].sort();
      if (reverse) keys = keys.reverse();
      if (start !== undefined) keys = keys.filter((k) => k >= start);
      const out = [];
      for (const k of keys) {
        out.push([k, map.get(k)]);
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}

function makeWs() {
  const sent = [];
  return { sent, send(f) { sent.push(JSON.parse(f)); } };
}

const T0 = 1700000000000;
const M = (i) => T0 + i * 10000;
const msg = (ts, over = {}) => JSON.stringify({ id: ts, name: "bob", message: "hello " + ts, channel: "general", timestamp: ts, ...over });

function run() {
  let pass = 0, fail = 0;
  function check(name, fn) {
    try { fn(); pass++; console.log("✅ " + name); }
    catch (e) { fail++; console.log("❌ " + name + " — " + e.message); }
  }

  check("55条离线：只补发最近50条之外的最早5条 + marker=5", async () => {
    const msgs = [];
    for (let i = 1; i <= 55; i++) msgs.push([new Date(M(i)).toISOString(), msg(M(i))]);
    const storage = makeStorage([["1:lastSeen:alice", T0], ...msgs, ["stat:msg:2026-08-11", 5]]);
    const room = { storage };
    const ws = makeWs();
    await deliverOfflineMessagesImpl(room, ws, { name: "alice", channel: "general" }, M(56));
    const offline = ws.sent.filter((f) => f.offline === true).map((m) => m.timestamp).sort((a, b) => a - b);
    assert.strictEqual(offline.length, 5, "应补发 5 条（最近50条之外的最早5条）");
    assert.deepStrictEqual(offline, [M(1), M(2), M(3), M(4), M(5)], "应为最早 5 条");
    const marker = ws.sent.find((f) => f.type === "offline-marker");
    assert.ok(marker, "应有 offline-marker");
    assert.strictEqual(marker.count, 5);
    assert.strictEqual(storage.map.get("1:lastSeen:alice"), M(56), "lastSeen 应更新");
  });

  check("消息在最近50条backlog内 → 不重复补发", async () => {
    const storage = makeStorage([
      ["1:lastSeen:alice", T0],
      [new Date(M(1)).toISOString(), msg(M(1))],
      [new Date(M(2)).toISOString(), msg(M(2), { _anonOwner: "anon:abc", fid: "f1" })],
      [new Date(M(3)).toISOString(), msg(M(3), { channel: "news" })], // 其他频道过滤
    ]);
    const ws = makeWs();
    await deliverOfflineMessagesImpl({ storage }, ws, { name: "alice", channel: "general" }, M(4));
    assert.strictEqual(ws.sent.filter((f) => f.offline === true).length, 0, "backlog 内的不补发");
    assert.strictEqual(ws.sent.find((f) => f.type === "offline-marker"), undefined, "无 marker");
    assert.strictEqual(storage.map.get("1:lastSeen:alice"), M(4), "lastSeen 仍更新");
  });

  check("60条离线含其他频道：只补发 general 且剔除敏感字段", async () => {
    const msgs = [];
    for (let i = 1; i <= 60; i++) msgs.push([new Date(M(i)).toISOString(), msg(M(i))]);
    msgs.push([new Date(M(70)).toISOString(), msg(M(70), { channel: "news" })]);
    const storage = makeStorage([["1:lastSeen:alice", T0], ...msgs]);
    const ws = makeWs();
    await deliverOfflineMessagesImpl({ storage }, ws, { name: "alice", channel: "general" }, M(71));
    const offline = ws.sent.filter((f) => f.offline === true);
    assert.strictEqual(offline.length, 10, "60条中最近50条剔除，补发最早10条");
    assert.ok(offline.every((m) => m.channel === "general"), "不含其他频道");
    assert.strictEqual(offline[0]._anonOwner, undefined, "剔除 _anonOwner");
    assert.strictEqual(offline[0].fid, undefined, "剔除 fid");
    assert.strictEqual(ws.sent.find((f) => f.type === "offline-marker").count, 10);
  });

  check("首次上线（无 lastSeen）不补发只记录", async () => {
    const storage = makeStorage([[new Date(M(1)).toISOString(), msg(M(1))]]);
    const ws = makeWs();
    await deliverOfflineMessagesImpl({ storage }, ws, { name: "alice", channel: "general" }, M(1));
    assert.strictEqual(ws.sent.filter((f) => f.offline === true).length, 0, "首次无历史不补发");
    assert.strictEqual(storage.map.get("1:lastSeen:alice"), M(1), "仍记录 lastSeen");
  });

  check("recordLastSeen 空名不写", async () => {
    const storage = makeStorage([]);
    await recordLastSeenImpl({ storage }, "", 123);
    assert.strictEqual(storage.map.size, 0);
  });

  console.log(`\n${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

run();
