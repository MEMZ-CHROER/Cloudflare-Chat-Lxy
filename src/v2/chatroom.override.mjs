// v2 override: chatroom — imports core ChatRoom, adds v2-specific behavior
import { ChatRoom as CoreChatRoom } from "../core/chatroom.mjs";

/**
 * v2 ChatRoom — extends core with v2-specific hooks.
 * All core methods are preserved; v2 additions are layered on top.
 */
export class ChatRoom extends CoreChatRoom {
  // v2 hook: called after every webSocketMessage dispatch
  // Override this method in a subclass or patch it post-construction
  async _v2OnMessage(webSocket, data) {
    // Placeholder for v2 message handling (e.g. push to Vue store)
    // Currently no-op — v2 client will listen via WS event channels
  }

  // v2 hook: called on session join
  async _v2OnJoin(session) {
    // Placeholder for v2 join logic (e.g. send v2-init event)
  }

  // v2 hook: called on session leave
  async _v2OnLeave(session) {
    // Placeholder for v2 leave logic
  }
}

// Re-export all core named exports unchanged
export {
  handleHttp,
  handleSessionImpl,
  handleWsCloseImpl,
  deliverOfflineMessagesImpl,
  recordLastSeenImpl,
  _doRollbackImpl,
  getMaxMsgLenImpl,
  containsProfanityImpl,
  isAdminSessionImpl,
  isSuperSessionImpl,
  hasPermImpl,
  lpRawPermImpl,
  handleSchedule,
  runScheduledMessages,
  handleMedia,
  handleManage,
  stripSensitiveMsg,
  handleDoc,
  handleActivity,
} from "../core/chatroom.mjs";
