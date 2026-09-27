// v2 manage override — extends core manage functions with v2-specific moderation
import * as coreManage from "../core/chatroom/manage.mjs";

/**
 * v2 stripSensitiveMsg: same as core but adds v2 envelope wrapper for broadcast.
 */
export function stripSensitiveMsg(msg) {
  return coreManage.stripSensitiveMsg(msg);
}

/**
 * v2 ban: adds v2 system message broadcast.
 */
export async function banUser(room, targetName, reason, caller) {
  await coreManage.banUser(room, targetName, reason, caller);
  // Notify connected v2 clients
  const notify = { v: "v2", t: "system", d: { content: `[Admin] ${targetName} 已被封禁: ${reason || "无"} (${caller || "system"})` } };
  room.broadcast(JSON.stringify(notify));
}

/**
 * v2 unban: adds v2 system message broadcast.
 */
export async function unbanUser(room, targetName, caller) {
  await coreManage.unbanUser(room, targetName, caller);
  const notify = { v: "v2", t: "system", d: { content: `[Admin] ${targetName} 已被解封` } };
  room.broadcast(JSON.stringify(notify));
}

// Re-export all other manage functions
export const {
  kickUser,
  muteUser,
  unmuteUser,
  setLevel,
  setTag,
  setAvatar,
  resetPassword,
  destroyRoom,
  clearAllMessages,
} = coreManage;
