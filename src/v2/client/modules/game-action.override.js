// v2 game action — basic game actions for chat
import { state } from "../store.js";
import { showToast } from "./toast.override.js";

export function gameAction(action, target) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    showToast("未连接到服务器", "error");
    return false;
  }
  state.ws.send(JSON.stringify({ type: "game-action", action: action, target: target }));
  return true;
}

export function openGames() {
  showToast("游戏功能开发中...", "info");
}

export function closeGames() {}

window.__v2_gameAction = gameAction;
window.__v2_openGames = openGames;
window.__v2_closeGames = closeGames;
