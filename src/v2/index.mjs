// v2 worker entry — re-exports core DO classes so wrangler recognizes them
export { ChatRoom } from "../core/chatroom.mjs";
export { RoomRegistry } from "../core/registry.mjs";
export { VersionArchive } from "../core/archive.mjs";
export { FileBucket } from "../core/filebucket.mjs";

// v2 overrides (thin wrappers that import core + add v2 behavior)
export * from "./chatroom.override.mjs";
export * from "./utils.override.mjs";

// v2 HTTP handler with fetch router
import { handleHttp as v2HandleHttp } from "./http.mjs";

export default {
  async fetch(request, env, ctx) {
    // Create a minimal room-like object for v2 HTTP handler
    // In production, this would route to actual DO instances
    const url = new URL(request.url);

    // v2 client entry point
    if (url.pathname === "/v2" || url.pathname === "/v2/") {
      const HTML = "<!DOCTYPE html><html><body>v2 placeholder</body></html>";
      return new Response(HTML.default || HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // For now, return a placeholder — full routing comes in Phase 4
    return new Response("CloudChat v2 — placeholder (Phase 1-3 skeleton)", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
