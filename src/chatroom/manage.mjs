// 管理类消息处理（pin/edit/highlight/effect/get-scheduled）— 从 chatroom.mjs 提取

// 🔒 安全修复（v1.34）：对外输出消息前剔除敏感字段——_anonOwner（真实身份哈希，防反推匿名者）与
// fid（文件存储标识）。其余字段全部保留（勿用白名单，防止破坏 redpacket/gh-card 等消息类型）。
export function stripSensitiveMsg(msg) {
  if (!msg || typeof msg !== "object") return msg;
  const m = { ...msg };
  delete m._anonOwner;
  delete m.fid;
  return m;
}

export async function handleManage(room, session, data, webSocket) {
  // ====== 频道体系：切换频道 ======
  if (data.type === "switch-channel") {
    if (room._loadChannels) await room._loadChannels; // 确保频道列表已加载（防 DO 重启后丢失）
    let target = "" + (data.channel || "");
    if (!room.channels || !room.channels.some(c => c.name === target)) {
      webSocket.send(JSON.stringify({error: "频道不存在"}));
      return true;
    }
    session.channel = target;
    try { webSocket.serializeAttachment({ ...webSocket.deserializeAttachment(), channel: target }); } catch (e) {}
    // 读该频道最近消息
    let entries = await room.storage.list({reverse: true, limit: 150});
    let msgs = [];
    for (let val of [...entries.values()]) {
      try {
        let m = JSON.parse(val);
        if ((m.channel || "general") === target) {
          // 🔒 安全修复（v1.34）：频道历史同样剔除 _anonOwner/fid，防匿名身份哈希经切换频道泄漏
          msgs.push(stripSensitiveMsg(m));
          if (msgs.length >= 50) break;
        }
      } catch (e) {}
    }
    msgs.reverse();
    // 📌 置顶消息（v1.35）：切频道时附带该频道置顶列表，前端立即渲染无需等待广播
    if (room._loadPinnedMessages) await room._loadPinnedMessages;
    let pinned = (room.pinnedMessages && room.pinnedMessages[target]) || [];
    webSocket.send(JSON.stringify({type: "channel-history", channel: target, messages: msgs, channels: room.channels, pinned}));
    return true;
  }

  // ====== 频道体系：管理员增删频道 ======
  if (data.type === "channel") {
    if (room._loadChannels) await room._loadChannels; // 确保频道列表已加载
    let action = data.action;
    let name = "" + (data.name || "");
    // 🧪 v1.49 LP：chat.admin.channel（管理员标签或授权均可）
    if (!(await room.hasPerm(session, "chat.admin.channel"))) {
      webSocket.send(JSON.stringify({error: "仅管理员可管理频道"}));
      return true;
    }
    if (!/^[a-zA-Z0-9_-]{1,24}$/.test(name)) {
      webSocket.send(JSON.stringify({error: "频道名仅限字母数字下划线连字符，1-24位"}));
      return true;
    }
    if (action === "add") {
      if (room.channels.length >= 20) { webSocket.send(JSON.stringify({error: "频道数量已达上限(20)"})); return true; }
      if (room.channels.some(c => c.name === name)) { webSocket.send(JSON.stringify({error: "频道已存在"})); return true; }
      room.channels.push({name, type: "text"});
      await room.storage.put("channels", room.channels);
      room.broadcast({type: "channels", channels: room.channels, action: "add", name});
      webSocket.send(JSON.stringify({ok: true, system: "频道 #" + name + " 已创建"}));
    } else if (action === "remove") {
      if (name === "general") { webSocket.send(JSON.stringify({error: "不能删除默认频道 general"})); return true; }
      if (!room.channels.some(c => c.name === name)) { webSocket.send(JSON.stringify({error: "频道不存在"})); return true; }
      room.channels = room.channels.filter(c => c.name !== name);
      // 该频道会话迁回 general
      room.sessions.forEach((s, ws) => {
        if (s.channel === name) {
          s.channel = "general";
          try { ws.serializeAttachment({ ...ws.deserializeAttachment(), channel: "general" }); } catch (e) {}
        }
      });
      await room.storage.put("channels", room.channels);
      room.broadcast({type: "channels", channels: room.channels, action: "remove", name});
      webSocket.send(JSON.stringify({ok: true, system: "频道 #" + name + " 已删除"}));
    }
    return true;
  }

  if (data.type === "pin") {
    // 🔒 安全修复：置顶是管理员功能，普通用户禁止
    // 🧪 v1.49 LP：chat.admin.pinMessage（管理员标签或授权均可）
    if (!(await room.hasPerm(session, "chat.admin.pinMessage"))) {
      webSocket.send(JSON.stringify({error: "仅管理员可置顶消息"}));
      return true;
    }
    let pinChannel = session.channel || "general";
    if (data.unpin) {
      // 取消置顶（v1.35 按频道 + timestamp 指定清除）
      let unpinTs = parseInt(data.timestamp, 10);
      if (!unpinTs) {
        webSocket.send(JSON.stringify({error: "置顶参数错误"}));
        return true;
      }
      await room.removePinnedMessage(pinChannel, unpinTs);
      return true;
    }
    if (!data.text || !data.timestamp) {
      webSocket.send(JSON.stringify({error: "置顶参数错误"}));
      return true;
    }
    // v1.35：置顶快照按 session 当前频道存储（addPinnedMessage 内部持久化 + 按频道广播）
    await room.addPinnedMessage(pinChannel, {
      name: session.name,
      text: "" + data.text,
      timestamp: parseInt(data.timestamp, 10),
      tag: session.tag || "", tagColor: session.tagColor || "", tagBorder: session.tagBorder || "",
      channel: pinChannel, pinnedBy: session.name, pinnedAt: Date.now()
    });
    return true;
  }

  if (data.type === "edit") {
    let editId = parseInt(data.id, 10);
    let editMessage = "" + (data.message || "");
    if (!editId || !editMessage) {
      webSocket.send(JSON.stringify({error: "编辑参数错误"}));
      return true;
    }
    let orig = room.messages.get(editId);
    if (!orig) {
      webSocket.send(JSON.stringify({error: "消息不存在或已过期"}));
      return true;
    }
    // 🔒 安全修复（L6）：delete 不回写 room.messages，删除后同 id edit 会把原文写回 storage 复活消息。
    // 编辑前校验 storage 中该消息未被标记 deleted/recalled，已删除/撤回则拒绝编辑。
    try {
      let storageKeyCheck = new Date(orig.timestamp).toISOString();
      let storageRaw = await room.storage.get(storageKeyCheck);
      if (storageRaw) {
        let stored;
        try { stored = JSON.parse(storageRaw); } catch (e) { stored = null; }
        if (stored && (stored.type === "deleted" || stored.type === "recalled")) {
          webSocket.send(JSON.stringify({error: "消息已被删除或撤回，无法编辑"}));
          return true;
        }
      }
    } catch (e) {}
    if (orig.name !== session.name) {
      webSocket.send(JSON.stringify({error: "只能编辑自己的消息"}));
      return true;
    }
    if (Date.now() - orig.timestamp > 120000) {
      webSocket.send(JSON.stringify({error: "超过2分钟无法编辑"}));
      return true;
    }
    let maxMsgLen = (session.vip && session.vip.features ? session.vip.features.maxMsgLen : 256);
    if (editMessage.length > maxMsgLen) {
      webSocket.send(JSON.stringify({error: "消息过长"}));
      return true;
    }
    // 🔒 安全修复：编辑后的内容同样过敏感词检查，防绕过敏感词发布违规内容
    if (room.containsProfanity(editMessage)) {
      webSocket.send(JSON.stringify({error: "编辑内容包含违规词汇，已拦截"}));
      return true;
    }
    orig.message = editMessage;
    room.messages.set(editId, orig);
    let storageKey = new Date(orig.timestamp).toISOString();
    try { await room.storage.put(storageKey, JSON.stringify(orig)); } catch (e) {}
    room.broadcast({type: "edit", id: editId, message: editMessage, name: session.name, timestamp: orig.timestamp});
    return true;
  }

  if (data.type === "get-scheduled") {
    if (room._loadScheduled) await room._loadScheduled;
    // 🔒 安全修复（W6）：非管理员只能查看自己创建的定时消息，防窥探他人定时内容
    // 🧪 v1.49 LP：chat.admin.viewMessages（管理员标签或授权均可）
    let isAdmin = await room.hasPerm(session, "chat.admin.viewMessages");
    let list = (room.scheduledMessages || [])
      .filter(s => isAdmin || s.name === session.name)
      .map(s => ({id: s.id, name: s.name, message: s.message.slice(0, 80), time: s.time, createdAt: s.createdAt}));
    webSocket.send(JSON.stringify({type: "scheduled-list", list}));
    return true;
  }

  if (data.type === "highlight") {
    // 🔒 安全修复：增删精华是管理员功能，普通用户禁止
    // 🧪 v1.49 LP：chat.admin.highlight（管理员标签或授权均可）
    if (!(await room.hasPerm(session, "chat.admin.highlight"))) {
      webSocket.send(JSON.stringify({error: "仅管理员可操作精华消息"}));
      return true;
    }
    let hKey = data.msgTimestamp;
    let hText = data.text || "";
    if (!hKey) { webSocket.send(JSON.stringify({error: "缺少参数"})); return true; }
    if (!room.highlights) room.highlights = [];
    let existing = room.highlights.findIndex(h => h.timestamp == hKey);
    if (existing >= 0) {
      room.highlights.splice(existing, 1);
    } else {
      room.highlights.push({timestamp: parseInt(hKey), text: hText.slice(0, 100), name: session.name, by: session.name, time: Date.now()});
    }
    await room.storage.put("highlights", JSON.stringify(room.highlights));
    room.broadcast({type: "highlights-update", highlights: room.highlights});
    return true;
  }

  if (data.type === "effect") {
    // v1.39 临时移除限频（用户初期测试）。若需防刷屏，可恢复原限频块：
    //   if (!room.lastEffect) room.lastEffect = new Map();
    //   let last = room.lastEffect.get(session.name) || 0;
    //   if (Date.now() - last < 10000) { webSocket.send(JSON.stringify({error: "特效触发太频繁"})); return true; }
    //   room.lastEffect.set(session.name, Date.now());
    room.broadcast(JSON.stringify({type: "effect", effect: data.effect}));
    return true;
  }

  return false;
}
