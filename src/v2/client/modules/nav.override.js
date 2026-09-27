// v2 nav override — navigation between views
import { state, patch } from "./store.js";

export function navTo(view, params = {}) {
  const app = document.getElementById("v2-app");
  if (!app) return;

  switch (view) {
    case "room-list":
      window.__v2_showRoomList?.();
      break;
    case "chat":
      window.__v2_showChat?.(params.room);
      break;
    case "auth":
      window.__v2_showAuth?.();
      break;
    case "settings":
      window.__v2_openSettings?.();
      break;
    default:
      console.warn("[v2] Unknown view:", view);
  }
}

export function goBack() {
  if (state.currentRoom) {
    navTo("room-list");
  } else {
    navTo("auth");
  }
}

window.__v2_navTo = navTo;
window.__v2_navBack = goBack;
