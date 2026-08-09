import HTML from "./chat.html";
import ADMIN from "./admin.html";
import TASKS from "./tasks.html";
import CHANGELOG from "./changelog.html";
import BUGS from "./bugs.html";
import FAVICON_B64 from "./favicon-data.mjs";
import HELP from "./help.html";
import ABOUT from "./about.html";
import LEADERBOARD from "./leaderboard.html";
import USERPAGE from "./user.html";
import ROOMSPAGE from "./rooms.html";
import ONLINEPAGE from "./online.html";
import STATSPAGE from "./stats.html";
import REDEEM from "./redeem.html";
import CHAT_JS from "./chat.js";
import ADMIN_JS from "./admin.js";
import CHAT_MAIN from "./client/chat/main.js";
import CHAT_STATE from "./client/chat/state.js";
import CHAT_VIP from "./client/chat/vip.js";
import CHAT_ASCII from "./client/chat/ascii.js";
import CHAT_AUTH from "./client/chat/auth.js";
import CHAT_ROOMS from "./client/chat/rooms.js";
import CHAT_RENDERERS from "./client/chat/renderers.js";
import CHAT_UI from "./client/chat/ui.js";
import CHAT_SEARCH from "./client/chat/search.js";
import CHAT_MENU from "./client/chat/menu.js";
import CHAT_DM from "./client/chat/dm.js";
import CHAT_COMMANDS from "./client/chat/commands.js";
import CHAT_SHOP from "./client/chat/shop.js";
import CHAT_LOTTERY from "./client/chat/lottery.js";
import CHAT_TASKS from "./client/chat/tasks.js";
import CHAT_CORE from "./client/chat/core.js";
import CHAT_WEBSOCKET from "./client/chat/websocket.js";
import CHAT_BANNER from "./client/chat/banner.js";
import CHAT_FAVORITES from "./client/chat/favorites.js";
import CHAT_HIGHLIGHTS from "./client/chat/highlights.js";
import CHAT_ROOMINFO from "./client/chat/roominfo.js";
import CHAT_NOTE from "./client/chat/note.js";
import CHAT_KEYWORDS from "./client/chat/keywords.js";
import CHAT_GAMES from "./client/chat/games.js";
import CHAT_FILESPANEL from "./client/chat/filespanel.js";
import CHAT_SETTINGS from "./client/chat/settings.js";
import CHAT_MUSIC from "./client/chat/music.js";
import CHAT_GAME_CORE from "./client/chat/game-core.js";
import CHAT_GAME_SIMPLE from "./client/chat/game-simple.js";
import CHAT_GAME_CARDS from "./client/chat/game-cards.js";
import CHAT_GAME_BOARD from "./client/chat/game-board.js";
import CHAT_GAME_ACTION from "./client/chat/game-action.js";
import CHAT_GAME_ARCADE from "./client/chat/game-arcade.js";
import CHAT_CHANNELS from "./client/chat/channels.js";
import CHAT_ACHIEVEMENTS from "./client/chat/achievements.js";
import CHAT_ICCO from "./client/chat/icco.js";
import CHAT_ICCO_ASSETS from "./client/chat/icco-assets.js";
import CHAT_HACKNET from "./client/chat/hacknet.js";
import CHAT_HACKNET_GAME from "./client/chat/hacknet-game.js";
import CHAT_UPLOAD from "./client/chat/upload.js";
import CHAT_IMAGE_UPLOAD from "./client/chat/image-upload.js";
import CHAT_VOICE_RECORD from "./client/chat/voice-record.js";
import CHAT_FILE_UPLOAD from "./client/chat/file-upload.js";
import CHAT_MENTION from "./client/chat/mention.js";
import CHAT_EMOJI_PANEL from "./client/chat/emoji-panel.js";
import CHAT_SEASON from "./client/chat/season.js";
import CHAT_MARKET from "./client/chat/market.js";
import CHAT_RELATION from "./client/chat/relation.js";
import CHAT_STYLE from "./client/chat/style.css";
import CHAT_GAME_STYLE from "./client/chat/game-style.css";
import ALL_STYLES from "./client/styles/all-styles.css";
import ACRYLIC_THEME from "./client/styles/acrylic-theme.css";
import THEME_SWITCH_JS from "./client/theme-switch.js";
import ADMIN_MAIN from "./client/admin/main.js";
import ADMIN_STATE from "./client/admin/state.js";
import ADMIN_UTILS from "./client/admin/utils.js";
import ADMIN_AUTH from "./client/admin/auth.js";
import ADMIN_ROOMS from "./client/admin/rooms.js";
import ADMIN_USERS from "./client/admin/users.js";
import ADMIN_HISTORY from "./client/admin/history.js";
import ADMIN_TAGS from "./client/admin/tags.js";
import ADMIN_POINTS from "./client/admin/points.js";
import ADMIN_EXP from "./client/admin/exp.js";
import ADMIN_LEVELSTYLE from "./client/admin/levelstyle.js";
import ADMIN_SHOP from "./client/admin/shop.js";
import ADMIN_TASKS from "./client/admin/tasks.js";
import ADMIN_LOTTERY from "./client/admin/lottery.js";
import ADMIN_KEY from "./client/admin/key.js";
import ADMIN_ROUTING from "./client/admin/routing.js";
import ADMIN_DASHBOARD from "./client/admin/dashboard.js";
import ADMIN_IPGROUP from "./client/admin/ipgroup.js";
import ADMIN_MESSAGES from "./client/admin/messages.js";
import ADMIN_BOT from "./client/admin/bot.js";
import ADMIN_SENDMESSAGE from "./client/admin/sendmessage.js";
import ADMIN_USERMODAL from "./client/admin/usermodal.js";
import ADMIN_REDEEM from "./client/admin/redeem.js";
import ADMIN_KICKPROTECT from "./client/admin/kickprotect.js";
import ADMIN_LOG from "./client/admin/log.js";
import ADMIN_WEBHOOKS from "./client/admin/webhooks.js";
import ADMIN_SEASON from "./client/admin/season.js";
import ADMIN_HONOR from "./client/admin/honor.js";
import ADMIN_MARKET from "./client/admin/market.js";

