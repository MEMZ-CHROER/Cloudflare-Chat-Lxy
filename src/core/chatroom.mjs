// @ts-check
import { handleErrors, safeEqual, SAFE_COLOR_RE } from "./utils.mjs";
import { handleMedia } from "./chatroom/media.mjs";
import { handleManage, stripSensitiveMsg } from "./chatroom/manage.mjs";
import { handleDoc } from "./chatroom/doc.mjs";
import { handleActivity } from "./chatroom/activity.mjs";
import {
  getMaxMsgLenImpl,
  containsProfanityImpl,
  isAdminSessionImpl,
  isSuperSessionImpl,
  hasPermImpl,
  lpRawPermImpl,
} from "./chatroom/permissions.mjs";
import { handleSchedule, runScheduledMessages } from "./chatroom/schedule.mjs";
import { handleSessionImpl, handleWsCloseImpl } from "./chatroom/conn.mjs";
import { deliverOfflineMessagesImpl, recordLastSeenImpl } from "./chatroom/offline.mjs";
import { _doRollbackImpl } from "./chatroom/rollback.mjs";
import { handleHttp } from "./chatroom/http.mjs";

// 🔒 安全修复（F7）：匿名消息存储时附带的"真实身份指纹"——真实 name 的 32 位 FNV-1a 哈希。
// 只存 storage（不广播、不进 /messages /search 白名单字段、export 时剔除），供本人删除自己的匿名消息；
// 存哈希而非明文昵称，避免导出日志/历史泄漏真实身份。
/**
 * 计算用户名的 32 位 FNV-1a 哈希指纹（用于匿名消息归属校验）
 * @param {string} nameStr 真实用户名
 * @returns {string} "anon:" + 十六进制哈希
 */
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
/**
 * ChatRoom Durable Object：单聊天室的状态 + WebSocket 连接管理
 * @property {any} state DO 状态
 * @property {any} storage DO 存储
 * @property {import("./types.js").Env} env 环境绑定
 * @property {Map<any, import("./types.js").WsSession>} sessions WS 会话表
 */
export class ChatRoom {
  /** @type {string|undefined} 房间名（conn.mjs/http.mjs 初始化时设置） */
  roomName;
  /**
   * @param {any} state Durable Object 状态（含 storage + getWebSockets）
   * @param {import("./types.js").Env} env Worker 环境绑定
   */
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
    this.channels = [
      { name: "general", type: "text" },
      { name: "announcement", type: "announcement" },
    ];
    this._loadChannels = this.storage.get("channels").then((arr) => {
      if (Array.isArray(arr) && arr.length) this.channels = arr;
    });
    // 红包所在频道（id → channel），供 grab 广播隔离
    this.redpacketChannels = new Map();
    // 🔒 安全修复（v1.34）：红包频道映射持久化，防 DO 重启后丢失导致 grab 广播回落到 general
    this._loadRedpacketChannels = this.storage.get("redpacketChannels").then((arr) => {
      if (Array.isArray(arr)) this.redpacketChannels = new Map(arr);
    });

    this.blacklist = new Set();
    this._loadBlacklist = this.storage.get("blacklist").then((list) => {
      if (list) this.blacklist = new Set(list);
    });

    this.announcement = "";
    this._loadAnnouncement = this.storage.get("announcement").then((text) => {
      if (text) this.announcement = text;
    });

    // 🏅 房间等级样式：{ "<level>": {color, icon, text} }，level 为 1-999 整数键
    this.levelStyles = {};
    this._loadLevelStyles = this.storage.get("levelStyles").then((r) => {
      if (r && typeof r === "object") this.levelStyles = r;
    });

