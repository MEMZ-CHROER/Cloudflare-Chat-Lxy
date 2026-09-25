/**
 * v2 client entry point — Vue 3 app bootstrapper.
 * Currently a minimal shell; Vue 3 will be added in Phase 3 step 6.
 * For now, validates WS connectivity and store integration.
 */

// ── Inline Store (avoid dynamic import issues) ──
const _v2Listeners = new Map();
const _v2State = {
  user: null,
  currentRoom: null,
  ws: null,
  connected: false,
  messages: [],
  onlineUsers: [],
  lang: "zh",
  theme: "classic",
};

function _v2Subscribe(key, fn) {
  if (!_v2Listeners.has(key)) _v2Listeners.set(key, new Set());
  _v2Listeners.get(key).add(fn);
  if (key !== "*" && _v2Listeners.has("*")) _v2Listeners.get("*").add(fn);
  return () => {
    const s = _v2Listeners.get(key);
    if (s) s.delete(fn);
    if (key !== "*" && _v2Listeners.has("*")) _v2Listeners.get("*").delete(fn);
  };
}

function _v2Set(key, value) {
  const prev = _v2State[key];
  _v2State[key] = value;
  const notify = (set) => {
    if (set) set.forEach((fn) => { try { fn(value, prev); } catch(e) { console.error("v2 store error:", e); } });
  };
  notify(_v2Listeners.get(key));
  notify(_v2Listeners.get("*"));
}

function _v2Patch(patches) {
  const keys = Object.keys(patches);
  const prev = {};
  for (const k of keys) prev[k] = _v2State[k];
  for (const k of keys) _v2State[k] = patches[k];
  for (const k of keys) {
    const notify = (set) => {
      if (set) set.forEach((fn) => { try { fn(_v2State[k], prev[k]); } catch(e) { console.error("v2 store error:", e); } });
    };
    notify(_v2Listeners.get(k));
    notify(_v2Listeners.get("*"));
  }
}

const state = _v2State;
const set = _v2Set;
const subscribe = _v2Subscribe;
const patch = _v2Patch;

// Export for other modules
export { state, set, subscribe, patch };

/**
 * Initialize v2 client — called after page load when user is authenticated.
 */
export function initV2Client() {
  console.log("[v2] client initializing");

  subscribe("currentRoom", (room) => {
    if (room) {
      console.log(`[v2] room changed to: ${room}`);
      connectWebSocket(room);
    }
  });

  subscribe("user", (user) => {
    if (user) {
      console.log(`[v2] user logged in: ${user.name}`);
    }
  });

  console.log("[v2] client ready");
}

/**
 * Connect to chat room via WebSocket with v2 envelope protocol.
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
    const initMsg = JSON.stringify({ type: "v2-init", room: roomName });
    ws.send(initMsg);
  };

  ws.onmessage = (event) => {
    const data = event.data;
    const envelope = parseV2Envelope(data);
    if (envelope) {
      console.log(`[v2] envelope received: ${envelope.type}`, envelope.payload);
      handleV2Event(envelope.type, envelope.payload);
      return;
    }
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

function handleV2Event(type, payload) {
  switch (type) {
    case "msg":
      const msgs = [...state.messages, payload];
      patch({ messages: msgs });
      break;
    case "join":
      console.log("[v2] user joined:", payload.name);
      break;
    case "leave":
      console.log("[v2] user left:", payload.name);
      break;
    case "user-list":
      patch({ onlineUsers: payload.users });
      break;
    default:
      console.log("[v2] unknown event type:", type);
  }
}

function handleLegacyEvent(msg) {
  console.log("[v2] legacy event (ignored):", msg.type || msg);
}

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