// i18n 已内联进 state.js；此 re-export 兼容仍引用 ./i18n.js 的旧前端缓存，避免登录模块加载失败
const CHAT_I18N = 'export { t, getLang, setLang, applyI18n, LANG_KEY } from "./state.js";';
const CHAT_MODULES = {
  "chat/main.js": CHAT_MAIN,
  "chat/state.js": CHAT_STATE,
  "chat/i18n.js": CHAT_I18N,
  "chat/vip.js": CHAT_VIP,
  "chat/ascii.js": CHAT_ASCII,
  "chat/auth.js": CHAT_AUTH,
  "chat/rooms.js": CHAT_ROOMS,
  "chat/renderers.js": CHAT_RENDERERS,
  "chat/ui.js": CHAT_UI,
  "chat/search.js": CHAT_SEARCH,
  "chat/menu.js": CHAT_MENU,
  "chat/dm.js": CHAT_DM,
  "chat/commands.js": CHAT_COMMANDS,
  "chat/shop.js": CHAT_SHOP,
  "chat/lottery.js": CHAT_LOTTERY,
  "chat/tasks.js": CHAT_TASKS,
  "chat/core.js": CHAT_CORE,
  "chat/websocket.js": CHAT_WEBSOCKET,
  "chat/banner.js": CHAT_BANNER,
  "chat/favorites.js": CHAT_FAVORITES,
  "chat/highlights.js": CHAT_HIGHLIGHTS,
  "chat/roominfo.js": CHAT_ROOMINFO,
  "chat/note.js": CHAT_NOTE,
  "chat/keywords.js": CHAT_KEYWORDS,
  "chat/filespanel.js": CHAT_FILESPANEL,
  "chat/games.js": CHAT_GAMES,
  "chat/settings.js": CHAT_SETTINGS,
  "chat/music.js": CHAT_MUSIC,
  "chat/game-core.js": CHAT_GAME_CORE,
  "chat/game-simple.js": CHAT_GAME_SIMPLE,
  "chat/game-cards.js": CHAT_GAME_CARDS,
  "chat/game-board.js": CHAT_GAME_BOARD,
  "chat/game-action.js": CHAT_GAME_ACTION,
  "chat/game-arcade.js": CHAT_GAME_ARCADE,
  "chat/channels.js": CHAT_CHANNELS,
  "chat/achievements.js": CHAT_ACHIEVEMENTS,
  "chat/icco.js": CHAT_ICCO,
  "chat/icco-assets.js": CHAT_ICCO_ASSETS,
  "chat/hacknet.js": CHAT_HACKNET,
  "chat/hacknet-game.js": CHAT_HACKNET_GAME,
  "chat/upload.js": CHAT_UPLOAD,
  "chat/image-upload.js": CHAT_IMAGE_UPLOAD,
  "chat/voice-record.js": CHAT_VOICE_RECORD,
  "chat/file-upload.js": CHAT_FILE_UPLOAD,
  "chat/mention.js": CHAT_MENTION,
  "chat/emoji-panel.js": CHAT_EMOJI_PANEL,
  "chat/season.js": CHAT_SEASON,
  "chat/market.js": CHAT_MARKET,
  "chat/relation.js": CHAT_RELATION,
};

