// v1.56 内容沉淀：房间知识库文档 CRUD（WS {type:"doc", action, reqId, ...}）
// 持久化（混合式，规避 DO storage 单值 128KiB 上限）：
//   documents key  → 只存元数据数组 [{id,title,tags,createdBy,createdAt,updatedAt,updatedBy}]（恒小）
//   doc:<id> key   → 存完整 doc（content ≤20000 字 ≈ 60KB < 128KiB 安全）
// 权限：list/get 游客可读；create 需已登录；update/delete 作者本人 或 chat.admin.messageDelete（仿 relay-end）
// 广播：created/updated/deleted 只推元数据（不推正文），在线客户端据此刷新知识库列表
// @ts-check

const MAX_TITLE = 100;
const MAX_CONTENT = 20000;
const MAX_TAGS = 5;
const MAX_TAG_LEN = 20;
const MAX_DOCS = 200;

/** 提取文档元数据态（不含正文）。 @param {import("../types.js").Doc} d @returns {import("../types.js").Doc} */
function metaOf(d) {
  return {
    id: d.id,
    title: d.title,
    tags: d.tags || [],
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    updatedBy: d.updatedBy,
  };
}

async function persistMeta(room) {
  await room.storage.put("documents", JSON.stringify([...room.documents.values()].map(metaOf)));
}

async function persistDoc(room, doc) {
  await room.storage.put("doc:" + doc.id, JSON.stringify(doc));
  await persistMeta(room);
}

/**
 * 房间知识库文档 CRUD 处理入口（WS {type:"doc", action, reqId, ...}）。
 * 处理 list/get/create/update/delete 五个动作，各动作含权限校验，返回是否已消费该命令。
 * @param {any} room ChatRoom 实例（含 documents/storage/broadcast/hasPerm/containsProfanity 等）
 * @param {import("../types.js").WsSession} session 发起命令的 WS 会话
 * @param {import("../types.js").WsCommandData} data 入站命令数据
 * @param {any} webSocket 当前连接的 WebSocket
 * @returns {Promise<boolean>} 是否已处理该命令（true 表示已消费）
 */
