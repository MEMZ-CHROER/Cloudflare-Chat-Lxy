// v1.58 离线消息：用户离线期间该房间错过的消息，重新上线后补发（标记 offline:true）
// 范式：deliverOfflineMessagesImpl(room, webSocket, session, now) 上线补发；recordLastSeenImpl(room, name, now) 记录最近在线时间
// lastSeen 存储 key 用 "1:" 前缀：字典序早于 ISO 时间戳（"2026-..." 以 "2" 开头），
// 不会污染 conn.mjs backlog 的 reverse-limit 150 窗口（该窗口取字典序最大的 key）。
import { stripSensitiveMsg } from "./manage.mjs";

const LS_PREFIX = "1:lastSeen:";
const MAX_OFFLINE = 200;

/** 记录用户最近在线时间（join 与 close 各写一次，close 保证离线窗口只覆盖真实离线时段） */
export async function recordLastSeenImpl(room, name, now) {
  if (!name) return;
  try {
    await room.storage.put(LS_PREFIX + name, now);
  } catch (e) {}
}

/**
 * 上线补发离线消息：
 * 1) 读上次 lastSeen（上次 close/join 时间）
 * 2) 先把 lastSeen 更新为 now（此后消息算"在线看到"，下次不再重复补发）
 * 3) 拉取 lastSeen 之后、当前频道的消息，剔除「正常 backlog 会推的最近 50 条」，
 *    其余逐条补发（offline:true），最后发 offline-marker 计数 —— 避免与 backlog 重复显示
 * @param {any} room 房间 DO
 * @param {any} webSocket WS
 * @param {{name?:string, channel?:string}} session 已命名会话
 * @param {number} now 当前时间戳
 * @returns {Promise<void>}
 */
export async function deliverOfflineMessagesImpl(room, webSocket, session, now) {
  const name = session.name;
  if (!name) return;
  let lastSeen = 0;
  try {
    lastSeen = Number(await room.storage.get(LS_PREFIX + name)) || 0;
  } catch (e) {}
  await recordLastSeenImpl(room, name, now);
  if (lastSeen <= 0) return;

  const startKey = new Date(lastSeen).toISOString();
  let entries = [];
  try {
    entries = await room.storage.list({ start: startKey, limit: MAX_OFFLINE });
  } catch (e) {
    return;
  }

  // 本次入房正常 backlog 会推最近 50 条频道消息（conn.mjs），离线补发须剔除，避免重复显示
  const backlogTs = new Set();
  try {
    const recent = await room.storage.list({ reverse: true, limit: 150 });
    for (const [, value] of recent) {
      try {
        const m = JSON.parse(value);
        if (m && typeof m === "object" && m.timestamp !== undefined && (m.channel || "general") === session.channel) {
          backlogTs.add(Number(m.timestamp));
          if (backlogTs.size >= 50) break;
        }
      } catch (e) {}
    }
  } catch (e) {}

  const offline = [];
  for (const [, value] of entries) {
    try {
      const m = JSON.parse(value);
      if (!m || typeof m !== "object" || m.timestamp === undefined) continue;
      if ((m.channel || "general") !== session.channel) continue;
      const ts = Number(m.timestamp) || 0;
      if (ts <= lastSeen) continue;
      if (backlogTs.has(ts)) continue; // 已在 normal backlog，不重复补发
      offline.push(JSON.stringify({ ...stripSensitiveMsg(m), offline: true }));
    } catch (e) {}
    if (offline.length >= MAX_OFFLINE) break;
  }

  for (const f of offline) webSocket.send(f);
  if (offline.length > 0) {
    webSocket.send(JSON.stringify({ type: "offline-marker", count: offline.length }));
  }
}
