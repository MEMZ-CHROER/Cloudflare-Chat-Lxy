// 图片/文件消息处理 — 从 chatroom.mjs 提取
export async function handleMedia(room, session, data, webSocket) {
  // 频道体系：公告频道只读，仅管理员可发图片/文件/字符画
  if (room._loadChannels) await room._loadChannels;
  let msgChannel = session.channel || "general";
  let curChan = room.channels ? room.channels.find(c => c.name === msgChannel) : null;
  if (curChan && curChan.type === "announcement" && session.tag !== "red" && session.tag !== "cyan") {
    webSocket.send(JSON.stringify({error: "仅管理员可在公告频道发言"}));
    return true;
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
    // 🔒 安全修复：图片消息拒绝 svg+xml 等可注入类型
    if (/^data:image\/svg\+xml/i.test(imageData)) {
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
    // 🔒 安全修复：拒绝可执行/可注入类型（data:text/html、data:image/svg+xml）
    if (/^data:text\/html/i.test(fileData) || /^data:image\/svg\+xml/i.test(fileData)) {
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
