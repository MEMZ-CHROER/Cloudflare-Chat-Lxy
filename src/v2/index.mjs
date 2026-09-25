// v2 worker entry — re-exports core DO classes so wrangler recognizes them
export { ChatRoom } from "../core/chatroom.mjs";
export { RoomRegistry } from "../core/registry.mjs";
export { VersionArchive } from "../core/archive.mjs";
export { FileBucket } from "../core/filebucket.mjs";

// v2 overrides
export * from "./chatroom.override.mjs";
export * from "./utils.override.mjs";

// Import v2 client assets
import V2_HTML from "./client/views/v2-chat.js";
import V2_APP from "./client/app.js";
import V2_STORE from "./client/store.js";
import V2_WS from "./client/ws.js";
import V2_AUTH from "./client/auth.js";
import V2_ROOM from "./client/room.js";
import V2_CHAT from "./client/chat.js";

/**
 * v2 Worker fetch handler.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Root path — serve v2 chat UI
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(V2_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // v2 static assets map
    const assets = {
      "/static/app.js": V2_APP,
      "/static/store.js": V2_STORE,
      "/static/ws.js": V2_WS,
      "/static/auth.js": V2_AUTH,
      "/static/room.js": V2_ROOM,
      "/static/chat.js": V2_CHAT,
    };

    if (assets[url.pathname]) {
      return new Response(assets[url.pathname], {
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      });
    }

    // API routes — forward to core handler
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "v2 API routing in progress" }), {
        status: 501,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return new Response("CloudChat v2", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
