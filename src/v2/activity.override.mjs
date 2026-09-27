// v2 activity override — extends core activity tracking with v2-specific analytics
import * as coreActivity from "../core/chatroom/activity.mjs";

/**
 * v2 trackMsg: wraps in v2 envelope for real-time analytics.
 */
export async function trackMsg(room, msg) {
  const result = await coreActivity.trackMsg(room, msg);

  // v2-specific: push real-time msg count to registry
  if (room.env.registry && msg.type !== "system") {
    try {
      const registryId = room.env.registry.idFromName("global");
      const stub = room.env.registry.get(registryId);
      await stub.fetch("https://dummy-url/incr-msg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: room.roomName, by: msg.name || "anon" }),
      });
    } catch {}
  }

  return result;
}

// Re-export all other activity functions
export const {
  trackJoin,
  trackQuit,
  trackCommand,
  updateRegistry,
} = coreActivity;
