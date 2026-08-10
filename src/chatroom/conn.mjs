// v1.57 拆分：WS 连接生命周期（handleSession 入房 backlog + close/error 清理）搬移至此
// 原 chatroom.mjs 210-333（handleSession）+ 1220-1236（close 三兄弟）
// 范式：handleSessionImpl(room, webSocket, ip)；类上 handleSession/webSocketClose/webSocketError 委托
// 依赖 room.*：storage/sessions/announcement/pinnedMessages/polls/highlights/reactions/relays/documents/channels/levelStyles/updateRegistry/destroyed/_loadX
import { stripSensitiveMsg } from "./manage.mjs";

export async function handleSessionImpl(room, webSocket, ip) {
  // 房间已销毁，拒绝新连接（reason 用 destroyed，前端识别后跳首页避免无限重连）
  if (room._loadDestroyed) await room._loadDestroyed;
  if (room.destroyed) {
    webSocket.close(1000, "destroyed");
    return;
  }
  room.state.acceptWebSocket(webSocket);

  room.connCounter++;
  let connId = room.connCounter;
  let session = { blockedMessages: [], ip, connId, channel: "general" };
  webSocket.serializeAttachment({ ...webSocket.deserializeAttachment(), ip, connId, channel: "general" });
  room.sessions.set(webSocket, session);

  for (let otherSession of room.sessions.values()) {
    if (otherSession.name) {
      let msg = {joined: otherSession.name};
      if (otherSession.tag) msg.tag = otherSession.tag;
      if (otherSession.tagColor) msg.tagColor = otherSession.tagColor;
      if (otherSession.tagBorder) msg.tagBorder = otherSession.tagBorder;
      if (otherSession.vip) msg.vip = otherSession.vip;
      session.blockedMessages.push(JSON.stringify(msg));
    }
  }

  // 频道体系：加入时只拉当前频道（general）的最近消息，按 channel 过滤
  let storage = await room.storage.list({reverse: true, limit: 150});
  let backlog = [...storage.values()];
  backlog.reverse();
  let chBacklog = [];
  for (let value of backlog) {
    try {
      let m = JSON.parse(value);
      // 🔒 安全修复（v1.34）：backlog 推送前剔除 _anonOwner/fid，防匿名身份哈希经历史回放泄漏
      if ((m.channel || "general") === session.channel) chBacklog.push(JSON.stringify(stripSensitiveMsg(m)));
    } catch (e) {}
    if (chBacklog.length >= 50) break;
  }
  chBacklog.forEach(value => {
    session.blockedMessages.push(value);
  });

  if (room._loadAnnouncement) await room._loadAnnouncement;
  if (room.announcement) {
    session.blockedMessages.push(JSON.stringify({type: "announcement", text: room.announcement}));
  }

  // 📌 置顶消息（v1.35）：加入时推送当前频道置顶列表（数组，可能为空）
  if (room._loadPinnedMessages) await room._loadPinnedMessages;
  session.blockedMessages.push(JSON.stringify({
    type: "pinned", channel: session.channel,
    pinned: (room.pinnedMessages && room.pinnedMessages[session.channel]) || []
  }));

  if (room._loadPolls) await room._loadPolls;
  if (room.polls && room.polls.size > 0) {
    for (let [pollId, poll] of room.polls) {
      session.blockedMessages.push(JSON.stringify({
        type: "poll",
        pollId: pollId,
        question: poll.question,
        options: poll.options.map(o => ({index: o.index, text: o.text})),
        creator: poll.creator,
        timestamp: poll.timestamp
      }));
    }
  }

  if (room._loadHighlights) await room._loadHighlights;
  if (room.highlights && room.highlights.length > 0) {
    session.blockedMessages.push(JSON.stringify({type: "highlights-update", highlights: room.highlights}));
  }

  if (room._loadReactions) await room._loadReactions;
  if (room.reactions && Object.keys(room.reactions).length > 0) {
    for (let [rKey, rData] of Object.entries(room.reactions)) {
      if (Object.keys(rData).length > 0) {
        session.blockedMessages.push(JSON.stringify({type: "reaction-update", msgTimestamp: rKey, reactions: rData}));
      }
    }
  }

  if (room._loadRelays) await room._loadRelays;
  if (room.relays && room.relays.size > 0) {
    for (let [, relay] of room.relays) {
      if (relay.active) {
        session.blockedMessages.push(JSON.stringify({
          type: "relay-new", relayId: relay.id, topic: relay.topic,
          startedBy: relay.startedBy, startedAt: relay.startedAt
        }));
        relay.entries.forEach(entry => {
          session.blockedMessages.push(JSON.stringify({
            type: "relay-update", relayId: relay.id, entry, totalCount: relay.entries.length
          }));
        });
      }
    }
  }

  // v1.56 房间知识库：入房推送文档元数据列表（游客也可读）
  if (room._loadDocuments) await room._loadDocuments;
  if (room.documents && room.documents.size > 0) {
    session.blockedMessages.push(JSON.stringify({
      type: "doc", action: "list",
      docs: [...room.documents.values()].map(d => ({
        id: d.id, title: d.title, tags: d.tags || [],
        createdBy: d.createdBy, createdAt: d.createdAt,
        updatedAt: d.updatedAt, updatedBy: d.updatedBy
      }))
    }));
  }

  if (room._loadChannels) await room._loadChannels;
  session.blockedMessages.push(JSON.stringify({type: "channels", channels: room.channels}));

  // 🏅 房间等级样式：加入时推送当前配置（前端据此渲染各等级徽章）
  if (room._loadLevelStyles) await room._loadLevelStyles;
  if (room.levelStyles && Object.keys(room.levelStyles).length > 0) {
    session.blockedMessages.push(JSON.stringify({type: "level-styles", styles: room.levelStyles}));
  }

  room.updateRegistry();
}

// 连接关闭/错误统一清理：标记退出、广播 quit、更新注册表
export async function handleWsCloseImpl(room, webSocket) {
  let session = room.sessions.get(webSocket) || {};
  session.quit = true;
  room.sessions.delete(webSocket);
  if (session.name) {
    room.broadcast({quit: session.name});
  }
  room.updateRegistry();
}
