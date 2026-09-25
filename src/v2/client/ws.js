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
  // Normal chat message
  if (msg.message || msg.content) {
    const chatMsg = {
      id: msg.timestamp || Date.now(),
      name: msg.name || "Anonymous",
      tag: msg.tag,
      tagColor: msg.tagColor,
      tagBorder: msg.tagBorder,
      content: msg.message || msg.content,
      timestamp: msg.timestamp || Date.now(),
      channel: msg.channel,
      type: msg.type || "msg",
    };
    patch({ messages: [...state.messages, chatMsg] });
    return;
  }

  // Join/quit
  if (msg.joined) {
    console.log("[v2] joined:", msg.joined);
    return;
  }
  if (msg.quit) {
    console.log("[v2] quit:", msg.quit);
    return;
  }

  // Ready
  if (msg.ready) {
    console.log("[v2] connected, ready");
    return;
  }

  // Channel info
  if (msg.type === "channels") {
    console.log("[v2] channels:", msg.channels);
    return;
  }
  if (msg.type === "pinned") {
    console.log("[v2] pinned:", msg.pinned);
    return;
  }
  if (msg.type === "destroyed") {
    console.log("[v2] room destroyed");
    return;
  }

  // Image
  if (msg.type === "image") {
    const chatMsg = {
      id: msg.timestamp || Date.now(),
      name: msg.name || "Anonymous",
      tag: msg.tag,
      tagColor: msg.tagColor,
      tagBorder: msg.tagBorder,
      content: `[图片] ${msg.url || msg.path}`,
      timestamp: msg.timestamp || Date.now(),
      channel: msg.channel,
      type: "image",
    };
    patch({ messages: [...state.messages, chatMsg] });
    return;
  }

  // GH card
  if (msg.type === "gh-card") {
    const chatMsg = {
      id: Date.now(),
      name: msg.name || "System",
      tag: msg.tag,
      tagColor: msg.tagColor,
      tagBorder: msg.tagBorder,
      content: `📦 [GitHub] ${msg.repo || msg.repoUrl || ''}`,
      timestamp: Date.now(),
      channel: msg.channel,
      type: "gh-card",
    };
    patch({ messages: [...state.messages, chatMsg] });
    return;
  }

  console.log("[v2] legacy-msg", msg.type, msg);
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
