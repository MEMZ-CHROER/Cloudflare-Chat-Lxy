// 图片/文件消息处理 — 从 chatroom.mjs 提取
export async function handleMedia(room, session, data, webSocket) {
  if (data.type === "image") {
    let imageData = "" + data.data;
    // 🔒 安全修复：图片消息拒绝 svg+xml/javascript 等可注入类型
    if (/^(javascript|vbscript):/i.test(imageData) || /^data:image\/svg\+xml/i.test(imageData)) {
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
      name: session.name, type: "image", data: imageData,
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
    room.broadcast(JSON.stringify(broadcastImg));
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
    let fileData = "" + data.data;
    let fileName = "" + (data.fileName || "unknown");
    let fileType = "" + (data.fileType || "application/octet-stream");
    let fileSize = parseInt(data.fileSize) || 0;
    // 🔒 安全修复：拒绝可执行协议注入（javascript:/vbscript:/data:text/html/data:image/svg+xml），
    // 防止文件消息被用作存储型XSS（客户端 a.href=data 直接赋值）
    if (/^(javascript|vbscript):/i.test(fileData) || /^data:text\/html/i.test(fileData) || /^data:image\/svg\+xml/i.test(fileData)) {
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
      name: session.name, type: "file", data: fileData,
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
    room.broadcast(JSON.stringify(broadcastData));
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
    data = {
      name: "BOT", type: "zifu", message: art,
      timestamp: Math.max(Date.now(), room.lastTimestamp + 1),
      tag: "BOT", tagColor: "cyan", tagBorder: "gold"
    };
    room.lastTimestamp = data.timestamp;
    data.id = ++room.msgCounter;
    room.messages.set(data.id, data);
    room.broadcast(JSON.stringify(data));
    await room.storage.put(new Date(data.timestamp).toISOString(), JSON.stringify(data));
    return true;
  }

  return false;
}
