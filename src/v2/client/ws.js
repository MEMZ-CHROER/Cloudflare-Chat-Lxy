/**
 * v2 WebSocket manager — handles connection lifecycle
 */
import { state, set, subscribe, patch } from "./store.js";

let ws = null;

export function connectWebSocket(roomName) {
  if (ws) {
    ws.close();
    ws = null;
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}://${location.host}/api/room/${encodeURIComponent(roomName)}/websocket`;
  console.log(`[v2] connecting to ${wsUrl}`);

  ws = new WebSocket(wsUrl);
  set("ws", ws);

  ws.onopen = () => {
    console.log("[v2] WS connected");
    patch({ connected: true });
    ws.send(JSON.stringify({ type: "v2-init", room: roomName }));
  };

  ws.onmessage = (event) => {
    const data = event.data;
    try {
      const msg = JSON.parse(data);
      handleWSMessage(msg);
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

function handleWSMessage(msg) {
  switch (msg.type) {
    case "msg":
      patch({ messages: [...state.messages, msg] });
      break;
    case "join":
      console.log("[v2] user joined:", msg.name);
      break;
    case "leave":
      console.log("[v2] user left:", msg.name);
      break;
    case "user-list":
      patch({ onlineUsers: msg.users });
      break;
    case "system":
      console.log("[v2] system:", msg.content);
      break;
    default:
      console.log("[v2] unknown message type:", msg.type);
  }
}

export function sendMessage(content) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error("[v2] WS not connected");
    return false;
  }
  ws.send(JSON.stringify({ type: "msg", content }));
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