const ADMIN_MODULES = {
  "admin/main.js": ADMIN_MAIN,
  "admin/state.js": ADMIN_STATE,
  "admin/utils.js": ADMIN_UTILS,
  "admin/auth.js": ADMIN_AUTH,
  "admin/rooms.js": ADMIN_ROOMS,
  "admin/users.js": ADMIN_USERS,
  "admin/history.js": ADMIN_HISTORY,
  "admin/tags.js": ADMIN_TAGS,
  "admin/points.js": ADMIN_POINTS,
  "admin/exp.js": ADMIN_EXP,
  "admin/levelstyle.js": ADMIN_LEVELSTYLE,
  "admin/shop.js": ADMIN_SHOP,
  "admin/tasks.js": ADMIN_TASKS,
  "admin/lottery.js": ADMIN_LOTTERY,
  "admin/key.js": ADMIN_KEY,
  "admin/routing.js": ADMIN_ROUTING,
  "admin/dashboard.js": ADMIN_DASHBOARD,
  "admin/ipgroup.js": ADMIN_IPGROUP,
  "admin/messages.js": ADMIN_MESSAGES,
  "admin/bot.js": ADMIN_BOT,
  "admin/sendmessage.js": ADMIN_SENDMESSAGE,
  "admin/usermodal.js": ADMIN_USERMODAL,
  "admin/redeem.js": ADMIN_REDEEM,
  "admin/kickprotect.js": ADMIN_KICKPROTECT,
  "admin/log.js": ADMIN_LOG,
  "admin/webhooks.js": ADMIN_WEBHOOKS,
  "admin/season.js": ADMIN_SEASON,
  "admin/honor.js": ADMIN_HONOR,
  "admin/market.js": ADMIN_MARKET,
};

import { handleErrors } from "./utils.mjs";
import { handleAuth } from "./api/auth.mjs";
import { handleRooms } from "./api/rooms.mjs";
import { handleLottery } from "./api/lottery.mjs";
import { handlePoints } from "./api/points.mjs";
import { handleShop } from "./api/shop.mjs";
import { handleTasks } from "./api/tasks.mjs";
import { handleRecall } from "./api/recall.mjs";
import { handleAdmin } from "./api/admin.mjs";
import { handlePreview } from "./api/preview.mjs";
import { handleArchive } from "./api/archive.mjs";
import { handleRedeemApi } from "./api/redeem.mjs";
import { handleGame } from "./api/game.mjs";
import { handleHacknetApi } from "./api/hacknet.mjs";
import { handleSeasonApi } from "./api/season.mjs";
import { handleHonorApi } from "./api/honor.mjs";
import { handleMarket } from "./api/market.mjs";
import { handleOauthApi } from "./api/oauth.mjs";
import { handleRelation } from "./api/relation.mjs";
import ARCHIVE from "./archive.html";

// Re-export Durable Object 类供 wrangler 识别
export { ChatRoom } from "./chatroom.mjs";
export { RoomRegistry } from "./registry.mjs";
export { VersionArchive } from "./archive.mjs";
export { FileBucket } from "./filebucket.mjs";

/**
 * @typedef {Object} Env
 * @property {DurableObjectNamespace} rooms
 * @property {string} ADMIN_SECRET_KEY
 * @property {DurableObjectNamespace} registry
 */

