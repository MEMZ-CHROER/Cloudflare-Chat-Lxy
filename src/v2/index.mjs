// v2 worker entry — re-exports core DO classes so wrangler recognizes them
export { ChatRoom } from "../core/chatroom.mjs";
export { RoomRegistry } from "../core/registry.mjs";
export { VersionArchive } from "../core/archive.mjs";
export { FileBucket } from "../core/filebucket.mjs";

// v2 overrides (thin wrappers that import core + add v2 behavior)
export * from "./chatroom.override.mjs";
export * from "./utils.override.mjs";

/**
 * v2 Worker fetch handler.
 * Root path serves v2 chat UI directly.
 * API routes forward to DO instances.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Root path — serve v2 chat UI
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudChat v2</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; }
    #v2-app { display: flex; flex-direction: column; height: 100vh; max-width: 800px; margin: 0 auto; }
    #v2-header { padding: 16px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
    #v2-header h1 { font-size: 1.25rem; }
    #v2-status { font-size: 0.875rem; padding: 4px 12px; border-radius: 9999px; background: #334155; }
    #v2-messages { flex: 1; overflow-y: auto; padding: 16px; }
    .v2-msg { padding: 8px 12px; margin-bottom: 8px; background: #1e293b; border-radius: 8px; word-wrap: break-word; }
    #v2-input-area { padding: 16px; background: #1e293b; border-top: 1px solid #334155; display: flex; gap: 8px; }
    #v2-msg-input { flex: 1; padding: 12px; border: 1px solid #334155; border-radius: 8px; background: #0f172a; color: #e2e8f0; font-size: 1rem; }
    #v2-msg-input:focus { outline: none; border-color: #3b82f6; }
    #v2-send-btn { padding: 12px 24px; border: none; border-radius: 8px; background: #3b82f6; color: white; font-size: 1rem; cursor: pointer; }
    #v2-send-btn:hover { background: #2563eb; }
    .v2-placeholder { text-align: center; padding: 40px; color: #64748b; }
  </style>
</head>
<body>
  <div id="v2-app">
    <div id="v2-header">
      <h1>CloudChat v2</h1>
      <span id="v2-status">initializing...</span>
    </div>
    <div id="v2-messages">
      <div class="v2-placeholder">v2 chat interface loading...</div>
    </div>
    <div id="v2-input-area">
      <input id="v2-msg-input" placeholder="Type a message..." maxlength="5000" />
      <button id="v2-send-btn">Send</button>
    </div>
  </div>
  <script type="module">
    import { initV2Client } from '/static/app.js';
    import { renderChatShell } from '/static/chat-shell.js';
    const app = document.getElementById('v2-app');
    renderChatShell(app);
    initV2Client();
  </script>
</body>
</html>`;
      return new Response(HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // v2 static assets
    if (url.pathname.startsWith("/static/")) {
      const filePath = url.pathname.replace("/static/", "");
      try {
        const mod = await import(`./client/${filePath}`);
        const content = mod.default || mod;
        const ext = filePath.split(".").pop();
        const contentType = {
          "js": "application/javascript; charset=utf-8",
          "css": "text/css; charset=utf-8",
        }[ext] || "application/octet-stream";
        return new Response(content, { headers: { "Content-Type": contentType } });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    // For API and other routes, route to DO instances
    // Phase 4 will implement full API routing
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({
        error: "v2 API not yet implemented",
        hint: "Phase 4 will add full API routing through DO instances"
      }), {
        status: 501,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return new Response("CloudChat v2 — Phase 1-3 skeleton", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
