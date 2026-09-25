/**
 * v2 HTTP handler — routes /v2/* paths to v2 client assets.
 * All other paths fall through to core handler.
 */
import { handleHttp as coreHandleHttp } from "../core/chatroom/http.mjs";

/**
 * @param {any} room - ChatRoom instance
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleHttp(room, request) {
  const url = new URL(request.url);

  // v2 client entry point
  if (url.pathname === "/v2" || url.pathname === "/v2/") {
    const HTML = await readFile("./v2/client/views/v2-chat.js");
    return new Response(HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // v2 static assets (served inline for now, will move to archive later)
  if (url.pathname.startsWith("/v2/static/")) {
    const filePath = url.pathname.replace("/v2/static/", "./v2/client/");
    try {
      const content = await readFile(filePath);
      const ext = filePath.split(".").pop();
      const contentType = {
        "js": "application/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "html": "text/html; charset=utf-8",
      }[ext] || "application/octet-stream";
      return new Response(content, { headers: { "Content-Type": contentType } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  // Fall through to core handler for all other routes
  return coreHandleHttp(room, request);
}

/**
 * Read a file from the worker's module context.
 * For HTML files, return as plain string (no ES module export).
 * @param {string} path
 * @returns {Promise<string>}
 */
async function readFile(path) {
  // HTML files are imported as raw text, not ES modules
  if (path.endsWith(".html")) {
    const mod = await import(path.startsWith(".") ? path : `./${path}`);
    return mod.default || mod;
  }
  // JS/CSS files are ES modules
  const mod = await import(path.startsWith(".") ? path : `./${path}`);
  return mod.default || mod;
}
