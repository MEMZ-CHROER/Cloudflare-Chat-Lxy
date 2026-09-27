// v2 worker entry — re-exports core DO classes so wrangler recognizes them
export { ChatRoom } from "../core/chatroom.mjs";
export { RoomRegistry } from "../core/registry.mjs";
export { VersionArchive } from "../core/archive.mjs";
export { FileBucket } from "../core/filebucket.mjs";

// v2 overrides
export * from "./chatroom.override.mjs";
export * from "./utils.override.mjs";

// ─── Build-time static asset imports ───
import V2_APP from "./client/app.js";
import V2_STORE from "./client/store.js";
import V2_WS from "./client/ws.js";
import V2_AUTH from "./client/auth.js";
import V2_ROOM from "./client/room.js";
import V2_CHAT from "./client/chat.js";
import V2_RENDERERS from "./client/renderers.override.js";
import V2_CHANNELS from "./client/modules/channels.override.js";
import V2_DM from "./client/modules/dm.override.js";
import V2_SEARCH from "./client/modules/search.override.js";
import V2_SETTINGS from "./client/modules/settings.override.js";
import V2_EMOJI from "./client/modules/emoji-panel.override.js";
import V2_MENTION from "./client/modules/mention.override.js";
import V2_FAVORITES from "./client/modules/favorites.override.js";
import V2_COMMANDS from "./client/modules/commands.override.js";
import V2_NOTIF from "./client/modules/notifications.override.js";
import V2_KEYBOARD from "./client/modules/keyboard.override.js";
import V2_UPLOAD from "./client/modules/upload.override.js";
import V2_IMGUPLOAD from "./client/modules/image-upload.override.js";
import V2_HIGHLIGHTS from "./client/modules/highlights.override.js";
import V2_ROOMINFO from "./client/modules/roominfo.override.js";
import V2_VIP from "./client/modules/vip.override.js";
import V2_ACHIEVEMENTS from "./client/modules/achievements.override.js";
import V2_TOAST from "./client/modules/toast.override.js";
import V2_STATE from "./client/state.override.js";
import V2_ASCII from "./client/modules/ascii.override.js";
import V2_BANNER from "./client/modules/banner.override.js";
import V2_I18N from "./client/modules/i18n.override.js";
import V2_KEYWORDS from "./client/modules/keywords.override.js";
import V2_MUSIC from "./client/modules/music.override.js";
import V2_NAV from "./client/modules/nav.override.js";
import V2_PROFILE from "./client/modules/profile.override.js";
import V2_SHOP from "./client/modules/shop.override.js";
import V2_TASKS from "./client/modules/tasks.override.js";
import V2_LOTTERY from "./client/modules/lottery.override.js";
import V2_MARKET from "./client/modules/market.override.js";
import V2_SEASON from "./client/modules/season.override.js";
import V2_RELATION from "./client/modules/relation.override.js";
import V2_VOICE from "./client/modules/voice-record.override.js";
import V2_NOTES from "./client/modules/note.override.js";
import V2_DOCSTORE from "./client/modules/doc-store.override.js";
import V2_GAMES from "./client/modules/games.override.js";
import V2_HACKNET from "./client/modules/hacknet.override.js";
import V2_MODAL from "./client/modules/modal-manager.override.js";
import V2_UI from "./client/modules/ui.override.js";
import V2_CHAT_SHELL from "./client/views/chat-shell.js";
import V2_V2_CHAT from "./client/views/v2-chat.js";
import V2_AUTO_DISCOVER from "./client/views/auto-discover.js";
import V2_STYLE from "./client/style.css";

// ─── v2 HTML template (from v2-chat.js) ───
const V2_HTML = V2_V2_CHAT;

