/**
 * v2 client entry point — Vue 3 app bootstrapper.
 * Currently a minimal shell; Vue 3 will be added in Phase 3 step 6.
 * For now, validates WS connectivity and store integration.
 */
import { state, set, subscribe, patch } from "./store/store.js";

/**
 * Initialize v2 client — called after page load when user is authenticated.
 * Sets up WebSocket connection using v2 envelope protocol.
 */
export function initV2Client() {
  console.log("[v2] client initializing");

  // Subscribe to room changes to auto-connect WS
  subscribe("currentRoom", (room) => {
    if (room) {
      console.log(`[v2] room changed to: ${room}`);
      connectWebSocket(room);
    }
  });

  // Subscribe to user changes
  subscribe("user", (user) => {
    if (user) {
      console.log(`[v2] user logged in: ${user.name}`);
    }
  });

  console.log("[v2] client ready");
}

/**
 * Connect to chat room via WebSocket with v2 envelope protocol.
 * @param {string} roomName
 */
async function connectWebSocket(roomName) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const host = location.host;
  const wsUrl = `${protocol}://${host}/api/room/${encodeURIComponent(roomName)}/websocket`;

  console.log(`[v2] connecting to ${wsUrl}`);

  const ws = new WebSocket(wsUrl);
  set("ws", ws);

  ws.onopen = () => {
    console.log("[v2] WS connected");
    patch({ connected: true });

    // Send v2-init handshake
    const initMsg = JSON.stringify({ type: "v2-init", room: roomName });
    ws.send(initMsg);
  };

  ws.onmessage = (event) => {
    const data = event.data;
    // Try to parse as v2 envelope first
    const envelope = parseV2Envelope(data);
    if (envelope) {
      console.log(`[v2] envelope received: ${envelope.type}`, envelope.payload);
      handleV2Event(envelope.type, envelope.payload);
      return;
    }
    // Fallback: legacy v1 message format
    try {
      const legacy = JSON.parse(data);
      console.log(`[v2] legacy message:`, legacy);
      handleLegacyEvent(legacy);
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
 * Handle v2 protocol events.
 * @param {string} type
 * @param {object} payload
 */
function handleV2Event(type, payload) {
  switch (type) {
    case "msg":
      // New message — append to store
      const msgs = [...state.messages, payload];
      patch({ messages: msgs });
      break;
    case "join":
      // User joined
      console.log("[v2] user joined:", payload.name);
      break;
    case "leave":
      // User left
      console.log("[v2] user left:", payload.name);
      break;
    case "user-list":
      // Update online users
      patch({ onlineUsers: payload.users });
      break;
    default:
      console.log("[v2] unknown event type:", type);
  }
}

/**
 * Handle legacy v1 message format (backward compatibility).
 * @param {object} msg
 */
function handleLegacyEvent(msg) {
  // v1 messages flow through v1 client; v2 just logs for now
  console.log("[v2] legacy event (ignored):", msg.type || msg);
}

/**
 * Parse v2 envelope from raw data.
 * (Duplicate of utils.override.mjs — kept here for client-side standalone use)
 */
function parseV2Envelope(data) {
  let obj;
  try {
    obj = typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return null;
  }
  if (!obj || obj.v !== "v2") return null;
  return { type: obj.t, payload: obj.d, version: obj.v };
}

// Auto-initialize if loaded in browser context
if (typeof window !== "undefined") {
  window.__v2_init = initV2Client;
  window.__v2_state = state;
}
