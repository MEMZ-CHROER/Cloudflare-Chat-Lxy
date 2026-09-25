/**
 * v2 WebSocket manager — handles v2 envelope protocol + legacy v1 messages
 */
import { state, set, subscribe, patch } from "./store.js";

let ws = null;
let msgSubscription = null;
let connSubscription = null;

export function connectWebSocket(roomName, password) {
  if (ws) {
    ws.close();
    ws = null;
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  let wsUrl = `${protocol}//${location.host}/api/room/${encodeURIComponent(roomName)}/websocket`;
  if (password) wsUrl += `?password=${encodeURIComponent(password)}`;
  console.log(`[v2] connecting to ${wsUrl}`);

  ws = new WebSocket(wsUrl);
  set("ws", ws);

  ws.onopen = () => {
    console.log("[v2] WS connected");
    patch({ connected: true });
    // Send join with auth token (same format as v1)
    const token = localStorage.getItem("chat_token") || "";
    ws.send(JSON.stringify({ name: state.user?.name || "Guest", token }));
  };

  ws.onmessage = (event) => {
    const data = event.data;
    try {
      const msg = JSON.parse(data);
      // v2 envelope: { v: "v2", t: type, d: data }
      if (msg.v === "v2") {
        handleV2Message(msg.t, msg.d);
      } else {
        // Legacy v1 format — forward to v1 handler for compatibility
        handleLegacyMessage(msg);
      }
    } catch {
      console.log("[v2] raw message:", data);
    }
  };

  ws.onerror = (error) => {
    console.error("[v2] WS error:", error);
    patch({ connected: false });
  };

  ws.onclose = () => {
    console.log("[v2] WS closed");
    patch({ connected: false });
    set("ws", null);
  };
}

/**
 * Handle v2 envelope messages
 */
function handleV2Message(type, data) {
  switch (type) {
    case "msg":
      patch({ messages: [...state.messages, data] });
      break;
    case "join":
    case "quit":
      console.log("[v2] user", type, ":", data.name || data.quit);
      break;
    case "user-list":
      patch({ onlineUsers: data.users });
      break;
    case "system":
      console.log("[v2] system:", data.content);
      break;
    case "channels":
      console.log("[v2] channels:", data.channels);
      break;
    case "pinned":
      console.log("[v2] pinned:", data.pinned);
      break;
    case "level-styles":
      console.log("[v2] level-styles:", data.styles);
      break;
    case "destroyed":
      console.log("[v2] room destroyed");
      break;
    default:
      console.log("[v2] v2-msg", type, data);
  }
}

/**
 * Handle legacy v1 messages (raw format without envelope)
 */
function handleLegacyMessage(msg) {
  switch (msg.type) {
    case "msg":
      patch({ messages: [...state.messages, msg] });
      break;
    case "join":
      console.log("[v2] join:", msg.name);
      break;
    case "quit":
      console.log("[v2] quit:", msg.quit || msg.name);
      break;
    case "user-list":
      patch({ onlineUsers: msg.users });
      break;
    case "system":
      console.log("[v2] system:", msg.system || msg.content);
      break;
    case "channels":
      console.log("[v2] channels:", msg.channels);
      break;
    case "pinned":
      console.log("[v2] pinned:", msg.pinned);
      break;
    case "destroyed":
      console.log("[v2] room destroyed");
      break;
    default:
      console.log("[v2] legacy-msg", msg.type, msg);
  }
}

export function sendMessage(content) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error("[v2] WS not connected");
    return false;
  }
  // Send as v2 envelope
  ws.send(JSON.stringify({ v: "v2", t: "msg", d: { type: "msg", content } }));
  return true;
}

export function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
    patch({ connected: false });
    set("ws", null);
  }
}
