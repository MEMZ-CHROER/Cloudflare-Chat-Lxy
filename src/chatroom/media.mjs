// 图片/文件消息处理 — 从 chatroom.mjs 提取
export async function handleMedia(room, session, data, webSocket) {
  // 频道体系：公告频道只读，仅管理员可发图片/文件/字符画/语音（仅对媒体类型校验，避免拦截 switch-channel/typing 等）
  // 注意：msgChannel 必须声明在函数顶层（let 块级作用域，各媒体分支需共享访问）
  let msgChannel = session.channel || "general";
  if (data.type === "image" || data.type === "file" || data.type === "zifu" || data.type === "voice") {
    if (room._loadChannels) await room._loadChannels;
    let curChan = room.channels ? room.channels.find(c => c.name === msgChannel) : null;
    if (curChan && curChan.type === "announcement" && !room.isAdminSession(session)) {
      webSocket.send(JSON.stringify({error: "仅管理员可在公告频道发言"}));
      return true;
    }
  }
  if (data.type === "image") {
    // 🔒 安全修复（W4）：上传限频（每用户10秒1次），防大文件广播放大/存储耗尽
    if (!room.lastUpload) room.lastUpload = new Map();
    let lastUp = room.lastUpload.get(session.name) || 0;
    if (Date.now() - lastUp < 10000) {
      webSocket.send(JSON.stringify({error: "上传太频繁，请稍后再试"}));
      return true;
    }
    room.lastUpload.set(session.name, Date.now());
    let imageData = "" + data.data;
    // 🔒 安全修复（W18）：图片必须是 data:image/* 数据，拒绝外链 URL（防观看者 IP 追踪/钓鱼跳转）
    if (!/^data:image\//i.test(imageData)) {
      webSocket.send(JSON.stringify({error: "图片内容类型不合法"}));
      return true;
    }
    // 🔒 安全修复：图片消息拒绝 svg/svg+xml 等可注入类型（M13：svg 不带 +xml 后缀也拦）
    if (/^data:image\/svg/i.test(imageData)) {
      webSocket.send(JSON.stringify({error: "图片内容类型不合法"}));
      return true;
    }
    let imgMax = (session.vip && session.vip.features ? session.vip.features.uploadImgMB : 1) * 1024 * 1024;
    if (imageData.length > imgMax) {
      webSocket.send(JSON.stringify({error: "图片过大（VIP最高 " + (imgMax / 1024 / 1024) + "MB）"}));
      return true;
    }
    let imgReply = data.reply;
    let broadcastImg = {
      name: session.name, type: "image", data: imageData, channel: msgChannel,
      timestamp: Math.max(Date.now(), room.lastTimestamp + 1)
    };
    if (session.tag) broadcastImg.tag = session.tag;
    if (session.tagColor) broadcastImg.tagColor = session.tagColor;
    if (session.tagBorder) broadcastImg.tagBorder = session.tagBorder;
    if (session.avatar) broadcastImg.avatar = session.avatar;
    if (imgReply) broadcastImg.reply = imgReply;
    room.lastTimestamp = broadcastImg.timestamp;
    broadcastImg.id = ++room.msgCounter;
    room.messages.set(broadcastImg.id, broadcastImg);
    room.broadcastToChannel(msgChannel, JSON.stringify(broadcastImg));
    // 存 FileBucket + 元信息（大 base64 不占主 DO）
    let fid = "img_" + broadcastImg.timestamp + "_" + session.name;
    try {
      if (room.env.filebucket) {
        let bucketId = room.env.filebucket.idFromName("primary");
        let bucket = room.env.filebucket.get(bucketId);
        // base64 -> binary -> bucket
        let binary = Uint8Array.from(atob(imageData.split(",")[1] || imageData), c => c.charCodeAt(0));
        await bucket.fetch("https://dummy-url/upload?fid=" + encodeURIComponent(fid), {
          method: "POST", body: binary
        });
      }
    } catch (e) { /* bucket 存储失败不影响消息发送 */ }
    let storageImg = { ...broadcastImg };
    delete storageImg.data;
    storageImg.fileBucket = true;
    storageImg.fid = fid;
    await room.storage.put(new Date(broadcastImg.timestamp).toISOString(), JSON.stringify(storageImg));
    return true;
  }

  if (data.type === "file") {
    // 🔒 安全修复（W4）：上传限频（每用户10秒1次），防大文件广播放大/存储耗尽
    if (!room.lastUpload) room.lastUpload = new Map();
    let lastUpF = room.lastUpload.get(session.name) || 0;
    if (Date.now() - lastUpF < 10000) {
      webSocket.send(JSON.stringify({error: "上传太频繁，请稍后再试"}));
      return true;
    }
    room.lastUpload.set(session.name, Date.now());
    let fileData = "" + data.data;
    let fileName = "" + (data.fileName || "unknown");
    let fileType = "" + (data.fileType || "application/octet-stream");
    let fileSize = parseInt(data.fileSize) || 0;
    // 🔒 安全修复（W18）：文件必须是 data: 数据，拒绝外链 URL（防追踪/钓鱼跳转）
    if (!/^data:/i.test(fileData)) {
      webSocket.send(JSON.stringify({error: "文件内容类型不合法"}));
      return true;
    }
    // 🔒 安全修复：拒绝可执行/可注入类型（M13 补全：text/html、image/svg、xhtml+xml、svg+xml）
    if (/^data:text\/html/i.test(fileData) || /^data:image\/svg/i.test(fileData) ||
        /^data:application\/xhtml\+xml/i.test(fileData) || /^data:application\/svg\+xml/i.test(fileData)) {
      webSocket.send(JSON.stringify({error: "文件内容类型不合法"}));
      return true;
    }
    let fileMax = (session.vip && session.vip.features ? session.vip.features.uploadFileMB : 20) * 1024 * 1024;
    if (fileData.length > fileMax) {
      webSocket.send(JSON.stringify({error: "文件过大（VIP最高 " + (fileMax / 1024 / 1024) + "MB）"}));
      return true;
    }
    if (fileName.length > 256) {
      webSocket.send(JSON.stringify({error: "文件名过长"}));
      return true;
    }
    let fileReply = data.reply;
    let broadcastData = {
      name: session.name, type: "file", data: fileData, channel: msgChannel,
      fileName, fileType, fileSize,
      timestamp: Math.max(Date.now(), room.lastTimestamp + 1)
    };
    if (session.tag) broadcastData.tag = session.tag;
    if (session.tagColor) broadcastData.tagColor = session.tagColor;
    if (session.tagBorder) broadcastData.tagBorder = session.tagBorder;
    if (session.avatar) broadcastData.avatar = session.avatar;
    if (fileReply) broadcastData.reply = fileReply;
    room.lastTimestamp = broadcastData.timestamp;
    broadcastData.id = ++room.msgCounter;
    room.messages.set(broadcastData.id, broadcastData);
    room.broadcastToChannel(msgChannel, JSON.stringify(broadcastData));
    // 存 FileBucket + 元信息
    let fid = "file_" + broadcastData.timestamp + "_" + session.name;
    try {
      if (room.env.filebucket) {
        let bucketId = room.env.filebucket.idFromName("primary");
        let bucket = room.env.filebucket.get(bucketId);
        let binary = Uint8Array.from(atob(fileData.split(",")[1] || fileData), c => c.charCodeAt(0));
        await bucket.fetch("https://dummy-url/upload?fid=" + encodeURIComponent(fid), {
          method: "POST", body: binary
        });
      }
    } catch (e) {}
    let storageData = { ...broadcastData };
    delete storageData.data;
    storageData.fileBucket = true;
    storageData.fid = fid;
    await room.storage.put(new Date(broadcastData.timestamp).toISOString(), JSON.stringify(storageData));
    return true;
  }

  if (data.type === "voice") {
    // 语音消息：限制类型 audio/*，走 FileBucket 存储，不走主 DO 存储（体积较大）
    if (!room.lastUpload) room.lastUpload = new Map();
    let lastUpV = room.lastUpload.get(session.name) || 0;
    if (Date.now() - lastUpV < 10000) {
      webSocket.send(JSON.stringify({error: "上传太频繁，请稍后再试"}));
      return true;
    }
    room.lastUpload.set(session.name, Date.now());
    let voiceData = "" + data.data;
    let duration = parseInt(data.duration) || 0;
    // 🔒 安全修复：语音必须是 data:audio/* 数据，拒绝外链/可注入类型
    if (!/^data:audio\//i.test(voiceData)) {
      webSocket.send(JSON.stringify({error: "语音内容类型不合法"}));
      return true;
    }
    if (/^data:audio\/svg\+xml/i.test(voiceData)) {
      webSocket.send(JSON.stringify({error: "语音内容类型不合法"}));
      return true;
    }
    // 上限 8MB / 60 秒
    let voiceMax = 8 * 1024 * 1024;
    if (voiceData.length > voiceMax) {
      webSocket.send(JSON.stringify({error: "语音过大（上限 8MB，请分段发送）"}));
      return true;
    }
    if (duration > 60 || duration < 1) {
      webSocket.send(JSON.stringify({error: "语音时长需在 1-60 秒之间"}));
      return true;
    }
    let voiceReply = data.reply;
    let broadcastVoice = {
      name: session.name, type: "voice", data: voiceData, channel: msgChannel, duration,
      timestamp: Math.max(Date.now(), room.lastTimestamp + 1)
    };
    if (session.tag) broadcastVoice.tag = session.tag;
    if (session.tagColor) broadcastVoice.tagColor = session.tagColor;
    if (session.tagBorder) broadcastVoice.tagBorder = session.tagBorder;
    if (session.avatar) broadcastVoice.avatar = session.avatar;
    if (voiceReply) broadcastVoice.reply = voiceReply;
    room.lastTimestamp = broadcastVoice.timestamp;
    broadcastVoice.id = ++room.msgCounter;
    room.messages.set(broadcastVoice.id, broadcastVoice);
    room.broadcastToChannel(msgChannel, JSON.stringify(broadcastVoice));
    // 存 FileBucket + 元信息（大 base64 不占主 DO）
    let fid = "voice_" + broadcastVoice.timestamp + "_" + session.name;
    try {
      if (room.env.filebucket) {
        let bucketId = room.env.filebucket.idFromName("primary");
        let bucket = room.env.filebucket.get(bucketId);
        let binary = Uint8Array.from(atob(voiceData.split(",")[1] || voiceData), c => c.charCodeAt(0));
        await bucket.fetch("https://dummy-url/upload?fid=" + encodeURIComponent(fid), {
          method: "POST", body: binary
        });
      }
    } catch (e) { /* bucket 存储失败不影响消息发送 */ }
    let storageVoice = { ...broadcastVoice };
    delete storageVoice.data;
    storageVoice.fileBucket = true;
    storageVoice.fid = fid;
    await room.storage.put(new Date(broadcastVoice.timestamp).toISOString(), JSON.stringify(storageVoice));
    return true;
  }

  if (data.type === "zifu") {
    let art = "" + data.message;
    if (art.length > 8000) {
      webSocket.send(JSON.stringify({error: "字符画过长，请精简"}));
      return true;
    }
    // 🔒 安全修复（W9）：不再伪装 BOT 身份广播，改用发送者本人身份（防冒充官方机器人钓鱼）
    // 🔒 安全修复（W7）：字符画内容过敏感词过滤
    if (room.containsProfanity(art)) {
      webSocket.send(JSON.stringify({error: "内容包含违规词汇，已拦截"}));
      return true;
    }
    data = {
      name: session.name, type: "zifu", message: art, channel: msgChannel,
      timestamp: Math.max(Date.now(), room.lastTimestamp + 1)
    };
    if (session.tag) data.tag = session.tag;
    if (session.tagColor) data.tagColor = session.tagColor;
    if (session.tagBorder) data.tagBorder = session.tagBorder;
    room.lastTimestamp = data.timestamp;
    data.id = ++room.msgCounter;
    room.messages.set(data.id, data);
    room.broadcastToChannel(msgChannel, JSON.stringify(data));
    await room.storage.put(new Date(data.timestamp).toISOString(), JSON.stringify(data));
    return true;
  }

  return false;
}
