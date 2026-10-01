/**
 * v2 WebSocket manager — handles v2 envelope protocol + legacy v1 messages
 */
import { state, set, subscribe, patch } from "./store.js";
import { addSystemMessage, initOnlineUsersListener, loadMessages } from "./chat.js";

let ws = null;
let msgSubscription = null;
let connSubscription = null;
let reconnectTimer = null;
let reconnectAttempts = 0;

export function connectWebSocket(roomName, password) {
  if (ws) { ws.close(); ws = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectAttempts = 0;

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  let wsUrl = `${protocol}//${location.host}/api/room/${encodeURIComponent(roomName)}/websocket`;
  if (password) wsUrl += `?password=${encodeURIComponent(password)}`;
  console.log(`[v2] connecting to ${wsUrl}`);

  ws = new WebSocket(wsUrl);
  set("ws", ws);

  ws.onopen = () => {
    console.log("[v2] WS connected");
    patch({ connected: true });
    reconnectAttempts = 0;
    const token = localStorage.getItem("chat_token") || "";
    ws.send(JSON.stringify({ name: state.user?.name || "Guest", token }));
    // Fetch online users after connecting
    fetch("/api/room/" + encodeURIComponent(roomName) + "/users")
      .then(r => r.json())
      .then(data => {
        if (data.users) patch({ onlineUsers: data.users });
      })
      .catch(e => console.error("[v2] Failed to fetch users:", e));

  };

  ws.onmessage = (event) => {
    const data = event.data;
    try {
      const msg = JSON.parse(data);
      if (msg.v === "v2") {
        handleV2Message(msg.t, msg.d);
      } else {
        handleLegacyMessage(msg);
      }
    } catch {
      console.log("[v2] raw:", data);
    }
  };

  ws.onerror = () => {
    console.error("[v2] WS error");
    patch({ connected: false });
  };

  ws.onclose = () => {
    console.log("[v2] WS closed");
    patch({ connected: false });
    set("ws", null);
    // Auto-reconnect after 3s
    reconnectTimer = setTimeout(() => {
      if (state.currentRoom && !state._manualDisconnect) {
        console.log("[v2] reconnecting...");
        connectWebSocket(state.currentRoom);
      }
    }, 3000);
  };
}

function handleV2Message(type, data) {
  switch (type) {
    case "msg":
      patch({ messages: [...state.messages, data] });
      break;
    case "join":
    case "quit":
      addSystemMessage(`${data.name || data.quit} ${type === "join" ? "加入了" : "离开了"}房间`);
      break;
    case "user-list":
      patch({ onlineUsers: data.users });
      break;
    case "system":
      addSystemMessage(data.content);
      break;
    case "destroyed":
      addSystemMessage("房间已销毁");
      break;
    default:
      console.log("[v2] v2-msg", type, data);
  }
}

function handleLegacyMessage(msg) {
  // Chat message
  if (msg.message || msg.content) {
    const chatMsg = {
      id: msg.id || Date.now(),
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
  // Join
  if (msg.joined) {
    addSystemMessage(`${msg.joined} 加入了房间`);
    return;
  }
  if (msg.quit) {
    addSystemMessage(`${msg.quit} 离开了房间`);
    return;
  }
  // Ready
  if (msg.ready) {
    console.log("[v2] connected, ready");
    return;
  }
  // Channel info
  if (msg.type === "channels") return;
  if (msg.type === "pinned") return;
  if (msg.type === "level-styles") return;
  // Destroyed
  if (msg.type === "destroyed") {
    addSystemMessage("房间已销毁");
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
      content: msg.url || msg.path || "[图片]",
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
      content: msg.repo || msg.repoUrl || "",
      timestamp: Date.now(),
      channel: msg.channel,
      type: "gh-card",
    };
    patch({ messages: [...state.messages, chatMsg] });
    return;
  }
  // Error
  if (msg.error) {
    addSystemMessage("错误: " + msg.error);
    return;
  }
  console.log("[v2] legacy-msg", msg.type, msg);
}

export function sendMessage(content) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error("[v2] WS not connected");
    return false;
  }
  // v2 envelope — server's ChatRoom.broadcast override wraps it for v2 clients
  ws.send(JSON.stringify({ message: content }));
  return true;
}

export function disconnect() {
  state._manualDisconnect = true;
  if (ws) { ws.close(); ws = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  patch({ connected: false });
  set("ws", null);
}