const V2_MODULES = {
  "client/app.js": V2_APP,
  "client/store.js": V2_STORE,
  "client/ws.js": V2_WS,
  "client/auth.js": V2_AUTH,
  "client/room.js": V2_ROOM,
  "client/chat.js": V2_CHAT,
  "client/renderers.override.js": V2_RENDERERS,
  "client/modules/channels.override.js": V2_CHANNELS,
  "client/modules/dm.override.js": V2_DM,
  "client/modules/search.override.js": V2_SEARCH,
  "client/modules/settings.override.js": V2_SETTINGS,
  "client/modules/emoji-panel.override.js": V2_EMOJI,
  "client/modules/mention.override.js": V2_MENTION,
  "client/modules/favorites.override.js": V2_FAVORITES,
  "client/modules/commands.override.js": V2_COMMANDS,
  "client/modules/notifications.override.js": V2_NOTIF,
  "client/modules/keyboard.override.js": V2_KEYBOARD,
  "client/modules/upload.override.js": V2_UPLOAD,
  "client/modules/image-upload.override.js": V2_IMGUPLOAD,
  "client/modules/highlights.override.js": V2_HIGHLIGHTS,
  "client/modules/roominfo.override.js": V2_ROOMINFO,
  "client/modules/vip.override.js": V2_VIP,
  "client/modules/achievements.override.js": V2_ACHIEVEMENTS,
  "client/modules/toast.override.js": V2_TOAST,
  "client/state.override.js": V2_STATE,
  "client/modules/ascii.override.js": V2_ASCII,
  "client/modules/banner.override.js": V2_BANNER,
  "client/modules/i18n.override.js": V2_I18N,
  "client/modules/keywords.override.js": V2_KEYWORDS,
  "client/modules/music.override.js": V2_MUSIC,
  "client/modules/nav.override.js": V2_NAV,
  "client/modules/profile.override.js": V2_PROFILE,
  "client/modules/shop.override.js": V2_SHOP,
  "client/modules/tasks.override.js": V2_TASKS,
  "client/modules/lottery.override.js": V2_LOTTERY,
  "client/modules/market.override.js": V2_MARKET,
  "client/modules/season.override.js": V2_SEASON,
  "client/modules/relation.override.js": V2_RELATION,
  "client/modules/voice-record.override.js": V2_VOICE,
  "client/modules/note.override.js": V2_NOTES,
  "client/modules/doc-store.override.js": V2_DOCSTORE,
  "client/modules/games.override.js": V2_GAMES,
  "client/modules/hacknet.override.js": V2_HACKNET,
  "client/modules/modal-manager.override.js": V2_MODAL,
  "client/modules/ui.override.js": V2_UI,
  "client/views/chat-shell.js": V2_CHAT_SHELL,
  "client/views/v2-chat.js": V2_V2_CHAT,
  "client/views/auto-discover.js": V2_AUTO_DISCOVER,
  "client/style.css": V2_STYLE,
};

const JS_CT = "application/javascript; charset=utf-8";
const HTML_CT = "text/html; charset=utf-8";
const NO_CACHE = { "Cache-Control": "no-cache, must-revalidate", "X-Content-Type-Options": "nosniff" };

// ─── v2 专属路由（页面 + 静态资源 + WebSocket） ───
async function handleV2Request(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\//, "");

  // 首页
  if (path === "" || path === "index.html") {
    return new Response(V2_HTML, { headers: { "Content-Type": HTML_CT, ...NO_CACHE } });
  }

  // 静态 JS 模块
  const modKey = path.startsWith("static/") ? path.replace(/^static\//, "client/") : path;
  if (V2_MODULES[modKey]) {
    return new Response(V2_MODULES[modKey], {
      headers: { "Content-Type": JS_CT, ...NO_CACHE },
    });
  }

  // WebSocket 升级 → v2 自己处理（避免 CF fetch() 无法代理 WS 的问题）
  const upgrade = request.headers.get("Upgrade") || "";
  if (upgrade.toLowerCase() === "websocket") {
    return handleV2WebSocket(request, env);
  }

  // 其他路径也走 fallback
  return null;
}

/**
 * v2 WebSocket handler — creates a DO instance and handles the session.
 * Reuses core ChatRoom.handleSession + webSocketMessage (same as v1).
 */
async function handleV2WebSocket(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const roomName = parts[1] || "";
  if (!roomName) return new Response("Missing room name", { status: 400 });

  const room = env.V2_CHAT_ROOM.get(roomName);
  room.roomName = roomName; // v1 sets this in http.mjs; we need it here for password check
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

  // Password check (same logic as v1)
  if (room.roomName && env.registry) {
    try {
      const pwd = url.searchParams.get("password") || "";
      const registryId = env.registry.idFromName("global");
      const stub = env.registry.get(registryId);
      const pwdCheck = await stub.fetch("https://dummy-url/verify-password", {
        method: "POST",
        body: JSON.stringify({ name: roomName, password: pwd }),
        headers: { "Content-Type": "application/json" }
      });
      const pwdResult = await pwdCheck.json();
      if (!pwdResult.ok) return new Response("需要密码", { status: 403 });
    } catch {
      return new Response("验证服务暂时不可用", { status: 503 });
    }
  }

  const pair = new WebSocketPair();
  const [client, server] = pair;

  await room.handleSession(server, ip);

  server.onmessage = (event) => {
    room.webSocketMessage(server, event.data).catch(() => {});
  };

  server.onclose = (event) => {
    room.webSocketClose(server, event.code, event.reason, event.wasClean).catch(() => {});
  };

  server.onerror = (event) => {
    room.webSocketError(server, event).catch(() => {});
  };

  return new Response(null, { status: 101, webSocket: client });
}

// ─── 优雅降级到 v1 ───
const V1_HOST = "chat.liuxiyu.cn";

async function fallbackToV1(request) {
  const url = new URL(request.url);
  url.host = V1_HOST;
  url.protocol = "https:";
  const v1Req = new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: "manual",
  });
  return fetch(v1Req);
}

// ─── v2 fetch 入口 ───
export default {
  async fetch(request, env, ctx) {
    try {
      const response = await handleV2Request(request, env);
      if (response !== null) return response;
      return await fallbackToV1(request);
    } catch (e) {
      console.error("[v2] error, fallback:", e);
      return await fallbackToV1(request);
    }
  },
};
