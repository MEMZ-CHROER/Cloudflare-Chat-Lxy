import { handleErrors, safeEqual } from "./utils.mjs";
import { handleMedia } from "./chatroom/media.mjs";
import { handleManage, stripSensitiveMsg } from "./chatroom/manage.mjs";

// 🔒 安全修复（W20）：颜色白名单（色名 + #hex），消息颜色/房间等级样式统一使用
const SAFE_COLOR_RE = /^(red|blue|green|purple|pink|cyan|gray|grey|orange|yellow|teal|indigo|brown|lime|deeporange|rose|crimson|coral|gold|amber|forest|seagreen|turquoise|steel|royalblue|mediumpurple|darkviolet|chocolate|olive|firebrick|slateblue|darkcyan|mediumseagreen|indianred|cadetblue|#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?)$/;

// 🔒 安全修复（F7）：匿名消息存储时附带的"真实身份指纹"——真实 name 的 32 位 FNV-1a 哈希。
// 只存 storage（不广播、不进 /messages /search 白名单字段、export 时剔除），供本人删除自己的匿名消息；
// 存哈希而非明文昵称，避免导出日志/历史泄漏真实身份。
function hashAnonOwner(nameStr) {
  let h = 0x811c9dc5;
  const s = String(nameStr || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return "anon:" + h.toString(16);
}

// ⚠️ 安全说明（L12）：本 DO 的 /blacklist/*、/do-kick、/do-clear、/do-destroy、/broadcast-message、
// /tag-update、/set-announcement、/message/recall 等端点无自身鉴权，仅依赖 api/ 层路由白名单单点兜底，
// 当前房间名+DO id 不可枚举，无法被外部直接连到。纵深防御需 api/admin 层配合改造，本次保留现状不动。

// ChatRoom Durable Object — 管理单个聊天室的状态和 WebSocket 连接
export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;
    this.sessions = new Map();

    this.state.getWebSockets().forEach((webSocket) => {
      let meta = webSocket.deserializeAttachment();
      let blockedMessages = [];
      this.sessions.set(webSocket, { ...meta, channel: meta.channel || "general", blockedMessages });
    });

    this.lastTimestamp = 0;
    this.connCounter = 0;
    this.msgCounter = 0;
    this.messages = new Map();

    // 频道体系：默认频道列表（general 文本 + announcement 公告只读）
    this.channels = [{name: "general", type: "text"}, {name: "announcement", type: "announcement"}];
    this._loadChannels = this.storage.get("channels").then(arr => {
      if (Array.isArray(arr) && arr.length) this.channels = arr;
    });
    // 红包所在频道（id → channel），供 grab 广播隔离
    this.redpacketChannels = new Map();
    // 🔒 安全修复（v1.34）：红包频道映射持久化，防 DO 重启后丢失导致 grab 广播回落到 general
    this._loadRedpacketChannels = this.storage.get("redpacketChannels").then(arr => {
      if (Array.isArray(arr)) this.redpacketChannels = new Map(arr);
    });

    this.blacklist = new Set();
    this._loadBlacklist = this.storage.get("blacklist").then(list => {
      if (list) this.blacklist = new Set(list);
    });

    this.announcement = "";
    this._loadAnnouncement = this.storage.get("announcement").then(text => {
      if (text) this.announcement = text;
    });

    // 🏅 房间等级样式：{ "<level>": {color, icon, text} }，level 为 1-999 整数键
    this.levelStyles = {};
    this._loadLevelStyles = this.storage.get("levelStyles").then(r => {
      if (r && typeof r === "object") this.levelStyles = r;
    });

    this.destroyed = false;
    // 🔒 销毁标记持久化：DO 重启后仍保持"已销毁"，防止房间复活导致重连异常
    this._loadDestroyed = this.storage.get("__destroyed__").then(v => {
      if (v === "1") this.destroyed = true;
    });
    // 📌 置顶消息（v1.35 升级为按频道）：{ "<channel>": [pinObj, ...] }，每频道最多 3 条
    this.pinnedMessages = {};
    this._loadPinnedMessages = this.storage.get("pinnedMessages").then(async data => {
      if (data && typeof data === "object") {
        this.pinnedMessages = data;
        return;
      }
      // 迁移：旧版单条全局置顶（pinnedMessage）并入 general 频道，随后删除旧 key
      try {
        let old = await this.storage.get("pinnedMessage");
        if (old) {
          let p = JSON.parse(old);
          if (p && p.timestamp) {
            this.pinnedMessages["general"] = [p];
            await this.storage.put("pinnedMessages", this.pinnedMessages);
            await this.storage.delete("pinnedMessage");
          }
        }
      } catch (e) {}
    });

    this.scheduledMessages = [];
    this._loadScheduled = this.storage.get("scheduledMessages").then(list => {
      this.scheduledMessages = list || [];
      if (this.scheduledMessages.length > 0) {
        let nextTime = Math.min(...this.scheduledMessages.map(s => s.time));
        this.state.storage.setAlarm(nextTime).catch(() => {});
      }
    });

    this.polls = new Map();
    this._loadPolls = this.storage.get("polls").then(data => {
      if (data) this.polls = new Map(data);
    });

    this.relays = new Map();
    this._loadRelays = this.storage.get("relays").then(data => {
      if (data) this.relays = new Map(data);
    });

    this.highlights = [];
    this._loadHighlights = this.storage.get("highlights").then(data => {
      if (data) {
        // 🔒 安全修复（L9）：历史 JSON 损坏时回退空数组，防房间不可进（500 拒绝所有新连接）
        try { this.highlights = JSON.parse(data); } catch (e) { this.highlights = []; }
      }
    });

    this.reactions = {};
    this._loadReactions = this.storage.get("reactions").then(data => {
      if (data) {
        // 🔒 安全修复（L9）：历史 JSON 损坏时回退空对象，防房间不可进
        try { this.reactions = JSON.parse(data); } catch (e) { this.reactions = {}; }
      }
    });

    this.lotteryPools = new Map();
    this._loadLotteryPools = this.storage.get("lotteryPools").then(data => {
      if (data) {
        this.lotteryPools = new Map(data.map(([id, pool]) => {
          pool.prizes = new Map(pool.prizes);
          return [id, pool];
        }));
      }
    });
  }

  async fetch(request) {
    return await handleErrors(request, async () => {
      if (this._loadBlacklist) await this._loadBlacklist;

      let url = new URL(request.url);

      if (!this.roomName) {
        this.roomName = url.searchParams.get("room_name");
      }

      switch (url.pathname) {
        case "/websocket": {
          if (request.headers.get("Upgrade") != "websocket") {
            return new Response("需要 WebSocket", {status: 400});
          }
          // 💥 房间已销毁：升级后立即以 destroyed 关闭（前端识别跳首页），避免 handleSession 异常 1011
          if (this._loadDestroyed) await this._loadDestroyed;
          if (this.destroyed) {
            let dPair = new WebSocketPair();
            dPair[1].accept();
            dPair[1].close(1000, "destroyed");
            return new Response(null, { status: 101, webSocket: dPair[0] });
          }
          let ip = request.headers.get("CF-Connecting-IP");
          // 检查房间密码
          if (this.roomName && this.env.registry) {
            try {
              let pwd = url.searchParams.get("password") || "";
              let registryId = this.env.registry.idFromName("global");
              let stub = this.env.registry.get(registryId);
              let pwdCheck = await stub.fetch("https://dummy-url/verify-password", {
                method: "POST",
                body: JSON.stringify({name: this.roomName, password: pwd}),
                headers: {"Content-Type": "application/json"}
              });
              let pwdResult = await pwdCheck.json();
              if (!pwdResult.ok) {
                return new Response("需要密码", {status: 403});
              }
            } catch (e) {
              return new Response("验证服务暂时不可用", {status: 503});
            }
          }
          let pair = new WebSocketPair();
          await this.handleSession(pair[1], ip);
          return new Response(null, { status: 101, webSocket: pair[0] });
        }
        case "/clear-messages": {
          await this.clearAllMessages();
          return new Response("聊天记录已清空。", { status: 200 });
        }

        case "/blacklist/add": {
          let name = url.searchParams.get("name");
          if (!name) return new Response("请提供用户名", { status: 400 });
          this.blacklist.add(name);
          await this.storage.put("blacklist", [...this.blacklist]);
          return new Response(name + " 已被加入黑名单", { status: 200 });
        }

        case "/blacklist/remove": {
          let name = url.searchParams.get("name");
          if (!name) return new Response("请提供用户名", { status: 400 });
          this.blacklist.delete(name);
          await this.storage.put("blacklist", [...this.blacklist]);
          return new Response(name + " 已被移出黑名单", { status: 200 });
        }

        case "/blacklist/list": {
          return new Response(JSON.stringify([...this.blacklist]), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/users": {
          let users = [];
          for (let s of this.sessions.values()) {
            if (s.name) users.push(s.name);
            else users.push("? 未知#" + s.connId);
          }
          return new Response(JSON.stringify(users), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/users-detail": {
          let users = [];
          for (let s of this.sessions.values()) {
            if (s.name) users.push({name: s.name, ip: s.ip || ""});
            else users.push({name: "? 未知#" + s.connId, ip: s.ip || ""});
          }
          return new Response(JSON.stringify(users), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/files": {
          let channel = url.searchParams.get("channel") || "general"; // M11：不带频道默认只列/导 general
          let entries = await this.storage.list({reverse: true, limit: 100});
          let files = [];
          for (let [key, val] of entries) {
            try {
              let msg = JSON.parse(val);
              if (msg.type === "file" && (!channel || (msg.channel || "general") === channel)) {
                files.push({
                  timestamp: msg.timestamp,
                  name: msg.name,
                  channel: msg.channel || "general",
                  fileName: msg.fileName,
                  fileSize: msg.fileSize,
                  fileType: msg.fileType,
                  tag: msg.tag,
                  tagColor: msg.tagColor,
                  tagBorder: msg.tagBorder || ""
                });
              }
            } catch (e) {}
          }
          return new Response(JSON.stringify(files), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/file-data": {
          let ts = url.searchParams.get("timestamp");
          if (!ts) return new Response("请提供时间戳", {status: 400});
          // 🔒 安全修复（L7）：非法时间戳直接返回 400，防 new Date(NaN).toISOString() 抛 500
          if (isNaN(parseInt(ts))) return new Response(JSON.stringify({error: "无效的时间戳"}), {status: 400, headers: {"Content-Type": "application/json"}});
          let key = new Date(parseInt(ts)).toISOString();
          let val = await this.storage.get(key);
          if (!val) return new Response("未找到文件", {status: 404});
          // 🔒 安全修复（v1.34）：文件公开端只给元数据——非 file 消息返回 404，并剔除 base64 正文与敏感字段
          let m;
          try { m = JSON.parse(val); } catch (e) { return new Response(JSON.stringify({error: "数据异常"}), {status: 500, headers: {"Content-Type": "application/json"}}); }
          if (!m || m.type !== "file") return new Response(JSON.stringify({error: "该消息不是文件"}), {status: 404, headers: {"Content-Type": "application/json"}});
          delete m.data;
          return new Response(JSON.stringify(stripSensitiveMsg(m)), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/messages": {
          let limit = parseInt(url.searchParams.get("limit")) || 50;
          if (limit > 200) limit = 200;
          let channel = url.searchParams.get("channel") || "general";
          let before = url.searchParams.get("before"); // 时间戳游标
          // 🔒 安全修复（W19）：非法时间戳直接忽略游标，防 new Date(NaN).toISOString() 抛 500
          if (before && isNaN(parseInt(before))) before = "";
          // 频道体系：读更大批次补偿其他频道消息穿插，按 channel 过滤到 limit
          let fetchLimit = Math.min(limit * 3, 1000);
          let entries;
          if (before) {
            let beforeKey = new Date(parseInt(before)).toISOString();
            entries = await this.storage.list({reverse: true, limit: fetchLimit, start: beforeKey});
          } else {
            entries = await this.storage.list({reverse: true, limit: fetchLimit});
          }
          let msgs = [];
          for (let [key, val] of entries) {
            try {
              let msg = JSON.parse(val);
              if (msg.type !== "file" && (msg.channel || "general") === channel) {
                msgs.push({
                  timestamp: msg.timestamp,
                  name: msg.name,
                  message: msg.message,
                  type: msg.type,
                  channel: msg.channel || "general",
                  tag: msg.tag,
                  tagColor: msg.tagColor,
                  tagBorder: msg.tagBorder || "",
                  color: msg.color,
                  fileName: msg.fileName,
                  fileSize: msg.fileSize,
                  duration: msg.duration,
                  fid: msg.fid,
                  repo: msg.repo,
                  id: msg.id,
                  atAll: msg.atAll,
                  avatar: msg.avatar,
                  reply: msg.reply
                });
                if (msgs.length >= limit) break;
              }
            } catch (e) {}
          }
          msgs.reverse();
          return new Response(JSON.stringify(msgs), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/search": {
          // 🔍 历史搜索：服务端遍历最近消息，按关键词/用户名/频道过滤（无索引，遍历最近 2000 条）
          let q = url.searchParams.get("q") || "";
          let sName = url.searchParams.get("name") || "";
          let sChannel = url.searchParams.get("channel") || "general"; // M11：不带频道默认只搜 general，防跨频道泄露
          let limit = parseInt(url.searchParams.get("limit")) || 30;
          if (limit > 100) limit = 100;
          if (!q.trim()) return new Response(JSON.stringify({error: "缺少搜索关键词"}), {status: 400, headers: {"Content-Type": "application/json"}});
          let qLower = q.trim().toLowerCase();
          let entries = await this.storage.list({reverse: true, limit: 2000});
          let results = [];
          for (let [key, val] of entries) {
            if (results.length >= limit) break;
            try {
              let msg = JSON.parse(val);
              if (!msg || typeof msg.message !== "string") continue;
              if (msg.type === "file" || msg.type === "image" || msg.type === "zifu" || msg.type === "recalled" || msg.type === "deleted") continue;
              if (sChannel && (msg.channel || "general") !== sChannel) continue;
              if (sName && msg.name !== sName) continue;
              if (msg.message.toLowerCase().includes(qLower)) {
                results.push({
                  timestamp: msg.timestamp, name: msg.name, message: msg.message,
                  type: msg.type, channel: msg.channel || "general",
                  tag: msg.tag, tagColor: msg.tagColor, tagBorder: msg.tagBorder || "",
                  color: msg.color, id: msg.id, reply: msg.reply, atAll: msg.atAll, avatar: msg.avatar
                });
              }
            } catch (e) {}
          }
          results.reverse();
          return new Response(JSON.stringify(results), {status: 200, headers: {"Content-Type": "application/json"}});
        }

        case "/export": {
          let format = url.searchParams.get("format") || "json";
          let channel = url.searchParams.get("channel") || "general"; // M11：不带频道默认只列/导 general
          let entries = await this.storage.list({reverse: false});
          let msgs = [];
          for (let [key, val] of entries) {
            try {
              let msg = JSON.parse(val);
              if (msg && (msg.type === undefined || msg.type === "text" || msg.type === "image" || msg.type === "file" || msg.type === "zifu" || msg.type === "voice" || msg.type === "gh-card") && (!channel || (msg.channel || "general") === channel)) {
                // 🔒 安全修复（F7）：导出日志剔除匿名身份指纹字段，防真实身份经 export 泄漏
                delete msg._anonOwner;
                msgs.push(msg);
              }
            } catch (e) {}
          }
          if (format === "txt") {
            let text = msgs.map(m => {
              let ts = m.timestamp ? new Date(m.timestamp).toLocaleString() : "";
              let tagText = m.tag ? "[" + m.tag + "]" : "";
              let content = m.message || (m.type === "image" ? "[图片]" : m.type === "file" ? "[文件] " + m.fileName : "");
              return "[" + ts + "] " + tagText + m.name + ": " + content;
            }).join("\r\n");
            return new Response(text, {status: 200, headers: {
              "Content-Type": "text/plain;charset=utf-8",
              "Content-Disposition": "attachment; filename=chatlog_" + (this.roomName || "export") + ".txt"
            }});
          } else {
            return new Response(JSON.stringify(msgs, null, 2), {status: 200, headers: {
              "Content-Type": "application/json;charset=utf-8",
              "Content-Disposition": "attachment; filename=chatlog_" + (this.roomName || "export") + ".json"
            }});
          }
        }

        case "/broadcast-message": {
          let text = url.searchParams.get("text");
          if (!text) return new Response("请提供消息内容", {status: 400});
          // 🔒 安全修复（F4）：webhook 广播同样过敏感词过滤，防绕过 WebSocket 文本路径的敏感词审查
          if (this.containsProfanity(text)) {
            return new Response("消息包含违规内容，已拦截", {status: 403});
          }
          // 🔒 安全修复（F3）：sender 固定为 "Webhook"，忽略请求体提供的 sender 字段（防冒充任意用户/管理员昵称）
          let sender = "Webhook";
          // 🔗 通用 Webhook 增强：可选 channel 参数（合法且存在的频道才生效，否则 general）+ webhook 来源标记
          let channelParam = url.searchParams.get("channel") || "";
          let isWebhook = url.searchParams.get("webhook") === "1";
          let targetChannel = "general";
          if (channelParam) {
            if (this._loadChannels) await this._loadChannels;
            if (/^[a-zA-Z0-9_-]{1,24}$/.test(channelParam) && this.channels.some(c => c.name === channelParam)) {
              targetChannel = channelParam;
            }
          }

          let timestamp = Date.now();
          let data = {
            type: "text",
            message: text,
            name: sender,
            timestamp: Math.max(timestamp, this.lastTimestamp + 1),
            tag: "📢",
            tagColor: "red",
            tagBorder: "",
            // 🔒 安全修复（F3）：移除 admin 标记——sender 已固定为 "Webhook"，保留 admin:true 会渲染出"管理员"身份误导；
            // roomwide 如实描述广播范围，予以保留
            channel: targetChannel,
            roomwide: true
          };
          if (isWebhook) data.webhook = true;
          data.id = ++this.msgCounter;
          this.lastTimestamp = data.timestamp;
          let dataStr = JSON.stringify(data);
          if (channelParam) {
            this.broadcastToChannel(targetChannel, dataStr);
          } else {
            this.broadcast(dataStr);
          }
          let key = new Date(data.timestamp).toISOString();
          await this.storage.put(key, dataStr);
          return new Response("消息已发送到房间 " + (this.roomName || "未知"), {status: 200});
        }

        case "/do-kick": {
          let targetName = url.searchParams.get("name");
          let callerName = url.searchParams.get("caller") || "";
          if (!targetName) return new Response("请提供用户名", {status: 400});
          if (targetName === callerName) {
            return new Response("不能踢出自己", {status: 400});
          }

          // 检查VIP踢出保护（全局机制，管理员也不能绕过）
          for (let [ws, s] of this.sessions) {
            if (s.name === targetName && s.vip && s.vip.features && s.vip.features.kickProtect) {
              return new Response("受保护，无法踢出", {status: 403});
            }
          }
          // 检查全局踢出保护名单
          if (this.env.registry) {
            try {
              let registryId = this.env.registry.idFromName("global");
              let stub = this.env.registry.get(registryId);
              let checkRes = await stub.fetch(new URL("https://dummy-url/is-kick-protected?name=" + encodeURIComponent(targetName)));
              let checkData = await checkRes.json();
              if (checkData.protected) {
                return new Response(targetName + " 受保护，无法踢出", {status: 403});
              }
            } catch (e) {}
          }

          let kickedWs = null;
          let ghostMatch = targetName.match(/^\?\s*未知#(\d+)$/);
          if (ghostMatch) {
            let targetConnId = parseInt(ghostMatch[1]);
            for (let [ws, s] of this.sessions) {
              if (s.connId === targetConnId && !s.name) {
                kickedWs = ws;
                break;
              }
            }
          } else {
            for (let [ws, s] of this.sessions) {
              if (s.name === targetName) {
                kickedWs = ws;
                break;
              }
            }
          }

          if (kickedWs) {
            this.sessions.delete(kickedWs);
            kickedWs.close(1000, "kicked");
            this.broadcast({kicked: targetName});
            await this.updateRegistry();
            return new Response("已踢出 " + targetName, {status: 200});
          }
          return new Response("未找到用户 " + targetName, {status: 404});
        }

        case "/do-clear": {
          await this.clearAllMessages();
          return new Response("聊天记录已清空。", { status: 200 });
        }

        case "/do-kick-all": {
          // v1.40 运维：踢出本房间全部在线用户（不销毁房间/不清消息），供 admin 全局清场
          // v1.42 /kickall 命令：支持 ?except=用户名 排除触发者自己（房间清场但自己留下）
          // 🔒 v1.42 管理专用：校验管理密钥（ADMIN_KEY 或 super），防止绕过前端直接调用端点踢人
          let k = url.searchParams.get("key") || "";
          let isKeyOk = (this.env.ADMIN_KEY && safeEqual(k, this.env.ADMIN_KEY)) || (this.env.ADMIN_SECRET_KEY && safeEqual(k, this.env.ADMIN_SECRET_KEY));
          if (!isKeyOk) return new Response("未经授权", { status: 401 });
          let except = url.searchParams.get("except") || "";
          let count = 0;
          for (let [webSocket, session] of this.sessions) {
            if (except && session.name === except) continue;
            try { webSocket.close(1000, "kicked"); } catch (e) {}
            count++;
          }
          for (let [webSocket, session] of this.sessions) {
            if (except && session.name === except) continue;
            this.sessions.delete(webSocket);
          }
          await this.updateRegistry();
          return new Response("已踢出 " + count + " 人", { status: 200 });
        }

        case "/do-destroy": {
          // 一键销毁房间：清空消息、断开所有连接
          this.destroyed = true;
          try { await this.storage.put("__destroyed__", "1"); } catch (e) {}
          await this.clearAllMessages();
          this.sessions.forEach((session, webSocket) => {
            try { webSocket.close(1000, "destroyed"); } catch (e) {}
          });
          this.sessions.clear();
          // registry 删除由管理 API 层直接处理
          return new Response("房间 " + (this.roomName || "未知") + " 已销毁", { status: 200 });
        }

        case "/message/recall": {
          let recallTs = url.searchParams.get("timestamp");
          let recallName = url.searchParams.get("name");
          if (!recallTs || !recallName) return new Response("缺少参数", {status: 400});
          // 🔒 安全修复（L7）：非法时间戳直接返回 400，防 new Date(NaN).toISOString() 抛 500
          if (isNaN(parseInt(recallTs))) return new Response(JSON.stringify({error: "无效的时间戳"}), {status: 400, headers: {"Content-Type": "application/json"}});
          let recallKey = new Date(parseInt(recallTs)).toISOString();
          let recallOrig = await this.storage.get(recallKey);
          // 🔒 安全修复（LD19）：消息不存在直接拒绝，杜绝伪造"已撤回"篡改视图 + 任意 storage key 写入
          if (!recallOrig) return new Response("消息不存在或已过期，无法撤回", {status: 400});
          let origData;
          try { origData = JSON.parse(recallOrig); } catch (e) { return new Response("消息不存在或已过期，无法撤回", {status: 400}); }
          if (origData.name !== recallName) {
            return new Response("无权撤回他人的消息", {status: 403});
          }
          let now = Date.now();
          if (now - parseInt(recallTs) > 120000) {
            return new Response("超过2分钟无法撤回", {status: 400});
          }
          let recalledMsg = JSON.stringify({type: "recalled", name: recallName, timestamp: parseInt(recallTs), channel: origData.channel || "general"});
          await this.storage.put(recallKey, recalledMsg);
          this.broadcast(recalledMsg);
          return new Response("ok", {status: 200});
        }

        case "/tag-update": {
          let targetName = url.searchParams.get("name");
          let newTag = url.searchParams.get("tag") || "";
          let newColor = url.searchParams.get("color") || "";
          let newBorder = url.searchParams.get("border") || "";
          if (!targetName) return new Response("请提供用户名", {status: 400});

          // 🔒 安全修复（LD9）：tag-update 只更新"已认证"的同名会话，防游客陈旧会话被改标签获得管理权限
          for (let [ws, s] of this.sessions) {
            if (s.name === targetName && s.authenticated) {
              s.tag = newTag;
              s.tagColor = newColor;
              s.tagBorder = newBorder;
            }
          }

          this.broadcast({type: "tag-update", name: targetName, tag: newTag, tagColor: newColor, tagBorder: newBorder});
          return new Response("ok", {status: 200});
        }

        case "/set-announcement": {
          let annText = url.searchParams.get("text") || "";
          this.announcement = annText;
          await this.storage.put("announcement", annText);
          this.broadcast({type: "announcement", text: annText});
          return new Response("公告已" + (annText ? "更新" : "清除"), {status: 200});
        }

        case "/get-announcement": {
          return new Response(JSON.stringify({text: this.announcement || ""}), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        // 🏅 房间等级样式：设置/更新某等级徽章样式（颜色白名单 + 图标/文字限长拒 HTML）
        case "/set-level-styles": {
          let level = parseInt(url.searchParams.get("level"), 10);
          let color = url.searchParams.get("color") || "";
          let icon = url.searchParams.get("icon") || "";
          let text = url.searchParams.get("text") || "";
          if (!(level >= 1 && level <= 999)) return new Response("等级无效", {status: 400});
          // 防护：颜色过白名单（非法置空）；图标 ≤4 字符、文字 ≤10 字符且拒 HTML 特殊字符
          if (color && !SAFE_COLOR_RE.test(String(color))) color = "";
          if (icon.length > 4 || /[<>&"']/.test(icon)) icon = "";
          if (text.length > 10 || /[<>&"']/.test(text)) text = "";
          if (!this.levelStyles || typeof this.levelStyles !== "object") this.levelStyles = {};
          if (color || icon || text) {
            this.levelStyles[String(level)] = {color, icon, text};
          } else {
            delete this.levelStyles[String(level)]; // 三项全空视为清除该等级样式
          }
          await this.storage.put("levelStyles", this.levelStyles);
          this.broadcast({type: "level-styles", styles: this.levelStyles});
          return new Response("等级样式已更新", {status: 200});
        }

        // 🏅 房间等级样式：清除单个等级样式
        case "/clear-level-style": {
          let level = parseInt(url.searchParams.get("level"), 10);
          if (!(level >= 1 && level <= 999)) return new Response("等级无效", {status: 400});
          if (this.levelStyles && typeof this.levelStyles === "object") {
            delete this.levelStyles[String(level)];
            await this.storage.put("levelStyles", this.levelStyles);
            this.broadcast({type: "level-styles", styles: this.levelStyles});
          }
          return new Response("等级样式已清除", {status: 200});
        }

        // 📌 置顶消息（v1.35）：按频道设置置顶（从 storage 读原消息构造快照，channel 须存在于频道列表）
        case "/set-pinned": {
          let pinChannel = "" + (url.searchParams.get("channel") || "general");
          let pinTs = parseInt(url.searchParams.get("timestamp"), 10);
          if (!pinTs) return new Response("请提供消息时间戳", {status: 400});
          if (this._loadChannels) await this._loadChannels;
          if (!this.channels || !this.channels.some(c => c.name === pinChannel)) {
            return new Response("频道不存在", {status: 400});
          }
          try {
            let raw = await this.storage.get(new Date(pinTs).toISOString());
            if (!raw) return new Response("消息不存在", {status: 404});
            let m = JSON.parse(raw);
            if ((m.channel || "general") !== pinChannel) return new Response("消息不属于该频道", {status: 400});
            if (m.type === "deleted" || m.type === "recalled") return new Response("消息已删除或撤回", {status: 400});
            let safe = stripSensitiveMsg(m);
            let pinObj = {
              name: safe.name || "未知",
              text: safe.message !== undefined ? safe.message : (safe.text || ""),
              timestamp: pinTs,
              tag: safe.tag || "", tagColor: safe.tagColor || "", tagBorder: safe.tagBorder || "",
              channel: pinChannel, pinnedBy: "admin", pinnedAt: Date.now()
            };
            await this.addPinnedMessage(pinChannel, pinObj);
            return new Response("已置顶", {status: 200});
          } catch (e) {
            return new Response("消息读取失败", {status: 500});
          }
        }

        // 📌 置顶消息（v1.35）：按频道+时间戳取消置顶
        case "/clear-pinned": {
          let pinChannel = "" + (url.searchParams.get("channel") || "general");
          let pinTs = parseInt(url.searchParams.get("timestamp"), 10);
          if (!pinTs) return new Response("请提供消息时间戳", {status: 400});
          await this.removePinnedMessage(pinChannel, pinTs);
          return new Response("已取消置顶", {status: 200});
        }

        case "/get-pinned": {
          if (this._loadPinnedMessages) await this._loadPinnedMessages;
          return new Response(JSON.stringify({pinned: this.pinnedMessages || {}}), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        default:
          return new Response("未找到", {status: 404});
      }
    });
  }

  // 📌 置顶消息（v1.35）：新增一条置顶到某频道（去重按 timestamp，头部插入，超 3 条淘汰最旧），持久化 + 按频道广播
  async addPinnedMessage(channel, pinObj) {
    if (this._loadPinnedMessages) await this._loadPinnedMessages;
    if (!this.pinnedMessages || typeof this.pinnedMessages !== "object") this.pinnedMessages = {};
    let arr = Array.isArray(this.pinnedMessages[channel]) ? this.pinnedMessages[channel] : [];
    arr = arr.filter(p => p && parseInt(p.timestamp) !== parseInt(pinObj.timestamp));
    arr.unshift(pinObj);
    if (arr.length > 3) arr.length = 3; // 每频道最多 3 条
    this.pinnedMessages[channel] = arr;
    await this.storage.put("pinnedMessages", this.pinnedMessages);
    this.broadcastToChannel(channel, JSON.stringify({type: "pinned", channel, pinned: arr}));
    return arr;
  }

  // 📌 置顶消息（v1.35）：移除某频道的指定置顶（按 timestamp），持久化 + 按频道广播
  async removePinnedMessage(channel, ts) {
    if (this._loadPinnedMessages) await this._loadPinnedMessages;
    if (!this.pinnedMessages || typeof this.pinnedMessages !== "object") this.pinnedMessages = {};
    let arr = Array.isArray(this.pinnedMessages[channel]) ? this.pinnedMessages[channel] : [];
    arr = arr.filter(p => !p || parseInt(p.timestamp) !== parseInt(ts));
    this.pinnedMessages[channel] = arr;
    await this.storage.put("pinnedMessages", this.pinnedMessages);
    this.broadcastToChannel(channel, JSON.stringify({type: "pinned", channel, pinned: arr}));
    return arr;
  }

  async clearAllMessages() {
    let allEntries = await this.storage.list();
    let msgKeys = [];
    for (let [key, val] of allEntries) {
      try {
        let parsed = JSON.parse(val);
        // H3 修复：文本消息无 type 字段（data={name,message,channel}），原条件删不掉文本；
        // 改为"有数字 timestamp + (有 message 字段 或 type 属消息类)"。系统 key
        // （channels/blacklist/announcement/__destroyed__/pinnedMessage/scheduledMessages/polls/relays/
        //  highlights/reactions/at-mentions/ghcache:*/aictx:*）无数字 timestamp 或类型非消息，不会误删
        if (parsed && typeof parsed.timestamp === "number" &&
            (typeof parsed.message === "string" || ["image", "file", "zifu", "voice", "gh-card", "reply", "text", "recalled", "deleted"].includes(parsed.type))) {
          msgKeys.push(key);
        }
      } catch (e) {}
    }
    if (msgKeys.length > 0) {
      await this.storage.delete(msgKeys);
    }
    console.log(`Durable Object ID: ${this.state.id} - 清空了 ${msgKeys.length} 条聊天记录。`);
    this.lastTimestamp = 0;
    this.broadcast({type: "room-cleared"});
  }

  async handleSession(webSocket, ip) {
    // 房间已销毁，拒绝新连接（reason 用 destroyed，前端识别后跳首页避免无限重连）
    if (this._loadDestroyed) await this._loadDestroyed;
    if (this.destroyed) {
      webSocket.close(1000, "destroyed");
      return;
    }
    this.state.acceptWebSocket(webSocket);

    this.connCounter++;
    let connId = this.connCounter;
    let session = { blockedMessages: [], ip, connId, channel: "general" };
    webSocket.serializeAttachment({ ...webSocket.deserializeAttachment(), ip, connId, channel: "general" });
    this.sessions.set(webSocket, session);

    for (let otherSession of this.sessions.values()) {
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
    let storage = await this.storage.list({reverse: true, limit: 150});
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

    if (this._loadAnnouncement) await this._loadAnnouncement;
    if (this.announcement) {
      session.blockedMessages.push(JSON.stringify({type: "announcement", text: this.announcement}));
    }

    // 📌 置顶消息（v1.35）：加入时推送当前频道置顶列表（数组，可能为空）
    if (this._loadPinnedMessages) await this._loadPinnedMessages;
    session.blockedMessages.push(JSON.stringify({
      type: "pinned", channel: session.channel,
      pinned: (this.pinnedMessages && this.pinnedMessages[session.channel]) || []
    }));

    if (this._loadPolls) await this._loadPolls;
    if (this.polls && this.polls.size > 0) {
      for (let [pollId, poll] of this.polls) {
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

    if (this._loadHighlights) await this._loadHighlights;
    if (this.highlights && this.highlights.length > 0) {
      session.blockedMessages.push(JSON.stringify({type: "highlights-update", highlights: this.highlights}));
    }

    if (this._loadReactions) await this._loadReactions;
    if (this.reactions && Object.keys(this.reactions).length > 0) {
      for (let [rKey, rData] of Object.entries(this.reactions)) {
        if (Object.keys(rData).length > 0) {
          session.blockedMessages.push(JSON.stringify({type: "reaction-update", msgTimestamp: rKey, reactions: rData}));
        }
      }
    }

    if (this._loadRelays) await this._loadRelays;
    if (this.relays && this.relays.size > 0) {
      for (let [, relay] of this.relays) {
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

    if (this._loadChannels) await this._loadChannels;
    session.blockedMessages.push(JSON.stringify({type: "channels", channels: this.channels}));

    // 🏅 房间等级样式：加入时推送当前配置（前端据此渲染各等级徽章）
    if (this._loadLevelStyles) await this._loadLevelStyles;
    if (this.levelStyles && Object.keys(this.levelStyles).length > 0) {
      session.blockedMessages.push(JSON.stringify({type: "level-styles", styles: this.levelStyles}));
    }

    this.updateRegistry();
  }

  async updateRegistry() {
    if (!this.roomName || !this.env.registry || this.destroyed) return;
    try {
      let registryId = this.env.registry.idFromName("global");
      let stub = this.env.registry.get(registryId);
      let count = 0;
      for (let s of this.sessions.values()) {
        if (s.name) count++;
      }
      await stub.fetch("https://dummy-url/update?name=" + encodeURIComponent(this.roomName) + "&count=" + count);
    } catch (e) {}
  }

  async webSocketMessage(webSocket, msg) {
    try {
      let session = this.sessions.get(webSocket);
      if (session.quit) {
        webSocket.close(1011, "WebSocket 已损坏");
        return;
      }

      let data = JSON.parse(msg);

      if (!session.name) {
        let rawName = "" + (data.name || "匿名");

        if (rawName.length > 32) {
          webSocket.send(JSON.stringify({error: "名称过长"}));
          webSocket.close(1009, "名称过长");
          return;
        }

        // 🔒 用户名过滤：排除 HTML 特殊字符，防止存储型 XSS（允许中文/emoji）
        if (/[<>&"'\\]/.test(rawName)) {
          webSocket.send(JSON.stringify({error: "名称包含非法字符"}));
          webSocket.close(1009, "名称包含非法字符");
          return;
        }

        session.name = rawName;
        webSocket.serializeAttachment({ ...webSocket.deserializeAttachment(), name: session.name });

        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          let initUrl = "https://dummy-url/user-init?name=" + encodeURIComponent(session.name) +
            "&ip=" + encodeURIComponent(session.ip || "") +
            "&token=" + encodeURIComponent(data.token || "");
          let initRes = await stub.fetch(initUrl);
          let initData = await initRes.json();

          if (initData.banned) {
            webSocket.send(JSON.stringify({error: "你已被封禁，无法加入聊天室"}));
            webSocket.close(1000, "banned");
            return;
          }
          if (initData.ipBanned) {
            webSocket.send(JSON.stringify({error: "你的IP已被封禁，无法加入聊天室"}));
            webSocket.close(1000, "banned");
            return;
          }
          if (initData.registered && !initData.authenticated) {
            webSocket.send(JSON.stringify({error: "该名称已注册，请登录后使用"}));
            webSocket.close(1000, "unauthorized");
            return;
          }
          // 🔒 安全修复（LD9）：记录会话的 token 与认证状态，供红包/标签等特权操作持续校验
          session.token = data.token || "";
          session.authenticated = !!(initData.authenticated);

          if (initData.tag) {
            session.tag = initData.tag;
            session.tagColor = initData.color || "";
            session.tagBorder = initData.border || "";
          } else {
            session.tag = "USER";
            session.tagColor = "blue";
            session.tagBorder = "";
          }
          if (initData.vip) {
            session.vip = initData.vip;
          }
          if (initData.avatar) {
            session.avatar = initData.avatar;
          }
          if (initData.bio) {
            session.bio = initData.bio;
          }
        } catch (e) {
          session.tag = "";
          session.tagColor = "";
          session.tagBorder = "";
        }
        webSocket.serializeAttachment({ ...webSocket.deserializeAttachment(), tag: session.tag, tagColor: session.tagColor, tagBorder: session.tagBorder, vip: session.vip, avatar: session.avatar });

        session.blockedMessages.forEach(queued => {
          webSocket.send(queued);
        });
        delete session.blockedMessages;

        let joinMsg = {joined: session.name};
        if (session.tag) joinMsg.tag = session.tag;
        if (session.tagColor) joinMsg.tagColor = session.tagColor;
        if (session.tagBorder) joinMsg.tagBorder = session.tagBorder;
        if (session.vip) joinMsg.vip = session.vip;
        if (session.avatar) joinMsg.avatar = session.avatar;
        this.broadcast(joinMsg);

        this.updateRegistry();

        // 📌 在线@红点：上线时补显离线期间收到的 @ 提醒，并消费（标记已读）
        try {
          let atRaw = await this.storage.get("at-mentions");
          let atAll = [];
          if (atRaw) { let arr = JSON.parse(atRaw); if (Array.isArray(arr)) atAll = arr; }
          if (atAll.length > 0) {
            let mine = atAll.filter(m => m.target === session.name).slice(-20);
            if (mine.length > 0) {
              webSocket.send(JSON.stringify({
                type: "at-unread",
                mentions: mine.map(m => ({from: m.from, message: m.message, timestamp: m.ts}))
              }));
              let rest = atAll.filter(m => m.target !== session.name);
              await this.storage.put("at-mentions", JSON.stringify(rest.slice(-50)));
            }
          }
        } catch (e) {}

        webSocket.send(JSON.stringify({ready: true}));
        return;
      }

      // 🔇 禁言检查：被禁言者所有发言/操作被拦（typing 除外，避免打扰）
      if (data.type !== "typing" && session.name && !this.isAdminSession(session)) {
        let muted = null;
        try {
          let rid = this.env.registry.idFromName("global");
          let rstub = this.env.registry.get(rid);
          let r = await rstub.fetch("https://dummy-url/mute-status?name=" + encodeURIComponent(session.name));
          let d = await r.json();
          if (d.muted) {
            muted = {remainingMs: d.remainingMs, permanent: d.permanent, reason: d.reason || ""};
          }
        } catch (e) {}
        if (muted) {
          let remainMin = Math.max(1, Math.ceil(muted.remainingMs / 60000));
          let tip = muted.permanent
            ? "你已被禁言，无法发言（永久）"
            : "你已被禁言，剩余 " + remainMin + " 分钟无法发言";
          if (muted.reason) tip += "（原因: " + muted.reason + "）";
          webSocket.send(JSON.stringify({error: tip}));
          return;
        }
      }

      if (data.type === "kick") {
        // 🔒 安全修复（M10）：未设名的游客会话禁止踢人
        if (!session.name) {
          webSocket.send(JSON.stringify({error: "请先设置昵称后再踢人"}));
          return;
        }
        // 🔒 安全修复（M10）：踢人限频（普通用户30秒内只能踢1次，管理员不限），防反复骚扰他人
        let isKickAdmin = this.isAdminSession(session);
        // 🔒 安全修复（M10）：非管理员踢人必须是已认证（登录）用户，堵住游客换名重连绕限频
        if (!isKickAdmin && !session.authenticated) {
          webSocket.send(JSON.stringify({error: "请登录后再踢人"}));
          return;
        }
        if (!isKickAdmin) {
          if (!this.lastKick) this.lastKick = new Map();
          let last = this.lastKick.get(session.name) || 0;
          if (Date.now() - last < 30000) {
            webSocket.send(JSON.stringify({error: "踢人操作太频繁，请稍后再试"}));
            return;
          }
          this.lastKick.set(session.name, Date.now());
        }
        if (this.blacklist.has(session.name)) {
          webSocket.send(JSON.stringify({error: "你已被加入黑名单，无法踢人"}));
          return;
        }

        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          let gbCheck = await stub.fetch("https://dummy-url/is-globally-blacklisted?name=" + encodeURIComponent(session.name));
          let gbResult = await gbCheck.json();
          if (gbResult.blacklisted) {
            webSocket.send(JSON.stringify({error: "你已被全局拉黑，无法踢人"}));
            return;
          }
        } catch (e) {}

        let targetName = data.target;
        if (!targetName) {
          webSocket.send(JSON.stringify({error: "未指定要踢出的用户"}));
          return;
        }

        if (targetName === session.name) {
          webSocket.send(JSON.stringify({error: "不能踢出自己"}));
          return;
        }

        for (let [ws, s] of this.sessions) {
          if (s.name === targetName && s.vip && s.vip.features && s.vip.features.kickProtect) {
            webSocket.send(JSON.stringify({error: "受保护，无法踢出"}));
            return;
          }
        }

        // 检查全局保护名单
        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          let checkRes = await stub.fetch(new URL("https://dummy-url/is-kick-protected?name=" + encodeURIComponent(targetName)));
          let checkData = await checkRes.json();
          if (checkData.protected) {
            webSocket.send(JSON.stringify({error: targetName + " 受保护，无法踢出"}));
            return;
          }
        } catch (e) {}

        // 🔒 安全修复（M10）：同一目标 60 秒内只能被踢一次（限频键为目标名，换名重连也无法绕过）
        if (!isKickAdmin) {
          if (!this.lastKickTarget) this.lastKickTarget = new Map();
          let lastT = this.lastKickTarget.get(targetName) || 0;
          if (Date.now() - lastT < 60000) {
            webSocket.send(JSON.stringify({error: targetName + " 刚被踢出过，请稍后再试"}));
            return;
          }
        }

        let kickedEntry = null;
        for (let [ws, s] of this.sessions) {
          if (s.name === targetName) {
            kickedEntry = {ws, s};
            break;
          }
        }

        if (kickedEntry) {
          if (!isKickAdmin) this.lastKickTarget.set(targetName, Date.now());
          this.sessions.delete(kickedEntry.ws);
          kickedEntry.ws.close(1000, "kicked");
          this.broadcast({kicked: targetName});
          webSocket.send(JSON.stringify({system: "你已将 " + targetName + " 踢出房间"}));
        } else {
          webSocket.send(JSON.stringify({error: "未找到用户 " + targetName}));
        }
        return;
      }

      if (data.type === "whisper") {
        let targetName = "" + data.target;
        let whisperMsg = "" + data.message;
        if (!targetName || !whisperMsg) {
          webSocket.send(JSON.stringify({error: "私聊格式错误"}));
          return;
        }
        // 🔒 安全修复（v1.34）：私信仅限已登录用户（防游客冒名发私信骚扰/钓鱼）
        if (!session.authenticated) {
          webSocket.send(JSON.stringify({error: "请先登录后再发送私信"}));
          return;
        }
        let whisperMax = (session.vip && session.vip.features ? session.vip.features.maxMsgLen : 256);
        if (whisperMsg.length > whisperMax) {
          webSocket.send(JSON.stringify({error: "消息过长（VIP最高 " + whisperMax + " 字）"}));
          return;
        }
        // 🔒 安全修复（W7）：私信内容过敏感词过滤，防绕过审查
        if (this.containsProfanity(whisperMsg)) {
          webSocket.send(JSON.stringify({error: "私信包含违规词汇，已拦截"}));
          return;
        }
        // 👥 v1.48 关系链：对方拉黑我则私信拦截
        try {
          let rid = this.env.registry.idFromName("global");
          let rstub = this.env.registry.get(rid);
          let r = await rstub.fetch("https://dummy-url/rel/blocked?from=" + encodeURIComponent(targetName) + "&to=" + encodeURIComponent(session.name));
          let d = await r.json();
          if (d.blocked) {
            webSocket.send(JSON.stringify({error: "对方已拉黑你，无法发送私信"}));
            return;
          }
        } catch (e) {}

        let found = false;
        this.sessions.forEach((s, ws) => {
          if (s.name === targetName) {
            ws.send(JSON.stringify({
              type: "whisper",
              from: session.name,
              message: whisperMsg,
              timestamp: Math.max(Date.now(), this.lastTimestamp + 1)
            }));
            found = true;
          }
        });

        webSocket.send(JSON.stringify({
          type: "whisper",
          from: session.name,
          to: targetName,
          message: whisperMsg,
          timestamp: Math.max(Date.now(), this.lastTimestamp + 1)
        }));

        if (!found) {
          webSocket.send(JSON.stringify({error: "用户 " + targetName + " 不在线"}));
        }
        return;
      }

      if (data.type === "typing") {
        this.broadcastToChannel(session.channel || "general", {type: "typing", name: session.name, channel: session.channel || "general"});
        return;
      }

      if (await handleMedia(this, session, data, webSocket)) return;

      if (data.type === "poll-create") {
        if (this._loadPolls) await this._loadPolls;
        // 🔒 安全修复（W12）：清理超过24小时的过期轮询，防 polls 永久堆积
        let cutoff = Date.now() - 24 * 3600 * 1000;
        for (let [pid, p] of this.polls) {
          if (p.timestamp < cutoff) this.polls.delete(pid);
        }
        // 🔒 安全修复（W12）：创建限频（每用户10秒1个），防刷屏创建投票
        if (!this.lastPollCreate) this.lastPollCreate = new Map();
        let lastPC = this.lastPollCreate.get(session.name) || 0;
        if (Date.now() - lastPC < 10000) {
          webSocket.send(JSON.stringify({error: "创建投票太频繁，请稍后再试"}));
          return;
        }
        this.lastPollCreate.set(session.name, Date.now());
        let question = "" + data.question;
        let options = data.options;
        if (!question || !Array.isArray(options) || options.length < 2 || options.length > 10) {
          webSocket.send(JSON.stringify({error: "投票需要2-10个选项"}));
          return;
        }
        if (question.length > 200) {
          webSocket.send(JSON.stringify({error: "问题过长"}));
          return;
        }
        // 🔒 安全修复（W12）：单选项长度限制（防超长选项撑爆存储）
        for (let opt of options) {
          if (("" + opt).length > 100) {
            webSocket.send(JSON.stringify({error: "选项过长（最多100字）"}));
            return;
          }
        }
        // 🔒 安全修复（W7）：投票问题与选项过敏感词过滤，防绕过审查
        if (this.containsProfanity(question)) {
          webSocket.send(JSON.stringify({error: "投票问题包含违规词汇，已拦截"}));
          return;
        }
        for (let opt of options) {
          if (this.containsProfanity("" + opt)) {
            webSocket.send(JSON.stringify({error: "投票选项包含违规词汇，已拦截"}));
            return;
          }
        }
        let pollId = "poll_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        let poll = {
          id: pollId,
          question: question,
          options: options.map((text, i) => ({index: i, text: "" + text, votes: []})),
          creator: session.name,
          timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
          voters: {},
          channel: data.channel || session.channel || "general"
        };
        this.polls.set(pollId, poll);
        await this.storage.put("polls", [...this.polls]);
        this.broadcastToChannel(poll.channel, {
          type: "poll",
          pollId: pollId,
          question: question,
          options: options.map((text, i) => ({index: i, text: "" + text})),
          creator: session.name,
          timestamp: poll.timestamp,
          channel: poll.channel
        });
        return;
      }

      if (data.type === "poll-vote") {
        let pollId = data.pollId;
        let optionIndex = parseInt(data.optionIndex, 10);
        if (!pollId || isNaN(optionIndex)) {
          webSocket.send(JSON.stringify({error: "投票参数错误"}));
          return;
        }
        if (this._loadPolls) await this._loadPolls;
        let poll = this.polls.get(pollId);
        if (!poll) {
          webSocket.send(JSON.stringify({error: "投票不存在"}));
          return;
        }
        // 🔒 安全修复（v1.34）：投票仅限已登录用户（防游客换名换IP刷票，已注册用户按 name 去重 + votedIps 辅助）
        if (!session.authenticated) {
          webSocket.send(JSON.stringify({error: "请先登录后再投票"}));
          return;
        }
        if (poll.voters[session.name] !== undefined) {
          webSocket.send(JSON.stringify({error: "你已经投过票了"}));
          return;
        }
        if (optionIndex < 0 || optionIndex >= poll.options.length) {
          webSocket.send(JSON.stringify({error: "选项不存在"}));
          return;
        }
        // 🔒 安全修复：同一IP每场投票限1票 + 限频，防批量连接换名刷票（保留按名字记录用于展示）
        if (session.ip) {
          if (poll.votedIps && poll.votedIps[session.ip]) {
            webSocket.send(JSON.stringify({error: "同一IP只能投一票"}));
            return;
          }
          if (!this.lastVote) this.lastVote = new Map();
          let lastVoteAt = this.lastVote.get(session.ip) || 0;
          if (Date.now() - lastVoteAt < 3000) {
            webSocket.send(JSON.stringify({error: "投票太频繁，请稍后再试"}));
            return;
          }
          this.lastVote.set(session.ip, Date.now());
        }
        poll.voters[session.name] = optionIndex;
        if (!poll.votedIps) poll.votedIps = {};
        if (session.ip) poll.votedIps[session.ip] = true;
        poll.options[optionIndex].votes.push(session.name);
        await this.storage.put("polls", [...this.polls]);
        let pollCh = poll.channel || "general";
        this.broadcastToChannel(pollCh, {
          type: "poll-update",
          pollId: pollId,
          options: poll.options.map(o => ({index: o.index, text: o.text, count: o.votes.length})),
          totalVoters: Object.keys(poll.voters).length,
          channel: pollCh
        });
        return;
      }

      if (data.type === "schedule") {
        if (this._loadScheduled) await this._loadScheduled;
        let schedMsg = "" + data.message;
        let schedTime = parseInt(data.time, 10);
        if (!schedMsg || !schedTime || schedTime <= Date.now()) {
          webSocket.send(JSON.stringify({error: "定时时间必须在未来"}));
          return;
        }
        if (schedTime > Date.now() + 7 * 24 * 3600 * 1000) {
          webSocket.send(JSON.stringify({error: "定时时间不能超过7天"}));
          return;
        }
        let maxLen = (session.vip && session.vip.features ? session.vip.features.maxMsgLen : 256);
        if (schedMsg.length > maxLen) {
          webSocket.send(JSON.stringify({error: "消息过长"}));
          return;
        }
        // 🔒 安全修复（W7）：定时消息同样过敏感词过滤，防绕过审查定时广播违规内容
        if (this.containsProfanity(schedMsg)) {
          webSocket.send(JSON.stringify({error: "定时消息包含违规词汇，已拦截"}));
          return;
        }
        if (!this.scheduledMessages) this.scheduledMessages = [];
        // 🔒 安全修复（LD17）：定时消息数量上限（每用户5条、房间50条），防整数组重写 storage 造成 O(n²) 存储/CPU DoS
        let myCount = this.scheduledMessages.filter(s => s.name === session.name).length;
        if (myCount >= 5) {
          webSocket.send(JSON.stringify({error: "你最多可创建5条定时消息，请先取消旧的"}));
          return;
        }
        if (this.scheduledMessages.length >= 50) {
          webSocket.send(JSON.stringify({error: "房间定时消息已达上限（50条）"}));
          return;
        }
        // 🔒 安全修复（v1.34）：公告频道仅管理员可发定时消息（防游客 switch-channel 到 announcement 再 schedule 绕过公告只读检查）
        if (this._loadChannels) await this._loadChannels;
        let schedChanName = session.channel || "general";
        let schedChanObj = this.channels.find(c => c.name === schedChanName);
        if (schedChanObj && schedChanObj.type === "announcement" && !this.isAdminSession(session)) {
          webSocket.send(JSON.stringify({error: "公告频道仅管理员可发"}));
          return;
        }
        let schedEntry = {
          id: "sched_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
          name: session.name,
          message: schedMsg,
          time: schedTime,
          createdAt: Date.now(),
          channel: session.channel || "general",
          admin: this.isAdminSession(session),
          tag: session.tag || "",
          tagColor: session.tagColor || "",
          tagBorder: session.tagBorder || ""
        };
        this.scheduledMessages.push(schedEntry);
        await this.storage.put("scheduledMessages", this.scheduledMessages);
        let nearest = Math.min(...this.scheduledMessages.map(s => s.time));
        await this.state.storage.setAlarm(nearest);
        webSocket.send(JSON.stringify({type: "schedule-confirm", id: schedEntry.id, time: schedTime}));
        return;
      }

      if (data.type === "schedule-cancel") {
        let cancelId = data.id;
        if (!cancelId) { webSocket.send(JSON.stringify({error: "缺少定时消息ID"})); return; }
        if (this._loadScheduled) await this._loadScheduled;
        let sched = (this.scheduledMessages || []).find(s => s.id === cancelId);
        if (!sched) { webSocket.send(JSON.stringify({error: "定时消息不存在"})); return; }
        // 🔒 安全修复（W6）：只能取消自己创建的定时消息（管理员可取消任意）
        if (sched.name !== session.name && !this.isAdminSession(session)) {
          webSocket.send(JSON.stringify({error: "只能取消自己创建的定时消息"}));
          return;
        }
        this.scheduledMessages = (this.scheduledMessages || []).filter(s => s.id !== cancelId);
        await this.storage.put("scheduledMessages", this.scheduledMessages);
        if (this.scheduledMessages.length > 0) {
          let nearest = Math.min(...this.scheduledMessages.map(s => s.time));
          await this.state.storage.setAlarm(nearest);
        }
        webSocket.send(JSON.stringify({type: "schedule-cancel-confirm", id: cancelId}));
        return;
      }

      if (data.type === "relay-create") {
        let topic = "" + (data.topic || "");
        if (!topic || topic.length > 100) {
          webSocket.send(JSON.stringify({error: "接龙主题不能为空且不超过100字"}));
          return;
        }
        // 🔒 安全修复（W7）：接龙主题过敏感词过滤
        if (this.containsProfanity(topic)) {
          webSocket.send(JSON.stringify({error: "接龙主题包含违规词汇，已拦截"}));
          return;
        }
        if (this._loadRelays) await this._loadRelays;
        let autoEnded = false;
        for (let [, relay] of this.relays) {
          if (relay.active) {
            // 🔒 安全修复（LD18）：超过24小时的接龙自动结束，防游客创建后断线永久锁死接龙功能
            if (Date.now() - (relay.startedAt || 0) > 24 * 3600 * 1000) {
              relay.active = false;
              autoEnded = true;
              continue;
            }
            webSocket.send(JSON.stringify({error: "已存在进行中的接龙: " + relay.topic + "，请先结束"}));
            return;
          }
        }
        if (autoEnded) await this.storage.put("relays", [...this.relays]);
        let relayId = "relay_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        this.relays.set(relayId, {
          id: relayId, topic: topic, entries: [], active: true,
          startedBy: session.name, startedAt: Date.now()
        });
        await this.storage.put("relays", [...this.relays]);
        this.broadcast({
          type: "relay-new", relayId: relayId, topic: topic,
          startedBy: session.name, startedAt: Date.now()
        });
        return;
      }

      if (data.type === "relay-add") {
        let relayId = data.relayId;
        let content = "" + (data.content || "");
        let number = parseInt(data.number, 10);
        if (!relayId || !content || isNaN(number)) {
          webSocket.send(JSON.stringify({error: "接龙参数错误"}));
          return;
        }
        if (this._loadRelays) await this._loadRelays;
        let relay = this.relays.get(relayId);
        if (!relay) { webSocket.send(JSON.stringify({error: "接龙不存在"})); return; }
        if (!relay.active) { webSocket.send(JSON.stringify({error: "接龙已结束"})); return; }
        if (number !== relay.entries.length + 1) {
          webSocket.send(JSON.stringify({error: "顺序错误，当前轮到第 " + (relay.entries.length + 1) + " 个"}));
          return;
        }
        if (content.length > 200) { webSocket.send(JSON.stringify({error: "内容过长（最多200字）"})); return; }
        // 🔒 安全修复（W7）：接龙内容过敏感词过滤
        if (this.containsProfanity(content)) {
          webSocket.send(JSON.stringify({error: "接龙内容包含违规词汇，已拦截"}));
          return;
        }
        // 🔒 安全修复（v1.34）：接龙每用户限频（2秒1条），防连发刷屏
        if (!this.lastRelayAdd) this.lastRelayAdd = new Map();
        let lastRelayAddAt = this.lastRelayAdd.get(session.name) || 0;
        if (Date.now() - lastRelayAddAt < 2000) {
          webSocket.send(JSON.stringify({error: "接龙操作太频繁，请稍后再试"}));
          return;
        }
        this.lastRelayAdd.set(session.name, Date.now());
        // 接龙条目总数上限，防无限堆积
        if (relay.entries.length >= 500) {
          webSocket.send(JSON.stringify({error: "接龙条目已达上限（500条）"}));
          return;
        }
        relay.entries.push({number, user: session.name, content, timestamp: Date.now()});
        await this.storage.put("relays", [...this.relays]);
        this.broadcast({type: "relay-update", relayId, entry: {number, user: session.name, content, timestamp: Date.now()}, totalCount: relay.entries.length});
        return;
      }

      if (data.type === "relay-end") {
        let relayId = data.relayId;
        if (this._loadRelays) await this._loadRelays;
        let relay = this.relays.get(relayId);
        if (!relay) { webSocket.send(JSON.stringify({error: "接龙不存在"})); return; }
        // 🔒 安全修复（LD18）：发起者或管理员（red/cyan）可结束接龙，防游客创建后断线导致功能永久锁死
        if (relay.startedBy !== session.name && !this.isAdminSession(session)) {
          webSocket.send(JSON.stringify({error: "只有发起者或管理员可以结束接龙"})); return;
        }
        relay.active = false;
        await this.storage.put("relays", [...this.relays]);
        this.broadcast({type: "relay-ended", relayId, totalCount: relay.entries.length, endedBy: session.name});
        return;
      }

      if (data.type === "relay-list") {
        if (this._loadRelays) await this._loadRelays;
        let activeRelays = [];
        for (let [, relay] of this.relays) {
          if (relay.active) {
            activeRelays.push({
              id: relay.id, topic: relay.topic, startedBy: relay.startedBy,
              startedAt: relay.startedAt, entryCount: relay.entries.length,
              nextNumber: relay.entries.length + 1
            });
          }
        }
        webSocket.send(JSON.stringify({type: "relay-list-result", relays: activeRelays}));
        return;
      }

      if (data.type === "reaction") {
        if (this._loadReactions) await this._loadReactions;
        let rKey = "" + data.msgTimestamp;
        if (!rKey) { webSocket.send(JSON.stringify({error: "缺少消息时间戳"})); return; }
        // 🔒 安全修复（W5）：rKey 必须是数字时间戳（防伪造任意键无限增长 + 原型污染面）
        if (!/^\d{10,14}$/.test(rKey)) {
          webSocket.send(JSON.stringify({error: "无效的消息时间戳"}));
          return;
        }
        // 🔒 安全修复（W5）：反应限频（每用户2秒1次）+ 反应总数上限（防存储/内存 DoS）
        if (!this.lastReaction) this.lastReaction = new Map();
        let lastReact = this.lastReaction.get(session.name) || 0;
        if (Date.now() - lastReact < 2000) {
          webSocket.send(JSON.stringify({error: "操作太频繁，请稍后再试"}));
          return;
        }
        this.lastReaction.set(session.name, Date.now());
        if (this.reactions && Object.keys(this.reactions).length > 2000) {
          webSocket.send(JSON.stringify({error: "反应数量已达上限"}));
          return;
        }
        // 防止原型污染：阻止 __proto__、constructor、prototype 作为键
        let emoji = ("" + data.emoji).trim();
        if (!emoji || emoji === "__proto__" || emoji === "constructor" || emoji === "prototype") {
          webSocket.send(JSON.stringify({error: "无效的表情"}));
          return;
        }
        // 🔒 安全修复（W7）：表情内容过敏感词过滤，防绕过审查
        if (this.containsProfanity(emoji)) {
          webSocket.send(JSON.stringify({error: "表情包含违规词汇，已拦截"}));
          return;
        }
        if (!this.reactions[rKey] || typeof this.reactions[rKey] !== "object") this.reactions[rKey] = {};
        if (data.action === "remove") {
          if (this.reactions[rKey][emoji]) {
            this.reactions[rKey][emoji] = (this.reactions[rKey][emoji] || []).filter(u => u !== session.name);
            if (this.reactions[rKey][emoji].length === 0) delete this.reactions[rKey][emoji];
            if (Object.keys(this.reactions[rKey]).length === 0) delete this.reactions[rKey];
          }
        } else {
          if (!this.reactions[rKey][emoji]) this.reactions[rKey][emoji] = [];
          if (!this.reactions[rKey][emoji].includes(session.name)) this.reactions[rKey][emoji].push(session.name);
        }
        await this.storage.put("reactions", JSON.stringify(this.reactions));
        this.broadcast({type: "reaction-update", msgTimestamp: rKey, reactions: this.reactions[rKey] || {}});
        return;
      }

      // ====== 红包 ======
      if (data.type === "redpacket") {
        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          if (data.action === "create") {
            let total = parseInt(data.total) || 0;
            let count = parseInt(data.count) || 0;
            let mode = data.mode || "random";
            if (total < 1 || count < 1) { webSocket.send(JSON.stringify({error: "参数无效"})); return; }
            let r = await stub.fetch("https://dummy-url/redpacket/create", {
              method: "POST",
              body: JSON.stringify({creator: session.name, total, count, mode, room: this.roomName, token: session.token || ""}),
              headers: {"Content-Type": "application/json"}
            });
            let result = await r.json();
            if (result.ok) {
              let rp = result.redpacket;
              this.redpacketChannels.set(rp.id, session.channel || "general");
              // 持久化并限容（红包为一次性，映射只保留最近300条）
              if (this.redpacketChannels.size > 300) {
                let oldestId = this.redpacketChannels.keys().next().value;
                if (oldestId) this.redpacketChannels.delete(oldestId);
              }
              await this.storage.put("redpacketChannels", [...this.redpacketChannels]);
              let msg = {
                type: "redpacket",
                action: "new",
                id: rp.id, creator: rp.creator,
                total: rp.total, count: rp.count, mode: rp.mode,
                remaining: rp.remaining, remainingCount: rp.remainingCount,
                timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
                channel: session.channel || "general",
                name: session.name,
                tag: session.tag || "",
                tagColor: session.tagColor || "",
                tagBorder: session.tagBorder || ""
              };
              msg.id = ++this.msgCounter;
              this.lastTimestamp = msg.timestamp;
              this.broadcastToChannel(session.channel || "general", JSON.stringify(msg));
              // 不存storage（红包消息不持久化）
            } else {
              webSocket.send(JSON.stringify({error: result.error || "红包创建失败"}));
            }
          } else if (data.action === "grab") {
            let rpId = data.id;
            if (!rpId) { webSocket.send(JSON.stringify({error: "缺少红包ID"})); return; }
            // 🔒 安全修复（E3）：抢红包需注册用户，并校验所在房间 + 携带 IP 用于限频
            let r = await stub.fetch("https://dummy-url/redpacket/grab", {
              method: "POST",
              body: JSON.stringify({id: rpId, user: session.name, room: this.roomName, ip: session.ip || "", token: session.token || ""}),
              headers: {"Content-Type": "application/json"}
            });
            let result = await r.json();
            if (result.ok) {
              // 抢到红包，按红包所在频道广播结果
              if (this._loadRedpacketChannels) await this._loadRedpacketChannels; // 防 DO 重启后映射未加载完
              let rpCh = this.redpacketChannels.get(rpId) || "general";
              this.broadcastToChannel(rpCh, {
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
        return;
      }

      if (await handleManage(this, session, data, webSocket)) return;

      if (this._loadChannels) await this._loadChannels; // 确保频道列表已加载（防热重启后自定义公告频道只读失效）
      let msgChannel = session.channel || "general";
      // 频道体系：公告频道只读，仅管理员（red/cyan）可发言
      let curChan = this.channels.find(c => c.name === msgChannel);
      if (curChan && curChan.type === "announcement" && !this.isAdminSession(session)) {
        webSocket.send(JSON.stringify({error: "仅管理员可在公告频道发言"}));
        return;
      }
      // 🐙 /gh 仓库卡片（旧版前端兼容）：部分旧前端会直接发 {type:"gh-card"}，此处校验后广播
      if (data.type === "gh-card") {
        // 🔒 安全修复（F2 补漏）：旧版直接发 {type:"gh-card"} 的分支在匿名块之前 return、不处理 anonFlag，
        // 匿名用户走此路径会以真实用户名广播且不扣券。拒绝匿名走旧路径（当前前端用 /gh 命令，匿名 /gh 已正确匿名化+扣券）。
        if (data.anon) {
          webSocket.send(JSON.stringify({error: "匿名模式请使用 /gh 命令发送仓库卡片"}));
          return;
        }
        let ghRepo = "" + (data.repo || "");
        let ghUrl = "" + (data.repoUrl || "");
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(ghRepo)) {
          webSocket.send(JSON.stringify({error: "无效的仓库名称"}));
          return;
        }
        if (!/^https:\/\/github\.com\//i.test(ghUrl)) {
          webSocket.send(JSON.stringify({error: "无效的仓库地址"}));
          return;
        }
        let ghDesc = ("" + (data.description || "")).slice(0, 300);
        let ghStars = parseInt(data.stars) || 0;
        let ghForks = parseInt(data.forks) || 0;
        let ghLang = ("" + (data.language || "")).slice(0, 30);
        let ghOwnerAvatar = ("" + (data.ownerAvatar || "")).slice(0, 300);
        let ghCard = {
          name: session.name, type: "gh-card", channel: msgChannel,
          repo: ghRepo, repoUrl: ghUrl, description: ghDesc,
          stars: ghStars, forks: ghForks, language: ghLang,
          ownerAvatar: ghOwnerAvatar,
          timestamp: Math.max(Date.now(), this.lastTimestamp + 1)
        };
        if (session.tag) ghCard.tag = session.tag;
        if (session.tagColor) ghCard.tagColor = session.tagColor;
        if (session.tagBorder) ghCard.tagBorder = session.tagBorder;
        if (session.avatar) ghCard.avatar = session.avatar;
        this.lastTimestamp = ghCard.timestamp;
        ghCard.id = ++this.msgCounter;
        this.messages.set(ghCard.id, ghCard);
        this.broadcastToChannel(msgChannel, JSON.stringify(ghCard));
        await this.storage.put(new Date(ghCard.timestamp).toISOString(), JSON.stringify(ghCard));
        return;
      }
      // 🗑️ 消息删除：本人可永久删除自己的消息（不限时间），管理员可删任意单条
      if (data.type === "delete-message") {
        let delTs = parseInt(data.timestamp);
        if (!delTs || isNaN(delTs)) { webSocket.send(JSON.stringify({error: "无效的消息标识"})); return; }
        let delKey = new Date(delTs).toISOString();
        let delRaw = await this.storage.get(delKey);
        if (!delRaw) { webSocket.send(JSON.stringify({error: "消息不存在或已过期"})); return; }
        let delOrig;
        try { delOrig = JSON.parse(delRaw); } catch (e) { webSocket.send(JSON.stringify({error: "消息数据异常"})); return; }
        if (delOrig.type === "recalled" || delOrig.type === "deleted") {
          webSocket.send(JSON.stringify({error: "该消息已被撤回或删除"})); return;
        }
        let isDelAdmin = this.isAdminSession(session);
        // 🔒 安全修复（F7）：匿名消息存储时 name="匿名"，原判定使真实发送者永远删不掉自己的匿名消息；
        // 增加对 storage 中 _anonOwner（真实 name 哈希）的校验，允许本人删除且不向他人泄露身份
        let isAnonOwner = !session.name ? false : (delOrig.name === "匿名" && !!delOrig._anonOwner && delOrig._anonOwner === hashAnonOwner(session.name));
        if (!isDelAdmin && (!session.name || (delOrig.name !== session.name && !isAnonOwner))) {
          webSocket.send(JSON.stringify({error: "无权删除他人的消息"})); return;
        }
        let delMsg = {type: "deleted", name: delOrig.name || "", timestamp: delTs, channel: delOrig.channel || "general"};
        await this.storage.put(delKey, JSON.stringify(delMsg));
        this.broadcastToChannel(delMsg.channel, JSON.stringify(delMsg));
        return;
      }
      let msgColor = data.color;
      // 🔒 安全修复（W20）：消息颜色仅允许预设色名或 hex，防 style.color 注入骚扰
      if (msgColor) {
        if (!SAFE_COLOR_RE.test(String(msgColor))) msgColor = "";
      }
      let replyData = data.reply;
      let atAll = data.atAll;
      let anonFlag = !!data.anon;
      data = { name: session.name, message: "" + data.message, channel: msgChannel };
      if (session.tag) data.tag = session.tag;
      if (session.tagColor) data.tagColor = session.tagColor;
      if (session.tagBorder) data.tagBorder = session.tagBorder;
      if (session.avatar) data.avatar = session.avatar;
      if (msgColor) data.color = msgColor;
      if (replyData) data.reply = replyData;
      if (atAll) data.atAll = true;

      // 🔒 安全修复（L11）：空消息/纯空白消息直接拒绝（只加空校验，不加发送限频）
      if (!data.message || !data.message.trim()) {
        webSocket.send(JSON.stringify({error: "消息不能为空"}));
        return;
      }

      let maxMsgLen = (session.vip && session.vip.features ? session.vip.features.maxMsgLen : 256);
      if (data.message.length > maxMsgLen) {
        webSocket.send(JSON.stringify({error: "消息过长（VIP最高 " + maxMsgLen + " 字）"}));
        return;
      }

      if (this.containsProfanity(data.message)) {
        // 🔒 安全修复：敏感词只拦截该条消息，不再自动封禁用户名+IP
        // 因用户名可冒名，自动封禁会被恶意利用来封禁任何人的昵称，封禁应由管理员手动执行
        webSocket.send(JSON.stringify({error: "消息包含违规内容，已拦截。请注意言辞，严重违规将被管理员封禁。"}));
        return;
      }

      // 🕶️ 匿名马甲：消耗一张匿名券，消息以「匿名」身份展示（真实身份由 registry /anon/use 写审计日志）。
      // 🔒 安全修复（F2）：券校验+身份替换提前到命令（/gh /ai /bot 等）分支之前——原逻辑放在命令全部 return
      // 之后，匿名用户发 /gh /ai 会以真实用户名广播且不扣券，绕过匿名。命令消息同样扣券校验，广播身份统一匿名。
      // 🔒 安全修复（F6）：匿名消息清除发送者自定义颜色，防个性化颜色作身份指纹。
      if (anonFlag) {
        if (!session.authenticated) {
          webSocket.send(JSON.stringify({error: "请先登录后再使用匿名发言"}));
          return;
        }
        try {
          let rid = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(rid);
          let useResp = await stub.fetch("https://dummy-url/anon/use", {
            method: "POST",
            body: JSON.stringify({name: session.name, token: session.token || "", channel: msgChannel}),
            headers: {"Content-Type": "application/json"}
          });
          if (!useResp.ok) {
            let errText = await useResp.text();
            let errObj = {};
            try { errObj = JSON.parse(errText); } catch (e) {}
            webSocket.send(JSON.stringify({error: errObj.error || "匿名券不足，可在商店购买"}));
            return;
          }
        } catch (e) {
          webSocket.send(JSON.stringify({error: "匿名服务暂时不可用"}));
          return;
        }
        data.name = "匿名";
        data.tag = "🕶️";
        data.tagColor = "purple";
        data.tagBorder = "";
        data.avatar = "";
        data.color = "";
        data.anon = true;
      }

      // 检测 @bot 或 /bot 命令
      let botMatch = data.message.match(/^[@\/]bot\s+(.+)/i);
      if (botMatch) {
        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          let cmdKeyword = botMatch[1].trim().split(/\s+/)[0];

          // help 命令 - 列出所有可用命令
          if (cmdKeyword === "help") {
            let listResp = await stub.fetch("https://dummy-url/bot-commands?action=list");
            let cmds = await listResp.json();
            let enabled = cmds.filter(c => c.enabled !== false);
            let helpText = enabled.length > 0 ? "可用命令: " + enabled.map(c => c.keyword).join(", ") : "暂无可用命令";
            let helpMsg = {name: "Bot", message: helpText, tag: "🤖", tagColor: "green", timestamp: Math.max(Date.now(), this.lastTimestamp + 1), id: ++this.msgCounter};
            this.lastTimestamp = helpMsg.timestamp;
            this.broadcast(JSON.stringify(helpMsg));
            let helpKey = new Date(helpMsg.timestamp).toISOString();
            await this.storage.put(helpKey, JSON.stringify(helpMsg));
            return;
          }

          let botResp = await stub.fetch("https://dummy-url/bot-commands?action=get&keyword=" + encodeURIComponent(cmdKeyword));
          if (botResp.ok) {
            let cmdData = await botResp.json();
            if (cmdData.enabled !== false && cmdData.response) {
              let botMsg = {name: "Bot", message: cmdData.response, tag: "🤖", tagColor: "green", channel: session.channel || "general", timestamp: Math.max(Date.now(), this.lastTimestamp + 1), id: ++this.msgCounter};
              this.lastTimestamp = botMsg.timestamp;
              this.broadcastToChannel(session.channel || "general", JSON.stringify(botMsg));
              let key = new Date(botMsg.timestamp).toISOString();
              await this.storage.put(key, JSON.stringify(botMsg));
              return;
            }
          }
          webSocket.send(JSON.stringify({error: "未知命令，输入 /bot help 查看可用命令"}));
        } catch (e) {
          webSocket.send(JSON.stringify({error: "机器人暂时不可用"}));
        }
        return;
      }

      // 🚨 全屏入侵警告命令（公开功能，仿 /rollback 服务端透传）：/icco
      // 服务端统一广播，所有在线用户（含发起者，任意频道）同时触发全屏警告动画
      if (/^\/icco\b/i.test(data.message)) {
        this.broadcast({type: "effect", effect: "icco"});
        return;
      }

      // 应急回滚命令（公开管理功能）：/rollback <版本号> <超管密钥>
      // 用于聊天室出问题时，超管在手机上快速把线上 worker 回滚部署到 archive 中的稳定版本
      let rbMatch = data.message.match(/^\/rollback\s+(\S+)\s+(\S+)/i);
      if (rbMatch) {
        if (!this.env.ADMIN_SECRET_KEY || rbMatch[2] !== this.env.ADMIN_SECRET_KEY) {
          webSocket.send(JSON.stringify({error: "回滚密钥无效"}));
          return;
        }
        let rbVersion = rbMatch[1];
        webSocket.send(JSON.stringify({system: "正在执行回滚到版本 " + rbVersion + " ..."}));
        this._doRollback(rbVersion, webSocket).catch(e => {
          try { webSocket.send(JSON.stringify({error: "回滚失败: " + (e && e.message || String(e))})); } catch (_) {}
        });
        return;
      }

      // 💥 销毁房间命令（公开管理功能，仿 /rollback 透传）：/destroy <销毁口令>
      // 销毁当前房间：清空全部数据、断开所有连接、从 registry 移除
      let dsMatch = data.message.match(/^\/destroy\s+(\S+)/i);
      if (dsMatch) {
        if (!this.env.DESTROY_KEY || dsMatch[1] !== this.env.DESTROY_KEY) {
          webSocket.send(JSON.stringify({error: "销毁口令无效"}));
          return;
        }
        try { webSocket.send(JSON.stringify({system: "正在销毁房间，所有数据将永久删除..."})); } catch (_) {}
        try {
          this.destroyed = true;
          try { await this.storage.put("__destroyed__", "1"); } catch (e) {}
          await this.clearAllMessages();
          // 先广播销毁通知（前端收到直接跳首页，不依赖 CloseEvent.reason，兼容各浏览器）
          let destroyNotice = JSON.stringify({type: "destroyed"});
          this.sessions.forEach((s, ws) => {
            try { ws.send(destroyNotice); } catch (e) {}
          });
          this.sessions.forEach((s, ws) => {
            try { ws.close(1000, "destroyed"); } catch (e) {}
          });
          this.sessions.clear();
          try {
            let rid = this.env.registry.idFromName("global");
            let rstub = this.env.registry.get(rid);
            await rstub.fetch(new URL("https://dummy-url/room-destroy?name=" + encodeURIComponent(this.roomName || "")));
          } catch (e) {}
        } catch (e) {
          try { webSocket.send(JSON.stringify({error: "销毁房间失败: " + (e && e.message || String(e))})); } catch (_) {}
        }
        return;
      }

      // 🐙 /gh 仓库卡片命令（公开功能，仿 /rollback 服务端透传）：/gh <owner>/<repo> 或 /gh <仓库URL>
      // 服务端查 GitHub API 获取仓库信息，广播一个可点击跳转的仓库卡片（带缓存缓解限流）
      let ghMatch = data.message.match(/^\/gh\s+(\S+)/i);
      if (ghMatch) {
        let ghInput = ghMatch[1].trim();
        // 支持 https://github.com/owner/repo、github.com/owner/repo、owner/repo
        let ghUrlMatch = ghInput.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?(?:\?.*)?$/i);
        let repoPath = ghInput;
        if (ghUrlMatch) repoPath = ghUrlMatch[1] + "/" + ghUrlMatch[2];
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/i.test(repoPath)) {
          webSocket.send(JSON.stringify({error: "用法: /gh <owner>/<repo> 或 /gh <GitHub仓库URL>"}));
          return;
        }
        webSocket.send(JSON.stringify({system: "正在查询 GitHub 仓库 " + repoPath + " ..."}));
        try {
          // 🐙 缓存查询结果（同一仓库 1 小时内不重复请求 GitHub API，缓解无 token 限流）
          let ghCacheKey = "ghcache:" + repoPath.toLowerCase();
          let cached = await this.storage.get(ghCacheKey);
          let ghData = null;
          if (cached) {
            try { ghData = JSON.parse(cached); } catch (e) { ghData = null; }
          }
          if (!ghData) {
            // 优先用 GITHUB_TOKEN（5000次/小时），无 token 时匿名查询（Workers 出口 IP 共享限流 60/h，可能被耗尽）
            let ghHeaders = {"User-Agent": "CloudChat/1.0", "Accept": "application/vnd.github+json"};
            if (this.env.GITHUB_TOKEN) ghHeaders["Authorization"] = "Bearer " + this.env.GITHUB_TOKEN;
            let ghResp = await fetch("https://api.github.com/repos/" + repoPath, {headers: ghHeaders});
            if (ghResp.status === 404) {
              webSocket.send(JSON.stringify({error: "仓库不存在: " + repoPath}));
              return;
            }
            if (ghResp.status === 403) {
              webSocket.send(JSON.stringify({error: "GitHub API 限流，请稍后再试"}));
              return;
            }
            let gh = await ghResp.json();
            if (!gh || !gh.full_name) {
              webSocket.send(JSON.stringify({error: "无法获取仓库信息"}));
              return;
            }
            ghData = {
              repo: gh.full_name,
              repoUrl: gh.html_url || ("https://github.com/" + repoPath),
              description: (gh.description || "").slice(0, 300),
              stars: gh.stargazers_count || 0,
              forks: gh.forks_count || 0,
              language: gh.language || "",
              ownerAvatar: (gh.owner && gh.owner.avatar_url) || ""
            };
            // 缓存 1 小时（DO storage put 的 expirationTtl 单位为秒）
            try { await this.storage.put(ghCacheKey, JSON.stringify(ghData), {expirationTtl: 3600}); } catch (e) {}
          }
          let ghCard = {
            // 🔒 安全修复（F2）：匿名模式下用 data.name/data.tag*（已替换为"匿名"+🕶️），防 /gh 卡片泄漏真实用户名与标签
            name: data.name, type: "gh-card", channel: session.channel || "general",
            repo: ghData.repo, repoUrl: ghData.repoUrl, description: ghData.description,
            stars: ghData.stars, forks: ghData.forks, language: ghData.language,
            ownerAvatar: ghData.ownerAvatar,
            timestamp: Math.max(Date.now(), this.lastTimestamp + 1)
          };
          if (data.tag) ghCard.tag = data.tag;
          if (data.tagColor) ghCard.tagColor = data.tagColor;
          if (data.tagBorder) ghCard.tagBorder = data.tagBorder;
          if (data.avatar) ghCard.avatar = data.avatar;
          this.lastTimestamp = ghCard.timestamp;
          ghCard.id = ++this.msgCounter;
          this.messages.set(ghCard.id, ghCard);
          this.broadcastToChannel(session.channel || "general", JSON.stringify(ghCard));
          // 🔒 安全修复（F7）：匿名 /gh 卡片存储同样附带真实身份指纹（不广播），供本人删除
          let ghCardKey = new Date(ghCard.timestamp).toISOString();
          let ghCardStr = anonFlag && session.name ? JSON.stringify({...ghCard, _anonOwner: hashAnonOwner(session.name)}) : JSON.stringify(ghCard);
          await this.storage.put(ghCardKey, ghCardStr);
        } catch (e) {
          webSocket.send(JSON.stringify({error: "查询 GitHub 失败: " + (e && e.message || String(e))}));
        }
        return;
      }

      // 检测 /ai 或 @ai 命令 — 调用 AI API
      let aiMatch = data.message.match(/^[@\/]ai\s+(.+)/i);
      if (aiMatch) {
        // 🔒 安全修复（LD2）：AI 调用仅限已登录（token 认证）用户，堵死游客无限刷付费 AI（频率限制不做，仅认证门槛）
        if (!session.authenticated) {
          webSocket.send(JSON.stringify({error: "请先登录后再使用 AI 功能"}));
          return;
        }
        try {
          // 先把用户的消息广播出去
          data.timestamp = Math.max(Date.now(), this.lastTimestamp + 1);
          this.lastTimestamp = data.timestamp;
          data.id = ++this.msgCounter;
          this.messages.set(data.id, data);
          let dataStr = JSON.stringify(data);
          this.broadcastToChannel(data.channel || "general", dataStr);
          // 🔒 安全修复（F7）：匿名 /ai 的用户消息存储同样附带真实身份指纹（不广播），供本人删除
          let aiUserKey = new Date(data.timestamp).toISOString();
          let aiUserStr = anonFlag && session.name ? JSON.stringify({...data, _anonOwner: hashAnonOwner(session.name)}) : dataStr;
          await this.storage.put(aiUserKey, aiUserStr);

          let userPrompt = aiMatch[1].trim();
          if (!userPrompt) {
            webSocket.send(JSON.stringify({error: "请输入你想问的问题，例如：/ai 你好"}));
            return;
          }
          // 新功能：AI 读取对话上下文 — 取房间最近 10 条普通文本消息作为上下文，让 AI 能结合聊天内容回答
          let ctxMsgs = [];
          let ctxArr = [...this.messages.values()];
          for (let i = ctxArr.length - 1; i >= 0 && ctxMsgs.length < 10; i--) {
            let m = ctxArr[i];
            if (!m || typeof m.message !== "string") continue;
            if ((m.channel || "general") !== (session.channel || "general")) continue; // 防跨频道上下文泄漏
            if (m.type === "file" || m.type === "image" || m.type === "zifu") continue;
            if (m.name === "AI" || m.name === "Bot" || m.name === "系统") continue;
            if (m.message.startsWith("/")) continue; // 跳过命令消息
            ctxMsgs.unshift({role: "user", content: (m.name || "用户") + ": " + m.message.slice(0, 200)});
          }
          // 多轮对话：读取该用户在当前频道的对话历史（storage 持久化，刷新不丢）
          let ctxKey = "aictx:" + (session.channel || "general") + ":" + session.name;
          let aiHistory = [];
          try {
            let histRaw = await this.storage.get(ctxKey);
            if (histRaw) aiHistory = JSON.parse(histRaw);
          } catch (e) {}
          if (!Array.isArray(aiHistory)) aiHistory = [];
          let aiMsgs = [{role: "system", content: this.env.AI_SYSTEM_PROMPT || "你是一个友好的助手，回答尽量简洁"}];
          if (ctxMsgs.length) aiMsgs = aiMsgs.concat(ctxMsgs);
          // 注入用户与 AI 的对话历史（最近 10 条），实现多轮记忆
          aiHistory.forEach(h => {
            if (h && h.role && h.content) aiMsgs.push({role: h.role, content: String(h.content).slice(0, 500)});
          });
          aiMsgs.push({role: "user", content: userPrompt});
          let resp = await fetch(this.env.AI_BASE_URL + "/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + this.env.AI_API_KEY
            },
            body: JSON.stringify({
              model: this.env.AI_MODEL || "deepseek-chat",
              messages: aiMsgs,
              max_tokens: 2000
            })
          });
          if (!resp.ok) {
            let errText = await resp.text();
            throw new Error("API " + resp.status + ": " + errText.slice(0, 200));
          }
          let aiData = await resp.json();
          let aiText = aiData.choices?.[0]?.message?.content || "AI 返回了空回复";
          let aiMsg = {
            name: "AI", message: aiText, tag: "🤖", tagColor: "blue", channel: session.channel || "general",
            timestamp: Math.max(Date.now(), this.lastTimestamp + 1), id: ++this.msgCounter
          };
          this.lastTimestamp = aiMsg.timestamp;
          this.broadcastToChannel(session.channel || "general", JSON.stringify(aiMsg));
          let key = new Date(aiMsg.timestamp).toISOString();
          await this.storage.put(key, JSON.stringify(aiMsg));
          // 记录多轮对话历史（上限 10 条，防 storage 膨胀）
          aiHistory.push({role: "user", content: userPrompt.slice(0, 500)});
          aiHistory.push({role: "assistant", content: aiText.slice(0, 1500)});
          if (aiHistory.length > 10) aiHistory = aiHistory.slice(-10);
          try { await this.storage.put(ctxKey, JSON.stringify(aiHistory)); } catch (e) {}
        } catch (e) {
          webSocket.send(JSON.stringify({error: "AI 请求失败: " + e.message}));
        }
        return;
      }

      // 🕶️ 匿名马甲：券校验+身份替换已提前到命令分支之前（见上），此处不再重复处理。
      // ⭐ 发言经验：注册用户发言 +1 经验（房间内按 name 用户级 15 秒限频，重连不重置、换 session 不可刷），
      // 升级/新成就通过 WS 推送。广播消息带 level 字段，前端在用户名旁显示 Lv 徽章。
      if (session.authenticated && session.name && session.token) {
        let nowExp = Date.now();
        if (!this.userExpTs) this.userExpTs = {};
        let lastExpTs = this.userExpTs[session.name] || 0;
        if (nowExp - lastExpTs >= 15000) {
          this.userExpTs[session.name] = nowExp;
          try {
            let rid = this.env.registry.idFromName("global");
            let stub = this.env.registry.get(rid);
            let xpResp = await stub.fetch("https://dummy-url/xp/grant", {
              method: "POST",
              body: JSON.stringify({name: session.name, token: session.token || "", amount: 1, stats: "msg"}),
              headers: {"Content-Type": "application/json"}
            });
            if (xpResp.ok) {
              let xpData = await xpResp.json();
              // 匿名发言不广播等级（避免泄露真实用户等级），经验照发
              if (xpData && xpData.level && !anonFlag) data.level = xpData.level;
              if (xpData && xpData.leveledUp) {
                try { webSocket.send(JSON.stringify({type: "xp-update", exp: xpData.exp, level: xpData.level, leveledUp: true, newLevel: xpData.newLevel})); } catch (e) {}
              }
              if (xpData && xpData.achievements && xpData.achievements.length) {
                try { webSocket.send(JSON.stringify({type: "achievement", achievements: xpData.achievements})); } catch (e) {}
              }
            }
          } catch (e) {}
        }
      }

      data.timestamp = Math.max(Date.now(), this.lastTimestamp + 1);
      this.lastTimestamp = data.timestamp;
      data.id = ++this.msgCounter;
      this.messages.set(data.id, data);

      let dataStr = JSON.stringify(data);
      this.broadcastToChannel(msgChannel, dataStr);

      // 频道体系：@全体 / @#频道 跨频道提醒 —— 不在本频道的在线用户也要收到提醒
      {
        let isAtAll = !!data.atAll || /@(all|everyone|全体)/i.test(data.message || "");
        let pingTarget = null; // null=不ping, "__all__"=全体, 否则=目标频道名
        if (isAtAll) {
          pingTarget = "__all__";
        } else {
          let pingMatch = (data.message || "").match(/@#([a-zA-Z0-9_-]{1,24})/);
          if (pingMatch && this.channels.some(c => c.name === pingMatch[1])) pingTarget = pingMatch[1];
        }
        if (pingTarget !== null) {
          let pingStr = JSON.stringify({
            type: "channel-ping",
            // 🔒 安全修复（F1）：匿名模式下用 data.name（"匿名"）代替 session.name，防跨频道 ping 泄漏真实身份
            name: data.name,
            fromChannel: msgChannel,
            targetChannel: pingTarget === "__all__" ? null : pingTarget,
            atAll: isAtAll
          });
          this.sessions.forEach((s, ws) => {
            // 跳过自己 + 跳过本频道的(他们已看到消息与常规 @全体 横幅)
            if (!s.name || s.name === session.name) return;
            if ((s.channel || "general") === msgChannel) return;
            // 指定频道时只通知该频道的用户
            if (pingTarget !== "__all__" && (s.channel || "general") !== pingTarget) return;
            try { ws.send(pingStr); } catch (_) {}
          });
        }
      }

      // 📌 在线@红点：检测 @<用户名>（排除 @全体/@频道），在线目标即时红点，离线目标记录下次上线补显
      {
        let atTargets = [];
        let msgText = data.message || "";
        let atRe = /@([a-zA-Z0-9_一-龥]{1,24})/g;
        let atMatch;
        while ((atMatch = atRe.exec(msgText)) !== null) {
          let tn = atMatch[1];
          if (tn === "all" || tn === "everyone" || tn === "everyone" || tn === "全体" || tn === "所有人") continue;
          if (tn === session.name) continue;
          if (!atTargets.includes(tn)) atTargets.push(tn);
        }
        // 👥 v1.48 关系链：被本消息发送者拉黑的目标不触发红点/补显（在线 ws.send 与离线 recordAtMention 一石二鸟跳过）
        if (session.authenticated && atTargets.length > 0) {
          try {
            let rid = this.env.registry.idFromName("global");
            let rstub = this.env.registry.get(rid);
            let r = await rstub.fetch("https://dummy-url/rel/at-filter?from=" + encodeURIComponent(session.name) + "&names=" + encodeURIComponent(atTargets.join(",")));
            let d = await r.json();
            if (Array.isArray(d.allowed)) atTargets = d.allowed;
          } catch (e) {}
        }
        for (let tn of atTargets) {
          this.sessions.forEach((s, ws) => {
            if (s.name === tn) {
              // 🔒 安全修复（F1）：匿名模式下 from 用 data.name（"匿名"）代替 session.name，防在线@红点泄漏真实身份
              try { ws.send(JSON.stringify({type: "at-mention", from: data.name, message: msgText.slice(0, 100), timestamp: data.timestamp, channel: msgChannel})); } catch (_) {}
            }
          });
          // 🔒 安全修复（F1）：at-mention 持久化同样匿名化 from，防离线补显时泄漏真实身份
          await this.recordAtMention(tn, data.name, msgText, data.timestamp, msgChannel);
        }
      }

      let key = new Date(data.timestamp).toISOString();
      // 🔒 安全修复（F7）：匿名消息存储时附带真实身份指纹（_anonOwner，真实 name 哈希）供本人删除；
      // 只写 storage 不进广播 dataStr，避免真实身份经 WS 泄漏给其他客户端
      let storeStr = anonFlag && session.name ? JSON.stringify({...data, _anonOwner: hashAnonOwner(session.name)}) : dataStr;
      await this.storage.put(key, storeStr);
    } catch (err) {
      console.error("webSocketMessage 异常:", err.stack || err);
      webSocket.send(JSON.stringify({error: "消息处理错误"}));
    }
  }

  async closeOrErrorHandler(webSocket) {
    let session = this.sessions.get(webSocket) || {};
    session.quit = true;
    this.sessions.delete(webSocket);
    if (session.name) {
      this.broadcast({quit: session.name});
    }
    this.updateRegistry();
  }

  async webSocketClose(webSocket, code, reason, wasClean) {
    this.closeOrErrorHandler(webSocket)
  }

  async webSocketError(webSocket, error) {
    this.closeOrErrorHandler(webSocket)
  }

  // 应急回滚：从 archive 下载指定版本代码 → 解压 → 用 Cloudflare API 重新部署当前 worker
  // 仅改线上部署，不触碰 GitHub 仓库代码
  async _doRollback(version, webSocket) {
    const send = (obj) => { try { webSocket.send(JSON.stringify(obj)); } catch (_) {} };
    if (!this.env.CF_ACCOUNT_ID || !this.env.CF_API_TOKEN) {
      send({error: "回滚功能未配置：缺少 CF_ACCOUNT_ID / CF_API_TOKEN 环境变量"});
      return;
    }
    let archiveId = this.env.archive.idFromName("archive");
    let archive = this.env.archive.get(archiveId);
    let dl = await archive.fetch("https://dummy-url/download?name=" + encodeURIComponent(version));
    if (!dl.ok) {
      send({error: "版本 " + version + " 不存在。请先运行 scripts/archive-latest.mjs 完成自动存档"});
      return;
    }
    let zipData = new Uint8Array(await dl.arrayBuffer());
    let files;
    try { files = unzipStore(zipData); } catch (e) {
      send({error: "版本存档解析失败（可能不是本项目 zip）"}); return;
    }
    if (!files["src/index.mjs"]) {
      send({error: "版本存档缺少入口 src/index.mjs"}); return;
    }
    let mime = buildRollbackMultipart(files, this.env);
    let scriptName = this.env.CF_SCRIPT_NAME || "cloudflare-workers-chat";
    let apiUrl = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(this.env.CF_ACCOUNT_ID) + "/workers/scripts/" + encodeURIComponent(scriptName);
    send({system: "正在回滚部署 " + scriptName + " 到版本 " + version + " ..."});
    let resp = await fetch(apiUrl, {
      method: "PUT",
      headers: { "Authorization": "Bearer " + this.env.CF_API_TOKEN, "Content-Type": mime.contentType },
      body: mime.data
    });
    let result;
    try { result = await resp.json(); } catch (e) { result = {}; }
    if (!resp.ok || !result.success) {
      send({error: "回滚部署失败: " + JSON.stringify(result.errors || result).slice(0, 300)});
      return;
    }
    send({system: "✅ 已回滚部署到版本 " + version + "，线上正在切换，稍后生效"});
  }

  containsProfanity(text) {
    // 🔒 安全修复（W8）：先做 Unicode NFKC 归一化 + 全角/拉丁变体转半角，防全角字母（ｃｎｍ）、变体字母（cñm）绕过敏感词
    let s = String(text || "").normalize("NFKC");
    s = s.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    s = s.replace(/[àáâãäåÀÁÂÃÄÅ]/g, "a").replace(/[èéêëÈÉÊË]/g, "e").replace(/[ìíîïÌÍÎÏ]/g, "i")
         .replace(/[òóôõöÒÓÔÕÖ]/g, "o").replace(/[ùúûüÙÚÛÜ]/g, "u").replace(/[ñÑ]/g, "n").replace(/çÇ/g, "c")
         // 🔒 安全修复（M9）：希腊/异体字母映射回拉丁，堵住 fμck 等希腊字母插入绕过
         .replace(/[μµ]/g, "u").replace(/[ρ]/g, "p").replace(/[σς]/g, "s").replace(/[κ]/g, "k").replace(/[λ]/g, "l");
    // 🔒 安全修复（M9）：保留数字（不再剥离），配合下方 leetspeak 字符类匹配，堵住 sh1t/f0ck 等数字插入绕过
    const t = s.replace(/[^a-z0-9一-鿿]/gi, "").toLowerCase();
    const roots = [
      "草泥马", "草你妈", "操你妈", "操你妈", "肏你妈",
      "傻逼", "傻比", "煞笔", "沙比", "撒比",
      "你妈逼", "尼玛逼", "尼玛", "你妈",
      "死全家", "全家死", "去死",
      "废物", "垃圾", "杂种", "狗日", "狗娘",
      "操你", "日你", "干你",
      "他妈", "特么", "他娘",
      "滚蛋", "滚粗", "滚开",
      "吃屎", "放屁", "放狗屁",
      "脑残", "智障", "弱智",
      "妓女", "婊子", "贱人", "骚货",
      "cnm", "nmb", "sb", "qnmd",
      "wqnmlgb", "qnmlgb",
      "fuck", "shit", "bitch", "asshole",
    ];
    const homophones = {
      "艹": "操", "曹": "操", "草": "操",
      "吗": "妈", "骂": "妈", "麻": "妈",
      "笔": "逼", "碧": "逼", "璧": "逼", "比": "逼",
      "莎": "傻", "啥": "傻", "厦": "傻",
      "币": "逼",
    };
    let normalized = "";
    for (const ch of t) {
      normalized += homophones[ch] || ch;
    }
    // 🔒 安全修复（v1.33）：先对原文（同音映射前）做 root 匹配——homophones 把"草"→"操"会改写原文，
    // 使"草泥马"→"操泥马"反而漏检 root"草泥马"（M9 引入的回归）。原文直接匹配补上此漏检。
    for (const root of roots) {
      if (t.includes(root)) return true;
    }
    // 🔒 安全修复（M9）：leetspeak 归一化匹配 —— 对词根每个拉丁字母构建含常见数字变体的字符类，
    // 使 sh1t/f0ck 等插入数字的变体也命中（仅影响检测，不改变消息内容）
    const leetExtras = {a:"4", b:"8", e:"3", g:"69", i:"1", l:"1", o:"0", s:"5", t:"7", u:"0", z:"2"};
    const escRe = (c) => /[.*+?^${}()|[\]\\]/.test(c) ? "\\" + c : c;
    let pattern = "";
    for (const root of roots) {
      let p = "";
      for (const ch of root) {
        p += /[a-z]/.test(ch) ? "[" + ch + (leetExtras[ch] || "") + "]" : escRe(ch);
      }
      pattern += (pattern ? "|" : "") + p;
    }
    if (pattern && new RegExp(pattern, "i").test(normalized)) return true;
    for (const root of roots) {
      if (normalized.includes(root)) return true;
    }
    return false;
  }

  async alarm() {
    if (this._loadScheduled) await this._loadScheduled;
    if (this._loadChannels) await this._loadChannels;
    let now = Date.now();
    let toSend = this.scheduledMessages.filter(s => s.time <= now);
    this.scheduledMessages = this.scheduledMessages.filter(s => s.time > now);
    for (let s of toSend) {
      // 🔒 安全修复（v1.34）：公告频道定时消息仅管理员来源可投递（防御旧数据/绕过 schedule 创建校验）
      let schedChanObj = this.channels.find(c => c.name === (s.channel || "general"));
      if (schedChanObj && schedChanObj.type === "announcement" && !s.admin) continue;
      let data = {
        name: s.name,
        message: s.message,
        timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
        channel: s.channel || "general",
        tag: s.tag || "",
        tagColor: s.tagColor || "",
        tagBorder: s.tagBorder || ""
      };
      data.id = ++this.msgCounter;
      this.lastTimestamp = data.timestamp;
      let dataStr = JSON.stringify(data);
      this.broadcastToChannel(s.channel || "general", dataStr);
      let key = new Date(data.timestamp).toISOString();
      await this.storage.put(key, dataStr);
    }
    await this.storage.put("scheduledMessages", this.scheduledMessages);
    if (this.scheduledMessages.length > 0) {
      let nextTime = Math.min(...this.scheduledMessages.map(s => s.time));
      await this.state.storage.setAlarm(nextTime);
    }
  }

  broadcast(message) {
    if (typeof message !== "string") {
      message = JSON.stringify(message);
    }

    let quitters = [];
    this.sessions.forEach((session, webSocket) => {
      if (session.name) {
        try {
          webSocket.send(message);
        } catch (err) {
          session.quit = true;
          quitters.push(session);
          this.sessions.delete(webSocket);
        }
      } else {
        // M12：未命名会话消息队列设上限，防无限累积
        if (session.blockedMessages.length < 200) session.blockedMessages.push(message);
      }
    });

    quitters.forEach(quitter => {
      if (quitter.name) {
        this.broadcast({quit: quitter.name});
      }
    });
  }

  // 管理员判定：支持自定义红/青/金边超管标签（不只认 tag 字符串，"金边红大佬"等也可）
  isAdminSession(session) {
    return session.tag === "red" || session.tag === "cyan" ||
           session.tagColor === "red" || session.tagColor === "cyan" ||
           session.tagBorder === "gold";
  }

  // 📌 在线@红点：记录 @<用户名> 到 storage（上限 50 条），供用户下次上线时补显
  async recordAtMention(targetName, fromName, message, ts, channel) {
    try {
      let raw = await this.storage.get("at-mentions");
      let arr = [];
      if (raw) { let p = JSON.parse(raw); if (Array.isArray(p)) arr = p; }
      arr.push({target: targetName, from: fromName, message: (message || "").slice(0, 100), ts: ts || Date.now(), channel: channel || "general"});
      if (arr.length > 50) arr = arr.slice(-50);
      await this.storage.put("at-mentions", JSON.stringify(arr));
    } catch (e) {}
  }

  // 频道体系：只发送给指定频道的已设名会话；未设名会话排队（命名后按频道分流）
  broadcastToChannel(channel, message) {
    if (typeof message !== "string") {
      message = JSON.stringify(message);
    }
    this.sessions.forEach((session, webSocket) => {
      if (session.name) {
        if ((session.channel || "general") === channel) {
          try { webSocket.send(message); }
          catch (err) { session.quit = true; this.sessions.delete(webSocket); }
        }
      } else {
        // M12：未命名会话消息队列设上限，防无限累积
        if (session.blockedMessages.length < 200) session.blockedMessages.push(message);
      }
    });
  }
}

// —— 应急回滚：构建 Cloudflare multipart 上传体 ——
// 与 wrangler 相同的 multipart 格式：metadata part + 每个模块一个 part
function buildRollbackMetadata(env) {
  let bindings = [
    {type: "durable_object_namespace", name: "rooms", class_name: "ChatRoom"},
    {type: "durable_object_namespace", name: "registry", class_name: "RoomRegistry"},
    {type: "durable_object_namespace", name: "archive", class_name: "VersionArchive"},
    {type: "durable_object_namespace", name: "filebucket", class_name: "FileBucket"},
  ];
  const vars = ["ADMIN_SECRET_KEY", "ADMIN_KEY", "AI_BASE_URL", "AI_MODEL", "AI_SYSTEM_PROMPT", "CF_ACCOUNT_ID", "CF_SCRIPT_NAME"];
  for (const v of vars) {
    if (env[v] != null) bindings.push({type: "plain_text", name: v, text: String(env[v])});
  }
  // CF_API_TOKEN 等敏感项用 secret_text 类型，避免明文进 vars
  for (const s of ["AI_API_KEY", "AI_SECRET", "CF_API_TOKEN"]) {
    if (env[s] != null) bindings.push({type: "secret_text", name: s, text: String(env[s])});
  }
  return { main_module: "src/index.mjs", compatibility_date: "2024-01-01", bindings };
}

function buildRollbackMultipart(files, env) {
  const boundary = "----cloudchat-rb-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const CRLF = "\r\n";
  const enc = new TextEncoder();
  const chunks = [];
  const push = (s) => chunks.push(enc.encode(s));
  const pushU8 = (u) => chunks.push(u);

  // metadata part
  push("--" + boundary + CRLF);
  push('Content-Disposition: form-data; name="metadata"' + CRLF);
  push("Content-Type: application/json" + CRLF + CRLF);
  push(JSON.stringify(buildRollbackMetadata(env)) + CRLF);

  // 模块 parts（.mjs 为代码模块，其余按 Data 模块）
  for (const [path, data] of Object.entries(files)) {
    if (!data || data.length === 0) continue;
    const ct = path.endsWith(".mjs") ? "application/javascript+module" : "application/octet-stream";
    push("--" + boundary + CRLF);
    push('Content-Disposition: form-data; name="' + path + '"; filename="' + path + '"' + CRLF);
    push("Content-Type: " + ct + CRLF + CRLF);
    pushU8(data);
    push(CRLF);
  }
  push("--" + boundary + "--" + CRLF);

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return { data: out, contentType: "multipart/form-data; boundary=" + boundary };
}

// 最小 zip 解压器（仅支持 store 无压缩格式 — scripts/archive-latest.mjs 以 level:0 生成）
// 解析 End of Central Directory + Central Directory + Local Header，直接读取未压缩数据
function unzipStore(zipData) {
  const dv = zipData;
  let eocd = -1;
  for (let i = dv.length - 22; i >= 0; i--) {
    if (dv[i] === 0x50 && dv[i+1] === 0x4b && dv[i+2] === 0x05 && dv[i+3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("无效的 zip 存档");
  const cdCount = dv[eocd + 10] | (dv[eocd + 11] << 8);
  const cdOffset = (dv[eocd + 16] | (dv[eocd + 17] << 8) | (dv[eocd + 18] << 16) | (dv[eocd + 19] << 24)) >>> 0;
  const files = {};
  const td = new TextDecoder();
  let pos = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (dv[pos] !== 0x50 || dv[pos+1] !== 0x4b || dv[pos+2] !== 0x01 || dv[pos+3] !== 0x02) break;
    const method = dv[pos + 10] | (dv[pos + 11] << 8);
    const compSize = (dv[pos + 20] | (dv[pos + 21] << 8) | (dv[pos + 22] << 16) | (dv[pos + 23] << 24)) >>> 0;
    const nameLen = dv[pos + 28] | (dv[pos + 29] << 8);
    const extraLen = dv[pos + 30] | (dv[pos + 31] << 8);
    const commentLen = dv[pos + 32] | (dv[pos + 33] << 8);
    const lho = (dv[pos + 42] | (dv[pos + 43] << 8) | (dv[pos + 44] << 16) | (dv[pos + 45] << 24)) >>> 0;
    const name = td.decode(dv.subarray(pos + 46, pos + 46 + nameLen));
    if (method !== 0) throw new Error("不支持的压缩方式: " + method + "（请用自动存档重新生成该版本）");
    const lNameLen = dv[lho + 26] | (dv[lho + 27] << 8);
    const lExtraLen = dv[lho + 28] | (dv[lho + 29] << 8);
    const dataStart = lho + 30 + lNameLen + lExtraLen;
    files[name] = dv.slice(dataStart, dataStart + compSize);
    pos += 46 + nameLen + extraLen + commentLen;
  }
  if (!files["src/index.mjs"]) throw new Error("存档缺少入口 src/index.mjs");
  return files;
}
