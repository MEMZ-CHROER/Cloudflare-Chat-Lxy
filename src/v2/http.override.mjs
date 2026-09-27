// v2 HTTP override — extends core handleHttp with v2-specific routes and v2 envelope wrapping
import { handleHttp as coreHandleHttp } from "../core/chatroom/http.mjs";
import { v2Envelope } from "./utils.override.mjs";

/**
 * v2-specific HTTP routes not in core.
 * Returns null to fall through to core handler.
 */
export async function handleV2Http(room, request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // /api/v2/stats — v2-only analytics (aggregated from shared storage)
  if (path === "/api/v2/stats") {
    const totalMsgs = await room.storage.list({ limit: 1 }).then(r => r.size || 0);
    return new Response(JSON.stringify({
      version: "v2",
      room: room.roomName,
      sessions: room.sessions.size,
      msgCount: totalMsgs,
      uptime: process.uptime?.() || 0,
    }), { headers: { "Content-Type": "application/json" } });
  }

  // /api/v2/active — list active rooms across all DO instances (via registry)
  if (path === "/api/v2/active") {
    if (!room.env.registry) return new Response("Registry not available", { status: 503 });
    try {
      const registryId = room.env.registry.idFromName("global");
      const stub = room.env.registry.get(registryId);
      const res = await stub.fetch("https://dummy-url/list", { method: "GET" });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    } catch {
      return new Response("[]", { headers: { "Content-Type": "application/json" } });
    }
  }

  // /api/v2/presence — real-time presence info
  if (path === "/api/v2/presence") {
    const users = [...room.sessions.values()]
      .filter(s => s.name)
      .map(s => ({
        name: s.name,
        channel: s.channel || "general",
        ip: s.ip || "",
        vip: s.vip || false,
        level: s.level || 1,
      }));
    return new Response(JSON.stringify({ room: room.roomName, users, count: users.length }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return null; // fall through to core
}

/**
 * Wrapper: calls v2 routes first, then core handler.
 */
export async function handleHttp(room, request) {
  const result = await handleV2Http(room, request);
  if (result !== null) return result;
  return coreHandleHttp(room, request);
}