// 通用安全响应头包装器
function secureResponse(body, init) {
  let headers = new Headers(init?.headers);
  if (!headers.has("X-Content-Type-Options")) headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("Referrer-Policy")) headers.set("Referrer-Policy", "same-origin");
  // HTML页面额外安全头
  let ct = headers.get("Content-Type") || "";
  if (ct.includes("text/html")) {
    if (!headers.has("X-Frame-Options")) headers.set("X-Frame-Options", "DENY");
  }
  return new Response(body, { ...init, headers });
}

export default {
  async fetch(request, env) {
    return await handleErrors(request, async () => {
      let url = new URL(request.url);
      let path = url.pathname.slice(1).split('/');

      // IP 封禁检查
      if (path[0] !== "admin" && path[0] !== "tasks" && path[0] !== "help" && path[0] !== "about" && path[0] !== "leaderboard" && path[0] !== "user" && path[0] !== "rooms" && path[0] !== "online" && path[0] !== "stats" && path[0] !== "redeem" && !(path[0] === "api" && path[1] === "admin")) {
        let clientIp = request.headers.get("CF-Connecting-IP") || "";
        if (clientIp) {
          try {
            let registryId = env.registry.idFromName("global");
            let stub = env.registry.get(registryId);
            let ipCheck = await stub.fetch("https://dummy-url/is-ip-banned?ip=" + encodeURIComponent(clientIp));
            let ipResult = await ipCheck.json();
            if (ipResult.banned) {
              return new Response("你的IP已被封禁，无法访问。", { status: 403 });
            }
          } catch (e) {
            console.error("IP封禁检查失败:", e);
          }
        }
      }

      // 静态 JS 文件
      if (path[0] === "static") {
        let modPath = path.slice(1).join("/");
        let mod = CHAT_MODULES[modPath];
        if (!mod) mod = ADMIN_MODULES[modPath];
        if (mod) {
          return new Response(mod, {headers: {"Content-Type": "text/javascript;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate"}});
        }
        if (modPath === "chat.js") {
          return new Response(CHAT_JS, {headers: {"Content-Type": "text/javascript;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Content-Type-Options": "nosniff"}});
        }
        if (modPath === "admin.js") {
          return new Response(ADMIN_JS, {headers: {"Content-Type": "text/javascript;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Content-Type-Options": "nosniff"}});
        }
        if (modPath === "chat/style.css") {
          return new Response(CHAT_STYLE, {headers: {"Content-Type": "text/css;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate"}});
        }
        if (modPath === "chat/game-style.css") {
          return new Response(CHAT_GAME_STYLE, {headers: {"Content-Type": "text/css;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate"}});
        }
        if (modPath === "styles/all-styles.css") {
          return new Response(ALL_STYLES, {headers: {"Content-Type": "text/css;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate"}});
        }
        if (modPath === "styles/acrylic-theme.css") {
          return new Response(ACRYLIC_THEME, {headers: {"Content-Type": "text/css;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate"}});
        }
        if (modPath === "theme-switch.js") {
          return new Response(THEME_SWITCH_JS, {headers: {"Content-Type": "application/javascript;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate"}});
        }
      }

      if (!path[0]) {
        return new Response(HTML, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});
      }

      if (path[0] === "manifest.json") {
        return new Response(JSON.stringify({
          name: "Cloud Chat",
          short_name: "CloudChat",
          description: "Cloudflare Workers 聊天室",
          start_url: "/",
          display: "standalone",
          background_color: "#f0f2f5",
          theme_color: "#4a6cf7",
          icons: [
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
          ]
        }), {headers: {"Content-Type": "application/json"}});
      }

      if (path[0] === "icon.svg") {
        return new Response(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <rect width="512" height="512" rx="64" fill="#4a6cf7"/>
            <text x="256" y="340" font-size="280" font-weight="bold" fill="white" text-anchor="middle" font-family="sans-serif">C</text>
          </svg>`,
          {headers: {"Content-Type": "image/svg+xml", "Cache-Control": "no-cache, must-revalidate"}}
        );
      }

      if (path[0] === "favicon.ico") {
        // 聊天室图标（32x32 ICO，base64 由 favicon-data.mjs 内嵌）：替代原 204 空响应
        let bytes = Uint8Array.from(atob(FAVICON_B64), c => c.charCodeAt(0));
        return new Response(bytes, {headers: {"Content-Type": "image/x-icon", "Cache-Control": "no-cache, must-revalidate"}});
      }

      if (path[0] === "sw.js") {
        return new Response(
          `const CACHE="cloudchat-v7";
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(["/","/admin/"])));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(m=>m||new Response("网络不可用",{status:503,headers:{"Content-Type":"text/plain"}}))));});`,
          {headers: {"Content-Type": "application/javascript", "Cache-Control": "no-cache"}}
        );
      }

      // 页面路由
      switch (path[0]) {
        case "api":
          return handleApi(path.slice(1), request, env);

        case "admin":
          return new Response(ADMIN, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "tasks":
          return new Response(TASKS, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "changelog":
          return new Response(CHANGELOG, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "bugs":
          return new Response(BUGS, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "help":
          return new Response(HELP, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "about":
          return new Response(ABOUT, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "leaderboard":
          return new Response(LEADERBOARD, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "user":
          return new Response(USERPAGE, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "rooms":
          return new Response(ROOMSPAGE, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "online":
          return new Response(ONLINEPAGE, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "stats":
          return new Response(STATSPAGE, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "archive":
          return new Response(ARCHIVE, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        case "redeem":
          return new Response(REDEEM, {headers: {"Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-cache, must-revalidate", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"}});

        default:
          return new Response("未找到", {status: 404});
      }
    });
  }
}

// ============ API 路由分发 ============

// 🔗 通用 Webhook 入站限频（内存级缓解，多实例不共享，防单实例刷屏）
const webhookRate = new Map();

async function handleApi(apiPath, request, env) {
  switch (apiPath[0]) {
    case "rooms":
    case "room":
      return handleRooms(apiPath, request, env);

    case "lottery":
      return handleLottery(apiPath, request, env);

    case "points":
      return handlePoints(apiPath, request, env);

    case "checkin": {
      let rid = env.registry.idFromName("global");
      let stub = env.registry.get(rid);
      if (request.method === "POST") {
        let body = await request.json();
        let name = body.name || "";
        let token = body.token || "";
        // 验证 token，防止冒名签到
        let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token)));
        let authData = await authCheck.json();
        if (!authData.authenticated) {
          return new Response(JSON.stringify({error: "请先登录"}), {status: 403, headers: {"Content-Type": "application/json"}});
        }
        // 🔒 安全修复（E4）：携带来源 IP 供签到按 IP 限频
        let ip = request.headers.get("CF-Connecting-IP") || "";
        let r = await stub.fetch("https://dummy-url/points/checkin?name=" + encodeURIComponent(name) + "&ip=" + encodeURIComponent(ip));
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      }
      return new Response("未找到", {status: 404});
    }

    case "shop":
      return handleShop(apiPath, request, env);

    case "tasks":
      return handleTasks(apiPath, request, env);

    case "register":
    case "login":
    case "logout":
    case "check-auth":
      return handleAuth(apiPath, request, env);

    case "recall":
      return handleRecall(apiPath, request, env);

    case "admin":
      return handleAdmin(apiPath, request, env);

    case "preview":
      return handlePreview(apiPath, request, env);

    case "archive":
      return handleArchive(apiPath, request, env);

    case "redeem":
      return handleRedeemApi(apiPath, request, env);

    case "game":
      return handleGame(apiPath, request, env);

    case "hn":
      return handleHacknetApi(apiPath, request, env);

    case "season":
      return handleSeasonApi(apiPath, request, env);

    case "honor":
      return handleHonorApi(apiPath, request, env);

    case "market":
      return handleMarket(apiPath, request, env);

    case "oauth":
      return handleOauthApi(apiPath, request, env);

    case "rel":
      return handleRelation(apiPath, request, env);

    // 🔗 通用 Webhook 入站：POST /api/webhook/<room>?secret=xxx&channel=xxx
    // body: {content, sender?, channel?}；secret 也可放 X-Webhook-Secret header
    case "webhook": {
      let url = new URL(request.url);
      let roomName = apiPath[1];
      if (!roomName) return new Response(JSON.stringify({error: "缺少房间名"}), {status: 400, headers: {"Content-Type": "application/json"}});
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405, headers: {"Content-Type": "application/json"}});
      let rid = env.registry.idFromName("global");
      let stub = env.registry.get(rid);
      // 🔒 安全修复（F1）：优先从请求头取 secret，query 仅作兼容降级（前端已不再拼接 ?secret= URL）
      let secret = request.headers.get("X-Webhook-Secret") || url.searchParams.get("secret") || "";
      // 校验房间 webhook secret（常量时间比较在 registry 层）
      let verify = await stub.fetch(new URL("https://dummy-url/room/webhook-verify"), {
        method: "POST",
        body: JSON.stringify({room: roomName, secret}),
        headers: {"Content-Type": "application/json"}
      });
      let vd;
      try { vd = await verify.json(); } catch (e) { vd = {}; }
      if (!vd.ok) return new Response(JSON.stringify({error: vd.error || "Webhook校验失败"}), {status: 403, headers: {"Content-Type": "application/json"}});
      // 解析 body（🔒 F3：先解析成功再记限频，非法 body 直接返回、不写限频标记，防合法 secret+非法 body 阻塞该房间 5 秒）
      let body;
      try { body = await request.json(); } catch (e) {
        return new Response(JSON.stringify({error: "请求体不是合法JSON"}), {status: 400, headers: {"Content-Type": "application/json"}});
      }
      // 限频：每房间每 5 秒 1 条（标记在 body 成功解析后才设置）
      let now = Date.now();
      // 🔒 F3：惰性清理超过 60 秒的限频条目，防 webhookRate Map 无限增长
      for (let [k, t] of webhookRate) { if (now - t > 60000) webhookRate.delete(k); }
      if (now - (webhookRate.get(roomName) || 0) < 5000) {
        return new Response(JSON.stringify({error: "发送过于频繁，请5秒后再试"}), {status: 429, headers: {"Content-Type": "application/json"}});
      }
      webhookRate.set(roomName, now);
      let content = (body.content === undefined ? "" : String(body.content)).slice(0, 500);
      if (!content.trim()) return new Response(JSON.stringify({error: "缺少消息内容"}), {status: 400, headers: {"Content-Type": "application/json"}});
      let sender = (body.sender === undefined ? "Webhook" : String(body.sender)).slice(0, 30);
      let channel = (body.channel === undefined ? "" : String(body.channel)).slice(0, 24);
      // 转发到房间 DO（仿 admin send-message 链路）
      let roomId;
      if (roomName.match(/^[0-9a-f]{64}$/)) roomId = env.rooms.idFromString(roomName);
      else if (roomName.length <= 32) roomId = env.rooms.idFromName(roomName);
      else return new Response(JSON.stringify({error: "无效房间名"}), {status: 400, headers: {"Content-Type": "application/json"}});
      let roomStub = env.rooms.get(roomId);
      let doUrl = "https://dummy-url/broadcast-message?text=" + encodeURIComponent(content) + "&sender=" + encodeURIComponent(sender) + "&webhook=1";
      if (channel) doUrl += "&channel=" + encodeURIComponent(channel);
      let r = await roomStub.fetch(new URL(doUrl));
      return new Response(await r.text(), {status: r.status});
    }

    case "emoji": {
      let rid = env.registry.idFromName("global");
      let stub = env.registry.get(rid);
      if (apiPath[1] === "list") {
        let r = await stub.fetch("https://dummy-url/emoji/list");
        return new Response(await r.text(), {headers: {"Content-Type": "application/json"}});
      }
      return new Response("未找到", {status: 404});
    }

    case "mute-status": {
      let rid = env.registry.idFromName("global");
      let stub = env.registry.get(rid);
      let url = new URL(request.url);
      let name = url.searchParams.get("name") || "";
      let r = await stub.fetch("https://dummy-url/mute-status?name=" + encodeURIComponent(name));
      return new Response(await r.text(), {headers: {"Content-Type": "application/json"}});
    }

    case "translate": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      try {
        let body = await request.json();
        let text = (body.text || "").trim();
        if (!text) return new Response(JSON.stringify({error: "请提供要翻译的文本"}), {status: 400});
        // 🔒 安全修复（LD1）：要求登录（token 认证），堵死游客无认证刷付费 AI 翻译
        let name = body.name || "";
        let token = body.token || "";
        let rid = env.registry.idFromName("global");
        let stub = env.registry.get(rid);
        let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token)));
        let authData = await authCheck.json();
        if (!authData.authenticated) {
          return new Response(JSON.stringify({error: "请先登录后使用翻译"}), {status: 403, headers: {"Content-Type": "application/json"}});
        }
        // 🔒 安全修复（LD1）：目标语言白名单，防 target 参数注入系统提示
        const LANG_WHITELIST = ["中文","英语","English","日语","韩语","法语","德语","西班牙语","俄语","阿拉伯语","葡萄牙语","意大利语","泰语","越南语","en","zh","ja","ko","fr","de","es","ru","ar","pt","it","th","vi"];
        let targetLang = String(body.target || "中文");
        if (!LANG_WHITELIST.includes(targetLang)) targetLang = "中文";
        let resp = await fetch((env.AI_BASE_URL || "https://api.deepseek.com") + "/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + (env.AI_API_KEY || "")
          },
          body: JSON.stringify({
            model: env.AI_MODEL || "deepseek-chat",
            messages: [
              {role: "system", content: "你是一个翻译助手。请将以下消息翻译成" + targetLang + "。只返回翻译结果，不要解释。"},
              {role: "user", content: text}
            ],
            max_tokens: 1000
          })
        });
        // 🔒 安全修复（LD1）：错误脱敏，不向调用者回显上游 AI 服务错误体
        if (!resp.ok) throw new Error("翻译服务暂时不可用");
        let data = await resp.json();
        let translated = data.choices?.[0]?.message?.content || "翻译失败";
        return new Response(JSON.stringify({original: text, translated, target: targetLang}), {
          headers: {"Content-Type": "application/json"}
        });
      } catch (e) {
        return new Response(JSON.stringify({error: "翻译失败，请稍后再试"}), {status: 500, headers: {"Content-Type": "application/json"}});
      }
    }

    case "user": {
      let url = new URL(request.url); // 🔒 修复: handleApi 作用域无 url, 补定义防 ReferenceError → 用户主页500
      let rid = env.registry.idFromName("global");
      let stub = env.registry.get(rid);
      // v1.46 修改密码：转发 registry /user-password（body 透传 name/token/oldPassword/newPassword）
      if (apiPath[1] === "password" && request.method === "POST") {
        let body = await request.json();
        let r = await stub.fetch(new URL("https://dummy-url/user-password"), {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      }
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "no name"}), {status: 400});

      if (apiPath[1] === "profile") {
        let r = await stub.fetch(new URL("https://dummy-url/user-profile?name=" + encodeURIComponent(name)));
        return new Response(await r.text(), {headers: {"Content-Type": "application/json"}});
      }
      if (apiPath[1] === "achievements") {
        let token = url.searchParams.get("token") || "";
        let r = await stub.fetch(new URL("https://dummy-url/user/achievements?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token)));
        return new Response(await r.text(), {headers: {"Content-Type": "application/json"}});
      }
      if (apiPath[1] === "avatar" && request.method === "POST") {
        let body = await request.json();
        let token = body.token || "";
        // 验证 token
        let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token)));
        let authData = await authCheck.json();
        if (!authData.authenticated) {
          return new Response(JSON.stringify({error: "请先登录"}), {status: 403, headers: {"Content-Type": "application/json"}});
        }
        let r = await stub.fetch("https://dummy-url/user-avatar?name=" + encodeURIComponent(name), {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      }
      if (apiPath[1] === "bio" && request.method === "POST") {
        let body = await request.json();
        let token = body.token || "";
        // 验证 token
        let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token)));
        let authData = await authCheck.json();
        if (!authData.authenticated) {
          return new Response(JSON.stringify({error: "请先登录"}), {status: 403, headers: {"Content-Type": "application/json"}});
        }
        let r = await stub.fetch("https://dummy-url/user-bio?name=" + encodeURIComponent(name), {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      }
      return new Response("未找到", {status: 404});
    }

    default:
      return new Response("未找到", {status: 404});
  }
}
