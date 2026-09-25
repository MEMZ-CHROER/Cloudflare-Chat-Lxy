// v1.57 拆分：ChatRoom 的互动型 WS 命令（投票 poll / 接龙 relay / 表情 reaction / 红包 redpacket）搬移至此
// 原 chatroom.mjs webSocketMessage 内 645-1092 行（schedule 定时消息在 schedule.mjs）
// 范式：handleActivity(room, session, data, webSocket) 返回 true = 已处理（短路），false = 放过
// 依赖 room.*：storage/polls/relays/reactions/redpacketChannels/broadcast/broadcastToChannel/containsProfanity/msgCounter/lastTimestamp/env.registry/roomName

export async function handleActivity(room, session, data, webSocket) {
  if (data.type === "poll-create") {
    if (room._loadPolls) await room._loadPolls;
    // 🔒 安全修复（W12）：清理超过24小时的过期轮询，防 polls 永久堆积
    let cutoff = Date.now() - 24 * 3600 * 1000;
    for (let [pid, p] of room.polls) {
      if (p.timestamp < cutoff) room.polls.delete(pid);
    }
    // 🔒 安全修复（W12）：创建限频（每用户10秒1个），防刷屏创建投票
    if (!room.lastPollCreate) room.lastPollCreate = new Map();
    let lastPC = room.lastPollCreate.get(session.name) || 0;
    if (Date.now() - lastPC < 10000) {
      webSocket.send(JSON.stringify({error: "创建投票太频繁，请稍后再试"}));
      return true;
    }
    room.lastPollCreate.set(session.name, Date.now());
    let question = "" + data.question;
    let options = data.options;
    if (!question || !Array.isArray(options) || options.length < 2 || options.length > 10) {
      webSocket.send(JSON.stringify({error: "投票需要2-10个选项"}));
      return true;
    }
    if (question.length > 200) {
      webSocket.send(JSON.stringify({error: "问题过长"}));
      return true;
    }
    // 🔒 安全修复（W12）：单选项长度限制（防超长选项撑爆存储）
    for (let opt of options) {
      if (("" + opt).length > 100) {
        webSocket.send(JSON.stringify({error: "选项过长（最多100字）"}));
        return true;
      }
    }
    // 🔒 安全修复（W7）：投票问题与选项过敏感词过滤，防绕过审查
    if (room.containsProfanity(question)) {
      webSocket.send(JSON.stringify({error: "投票问题包含违规词汇，已拦截"}));
      return true;
    }
    for (let opt of options) {
      if (room.containsProfanity("" + opt)) {
        webSocket.send(JSON.stringify({error: "投票选项包含违规词汇，已拦截"}));
        return true;
      }
    }
    let pollId = "poll_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    let poll = {
      id: pollId,
      question: question,
      options: options.map((text, i) => ({index: i, text: "" + text, votes: []})),
      creator: session.name,
      timestamp: Math.max(Date.now(), room.lastTimestamp + 1),
      voters: {},
      channel: data.channel || session.channel || "general"
    };
    room.polls.set(pollId, poll);
    await room.storage.put("polls", [...room.polls]);
    room.broadcastToChannel(poll.channel, {
      type: "poll",
      pollId: pollId,
      question: question,
      options: options.map((text, i) => ({index: i, text: "" + text})),
      creator: session.name,
      timestamp: poll.timestamp,
      channel: poll.channel
    });
    return true;
  }

  if (data.type === "poll-vote") {
    let pollId = data.pollId;
    let optionIndex = parseInt(data.optionIndex, 10);
    if (!pollId || isNaN(optionIndex)) {
      webSocket.send(JSON.stringify({error: "投票参数错误"}));
      return true;
    }
    if (room._loadPolls) await room._loadPolls;
    let poll = room.polls.get(pollId);
    if (!poll) {
      webSocket.send(JSON.stringify({error: "投票不存在"}));
      return true;
    }
    // 🔒 安全修复（v1.34）：投票仅限已登录用户（防游客换名换IP刷票，已注册用户按 name 去重 + votedIps 辅助）
    if (!session.authenticated) {
      webSocket.send(JSON.stringify({error: "请先登录后再投票"}));
      return true;
    }
    if (poll.voters[session.name] !== undefined) {
      webSocket.send(JSON.stringify({error: "你已经投过票了"}));
      return true;
    }
    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      webSocket.send(JSON.stringify({error: "选项不存在"}));
      return true;
    }
    // 🔒 安全修复：同一IP每场投票限1票 + 限频，防批量连接换名刷票（保留按名字记录用于展示）
    if (session.ip) {
      if (poll.votedIps && poll.votedIps[session.ip]) {
        webSocket.send(JSON.stringify({error: "同一IP只能投一票"}));
        return true;
      }
      if (!room.lastVote) room.lastVote = new Map();
      let lastVoteAt = room.lastVote.get(session.ip) || 0;
      if (Date.now() - lastVoteAt < 3000) {
        webSocket.send(JSON.stringify({error: "投票太频繁，请稍后再试"}));
        return true;
      }
      room.lastVote.set(session.ip, Date.now());
    }
    poll.voters[session.name] = optionIndex;
    if (!poll.votedIps) poll.votedIps = {};
    if (session.ip) poll.votedIps[session.ip] = true;
    poll.options[optionIndex].votes.push(session.name);
    await room.storage.put("polls", [...room.polls]);
    let pollCh = poll.channel || "general";
    room.broadcastToChannel(pollCh, {
      type: "poll-update",
      pollId: pollId,
      options: poll.options.map(o => ({index: o.index, text: o.text, count: o.votes.length})),
      totalVoters: Object.keys(poll.voters).length,
      channel: pollCh
    });
    return true;
  }

  if (data.type === "relay-create") {
    let topic = "" + (data.topic || "");
    if (!topic || topic.length > 100) {
      webSocket.send(JSON.stringify({error: "接龙主题不能为空且不超过100字"}));
      return true;
    }
    // 🔒 安全修复（W7）：接龙主题过敏感词过滤
    if (room.containsProfanity(topic)) {
      webSocket.send(JSON.stringify({error: "接龙主题包含违规词汇，已拦截"}));
      return true;
    }
    if (room._loadRelays) await room._loadRelays;
    let autoEnded = false;
    for (let [, relay] of room.relays) {
      if (relay.active) {
        // 🔒 安全修复（LD18）：超过24小时的接龙自动结束，防游客创建后断线永久锁死接龙功能
        if (Date.now() - (relay.startedAt || 0) > 24 * 3600 * 1000) {
          relay.active = false;
          autoEnded = true;
          continue;
        }
        webSocket.send(JSON.stringify({error: "已存在进行中的接龙: " + relay.topic + "，请先结束"}));
        return true;
      }
    }
    if (autoEnded) await room.storage.put("relays", [...room.relays]);
    let relayId = "relay_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    room.relays.set(relayId, {
      id: relayId, topic: topic, entries: [], active: true,
      startedBy: session.name, startedAt: Date.now()
    });
    await room.storage.put("relays", [...room.relays]);
    room.broadcast({
      type: "relay-new", relayId: relayId, topic: topic,
      startedBy: session.name, startedAt: Date.now()
    });
    return true;
  }

  if (data.type === "relay-add") {
    let relayId = data.relayId;
    let content = "" + (data.content || "");
    let number = parseInt(data.number, 10);
    if (!relayId || !content || isNaN(number)) {
      webSocket.send(JSON.stringify({error: "接龙参数错误"}));
      return true;
    }
    if (room._loadRelays) await room._loadRelays;
    let relay = room.relays.get(relayId);
    if (!relay) { webSocket.send(JSON.stringify({error: "接龙不存在"})); return true; }
    if (!relay.active) { webSocket.send(JSON.stringify({error: "接龙已结束"})); return true; }
    if (number !== relay.entries.length + 1) {
      webSocket.send(JSON.stringify({error: "顺序错误，当前轮到第 " + (relay.entries.length + 1) + " 个"}));
      return true;
    }
    if (content.length > 200) { webSocket.send(JSON.stringify({error: "内容过长（最多200字）"})); return true; }
    // 🔒 安全修复（W7）：接龙内容过敏感词过滤
    if (room.containsProfanity(content)) {
      webSocket.send(JSON.stringify({error: "接龙内容包含违规词汇，已拦截"}));
      return true;
    }
    // 🔒 安全修复（v1.34）：接龙每用户限频（2秒1条），防连发刷屏
    if (!room.lastRelayAdd) room.lastRelayAdd = new Map();
    let lastRelayAddAt = room.lastRelayAdd.get(session.name) || 0;
    if (Date.now() - lastRelayAddAt < 2000) {
      webSocket.send(JSON.stringify({error: "接龙操作太频繁，请稍后再试"}));
      return true;
    }
    room.lastRelayAdd.set(session.name, Date.now());
    // 接龙条目总数上限，防无限堆积
    if (relay.entries.length >= 500) {
      webSocket.send(JSON.stringify({error: "接龙条目已达上限（500条）"}));
      return true;
    }
    relay.entries.push({number, user: session.name, content, timestamp: Date.now()});
    await room.storage.put("relays", [...room.relays]);
    room.broadcast({type: "relay-update", relayId, entry: {number, user: session.name, content, timestamp: Date.now()}, totalCount: relay.entries.length});
    return true;
  }

  if (data.type === "relay-end") {
    let relayId = data.relayId;
    if (room._loadRelays) await room._loadRelays;
    let relay = room.relays.get(relayId);
    if (!relay) { webSocket.send(JSON.stringify({error: "接龙不存在"})); return true; }
    // 🔒 安全修复（LD18）：发起者或管理员（red/cyan）可结束接龙，防游客创建后断线导致功能永久锁死
    if (relay.startedBy !== session.name && !(await room.hasPerm(session, "chat.admin.messageDelete"))) {
      webSocket.send(JSON.stringify({error: "只有发起者或管理员可以结束接龙"})); return true;
    }
    relay.active = false;
    await room.storage.put("relays", [...room.relays]);
    room.broadcast({type: "relay-ended", relayId, totalCount: relay.entries.length, endedBy: session.name});
    return true;
  }

  if (data.type === "relay-list") {
    if (room._loadRelays) await room._loadRelays;
    let activeRelays = [];
    for (let [, relay] of room.relays) {
      if (relay.active) {
        activeRelays.push({
          id: relay.id, topic: relay.topic, startedBy: relay.startedBy,
          startedAt: relay.startedAt, entryCount: relay.entries.length,
          nextNumber: relay.entries.length + 1
        });
      }
    }
    webSocket.send(JSON.stringify({type: "relay-list-result", relays: activeRelays}));
    return true;
  }

  if (data.type === "reaction") {
    if (room._loadReactions) await room._loadReactions;
    let rKey = "" + data.msgTimestamp;
    if (!rKey) { webSocket.send(JSON.stringify({error: "缺少消息时间戳"})); return true; }
    // 🔒 安全修复（W5）：rKey 必须是数字时间戳（防伪造任意键无限增长 + 原型污染面）
    if (!/^\d{10,14}$/.test(rKey)) {
      webSocket.send(JSON.stringify({error: "无效的消息时间戳"}));
      return true;
    }
    // 🔒 安全修复（W5）：反应限频（每用户2秒1次）+ 反应总数上限（防存储/内存 DoS）
    if (!room.lastReaction) room.lastReaction = new Map();
    let lastReact = room.lastReaction.get(session.name) || 0;
    if (Date.now() - lastReact < 2000) {
      webSocket.send(JSON.stringify({error: "操作太频繁，请稍后再试"}));
      return true;
    }
    room.lastReaction.set(session.name, Date.now());
    if (room.reactions && Object.keys(room.reactions).length > 2000) {
      webSocket.send(JSON.stringify({error: "反应数量已达上限"}));
      return true;
    }
    // 防止原型污染：阻止 __proto__、constructor、prototype 作为键
    let emoji = ("" + data.emoji).trim();
    if (!emoji || emoji === "__proto__" || emoji === "constructor" || emoji === "prototype") {
      webSocket.send(JSON.stringify({error: "无效的表情"}));
      return true;
    }
    // 🔒 安全修复（W7）：表情内容过敏感词过滤，防绕过审查
    if (room.containsProfanity(emoji)) {
      webSocket.send(JSON.stringify({error: "表情包含违规词汇，已拦截"}));
      return true;
    }
    if (!room.reactions[rKey] || typeof room.reactions[rKey] !== "object") room.reactions[rKey] = {};
    if (data.action === "remove") {
      if (room.reactions[rKey][emoji]) {
        room.reactions[rKey][emoji] = (room.reactions[rKey][emoji] || []).filter(u => u !== session.name);
        if (room.reactions[rKey][emoji].length === 0) delete room.reactions[rKey][emoji];
        if (Object.keys(room.reactions[rKey]).length === 0) delete room.reactions[rKey];
      }
    } else {
      if (!room.reactions[rKey][emoji]) room.reactions[rKey][emoji] = [];
      if (!room.reactions[rKey][emoji].includes(session.name)) room.reactions[rKey][emoji].push(session.name);
    }
    await room.storage.put("reactions", JSON.stringify(room.reactions));
    room.broadcast({type: "reaction-update", msgTimestamp: rKey, reactions: room.reactions[rKey] || {}});
    return true;
  }

  // ====== 红包 ======
  if (data.type === "redpacket") {
    try {
      let registryId = room.env.registry.idFromName("global");
      let stub = room.env.registry.get(registryId);
      if (data.action === "create") {
        let total = parseInt(data.total) || 0;
        let count = parseInt(data.count) || 0;
        let mode = data.mode || "random";
        if (total < 1 || count < 1) { webSocket.send(JSON.stringify({error: "参数无效"})); return true; }
        let r = await stub.fetch("https://dummy-url/redpacket/create", {
          method: "POST",
          body: JSON.stringify({creator: session.name, total, count, mode, room: room.roomName, token: session.token || ""}),
          headers: {"Content-Type": "application/json"}
        });
        let result = await r.json();
        if (result.ok) {
          let rp = result.redpacket;
          room.redpacketChannels.set(rp.id, session.channel || "general");
          // 持久化并限容（红包为一次性，映射只保留最近300条）
          if (room.redpacketChannels.size > 300) {
            let oldestId = room.redpacketChannels.keys().next().value;
            if (oldestId) room.redpacketChannels.delete(oldestId);
          }
          await room.storage.put("redpacketChannels", [...room.redpacketChannels]);
          let msg = {
            type: "redpacket",
            action: "new",
            id: rp.id, creator: rp.creator,
            total: rp.total, count: rp.count, mode: rp.mode,
            remaining: rp.remaining, remainingCount: rp.remainingCount,
            timestamp: Math.max(Date.now(), room.lastTimestamp + 1),
            channel: session.channel || "general",
            name: session.name,
            tag: session.tag || "",
            tagColor: session.tagColor || "",
            tagBorder: session.tagBorder || ""
          };
          msg.id = ++room.msgCounter;
          room.lastTimestamp = msg.timestamp;
          room.broadcastToChannel(session.channel || "general", JSON.stringify(msg));
          // 不存storage（红包消息不持久化）
        } else {
          webSocket.send(JSON.stringify({error: result.error || "红包创建失败"}));
        }
      } else if (data.action === "grab") {
        let rpId = data.id;
        if (!rpId) { webSocket.send(JSON.stringify({error: "缺少红包ID"})); return true; }
        // 🔒 安全修复（E3）：抢红包需注册用户，并校验所在房间 + 携带 IP 用于限频
        let r = await stub.fetch("https://dummy-url/redpacket/grab", {
          method: "POST",
          body: JSON.stringify({id: rpId, user: session.name, room: room.roomName, ip: session.ip || "", token: session.token || ""}),
          headers: {"Content-Type": "application/json"}
        });
        let result = await r.json();
        if (result.ok) {
          // 抢到红包，按红包所在频道广播结果
          if (room._loadRedpacketChannels) await room._loadRedpacketChannels; // 防 DO 重启后映射未加载完
          let rpCh = room.redpacketChannels.get(rpId) || "general";
          room.broadcastToChannel(rpCh, {
            type: "redpacket",
            action: "grabbed",
            id: rpId,
            user: session.name,
            amount: result.amount,
            remaining: result.remaining,
            remainingCount: result.remainingCount,
            creator: result.creator,
            isFinished: result.isFinished,
            channel: rpCh
          });
        } else {
          webSocket.send(JSON.stringify({error: result.error || "领取失败"}));
        }
      } else if (data.action === "info") {
        let r = await stub.fetch(new URL("https://dummy-url/redpacket/info?id=" + encodeURIComponent(data.id || "")));
        let info = await r.json();
        webSocket.send(JSON.stringify({type: "redpacket", action: "info", id: data.id, info}));
      }
    } catch (e) {
      webSocket.send(JSON.stringify({error: "红包系统暂时不可用"}));
    }
    return true;
  }

  return false;
}
