// v2 notifications override — browser notifications for mentions and DMs
import { state } from "./store.js";

let notifPermission = "default";

export async function initNotifications() {
  if (!("Notification" in window)) return;
  notifPermission = await Notification.requestPermission();
}

export function requestNotifPermission() {
  if (!("Notification" in window)) {
    console.log("[v2] Notifications not supported");
    return false;
  }
  Notification.requestPermission().then(p => {
    notifPermission = p;
  });
  return notifPermission === "granted";
}

export function sendNotification(title, body) {
  if (notifPermission !== "granted") return;
  try {
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "v2-chat",
    });
  } catch {}
}

export function checkMentionAndNotify(msg) {
  if (!state.user?.name) return;
  if (!document.visibilityState || document.visibilityState === "visible") return;

  const text = msg.message || msg.content || "";
  if (text.includes("@" + state.user.name)) {
    sendNotification("有人@你", `${msg.name}: ${text.substring(0, 50)}`);
  }
}

export function checkDmAndNotify(msg) {
  if (!state.user?.name) return;
  if (!document.visibilityState || document.visibilityState === "visible") return;

  if (msg.type === "dm" && msg.target === state.user.name) {
    sendNotification("私信", `${msg.name}: ${(msg.message || "").substring(0, 50)}`);
  }
}

window.__v2_initNotifications = initNotifications;
window.__v2_requestNotifPermission = requestNotifPermission;