export async function handleDoc(room, session, data, webSocket) {
  if (!data || data.type !== "doc") return false;
  if (room._loadDocuments) await room._loadDocuments;
  const send = (obj) => {
    try {
      webSocket.send(JSON.stringify(obj));
    } catch (e) {}
  };
  const act = data.action;

  // list：游客可读，返回元数据数组（不含正文）
  if (act === "list") {
    send({ type: "doc", action: "list", reqId: data.reqId, docs: [...room.documents.values()].map(metaOf) });
    return true;
  }

  // get：游客可读，按 id 返回完整文档（缺正文时补拉 doc:<id>）
  if (act === "get") {
    let d = room.documents.get(String(data.id || ""));
    if (d && !d.content) {
      const raw = await room.storage.get("doc:" + d.id);
      try {
        d = raw ? JSON.parse(raw) : null;
        if (d) room.documents.set(d.id, d);
      } catch (e) {
        d = null;
      }
    }
    if (!d) {
      send({ type: "doc", action: "get", reqId: data.reqId, ok: false, error: "文档不存在" });
      return true;
    }
    send({ type: "doc", action: "get", reqId: data.reqId, ok: true, doc: { ...metaOf(d), content: d.content || "" } });
    return true;
  }

  // create：需已登录
  if (act === "create") {
    if (!session.authenticated || !session.name) {
      send({ type: "doc", action: "create", reqId: data.reqId, ok: false, error: "请先登录后再创建文档" });
      return true;
    }
    const title = String(data.title || "").trim();
    const content = String(data.content || "");
    if (!title || !content.trim()) {
      send({ type: "doc", action: "create", reqId: data.reqId, ok: false, error: "标题和内容不能为空" });
      return true;
    }
    if (title.length > MAX_TITLE) {
      send({
        type: "doc",
        action: "create",
        reqId: data.reqId,
        ok: false,
        error: "标题过长（最多 " + MAX_TITLE + " 字）",
      });
      return true;
    }
    if (content.length > MAX_CONTENT) {
      send({
        type: "doc",
        action: "create",
        reqId: data.reqId,
        ok: false,
        error: "内容过长（最多 " + MAX_CONTENT + " 字）",
      });
      return true;
    }
    if (room.containsProfanity(title) || room.containsProfanity(content)) {
      send({ type: "doc", action: "create", reqId: data.reqId, ok: false, error: "内容包含违规词汇，已拦截" });
      return true;
    }
    if (room.documents.size >= MAX_DOCS) {
      send({
        type: "doc",
        action: "create",
        reqId: data.reqId,
        ok: false,
        error: "文档数量已达上限（" + MAX_DOCS + " 篇）",
      });
      return true;
    }
    const tags = Array.isArray(data.tags)
      ? data.tags
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, MAX_TAGS)
          .map((s) => s.slice(0, MAX_TAG_LEN))
      : [];
    const id = "doc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
    const now = Date.now();
    const doc = {
      id,
      title,
      content,
      tags,
      createdBy: session.name,
      createdAt: now,
      updatedAt: now,
      updatedBy: session.name,
    };
    room.documents.set(id, doc);
    await persistDoc(room, doc);
    const meta = metaOf(doc);
    room.broadcast({ type: "doc", action: "created", doc: meta });
    send({ type: "doc", action: "created", reqId: data.reqId, ok: true, doc: meta });
    return true;
  }

  // update：作者本人 或 管理员（chat.admin.messageDelete）
  if (act === "update") {
    const d = room.documents.get(String(data.id || ""));
    if (!d) {
      send({ type: "doc", action: "update", reqId: data.reqId, ok: false, error: "文档不存在" });
      return true;
    }
    const canEdit = d.createdBy === session.name || (await room.hasPerm(session, "chat.admin.messageDelete"));
    if (!canEdit) {
      send({ type: "doc", action: "update", reqId: data.reqId, ok: false, error: "无权限修改该文档" });
      return true;
    }
    if (data.title !== undefined) {
      const t = String(data.title).trim();
      if (!t || t.length > MAX_TITLE) {
        send({ type: "doc", action: "update", reqId: data.reqId, ok: false, error: "标题过长或为空" });
        return true;
      }
      d.title = t;
    }
    if (data.content !== undefined) {
      const c = String(data.content);
      if (!c.trim() || c.length > MAX_CONTENT) {
        send({
          type: "doc",
          action: "update",
          reqId: data.reqId,
          ok: false,
          error: "内容过长或为空（最多 " + MAX_CONTENT + " 字）",
        });
        return true;
      }
      if (room.containsProfanity(c)) {
        send({ type: "doc", action: "update", reqId: data.reqId, ok: false, error: "内容包含违规词汇，已拦截" });
        return true;
      }
      d.content = c;
    }
    if (data.tags !== undefined) {
      d.tags = Array.isArray(data.tags)
        ? data.tags
            .map(String)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, MAX_TAGS)
            .map((s) => s.slice(0, MAX_TAG_LEN))
        : [];
    }
    d.updatedAt = Date.now();
    d.updatedBy = session.name;
    await persistDoc(room, d);
    const meta = metaOf(d);
    room.broadcast({ type: "doc", action: "updated", doc: meta });
    send({ type: "doc", action: "updated", reqId: data.reqId, ok: true, doc: meta });
    return true;
  }

  // delete：作者本人 或 管理员
  if (act === "delete") {
    const d = room.documents.get(String(data.id || ""));
    if (!d) {
      send({ type: "doc", action: "delete", reqId: data.reqId, ok: false, error: "文档不存在" });
      return true;
    }
    const canDel = d.createdBy === session.name || (await room.hasPerm(session, "chat.admin.messageDelete"));
    if (!canDel) {
      send({ type: "doc", action: "delete", reqId: data.reqId, ok: false, error: "无权限删除该文档" });
      return true;
    }
    room.documents.delete(data.id);
    await room.storage.delete("doc:" + data.id);
    await persistMeta(room);
    room.broadcast({ type: "doc", action: "deleted", id: data.id });
    send({ type: "doc", action: "deleted", reqId: data.reqId, ok: true });
    return true;
  }

  return false;
}
