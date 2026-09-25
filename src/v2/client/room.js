/**
 * v2 Room module — room list, join, create
 */
import { state, set, patch } from "./store.js";
import { connectWebSocket } from "./ws.js";

// Import showChat from app.js via window global (avoid circular import)
function getShowChat() {
  return window.__v2_showChat;
}

export async function fetchRooms() {
  try {
    const res = await fetch("/api/rooms/list");
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return Object.entries(data).map(([name, info]) => ({ name, ...info }));
  } catch {
    return [];
  }
}

export async function joinRoom(roomName, password) {
  try {
    patch({ currentRoom: roomName });
    connectWebSocket(roomName, password);
    // Switch to chat view
    const showChat = getShowChat();
    if (showChat) showChat();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function createRoom(roomName, password) {
  return joinRoom(roomName, password);
}

export function leaveRoom() {
  patch({ currentRoom: null });
  patch({ messages: [] });
  patch({ onlineUsers: [] });
}