    this.destroyed = false;
    // 🔒 销毁标记持久化：DO 重启后仍保持"已销毁"，防止房间复活导致重连异常
    this._loadDestroyed = this.storage.get("__destroyed__").then((v) => {
      if (v === "1") this.destroyed = true;
    });
    // 📌 置顶消息（v1.35 升级为按频道）：{ "<channel>": [pinObj, ...] }，每频道最多 3 条
    this.pinnedMessages = {};
    this._loadPinnedMessages = this.storage.get("pinnedMessages").then(async (data) => {
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
    this._loadScheduled = this.storage.get("scheduledMessages").then((list) => {
      this.scheduledMessages = list || [];
      if (this.scheduledMessages.length > 0) {
        let nextTime = Math.min(...this.scheduledMessages.map((s) => s.time));
        this.state.storage.setAlarm(nextTime).catch(() => {});
      }
    });

    this.polls = new Map();
    this._loadPolls = this.storage.get("polls").then((data) => {
      if (data) this.polls = new Map(data);
    });

    this.relays = new Map();
    this._loadRelays = this.storage.get("relays").then((data) => {
      if (data) this.relays = new Map(data);
    });

    // v1.56 内容沉淀：房间知识库文档（documents 存元数据 Map，正文在 doc:<id> 分 key，见 chatroom/doc.mjs）
    this.documents = new Map();
    this._loadDocuments = this.storage.get("documents").then((data) => {
      if (data) {
        try {
          this.documents = new Map(JSON.parse(data).map((m) => [m.id, m]));
        } catch (e) {
          this.documents = new Map();
        }
      }
    });

    this.highlights = [];
    this._loadHighlights = this.storage.get("highlights").then((data) => {
      if (data) {
        // 🔒 安全修复（L9）：历史 JSON 损坏时回退空数组，防房间不可进（500 拒绝所有新连接）
        try {
          this.highlights = JSON.parse(data);
        } catch (e) {
          this.highlights = [];
        }
      }
    });

    this.reactions = {};
    this._loadReactions = this.storage.get("reactions").then((data) => {
      if (data) {
        // 🔒 安全修复（L9）：历史 JSON 损坏时回退空对象，防房间不可进
        try {
          this.reactions = JSON.parse(data);
        } catch (e) {
          this.reactions = {};
        }
      }
    });

    this.lotteryPools = new Map();
    this._loadLotteryPools = this.storage.get("lotteryPools").then((data) => {
      if (data) {
        this.lotteryPools = new Map(
          data.map(([id, pool]) => {
            pool.prizes = new Map(pool.prizes);
            return [id, pool];
          })
        );
      }
    });
  }

  /**
   * DO 入口：全部 HTTP 端点委托给 chatroom/http.mjs
   * @param {Request} request 请求（含 WS Upgrade）
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    // v1.57 拆分：HTTP 端点全量搬移至 chatroom/http.mjs（handleHttp）
    return await handleHttp(this, request);
  }

  // 📌 置顶消息（v1.35）：新增一条置顶到某频道（去重按 timestamp，头部插入，超 3 条淘汰最旧），持久化 + 按频道广播
  /**
   * 新增一条置顶消息到频道（每频道最多 3 条，超限淘汰最旧）
   * @param {string} channel 目标频道名
   * @param {{ timestamp: string|number }} pinObj 置顶消息对象（含 timestamp）
   * @returns {Promise<Array<object>>} 该频道最新的置顶数组
   */
  async addPinnedMessage(channel, pinObj) {
    if (this._loadPinnedMessages) await this._loadPinnedMessages;
    if (!this.pinnedMessages || typeof this.pinnedMessages !== "object") this.pinnedMessages = {};
    let arr = Array.isArray(this.pinnedMessages[channel]) ? this.pinnedMessages[channel] : [];
    arr = arr.filter((p) => p && parseInt(p.timestamp) !== parseInt(String(pinObj.timestamp)));
    arr.unshift(pinObj);
    if (arr.length > 3) arr.length = 3; // 每频道最多 3 条
    this.pinnedMessages[channel] = arr;
    await this.storage.put("pinnedMessages", this.pinnedMessages);
    this.broadcastToChannel(channel, JSON.stringify({ type: "pinned", channel, pinned: arr }));
    return arr;
  }

  // 📌 置顶消息（v1.35）：移除某频道的指定置顶（按 timestamp），持久化 + 按频道广播
  /**
   * 移除某频道的指定置顶消息（按 timestamp 匹配）
   * @param {string} channel 目标频道名
   * @param {string|number} ts 置顶消息 timestamp
   * @returns {Promise<Array<object>>} 移除后该频道的置顶数组
   */
  async removePinnedMessage(channel, ts) {
    if (this._loadPinnedMessages) await this._loadPinnedMessages;
    if (!this.pinnedMessages || typeof this.pinnedMessages !== "object") this.pinnedMessages = {};
    let arr = Array.isArray(this.pinnedMessages[channel]) ? this.pinnedMessages[channel] : [];
    arr = arr.filter((p) => !p || parseInt(p.timestamp) !== parseInt(String(ts)));
    this.pinnedMessages[channel] = arr;
    await this.storage.put("pinnedMessages", this.pinnedMessages);
    this.broadcastToChannel(channel, JSON.stringify({ type: "pinned", channel, pinned: arr }));
    return arr;
  }

  /**
   * 清空房间全部聊天消息（识别消息类 storage key，系统 key 不受影响），随后广播 room-cleared
   * @returns {Promise<void>}
   */
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
        if (
          parsed &&
          typeof parsed.timestamp === "number" &&
          (typeof parsed.message === "string" ||
            ["image", "file", "zifu", "voice", "gh-card", "reply", "text", "recalled", "deleted"].includes(parsed.type))
        ) {
          msgKeys.push(key);
        }
      } catch (e) {}
    }
    if (msgKeys.length > 0) {
      await this.storage.delete(msgKeys);
    }
    console.log(`Durable Object ID: ${this.state.id} - 清空了 ${msgKeys.length} 条聊天记录。`);
    this.lastTimestamp = 0;
    this.broadcast({ type: "room-cleared" });
  }

  /**
   * WS 连接建立后的初始化（登录/房间密码校验等，逻辑在 chatroom/conn.mjs）
   * @param {any} webSocket WS 连接
   * @param {string} [ip] 客户端 IP
   * @returns {Promise<void>}
   */
  async handleSession(webSocket, ip) {
    // v1.57 拆分：连接生命周期逻辑在 chatroom/conn.mjs
    return await handleSessionImpl(this, webSocket, ip);
  }
  /**
   * 向 registry 上报房间在线人数（房间名 + 已设名会话数）
   * @returns {Promise<void>}
   */
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

  // 📈 v1.54 运营数据：每日消息计数日桶（storage key "stat:msg:<YYYY-MM-DD>"，房间 DO 各自累计）
  /**
   * 每日消息计数日桶 +1（storage key "stat:msg:<YYYY-MM-DD>"）
   * @param {string|number} ts 消息时间戳（毫秒）
   * @returns {Promise<void>}
   */
  async bumpMsgStat(ts) {
    try {
      let dayKey = "stat:msg:" + new Date(ts || Date.now()).toISOString().slice(0, 10);
      let cur = Number(await this.storage.get(dayKey)) || 0;
      await this.storage.put(dayKey, cur + 1);
    } catch (e) {}
  }

  /**
   * WS 主文本流：命名/认证/踢人/私聊/命令分发/普通消息广播（其余活动分发至 media/activity/schedule/manage/doc）
   * @param {any} webSocket WS 连接
   * @param {string} msg 入站 JSON 消息串
   * @returns {Promise<void>}
   */
  async webSocketMessage(webSocket, msg) {
    try {
      /** @type {import("./types.js").WsSession} */
      let session = this.sessions.get(webSocket);
      if (session.quit) {
        webSocket.close(1011, "WebSocket 已损坏");
        return;
      }

      let data = JSON.parse(msg);

      if (!session.name) {
        let rawName = "" + (data.name || "匿名");

        if (rawName.length > 32) {
          webSocket.send(JSON.stringify({ error: "名称过长" }));
          webSocket.close(1009, "名称过长");
          return;
        }

        // 🔒 用户名过滤：排除 HTML 特殊字符，防止存储型 XSS（允许中文/emoji）
        if (/[<>&"'\\]/.test(rawName)) {
          webSocket.send(JSON.stringify({ error: "名称包含非法字符" }));
          webSocket.close(1009, "名称包含非法字符");
          return;
        }

        session.name = rawName;
        webSocket.serializeAttachment({ ...webSocket.deserializeAttachment(), name: session.name });

        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          let initUrl =
            "https://dummy-url/user-init?name=" +
            encodeURIComponent(session.name) +
            "&ip=" +
            encodeURIComponent(session.ip || "") +
            "&token=" +
            encodeURIComponent(data.token || "");
          let initRes = await stub.fetch(initUrl);
          let initData = await initRes.json();

          if (initData.banned) {
            webSocket.send(JSON.stringify({ error: "你已被封禁，无法加入聊天室" }));
            webSocket.close(1000, "banned");
            return;
          }
          if (initData.ipBanned) {
            webSocket.send(JSON.stringify({ error: "你的IP已被封禁，无法加入聊天室" }));
            webSocket.close(1000, "banned");
            return;
          }
          if (initData.registered && !initData.authenticated) {
            webSocket.send(JSON.stringify({ error: "该名称已注册，请登录后使用" }));
            webSocket.close(1000, "unauthorized");
            return;
          }
          // 🔒 安全修复（LD9）：记录会话的 token 与认证状态，供红包/标签等特权操作持续校验
          session.token = data.token || "";
          session.authenticated = !!initData.authenticated;

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
        webSocket.serializeAttachment({
          ...webSocket.deserializeAttachment(),
          tag: session.tag,
          tagColor: session.tagColor,
          tagBorder: session.tagBorder,
          vip: session.vip,
          avatar: session.avatar,
        });

        session.blockedMessages.forEach((queued) => {
          webSocket.send(queued);
        });
        delete session.blockedMessages;

        // 📥 v1.58 离线消息：上线补发离线期间错过的消息（offline:true），先于 ready
        try {
          await deliverOfflineMessagesImpl(this, webSocket, session, Date.now());
        } catch (e) {}

        let joinMsg = { joined: session.name };
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
          if (atRaw) {
            let arr = JSON.parse(atRaw);
            if (Array.isArray(arr)) atAll = arr;
          }
          if (atAll.length > 0) {
            let mine = atAll.filter((m) => m.target === session.name).slice(-20);
            if (mine.length > 0) {
              webSocket.send(
                JSON.stringify({
                  type: "at-unread",
                  mentions: mine.map((m) => ({ from: m.from, message: m.message, timestamp: m.ts })),
                })
              );
              let rest = atAll.filter((m) => m.target !== session.name);
              await this.storage.put("at-mentions", JSON.stringify(rest.slice(-50)));
            }
          }
        } catch (e) {}

        webSocket.send(JSON.stringify({ ready: true }));
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
            muted = { remainingMs: d.remainingMs, permanent: d.permanent, reason: d.reason || "" };
          }
        } catch (e) {}
        if (muted) {
          let remainMin = Math.max(1, Math.ceil(muted.remainingMs / 60000));
          let tip = muted.permanent
            ? "你已被禁言，无法发言（永久）"
            : "你已被禁言，剩余 " + remainMin + " 分钟无法发言";
          if (muted.reason) tip += "（原因: " + muted.reason + "）";
          webSocket.send(JSON.stringify({ error: tip }));
          return;
        }
      }
      if (data.type === "kick") {
        // 🔒 安全修复（M10）：未设名的游客会话禁止踢人
        if (!session.name) {
          webSocket.send(JSON.stringify({ error: "请先设置昵称后再踢人" }));
          return;
        }
        // 🧪 v1.49 LP：chat.admin.kickUser 显式控制踢人权限（LuckPerms 语义）：
        //   · LP 显式 true  → 允许踢人（普通用户也可踢，视为管理员级无限频）
        //   · LP 显式 false → 禁止踢人（即使管理员/超管也拦，提示「你无权执行该操作」）
        //   · LP 未定义     → 回退基础层：管理员（红/青/金边）可踢，普通用户不可踢
        // 原 v1.34 M10 的普通用户 30s/60s 限频踢人已移除，踢人权限统一由 LP 精确控制
        let isKickAdmin = await this.hasPerm(session, "chat.admin.kickUser");
        if (!isKickAdmin) {
          webSocket.send(JSON.stringify({ error: "你无权执行该操作" }));
          return;
        }
        if (this.blacklist.has(session.name)) {
          webSocket.send(JSON.stringify({ error: "你已被加入黑名单，无法踢人" }));
          return;
        }

        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          let gbCheck = await stub.fetch(
            "https://dummy-url/is-globally-blacklisted?name=" + encodeURIComponent(session.name)
          );
          let gbResult = await gbCheck.json();
          if (gbResult.blacklisted) {
            webSocket.send(JSON.stringify({ error: "你已被全局拉黑，无法踢人" }));
            return;
          }
        } catch (e) {}

        let targetName = data.target;
        if (!targetName) {
          webSocket.send(JSON.stringify({ error: "未指定要踢出的用户" }));
          return;
        }

        if (targetName === session.name) {
          webSocket.send(JSON.stringify({ error: "不能踢出自己" }));
          return;
        }

        for (let [ws, s] of this.sessions) {
          if (s.name === targetName && s.vip && s.vip.features && s.vip.features.kickProtect) {
            webSocket.send(JSON.stringify({ error: "受保护，无法踢出" }));
            return;
          }
        }

        // 检查全局保护名单
        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          let checkRes = await stub.fetch(
            new URL("https://dummy-url/is-kick-protected?name=" + encodeURIComponent(targetName))
          );
          let checkData = await checkRes.json();
          if (checkData.protected) {
            webSocket.send(JSON.stringify({ error: targetName + " 受保护，无法踢出" }));
            return;
          }
        } catch (e) {}

        let kickedEntry = null;
        for (let [ws, s] of this.sessions) {
          if (s.name === targetName) {
            kickedEntry = { ws, s };
            break;
          }
        }

        if (kickedEntry) {
          this.sessions.delete(kickedEntry.ws);
          kickedEntry.ws.close(1000, "kicked");
          this.broadcast({ kicked: targetName });
          webSocket.send(JSON.stringify({ system: "你已将 " + targetName + " 踢出房间" }));
        } else {
          webSocket.send(JSON.stringify({ error: "未找到用户 " + targetName }));
        }
        return;
      }

      if (data.type === "whisper") {
        let targetName = "" + data.target;
        let whisperMsg = "" + data.message;
        if (!targetName || !whisperMsg) {
          webSocket.send(JSON.stringify({ error: "私聊格式错误" }));
          return;
        }
        // 🔒 安全修复（v1.34）：私信仅限已登录用户（防游客冒名发私信骚扰/钓鱼）
        if (!session.authenticated) {
          webSocket.send(JSON.stringify({ error: "请先登录后再发送私信" }));
          return;
        }
        let whisperMax = this.getMaxMsgLen(session);
        if (whisperMsg.length > whisperMax) {
          webSocket.send(JSON.stringify({ error: "消息过长（VIP最高 " + whisperMax + " 字）" }));
          return;
        }
        // 🔒 安全修复（W7）：私信内容过敏感词过滤，防绕过审查
        if (this.containsProfanity(whisperMsg)) {
          webSocket.send(JSON.stringify({ error: "私信包含违规词汇，已拦截" }));
          return;
        }
        // 👥 v1.48 关系链：对方拉黑我则私信拦截
        try {
          let rid = this.env.registry.idFromName("global");
          let rstub = this.env.registry.get(rid);
          let r = await rstub.fetch(
            "https://dummy-url/rel/blocked?from=" +
              encodeURIComponent(targetName) +
              "&to=" +
              encodeURIComponent(session.name)
          );
          let d = await r.json();
          if (d.blocked) {
            webSocket.send(JSON.stringify({ error: "对方已拉黑你，无法发送私信" }));
            return;
          }
        } catch (e) {}

        let found = false;
        this.sessions.forEach((s, ws) => {
          if (s.name === targetName) {
            ws.send(
              JSON.stringify({
                type: "whisper",
                from: session.name,
                message: whisperMsg,
                timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
              })
            );
            found = true;
          }
        });

        webSocket.send(
          JSON.stringify({
            type: "whisper",
            from: session.name,
            to: targetName,
            message: whisperMsg,
            timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
          })
        );

        if (!found) {
          webSocket.send(JSON.stringify({ error: "用户 " + targetName + " 不在线" }));
        }
        return;
      }

      if (data.type === "typing") {
        this.broadcastToChannel(session.channel || "general", {
          type: "typing",
          name: session.name,
          channel: session.channel || "general",
        });
        return;
      }
      if (await handleMedia(this, session, data, webSocket)) return;
      // v1.57 拆分：投票/接龙/表情/红包（activity.mjs，schedule 定时消息在 schedule.mjs）
      if (await handleActivity(this, session, data, webSocket)) return;
      // v1.57 拆分：定时消息创建/取消（schedule.mjs）
      if (await handleSchedule(this, session, data, webSocket)) return;

      if (await handleManage(this, session, data, webSocket)) return;
      // v1.56 房间知识库：文档操作不受公告频道只读限制（list/get/create/update/delete）
      if (await handleDoc(this, session, data, webSocket)) return;

      if (this._loadChannels) await this._loadChannels; // 确保频道列表已加载（防热重启后自定义公告频道只读失效）
      let msgChannel = session.channel || "general";
      // 频道体系：公告频道只读，仅管理员（red/cyan）可发言
      let curChan = this.channels.find((c) => c.name === msgChannel);
      if (curChan && curChan.type === "announcement" && !(await this.hasPerm(session, "chat.admin.announcement"))) {
        webSocket.send(JSON.stringify({ error: "仅管理员可在公告频道发言" }));
        return;
      }
      // 🐙 /gh 仓库卡片（旧版前端兼容）：部分旧前端会直接发 {type:"gh-card"}，此处校验后广播
      if (data.type === "gh-card") {
        // 🔒 安全修复（F2 补漏）：旧版直接发 {type:"gh-card"} 的分支在匿名块之前 return、不处理 anonFlag，
        // 匿名用户走此路径会以真实用户名广播且不扣券。拒绝匿名走旧路径（当前前端用 /gh 命令，匿名 /gh 已正确匿名化+扣券）。
        if (data.anon) {
          webSocket.send(JSON.stringify({ error: "匿名模式请使用 /gh 命令发送仓库卡片" }));
          return;
        }
        let ghRepo = "" + (data.repo || "");
        let ghUrl = "" + (data.repoUrl || "");
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(ghRepo)) {
          webSocket.send(JSON.stringify({ error: "无效的仓库名称" }));
          return;
        }
        if (!/^https:\/\/github\.com\//i.test(ghUrl)) {
          webSocket.send(JSON.stringify({ error: "无效的仓库地址" }));
          return;
        }
        let ghDesc = ("" + (data.description || "")).slice(0, 300);
        let ghStars = parseInt(data.stars) || 0;
        let ghForks = parseInt(data.forks) || 0;
        let ghLang = ("" + (data.language || "")).slice(0, 30);
        let ghOwnerAvatar = ("" + (data.ownerAvatar || "")).slice(0, 300);
        let ghCard = {
          name: session.name,
          type: "gh-card",
          channel: msgChannel,
          repo: ghRepo,
          repoUrl: ghUrl,
          description: ghDesc,
          stars: ghStars,
          forks: ghForks,
          language: ghLang,
          ownerAvatar: ghOwnerAvatar,
          timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
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
        if (!delTs || isNaN(delTs)) {
          webSocket.send(JSON.stringify({ error: "无效的消息标识" }));
          return;
        }
        let delKey = new Date(delTs).toISOString();
        let delRaw = await this.storage.get(delKey);
        if (!delRaw) {
          webSocket.send(JSON.stringify({ error: "消息不存在或已过期" }));
          return;
        }
        let delOrig;
        try {
          delOrig = JSON.parse(delRaw);
        } catch (e) {
          webSocket.send(JSON.stringify({ error: "消息数据异常" }));
          return;
        }
        if (delOrig.type === "recalled" || delOrig.type === "deleted") {
          webSocket.send(JSON.stringify({ error: "该消息已被撤回或删除" }));
          return;
        }
        let isDelAdmin = await this.hasPerm(session, "chat.admin.messageDelete");
        // 🔒 安全修复（F7）：匿名消息存储时 name="匿名"，原判定使真实发送者永远删不掉自己的匿名消息；
        // 增加对 storage 中 _anonOwner（真实 name 哈希）的校验，允许本人删除且不向他人泄露身份
        let isAnonOwner = !session.name
          ? false
          : delOrig.name === "匿名" && !!delOrig._anonOwner && delOrig._anonOwner === hashAnonOwner(session.name);
        if (!isDelAdmin && (!session.name || (delOrig.name !== session.name && !isAnonOwner))) {
          webSocket.send(JSON.stringify({ error: "无权删除他人的消息" }));
          return;
        }
        let delMsg = {
          type: "deleted",
          name: delOrig.name || "",
          timestamp: delTs,
          channel: delOrig.channel || "general",
        };
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
        webSocket.send(JSON.stringify({ error: "消息不能为空" }));
        return;
      }

      let maxMsgLen = this.getMaxMsgLen(session);
      if (data.message.length > maxMsgLen) {
        webSocket.send(JSON.stringify({ error: "消息过长（VIP最高 " + maxMsgLen + " 字）" }));
        return;
      }

      // 🔧 v1.60 修复：命令消息（/ 开头）跳过敏感词检查。系统命令（/lp /gh /ai /bot /icco
      // /rollback /destroy /help 等）的参数可含任意用户名/节点/URL/中文文本，被当聊天内容过滤
      // 会误伤（如 "/w 游客9933" 的 "游" 曾被 leetspeak 当标点顶替字母 → nmb 误伤）。且 / 开头的
      // 消息一律走命令处理（未知命令提示，不广播），不会以普通聊天内容发出，跳过检查无漏检风险。
      if (!/^\//.test(data.message) && this.containsProfanity(data.message)) {
        // 🔒 安全修复：敏感词只拦截该条消息，不再自动封禁用户名+IP
        // 因用户名可冒名，自动封禁会被恶意利用来封禁任何人的昵称，封禁应由管理员手动执行
        webSocket.send(JSON.stringify({ error: "消息包含违规内容，已拦截。请注意言辞，严重违规将被管理员封禁。" }));
        return;
      }

      // 🕶️ 匿名马甲：消耗一张匿名券，消息以「匿名」身份展示（真实身份由 registry /anon/use 写审计日志）。
      // 🔒 安全修复（F2）：券校验+身份替换提前到命令（/gh /ai /bot 等）分支之前——原逻辑放在命令全部 return
      // 之后，匿名用户发 /gh /ai 会以真实用户名广播且不扣券，绕过匿名。命令消息同样扣券校验，广播身份统一匿名。
      // 🔒 安全修复（F6）：匿名消息清除发送者自定义颜色，防个性化颜色作身份指纹。
      if (anonFlag) {
        if (!session.authenticated) {
          webSocket.send(JSON.stringify({ error: "请先登录后再使用匿名发言" }));
          return;
        }
        try {
          let rid = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(rid);
          let useResp = await stub.fetch("https://dummy-url/anon/use", {
            method: "POST",
            body: JSON.stringify({ name: session.name, token: session.token || "", channel: msgChannel }),
            headers: { "Content-Type": "application/json" },
          });
          if (!useResp.ok) {
            let errText = await useResp.text();
            let errObj = {};
            try {
              errObj = JSON.parse(errText);
            } catch (e) {}
            webSocket.send(JSON.stringify({ error: errObj.error || "匿名券不足，可在商店购买" }));
            return;
          }
        } catch (e) {
          webSocket.send(JSON.stringify({ error: "匿名服务暂时不可用" }));
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
            let enabled = cmds.filter((c) => c.enabled !== false);
            let helpText =
              enabled.length > 0 ? "可用命令: " + enabled.map((c) => c.keyword).join(", ") : "暂无可用命令";
            let helpMsg = {
              name: "Bot",
              message: helpText,
              tag: "🤖",
              tagColor: "green",
              timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
              id: ++this.msgCounter,
            };
            this.lastTimestamp = helpMsg.timestamp;
            this.broadcast(JSON.stringify(helpMsg));
            let helpKey = new Date(helpMsg.timestamp).toISOString();
            await this.storage.put(helpKey, JSON.stringify(helpMsg));
            return;
          }

          let botResp = await stub.fetch(
            "https://dummy-url/bot-commands?action=get&keyword=" + encodeURIComponent(cmdKeyword)
          );
          if (botResp.ok) {
            let cmdData = await botResp.json();
            if (cmdData.enabled !== false && cmdData.response) {
              let botMsg = {
                name: "Bot",
                message: cmdData.response,
                tag: "🤖",
                tagColor: "green",
                channel: session.channel || "general",
                timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
                id: ++this.msgCounter,
              };
              this.lastTimestamp = botMsg.timestamp;
              this.broadcastToChannel(session.channel || "general", JSON.stringify(botMsg));
              let key = new Date(botMsg.timestamp).toISOString();
              await this.storage.put(key, JSON.stringify(botMsg));
              return;
            }
          }
          webSocket.send(JSON.stringify({ error: "未知命令，输入 /bot help 查看可用命令" }));
        } catch (e) {
          webSocket.send(JSON.stringify({ error: "机器人暂时不可用" }));
        }
        return;
      }

      // 🧪 v1.49 LuckPerms 权限系统命令（仿 /rollback 服务端透传）：/lp ...
      // 门控：管理员标签 或 拥有 chat.lp.manage 权限的用户可执行；转发 registry /lp/exec 执行
      if (/^\/lp\b/i.test(data.message)) {
        let canManage = this.isAdminSession(session);
        if (!canManage && session.name) {
          try {
            let rid = this.env.registry.idFromName("global");
            let stub = this.env.registry.get(rid);
            let r = await stub.fetch(
              "https://dummy-url/lp/check?name=" + encodeURIComponent(session.name) + "&node=chat.lp.manage"
            );
            let d = await r.json();
            if (d && d.result === true) canManage = true;
          } catch (e) {}
        }
        if (!canManage) {
          webSocket.send(JSON.stringify({ error: "无权限使用 /lp（需要管理员身份或 chat.lp.manage 权限）" }));
          return;
        }
        try {
          let rid = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(rid);
          let r = await stub.fetch("https://dummy-url/lp/exec", {
            method: "POST",
            body: JSON.stringify({ cmd: data.message }),
            headers: { "Content-Type": "application/json" },
          });
          let d = await r.json();
          let txt = (d && d.text) || (d && d.error) || "命令执行完毕";
          webSocket.send(JSON.stringify({ system: txt }));
        } catch (e) {
          webSocket.send(JSON.stringify({ error: "权限系统暂时不可用" }));
        }
        return;
      }

      // 🚨 全屏入侵警告命令（公开功能，仿 /rollback 服务端透传）：/icco
      // 服务端统一广播，所有在线用户（含发起者，任意频道）同时触发全屏警告动画
      if (/^\/icco\b/i.test(data.message)) {
        this.broadcast({ type: "effect", effect: "icco" });
        return;
      }

      // 应急回滚命令（公开管理功能）：/rollback <版本号> <超管密钥>
      // 用于聊天室出问题时，超管在手机上快速把线上 worker 回滚部署到 archive 中的稳定版本
      let rbMatch = data.message.match(/^\/rollback\s+(\S+)\s+(\S+)/i);
      if (rbMatch) {
        if (!this.env.ADMIN_SECRET_KEY || rbMatch[2] !== this.env.ADMIN_SECRET_KEY) {
          webSocket.send(JSON.stringify({ error: "回滚密钥无效" }));
          return;
        }
        let rbVersion = rbMatch[1];
        webSocket.send(JSON.stringify({ system: "正在执行回滚到版本 " + rbVersion + " ..." }));
        this._doRollback(rbVersion, webSocket).catch((e) => {
          try {
            webSocket.send(JSON.stringify({ error: "回滚失败: " + ((e && e.message) || String(e)) }));
          } catch (_) {}
        });
        return;
      }

      // 💥 销毁房间命令（公开管理功能，仿 /rollback 透传）：/destroy <销毁口令>
      // 销毁当前房间：清空全部数据、断开所有连接、从 registry 移除
      let dsMatch = data.message.match(/^\/destroy\s+(\S+)/i);
      if (dsMatch) {
        if (!this.env.DESTROY_KEY || dsMatch[1] !== this.env.DESTROY_KEY) {
          webSocket.send(JSON.stringify({ error: "销毁口令无效" }));
          return;
        }
        try {
          webSocket.send(JSON.stringify({ system: "正在销毁房间，所有数据将永久删除..." }));
        } catch (_) {}
        try {
          this.destroyed = true;
          try {
            await this.storage.put("__destroyed__", "1");
          } catch (e) {}
          await this.clearAllMessages();
          // 先广播销毁通知（前端收到直接跳首页，不依赖 CloseEvent.reason，兼容各浏览器）
          let destroyNotice = JSON.stringify({ type: "destroyed" });
          this.sessions.forEach((s, ws) => {
            try {
              ws.send(destroyNotice);
            } catch (e) {}
          });
          this.sessions.forEach((s, ws) => {
            try {
              ws.close(1000, "destroyed");
            } catch (e) {}
          });
          this.sessions.clear();
          try {
            let rid = this.env.registry.idFromName("global");
            let rstub = this.env.registry.get(rid);
            await rstub.fetch(
              new URL("https://dummy-url/room-destroy?name=" + encodeURIComponent(this.roomName || ""))
            );
          } catch (e) {}
        } catch (e) {
          try {
            webSocket.send(JSON.stringify({ error: "销毁房间失败: " + ((e && e.message) || String(e)) }));
          } catch (_) {}
        }
        return;
      }

      // 🐙 /gh 仓库卡片命令（公开功能，仿 /rollback 服务端透传）：/gh <owner>/<repo> 或 /gh <仓库URL>
      // 服务端查 GitHub API 获取仓库信息，广播一个可点击跳转的仓库卡片（带缓存缓解限流）
      let ghMatch = data.message.match(/^\/gh\s+(\S+)/i);
      if (ghMatch) {
        let ghInput = ghMatch[1].trim();
        // 支持 https://github.com/owner/repo、github.com/owner/repo、owner/repo
        let ghUrlMatch = ghInput.match(
          /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?(?:\?.*)?$/i
        );
        let repoPath = ghInput;
        if (ghUrlMatch) repoPath = ghUrlMatch[1] + "/" + ghUrlMatch[2];
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/i.test(repoPath)) {
          webSocket.send(JSON.stringify({ error: "用法: /gh <owner>/<repo> 或 /gh <GitHub仓库URL>" }));
          return;
        }
        webSocket.send(JSON.stringify({ system: "正在查询 GitHub 仓库 " + repoPath + " ..." }));
        try {
          // 🐙 缓存查询结果（同一仓库 1 小时内不重复请求 GitHub API，缓解无 token 限流）
          let ghCacheKey = "ghcache:" + repoPath.toLowerCase();
          let cached = await this.storage.get(ghCacheKey);
          let ghData = null;
          if (cached) {
            try {
              ghData = JSON.parse(cached);
            } catch (e) {
              ghData = null;
            }
          }
          if (!ghData) {
            // 优先用 GITHUB_TOKEN（5000次/小时），无 token 时匿名查询（Workers 出口 IP 共享限流 60/h，可能被耗尽）
            let ghHeaders = { "User-Agent": "CloudChat/1.0", Accept: "application/vnd.github+json" };
            if (this.env.GITHUB_TOKEN) ghHeaders["Authorization"] = "Bearer " + this.env.GITHUB_TOKEN;
            let ghResp = await fetch("https://api.github.com/repos/" + repoPath, { headers: ghHeaders });
            if (ghResp.status === 404) {
              webSocket.send(JSON.stringify({ error: "仓库不存在: " + repoPath }));
              return;
            }
            if (ghResp.status === 403) {
              webSocket.send(JSON.stringify({ error: "GitHub API 限流，请稍后再试" }));
              return;
            }
            let gh = await ghResp.json();
            if (!gh || !gh.full_name) {
              webSocket.send(JSON.stringify({ error: "无法获取仓库信息" }));
              return;
            }
            ghData = {
              repo: gh.full_name,
              repoUrl: gh.html_url || "https://github.com/" + repoPath,
              description: (gh.description || "").slice(0, 300),
              stars: gh.stargazers_count || 0,
              forks: gh.forks_count || 0,
              language: gh.language || "",
              ownerAvatar: (gh.owner && gh.owner.avatar_url) || "",
            };
            // 缓存 1 小时（DO storage put 的 expirationTtl 单位为秒）
            try {
              await this.storage.put(ghCacheKey, JSON.stringify(ghData), { expirationTtl: 3600 });
            } catch (e) {}
          }
          let ghCard = {
            // 🔒 安全修复（F2）：匿名模式下用 data.name/data.tag*（已替换为"匿名"+🕶️），防 /gh 卡片泄漏真实用户名与标签
            name: data.name,
            type: "gh-card",
            channel: session.channel || "general",
            repo: ghData.repo,
            repoUrl: ghData.repoUrl,
            description: ghData.description,
            stars: ghData.stars,
            forks: ghData.forks,
            language: ghData.language,
            ownerAvatar: ghData.ownerAvatar,
            timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
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
          let ghCardStr =
            anonFlag && session.name
              ? JSON.stringify({ ...ghCard, _anonOwner: hashAnonOwner(session.name) })
              : JSON.stringify(ghCard);
          await this.storage.put(ghCardKey, ghCardStr);
        } catch (e) {
          webSocket.send(JSON.stringify({ error: "查询 GitHub 失败: " + ((e && e.message) || String(e)) }));
        }
        return;
      }

      // 检测 /ai 或 @ai 命令 — 调用 AI API
      let aiMatch = data.message.match(/^[@\/]ai\s+(.+)/i);
      if (aiMatch) {
        // 🔒 安全修复（LD2）：AI 调用仅限已登录（token 认证）用户，堵死游客无限刷付费 AI（频率限制不做，仅认证门槛）
        if (!session.authenticated) {
          webSocket.send(JSON.stringify({ error: "请先登录后再使用 AI 功能" }));
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
          let aiUserStr =
            anonFlag && session.name ? JSON.stringify({ ...data, _anonOwner: hashAnonOwner(session.name) }) : dataStr;
          await this.storage.put(aiUserKey, aiUserStr);

          let userPrompt = aiMatch[1].trim();
          if (!userPrompt) {
            webSocket.send(JSON.stringify({ error: "请输入你想问的问题，例如：/ai 你好" }));
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
            ctxMsgs.unshift({ role: "user", content: (m.name || "用户") + ": " + m.message.slice(0, 200) });
          }
          // 多轮对话：读取该用户在当前频道的对话历史（storage 持久化，刷新不丢）
          let ctxKey = "aictx:" + (session.channel || "general") + ":" + session.name;
          let aiHistory = [];
          try {
            let histRaw = await this.storage.get(ctxKey);
            if (histRaw) aiHistory = JSON.parse(histRaw);
          } catch (e) {}
          if (!Array.isArray(aiHistory)) aiHistory = [];
          let aiMsgs = [{ role: "system", content: this.env.AI_SYSTEM_PROMPT || "你是一个友好的助手，回答尽量简洁" }];
          if (ctxMsgs.length) aiMsgs = aiMsgs.concat(ctxMsgs);
          // 注入用户与 AI 的对话历史（最近 10 条），实现多轮记忆
          aiHistory.forEach((h) => {
            if (h && h.role && h.content) aiMsgs.push({ role: h.role, content: String(h.content).slice(0, 500) });
          });
          aiMsgs.push({ role: "user", content: userPrompt });
          let resp = await fetch(this.env.AI_BASE_URL + "/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + this.env.AI_API_KEY,
            },
            body: JSON.stringify({
              model: this.env.AI_MODEL || "deepseek-chat",
              messages: aiMsgs,
              max_tokens: 2000,
            }),
          });
          if (!resp.ok) {
            let errText = await resp.text();
            throw new Error("API " + resp.status + ": " + errText.slice(0, 200));
          }
          let aiData = await resp.json();
          let aiText = aiData.choices?.[0]?.message?.content || "AI 返回了空回复";
          let aiMsg = {
            name: "AI",
            message: aiText,
            tag: "🤖",
            tagColor: "blue",
            channel: session.channel || "general",
            timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
            id: ++this.msgCounter,
          };
          this.lastTimestamp = aiMsg.timestamp;
          this.broadcastToChannel(session.channel || "general", JSON.stringify(aiMsg));
          let key = new Date(aiMsg.timestamp).toISOString();
          await this.storage.put(key, JSON.stringify(aiMsg));
          // 记录多轮对话历史（上限 10 条，防 storage 膨胀）
          aiHistory.push({ role: "user", content: userPrompt.slice(0, 500) });
          aiHistory.push({ role: "assistant", content: aiText.slice(0, 1500) });
          if (aiHistory.length > 10) aiHistory = aiHistory.slice(-10);
          try {
            await this.storage.put(ctxKey, JSON.stringify(aiHistory));
          } catch (e) {}
        } catch (e) {
          webSocket.send(JSON.stringify({ error: "AI 请求失败: " + e.message }));
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
              body: JSON.stringify({ name: session.name, token: session.token || "", amount: 1, stats: "msg" }),
              headers: { "Content-Type": "application/json" },
            });
            if (xpResp.ok) {
              let xpData = await xpResp.json();
              // 匿名发言不广播等级（避免泄露真实用户等级），经验照发
              if (xpData && xpData.level && !anonFlag) data.level = xpData.level;
              if (xpData && xpData.leveledUp) {
                try {
                  webSocket.send(
                    JSON.stringify({
                      type: "xp-update",
                      exp: xpData.exp,
                      level: xpData.level,
                      leveledUp: true,
                      newLevel: xpData.newLevel,
                    })
                  );
                } catch (e) {}
              }
              if (xpData && xpData.achievements && xpData.achievements.length) {
                try {
                  webSocket.send(JSON.stringify({ type: "achievement", achievements: xpData.achievements }));
                } catch (e) {}
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
          if (pingMatch && this.channels.some((c) => c.name === pingMatch[1])) pingTarget = pingMatch[1];
        }
        if (pingTarget !== null) {
          let pingStr = JSON.stringify({
            type: "channel-ping",
            // 🔒 安全修复（F1）：匿名模式下用 data.name（"匿名"）代替 session.name，防跨频道 ping 泄漏真实身份
            name: data.name,
            fromChannel: msgChannel,
            targetChannel: pingTarget === "__all__" ? null : pingTarget,
            atAll: isAtAll,
          });
          this.sessions.forEach((s, ws) => {
            // 跳过自己 + 跳过本频道的(他们已看到消息与常规 @全体 横幅)
            if (!s.name || s.name === session.name) return;
            if ((s.channel || "general") === msgChannel) return;
            // 指定频道时只通知该频道的用户
            if (pingTarget !== "__all__" && (s.channel || "general") !== pingTarget) return;
            try {
              ws.send(pingStr);
            } catch (_) {}
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
            let r = await rstub.fetch(
              "https://dummy-url/rel/at-filter?from=" +
                encodeURIComponent(session.name) +
                "&names=" +
                encodeURIComponent(atTargets.join(","))
            );
            let d = await r.json();
            if (Array.isArray(d.allowed)) atTargets = d.allowed;
          } catch (e) {}
        }
        for (let tn of atTargets) {
          this.sessions.forEach((s, ws) => {
            if (s.name === tn) {
              // 🔒 安全修复（F1）：匿名模式下 from 用 data.name（"匿名"）代替 session.name，防在线@红点泄漏真实身份
              try {
                ws.send(
                  JSON.stringify({
                    type: "at-mention",
                    from: data.name,
                    message: msgText.slice(0, 100),
                    timestamp: data.timestamp,
                    channel: msgChannel,
                  })
                );
              } catch (_) {}
            }
          });
          // 🔒 安全修复（F1）：at-mention 持久化同样匿名化 from，防离线补显时泄漏真实身份
          await this.recordAtMention(tn, data.name, msgText, data.timestamp, msgChannel);
        }
      }

      let key = new Date(data.timestamp).toISOString();
      // 🔒 安全修复（F7）：匿名消息存储时附带真实身份指纹（_anonOwner，真实 name 哈希）供本人删除；
      // 只写 storage 不进广播 dataStr，避免真实身份经 WS 泄漏给其他客户端
      let storeStr =
        anonFlag && session.name ? JSON.stringify({ ...data, _anonOwner: hashAnonOwner(session.name) }) : dataStr;
      await this.storage.put(key, storeStr);
      // 📈 v1.54 运营数据：每日消息计数日桶（房间 DO 各自累计，registry /ops/stats 遍历聚合）
      await this.bumpMsgStat(data.timestamp);
    } catch (err) {
      console.error("webSocketMessage 异常:", err.stack || err);
      webSocket.send(JSON.stringify({ error: "消息处理错误" }));
    }
  }

  /**
   * WS 关闭/错误的统一清理入口（逻辑在 chatroom/conn.mjs）
   * @param {any} webSocket WS 连接
   * @returns {Promise<void>}
   */
  async closeOrErrorHandler(webSocket) {
    // v1.57 拆分：连接清理逻辑在 chatroom/conn.mjs
    await handleWsCloseImpl(this, webSocket);
  }

  /**
   * DO WS 关闭回调（薄包装 closeOrErrorHandler）
   * @param {any} webSocket WS 连接
   * @param {number} [code] 关闭码
   * @param {string} [reason] 关闭原因
   * @param {boolean} [wasClean] 是否正常关闭
   * @returns {Promise<void>}
   */
  async webSocketClose(webSocket, code, reason, wasClean) {
    this.closeOrErrorHandler(webSocket);
  }

  /**
   * DO WS 错误回调（薄包装 closeOrErrorHandler）
   * @param {any} webSocket WS 连接
   * @param {any} error 错误对象
   * @returns {Promise<void>}
   */
  async webSocketError(webSocket, error) {
    this.closeOrErrorHandler(webSocket);
  }

  /**
   * 应急回滚命令执行（逻辑在 chatroom/rollback.mjs）
   * @param {string} version archive 版本号
   * @param {any} webSocket WS 连接
   * @returns {Promise<void>}
   */
  async _doRollback(version, webSocket) {
    // v1.57 拆分：回滚逻辑在 chatroom/rollback.mjs
    await _doRollbackImpl(this, version, webSocket);
  }
  // v1.56 长文通道：消息长度单点收敛（普通 5000 / VIP10+ 10000，值来自 getVipFeatures），替代 4 处重复取 features.maxMsgLen
  /**
   * 获取会话允许的最大消息长度（逻辑在 permissions.mjs）
   * @param {import("./types.js").WsSession} session 会话（含 vip.features）
   * @returns {number} 最大消息长度
   */
  getMaxMsgLen(session) {
    return getMaxMsgLenImpl(session);
  }
  /**
   * 敏感词检测（逻辑在 permissions.mjs）
   * @param {string} text 待检测文本
   * @returns {boolean} 是否含敏感词
   */
  containsProfanity(text) {
    return containsProfanityImpl(text);
  }
  /**
   * DO alarm：定时消息投递（逻辑在 schedule.mjs）
   * @returns {Promise<void>}
   */
  async alarm() {
    // v1.57 拆分：定时消息投递逻辑在 schedule.mjs
    await runScheduledMessages(this);
  }
  /**
   * 向房间内所有已设名会话广播（未设名会话排队，上限 200 条）；对象自动 JSON 序列化
   * @param {string|object} message 消息对象或 JSON 字符串
   * @returns {void}
   */
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

    quitters.forEach((quitter) => {
      if (quitter.name) {
        this.broadcast({ quit: quitter.name });
      }
    });
  }

  // 管理员判定：支持自定义红/青/金边超管标签（v1.57 逻辑移至 chatroom/permissions.mjs）
  /**
   * 管理员判定（红/青标签或金边超管，逻辑在 permissions.mjs）
   * @param {import("./types.js").WsSession} session 会话
   * @returns {boolean} 是否管理员
   */
  isAdminSession(session) {
    return isAdminSessionImpl(session);
  }

  // 🧪 v1.49 超管判定：金色边框标签
  /**
   * 超管判定（金色边框标签）
   * @param {import("./types.js").WsSession} session 会话
   * @returns {boolean} 是否超管
   */
  isSuperSession(session) {
    return isSuperSessionImpl(session);
  }

  // 🧪 v1.49 LuckPerms 权限解析：LP 显式结果优先，未定义回退基础层（逻辑移至 permissions.mjs）
  /**
   * LuckPerms 权限解析：LP 显式结果优先，未定义回退基础层（逻辑在 permissions.mjs）
   * @param {import("./types.js").WsSession} session 会话（含 name/authenticated/tag）
   * @param {string} node 权限节点（如 chat.admin.kickUser / chat.admin.* / *）
   * @returns {Promise<boolean>} 是否放行
   */
  hasPerm(session, node) {
    return hasPermImpl(this, session, node);
  }

  // 🧪 v1.49 LP 辅助：查询用户对节点的显式权限结果（true/false/null），不回退基础层
  /**
   * 查询用户对节点的显式权限结果（true/false/null），不回退基础层
   * @param {string} name 用户名
   * @param {string} node 权限节点
   * @returns {Promise<boolean|null>} LP 显式结果或 null（未定义）
   */
  lpRawPerm(name, node) {
    return lpRawPermImpl(this, name, node);
  }
  // 📌 在线@红点：记录 @<用户名> 到 storage（上限 50 条），供用户下次上线时补显
  /**
   * 记录离线 @ 提醒到 storage（at-mentions，上限 50 条，下次上线补显）
   * @param {string} targetName 被 @ 的用户名
   * @param {string} fromName 发送者名（匿名模式为"匿名"）
   * @param {string} message 消息文本（截取前 100 字）
   * @param {number} [ts] 时间戳（默认当前时间）
   * @param {string} [channel] 频道名（默认 general）
   * @returns {Promise<void>}
   */
  async recordAtMention(targetName, fromName, message, ts, channel) {
    try {
      let raw = await this.storage.get("at-mentions");
      let arr = [];
      if (raw) {
        let p = JSON.parse(raw);
        if (Array.isArray(p)) arr = p;
      }
      arr.push({
        target: targetName,
        from: fromName,
        message: (message || "").slice(0, 100),
        ts: ts || Date.now(),
        channel: channel || "general",
      });
      if (arr.length > 50) arr = arr.slice(-50);
      await this.storage.put("at-mentions", JSON.stringify(arr));
    } catch (e) {}
  }

  // 频道体系：只发送给指定频道的已设名会话；未设名会话排队（命名后按频道分流）
  /**
   * 按频道广播（只发给该频道已设名会话，未设名会话排队）；对象自动 JSON 序列化
   * @param {string} channel 目标频道名
   * @param {string|object} message 消息对象或 JSON 字符串
   * @returns {void}
   */
  broadcastToChannel(channel, message) {
    if (typeof message !== "string") {
      message = JSON.stringify(message);
    }
    this.sessions.forEach((session, webSocket) => {
      if (session.name) {
        if ((session.channel || "general") === channel) {
          try {
            webSocket.send(message);
          } catch (err) {
            session.quit = true;
            this.sessions.delete(webSocket);
          }
        }
      } else {
        // M12：未命名会话消息队列设上限，防无限累积
        if (session.blockedMessages.length < 200) session.blockedMessages.push(message);
      }
    });
  }
}
