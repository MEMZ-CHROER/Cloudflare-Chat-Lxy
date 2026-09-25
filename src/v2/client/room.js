/**
 * v2 Room module — room list, join, create
 */
import { state, set, patch } from "./store.js";
import { connectWebSocket } from "./ws.js";

export async function fetchRooms() {
  try {
    const res = await fetch("/api/rooms");
    const data = await res.json();
    return data.rooms || [];
  } catch {
    return [];
  }
}

export async function joinRoom(roomName, password) {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(roomName)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.ok) {
      patch({ currentRoom: roomName });
      connectWebSocket(roomName);
      return { ok: true };
    }
    return { ok: false, error: data.error };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function createRoom(roomName, password) {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(roomName)}/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.ok) {
      patch({ currentRoom: roomName });
      connectWebSocket(roomName);
      return { ok: true };
    }
    return { ok: false, error: data.error };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function leaveRoom() {
  patch({ currentRoom: null });
  patch({ messages: [] });
  patch({ onlineUsers: [] });
}
