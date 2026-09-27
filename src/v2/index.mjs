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
import V2_CHAT_SHELL from "./client/views/chat-shell.js";
import V2_V2_CHAT from "./client/views/v2-chat.js";
import V2_AUTO_DISCOVER from "./client/views/auto-discover.js";

// ─── Inline HTML template ───
const V2_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudChat v2</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; }
    #v2-app { display: flex; flex-direction: column; height: 100vh; max-width: 800px; margin: 0 auto; }
    .v2-header { padding: 16px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .v2-header h1 { font-size: 1.25rem; }
    #v2-status { font-size: 0.875rem; padding: 4px 12px; border-radius: 9999px; background: #334155; }
    #v2-chat-body { display: flex; flex: 1; overflow: hidden; }
    #v2-messages { flex: 1; overflow-y: auto; padding: 16px; }
    .v2-msg { padding: 6px 12px; margin-bottom: 4px; background: transparent; word-wrap: break-word; }
    .v2-msg.self { background: rgba(59,130,246,0.1); border-radius: 8px; padding: 6px 12px; margin-left: 20px; }
    .v2-msg.other { background: rgba(30,41,59,0.5); border-radius: 8px; padding: 6px 12px; margin-right: 20px; }
    .v2-system-msg { color: #64748b; font-style: italic; font-size: 0.875rem; padding: 4px 12px; margin-bottom: 4px; }
    #v2-roster { width: 160px; background: #1e293b; border-left: 1px solid #334155; overflow-y: auto; padding: 8px; }
    .v2-roster-item { padding: 4px 8px; font-size: 0.875rem; color: #94a3b8; border-radius: 4px; cursor: pointer; }
    .v2-roster-item:hover { background: #334155; }
    .v2-roster-item.self { color: #60a5fa; }
    .v2-roster-header { font-size: 0.75rem; color: #64748b; padding: 4px 8px; text-transform: uppercase; }
    textarea#v2-msg-input { resize: none; min-height: 44px; }
    .v2-msg { padding: 8px 12px; margin-bottom: 8px; background: #1e293b; border-radius: 8px; word-wrap: break-word; }
    .v2-msg-header { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.875rem; }
    .v2-msg-name { font-weight: 600; color: #60a5fa; }
    .v2-msg-time { color: #64748b; font-size: 0.75rem; }
    .v2-msg-content { color: #e2e8f0; }
    #v2-input-area { padding: 16px; background: #1e293b; border-top: 1px solid #334155; display: flex; gap: 8px; }
    #v2-msg-input { flex: 1; padding: 12px; border: 1px solid #334155; border-radius: 8px; background: #0f172a; color: #e2e8f0; font-size: 1rem; }
    #v2-msg-input:focus { outline: none; border-color: #3b82f6; }
    #v2-send-btn { padding: 12px 24px; border: none; border-radius: 8px; background: #3b82f6; color: white; font-size: 1rem; cursor: pointer; }
    #v2-send-btn:hover { background: #2563eb; }
    #v2-auth { display: flex; align-items: center; justify-content: center; height: 100vh; }
    .v2-auth-card { background: #1e293b; padding: 32px; border-radius: 12px; width: 100%; max-width: 400px; }
    .v2-auth-card h1 { text-align: center; margin-bottom: 24px; }
    .v2-auth-tabs { display: flex; gap: 8px; margin-bottom: 24px; }
    .v2-auth-tab { flex: 1; padding: 8px; border: none; border-radius: 6px; background: #334155; color: #94a3b8; cursor: pointer; }
    .v2-auth-tab.active { background: #3b82f6; color: white; }
    .v2-auth-input { width: 100%; padding: 12px; margin-bottom: 12px; border: 1px solid #334155; border-radius: 6px; background: #0f172a; color: #e2e8f0; font-size: 1rem; }
    .v2-auth-btn { width: 100%; padding: 12px; border: none; border-radius: 6px; background: #3b82f6; color: white; font-size: 1rem; cursor: pointer; }
    .v2-auth-btn:hover { background: #2563eb; }
    .v2-auth-error { color: #f87171; font-size: 0.875rem; margin-top: 8px; display: none; }
    .v2-auth-skip { display: block; text-align: center; margin-top: 16px; color: #64748b; font-size: 0.875rem; cursor: pointer; background: none; border: none; }
    .v2-auth-skip:hover { color: #94a3b8; }
    #v2-room-list { padding: 16px; }
    .v2-room-input { display: flex; gap: 8px; margin-bottom: 16px; }
    .v2-room-input input { flex: 1; padding: 12px; border: 1px solid #334155; border-radius: 6px; background: #1e293b; color: #e2e8f0; }
    .v2-room-input button { padding: 12px 24px; border: none; border-radius: 6px; background: #3b82f6; color: white; cursor: pointer; }
    .v2-room-divider { text-align: center; color: #64748b; margin-bottom: 16px; }
    #v2-rooms { display: flex; flex-direction: column; gap: 8px; }
    .v2-room-btn { padding: 12px 16px; border: 1px solid #334155; border-radius: 6px; background: #1e293b; color: #e2e8f0; text-align: left; cursor: pointer; }
    .v2-room-btn:hover { background: #334155; }
    #v2-user-info { font-size: 0.875rem; color: #64748b; }
    .v2-header-actions { display: flex; align-items: center; gap: 8px; }
    .v2-header-center { flex: 1; text-align: center; }
    .v2-room-name { font-size: 0.9rem; color: #94a3b8; cursor: pointer; }
    .v2-room-name:hover { color: #e2e8f0; }
    .v2-channel-tabs { display: flex; gap: 4px; margin-top: 4px; justify-content: center; }
    .v2-channel { padding: 4px 12px; border-radius: 12px; font-size: 0.8rem; background: #334155; color: #94a3b8; cursor: pointer; border: none; }
    .v2-channel.active { background: #3b82f6; color: white; }
    .v2-channel-badge { font-size: 0.7rem; background: #ef4444; color: white; border-radius: 50%; padding: 1px 5px; margin-left: 4px; }
    .v2-header-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
    .v2-header-btn:hover { background: #334155; }
    .v2-dm-badge { background: #ef4444; color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.75rem; margin-left: 4px; }
    .v2-msg-bubble { margin-top: 4px; line-height: 1.5; }
    .v2-msg-bubble code { background: #334155; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
    .v2-msg-bubble strong { color: #60a5fa; }
    .v2-msg-bubble em { color: #94a3b8; font-style: italic; }
    #v2-input-area { padding: 16px; background: #1e293b; border-top: 1px solid #334155; display: flex; gap: 8px; align-items: flex-end; }
    .v2-emoji-btn, .v2-upload-btn { padding: 12px; border: none; border-radius: 8px; background: #334155; color: #e2e8f0; font-size: 1.2rem; cursor: pointer; }
    .v2-emoji-btn:hover, .v2-upload-btn:hover { background: #475569; }
    .v2-emoji-panel { position: absolute; bottom: 80px; left: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px; display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; max-height: 200px; overflow-y: auto; }
    .v2-emoji-btn-item { font-size: 1.5rem; cursor: pointer; padding: 4px; border-radius: 4px; }
    .v2-emoji-btn-item:hover { background: #334155; }
    #v2-msg-input { flex: 1; padding: 12px; border: 1px solid #334155; border-radius: 8px; background: #0f172a; color: #e2e8f0; font-size: 1rem; resize: none; }
    #v2-msg-input:focus { outline: none; border-color: #3b82f6; }
    #v2-send-btn { padding: 12px 24px; border: none; border-radius: 8px; background: #3b82f6; color: white; font-size: 1rem; cursor: pointer; }
    #v2-send-btn:hover { background: #2563eb; }
    .v2-auth-card { position: relative; }
    .v2-auth-subtitle { text-align: center; color: #64748b; font-size: 0.875rem; margin-bottom: 16px; }
    .v2-auth-footer { display: flex; justify-content: center; gap: 16px; margin-top: 16px; }
    .v2-lang-btn { background: none; border: 1px solid #334155; color: #94a3b8; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.875rem; }
    .v2-lang-btn:hover { background: #334155; }
    .v2-no-rooms { text-align: center; color: #64748b; padding: 20px; }
    .v2-create-room-btn { width: 100%; padding: 12px; border: 2px dashed #334155; border-radius: 6px; background: transparent; color: #64748b; cursor: pointer; font-size: 1rem; }
    .v2-create-room-btn:hover { border-color: #3b82f6; color: #3b82f6; }
    .v2-settings-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .v2-settings-modal { background: #1e293b; border-radius: 12px; padding: 24px; width: 90%; max-width: 400px; }
    .v2-settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .v2-settings-header h2 { font-size: 1.25rem; }
    .v2-settings-close { background: none; border: none; font-size: 1.5rem; color: #94a3b8; cursor: pointer; }
    .v2-settings-section { margin-bottom: 20px; }
    .v2-settings-section h3 { font-size: 1rem; color: #94a3b8; margin-bottom: 12px; }
    .v2-settings-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .v2-settings-row label { color: #e2e8f0; }
    .v2-settings-row input[type="text"], .v2-settings-row select { padding: 8px; border: 1px solid #334155; border-radius: 4px; background: #0f172a; color: #e2e8f0; }
    .v2-settings-footer { display: flex; gap: 12px; justify-content: flex-end; }
    .v2-settings-save, .v2-settings-cancel { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; }
    .v2-settings-save { background: #3b82f6; color: white; }
    .v2-settings-cancel { background: #334155; color: #e2e8f0; }
    .v2-room-info-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .v2-room-info-card { background: #1e293b; border-radius: 12px; padding: 24px; width: 90%; max-width: 400px; }
    .v2-room-info-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .v2-room-info-header h2 { font-size: 1.25rem; }
    .v2-room-info-close { background: none; border: none; font-size: 1.5rem; color: #94a3b8; cursor: pointer; }
    .v2-info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #334155; }
    .v2-info-row .label { color: #64748b; }
    .v2-info-row .value { color: #e2e8f0; }
    .v2-room-info-footer { display: flex; gap: 12px; margin-top: 20px; }
    .v2-room-info-footer button { flex: 1; padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; }
    .v2-room-info-footer button:first-child { background: #3b82f6; color: white; }
    .v2-room-info-footer button:last-child { background: #ef4444; color: white; }
    .v2-achievements-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .v2-achievements-modal { background: #1e293b; border-radius: 12px; padding: 24px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; }
    .v2-achievements-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .v2-achievements-header h2 { font-size: 1.25rem; }
    .v2-achievements-close { background: none; border: none; font-size: 1.5rem; color: #94a3b8; cursor: pointer; }
    .v2-achievement { display: flex; align-items: center; padding: 12px; border-radius: 8px; margin-bottom: 8px; background: #0f172a; }
    .v2-achievement.locked { opacity: 0.5; }
    .v2-achievement-icon { font-size: 2rem; margin-right: 12px; }
    .v2-achievement-info { flex: 1; }
    .v2-achievement-name { font-weight: 600; color: #e2e8f0; }
    .v2-achievement-desc { font-size: 0.875rem; color: #64748b; }
    .v2-achievement-unlocked { color: #22c55e; font-size: 0.875rem; }
    .v2-search-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: flex-start; justify-content: center; padding-top: 100px; z-index: 1000; }
    .v2-search-panel { background: #1e293b; border-radius: 12px; padding: 20px; width: 90%; max-width: 600px; }
    .v2-search-header { display: flex; gap: 12px; margin-bottom: 16px; }
    .v2-search-input { flex: 1; padding: 12px; border: 1px solid #334155; border-radius: 6px; background: #0f172a; color: #e2e8f0; font-size: 1rem; }
    .v2-search-close { background: #334155; border: none; color: #e2e8f0; padding: 12px 16px; border-radius: 6px; cursor: pointer; }
    .v2-search-results { max-height: 400px; overflow-y: auto; }
    .v2-search-item { padding: 12px; border-radius: 6px; margin-bottom: 8px; background: #0f172a; cursor: pointer; }
    .v2-search-item:hover, .v2-search-item.active { background: #334155; }
    .v2-search-item-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .v2-search-item-name { font-weight: 600; color: #60a5fa; }
    .v2-search-item-time { color: #64748b; font-size: 0.875rem; }
    .v2-search-item-text { color: #e2e8f0; font-size: 0.9rem; }
    .v2-search-empty { text-align: center; color: #64748b; padding: 20px; }
    mark { background: #fbbf24; color: #0f172a; padding: 2px 4px; border-radius: 2px; }
    .v2-dm-panel { position: absolute; right: 0; top: 0; bottom: 0; width: 300px; background: #1e293b; border-left: 1px solid #334155; display: flex; flex-direction: column; }
    .v2-dm-header { padding: 16px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
    .v2-dm-close { background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; }
    .v2-dm-messages { flex: 1; overflow-y: auto; padding: 16px; }
    .v2-dm-msg { margin-bottom: 12px; }
    .v2-dm-msg.self { text-align: right; }
    .v2-dm-msg.other { text-align: left; }
    .v2-dm-name { font-size: 0.75rem; color: #64748b; margin-bottom: 2px; }
    .v2-dm-text { display: inline-block; padding: 8px 12px; border-radius: 8px; background: #334155; color: #e2e8f0; max-width: 80%; }
    .v2-dm-msg.self .v2-dm-text { background: #3b82f6; color: white; }
    .v2-dm-time { font-size: 0.7rem; color: #64748b; margin-top: 4px; }
    .v2-dm-system { text-align: center; color: #64748b; font-size: 0.875rem; padding: 20px; }
    .v2-dm-input-area { padding: 16px; border-top: 1px solid #334155; display: flex; flex-direction: column; gap: 8px; }
    .v2-dm-input { width: 100%; padding: 12px; border: 1px solid #334155; border-radius: 6px; background: #0f172a; color: #e2e8f0; resize: none; }
    .v2-dm-send { padding: 10px; border: none; border-radius: 6px; background: #3b82f6; color: white; cursor: pointer; }
    .v2-dm-send:hover { background: #2563eb; }
    .v2-toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 2000; display: flex; flex-direction: column; gap: 8px; }
    .v2-toast { padding: 12px 20px; border-radius: 8px; color: white; font-size: 0.9rem; animation: slideIn 0.3s ease; }
    .v2-toast-success { background: #22c55e; }
    .v2-toast-error { background: #ef4444; }
    .v2-toast-warning { background: #f59e0b; }
    .v2-toast-info { background: #3b82f6; }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    .v2-toast-hide { animation: slideOut 0.3s ease forwards; }
    .v2-highlight-badge { background: #fbbf24; color: #0f172a; font-size: 0.7rem; padding: 2px 4px; border-radius: 3px; margin-left: 4px; }
  </style>
</head>
<body>
  <div id="v2-app"></div>
  <script type="module">
    import { initV2App } from '/static/app.js';
    import { openSettings } from '/static/modules/settings.override.js';
    import { toggleSearch } from '/static/modules/search.override.js';
    import { toggleEmojiPanel } from '/static/modules/emoji-panel.override.js';
    import { openRoomInfo } from '/static/modules/roominfo.override.js';
    import { renderAchievementsPanel } from '/static/modules/achievements.override.js';
    import { initKeyboardShortcuts } from '/static/modules/keyboard.override.js';
    window.__v2_openSettings = openSettings;
    window.__v2_toggleSearch = toggleSearch;
    window.__v2_toggleEmoji = toggleEmojiPanel;
    window.__v2_openRoomInfo = openRoomInfo;
    window.__v2_renderAchievements = renderAchievementsPanel;
    window.__v2_initKeyboardShortcuts = initKeyboardShortcuts;
    initV2App();
  </script>
</body>
</html>`;

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
  "client/views/chat-shell.js": V2_CHAT_SHELL,
  "client/views/v2-chat.js": V2_V2_CHAT,
  "client/views/auto-discover.js": V2_AUTO_DISCOVER,
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
