// v2 override: chatroom — imports core ChatRoom, adds v2-specific behavior
import { ChatRoom as CoreChatRoom } from "../core/chatroom.mjs";

/**
 * v2 ChatRoom — extends core with v2-specific hooks.
 * All core methods are preserved; v2 additions are layered on top.
 */
export class ChatRoom extends CoreChatRoom {
  // v2 hook: called after every webSocketMessage dispatch
  async _v2OnMessage(webSocket, data) {
    // Placeholder for v2 message handling
  }

  // v2 hook: called on session join
  async _v2OnJoin(session) {
    // Placeholder for v2 join logic
  }

  // v2 hook: called on session leave
  async _v2OnLeave(session) {
    // Placeholder for v2 leave logic
  }
}
