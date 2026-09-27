// v2 override: chatroom — extends core ChatRoom, routes broadcasts to v2 clients
import { ChatRoom as CoreChatRoom } from "../core/chatroom.mjs";

/** v2-connected sessions: WeakMap<WebSocket, { room, send(raw })> */
const v2Sessions = new WeakMap();

export class ChatRoom extends CoreChatRoom {
  /**
   * Override broadcast: inject v2 envelope for v2 clients.
   * Core broadcast sends raw JSON; we wrap it as { v: "v2", t, d } for v2 subscribers.
   */
  broadcast(message) {
    const wrapped = typeof message === "string" ? message : JSON.stringify(message);
    let data;
    try { data = JSON.parse(wrapped); } catch { data = { type: "system", content: wrapped }; }

    const envelope = JSON.stringify({ v: "v2", t: data.type || "msg", d: data });

    // Forward to v2 WebSocket subscribers
    this.sessions.forEach((session, ws) => {
      const v2 = v2Sessions.get(ws);
      if (v2) {
        try { ws.send(envelope); } catch {}
      }
    });

    // Continue with core broadcast
    super.broadcast(message);
  }

  /**
   * Override broadcastToChannel: same envelope logic per-channel.
   */
  broadcastToChannel(channel, message) {
    const wrapped = typeof message === "string" ? message : JSON.stringify(message);
    let data;
    try { data = JSON.parse(wrapped); } catch { return; }

    const envelope = JSON.stringify({ v: "v2", t: data.type || "msg", d: data, channel });

    this.sessions.forEach((session, ws) => {
      const v2 = v2Sessions.get(ws);
      if (v2 && (v2.room === channel || channel === "general")) {
        try { ws.send(envelope); } catch {}
      }
    });

    super.broadcastToChannel(channel, message);
  }

  /**
   * Register a v2 WebSocket session. Called from v2 WS handler.
   */
  static registerV2Session(ws, room) {
    v2Sessions.set(ws, { room, ws });
  }

  /**
   * Unregister on close.
   */
  static unregisterV2Session(ws) {
    v2Sessions.delete(ws);
  }
}

/**
 * v2 WebSocket handler — intercepts raw WS frames, decodes v2 envelope,
 * and calls the core chatroom's webSocketMessage for command handling.
 */
export function handleV2WebSocket(room, request) {
  const pair = new AbortController();
  const [ws0, ws1] = typeof WebSocketPair !== "undefined"
    ? (new WebSocketPair())
    : [null, null];

  if (!ws1) return new Response("WebSocket not supported", { status: 501 });

  ws1.accept();

  const roomName = new URL(request.url).pathname.split("/").filter(Boolean)[1];
  ChatRoom.registerV2Session(ws1, roomName);

  ws1.onmessage = (event) => {
    const raw = event.data;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // v2 envelope: { v: "v2", t: type, d: data }
    if (msg.v === "v2") {
      // Forward the decoded payload to core webSocketMessage
      const coreMsg = JSON.stringify(msg.d);
      room.webSocketMessage(ws1, coreMsg);
      return;
    }

    // Legacy v1 format: pass through directly
    room.webSocketMessage(ws1, raw);
  };

  ws1.onclose = () => {
    ChatRoom.unregisterV2Session(ws1);
  };

  ws1.onerror = () => {
    ChatRoom.unregisterV2Session(ws1);
  };

  return new Response(null, { status: 101, webSocket: ws0 });
}
