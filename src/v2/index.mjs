// v2 worker entry — re-exports core DO classes so wrangler recognizes them
export { ChatRoom } from "../core/chatroom.mjs";
export { RoomRegistry } from "../core/registry.mjs";
export { VersionArchive } from "../core/archive.mjs";
export { FileBucket } from "../core/filebucket.mjs";

// v2 overrides (thin wrappers that import core + add v2 behavior)
export * from "./chatroom.override.mjs";
export * from "./utils.override.mjs";

// Import v2 client assets as strings
import V2_HTML from "./client/v2-chat.js";
import V2_APP from "./client/app.js";
import V2_SHELL from "./client/chat-shell.js";

/**
 * v2 Worker fetch handler.
 * Root path serves v2 chat UI directly.
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

    // v2 static assets
    if (url.pathname === "/static/app.js") {
      return new Response(V2_APP, {
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      });
    }
    if (url.pathname === "/static/chat-shell.js") {
      return new Response(V2_SHELL, {
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      });
    }

    // API routes — placeholder for Phase 4
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "v2 API not yet implemented" }), {
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
