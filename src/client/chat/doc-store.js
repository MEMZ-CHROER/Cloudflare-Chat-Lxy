// v1.56 内容沉淀：房间知识库前端数据层（WS 事件路由 + 请求/响应 reqId 关联）
// @ts-check
// v1.57 代码质量 B 层：JSDoc 类型注释（send/applyServerEvent/getDocs/onChange）
// 职责：send(action, payload) 发请求并 Promise 化；applyServerEvent(data) 处理 WS 广播/响应；
//      维护本地 docs[]（元数据）+ bodyCache（id→完整文档）+ onChange 订阅（kb.js 用）
import { state, t } from "./state.js";

/** @type {import("../../types.js").Doc[]} 元数据列表（list/created/updated 维护） */
let docs = [];
/** @type {Map<string, import("../../types.js").Doc>} id -> 完整 doc（含 content） */
const bodyCache = new Map();
let seq = 0;
/** @type {Map<string, {resolve: (value: object) => void, reject: (reason?: Error) => void}>} reqId -> Promise 的 resolve/reject（send/applyServerEvent 配对） */
const pending = new Map();
/** @type {Set<() => void>} 文档列表变化订阅者 */
const listeners = new Set();

/** 获取当前知识库元数据列表 @returns {import("../../types.js").Doc[]} */
export const getDocs = () => docs;
/** 按 id 获取完整文档（含 content） @param {string} id @returns {import("../../types.js").Doc|undefined} */
export const getCached = (id) => bodyCache.get(id);
/**
 * 订阅文档列表变化
 * @param {() => void} cb 变化回调
 * @returns {() => void} 取消订阅函数
 */
export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit() {
  listeners.forEach((f) => {
    try {
      f();
    } catch (e) {}
  });
}

/**
 * 发送知识库请求（WS）并 Promise 化，8s 超时
 * @param {string} action 动作（list/get/create/update/delete）
 * @param {object} [payload] 附加字段
 * @returns {Promise<object>} 服务端响应（applyServerEvent resolve 的数据）
 */
export function send(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!state.currentWebSocket) return reject(new Error(t("未连接到聊天室")));
    const reqId = "r" + ++seq + "_" + Date.now();
    pending.set(reqId, { resolve, reject });
    try {
      state.currentWebSocket.send(JSON.stringify({ type: "doc", action, reqId, ...payload }));
    } catch (e) {
      pending.delete(reqId);
      return reject(e);
    }
    setTimeout(() => {
      if (pending.has(reqId)) {
        pending.delete(reqId);
        reject(new Error(t("请求超时")));
      }
    }, 8000);
  });
}

/** 合并文档到 docs[]（按 id upsert） @param {import("../../types.js").Doc} d */
function upsert(d) {
  if (!d) return;
  const i = docs.findIndex((x) => x.id === d.id);
  if (i >= 0) docs[i] = { ...docs[i], ...d };
  else docs.push(d);
}

// WS 事件入口：websocket.js 收到 data.type === "doc" 时调用
/**
 * 处理 WS 知识库事件（websocket.js 在 data.type === "doc" 时调用）
 * @param {import("../../types.js").WsCommandData} data WS 入站命令（doc 相关）
 * @returns {void}
 */
export function applyServerEvent(data) {
  if (!data) return;
  // 请求响应（带 reqId）：resolve/reject 后按 action 维护本地状态
  if (data.reqId && pending.has(data.reqId)) {
    const p = pending.get(data.reqId);
    pending.delete(data.reqId);
    if (data.ok) p.resolve(data);
    else p.reject(new Error(data.error || t("操作失败")));
    if (data.action === "created" && data.doc) upsert(data.doc);
    if (data.action === "updated" && data.doc) {
      upsert(data.doc);
      bodyCache.delete(data.doc.id);
    }
    emit();
    return;
  }
  // 服务器广播（入房 list / 他人 created/updated/deleted）
  if (data.action === "list") docs = Array.isArray(data.docs) ? data.docs : [];
  else if (data.action === "created" || data.action === "updated") {
    upsert(data.doc);
    if (data.action === "updated") bodyCache.delete(data.doc.id);
  } else if (data.action === "deleted") {
    docs = docs.filter((d) => d.id !== data.id);
    bodyCache.delete(String(data.id));
  }
  emit();
}
