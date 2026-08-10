// v1.57 拆分：定时消息（schedule create/cancel + alarm 投递）搬移至此
// 原 chatroom.mjs 650-730（create/cancel）+ 1361-1433（alarm）
// 范式：handleSchedule(room, session, data, webSocket) 返回 true=已处理；runScheduledMessages(room) 供类 alarm() 委托
// 依赖 room.*：storage/_loadScheduled/_loadChannels/scheduledMessages/channels/getMaxMsgLen/containsProfanity/hasPerm/isAdminSession/lastTimestamp/msgCounter/broadcastToChannel/state.storage.setAlarm

// WS 命令：创建/取消定时消息
export async function handleSchedule(room, session, data, webSocket) {
  if (data.type === "schedule") {
    if (room._loadScheduled) await room._loadScheduled;
    let schedMsg = "" + data.message;
    let schedTime = parseInt(data.time, 10);
    if (!schedMsg || !schedTime || schedTime <= Date.now()) {
      webSocket.send(JSON.stringify({error: "定时时间必须在未来"}));
      return true;
    }
    if (schedTime > Date.now() + 7 * 24 * 3600 * 1000) {
      webSocket.send(JSON.stringify({error: "定时时间不能超过7天"}));
      return true;
    }
    let maxLen = room.getMaxMsgLen(session);
    if (schedMsg.length > maxLen) {
      webSocket.send(JSON.stringify({error: "消息过长"}));
      return true;
    }
    // 🔒 安全修复（W7）：定时消息同样过敏感词过滤，防绕过审查定时广播违规内容
    if (room.containsProfanity(schedMsg)) {
      webSocket.send(JSON.stringify({error: "定时消息包含违规词汇，已拦截"}));
      return true;
    }
    if (!room.scheduledMessages) room.scheduledMessages = [];
    // 🔒 安全修复（LD17）：定时消息数量上限（每用户5条、房间50条），防整数组重写 storage 造成 O(n²) 存储/CPU DoS
    let myCount = room.scheduledMessages.filter(s => s.name === session.name).length;
    if (myCount >= 5) {
      webSocket.send(JSON.stringify({error: "你最多可创建5条定时消息，请先取消旧的"}));
      return true;
    }
    if (room.scheduledMessages.length >= 50) {
      webSocket.send(JSON.stringify({error: "房间定时消息已达上限（50条）"}));
      return true;
    }
    // 🔒 安全修复（v1.34）：公告频道仅管理员可发定时消息（防游客 switch-channel 到 announcement 再 schedule 绕过公告只读检查）
    if (room._loadChannels) await room._loadChannels;
    let schedChanName = session.channel || "general";
    let schedChanObj = room.channels.find(c => c.name === schedChanName);
    if (schedChanObj && schedChanObj.type === "announcement" && !(await room.hasPerm(session, "chat.admin.announcement"))) {
      webSocket.send(JSON.stringify({error: "公告频道仅管理员可发"}));
      return true;
    }
    let schedEntry = {
      id: "sched_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      name: session.name,
      message: schedMsg,
      time: schedTime,
      createdAt: Date.now(),
      channel: session.channel || "general",
      admin: room.isAdminSession(session),
      tag: session.tag || "",
      tagColor: session.tagColor || "",
      tagBorder: session.tagBorder || ""
    };
    room.scheduledMessages.push(schedEntry);
    await room.storage.put("scheduledMessages", room.scheduledMessages);
    let nearest = Math.min(...room.scheduledMessages.map(s => s.time));
    await room.state.storage.setAlarm(nearest);
    webSocket.send(JSON.stringify({type: "schedule-confirm", id: schedEntry.id, time: schedTime}));
    return true;
  }

  if (data.type === "schedule-cancel") {
    let cancelId = data.id;
    if (!cancelId) { webSocket.send(JSON.stringify({error: "缺少定时消息ID"})); return true; }
    if (room._loadScheduled) await room._loadScheduled;
    let sched = (room.scheduledMessages || []).find(s => s.id === cancelId);
    if (!sched) { webSocket.send(JSON.stringify({error: "定时消息不存在"})); return true; }
    // 🔒 安全修复（W6）：只能取消自己创建的定时消息（管理员可取消任意）
    if (sched.name !== session.name && !(await room.hasPerm(session, "chat.admin.messageDelete"))) {
      webSocket.send(JSON.stringify({error: "只能取消自己创建的定时消息"}));
      return true;
    }
    room.scheduledMessages = (room.scheduledMessages || []).filter(s => s.id !== cancelId);
    await room.storage.put("scheduledMessages", room.scheduledMessages);
    if (room.scheduledMessages.length > 0) {
      let nearest = Math.min(...room.scheduledMessages.map(s => s.time));
      await room.state.storage.setAlarm(nearest);
    }
    webSocket.send(JSON.stringify({type: "schedule-cancel-confirm", id: cancelId}));
    return true;
  }

  return false;
}

// alarm 投递：到点发送定时消息并重设下一闹钟（供 ChatRoom.alarm() 委托）
export async function runScheduledMessages(room) {
  if (room._loadScheduled) await room._loadScheduled;
  if (room._loadChannels) await room._loadChannels;
  let now = Date.now();
  let toSend = room.scheduledMessages.filter(s => s.time <= now);
  room.scheduledMessages = room.scheduledMessages.filter(s => s.time > now);
  for (let s of toSend) {
    // 🔒 安全修复（v1.34）：公告频道定时消息仅管理员来源可投递（防御旧数据/绕过 schedule 创建校验）
    let schedChanObj = room.channels.find(c => c.name === (s.channel || "general"));
    if (schedChanObj && schedChanObj.type === "announcement" && !s.admin) continue;
    let data = {
      name: s.name,
      message: s.message,
      timestamp: Math.max(Date.now(), room.lastTimestamp + 1),
      channel: s.channel || "general",
      tag: s.tag || "",
      tagColor: s.tagColor || "",
      tagBorder: s.tagBorder || ""
    };
    data.id = ++room.msgCounter;
    room.lastTimestamp = data.timestamp;
    let dataStr = JSON.stringify(data);
    room.broadcastToChannel(s.channel || "general", dataStr);
    let key = new Date(data.timestamp).toISOString();
    await room.storage.put(key, dataStr);
  }
  await room.storage.put("scheduledMessages", room.scheduledMessages);
  if (room.scheduledMessages.length > 0) {
    let nextTime = Math.min(...room.scheduledMessages.map(s => s.time));
    await room.state.storage.setAlarm(nextTime);
  }
}
