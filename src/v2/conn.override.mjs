// v2 conn override — extends core session handling with v2-specific features
import { handleSessionImpl as coreHandleSessionImpl } from "../core/chatroom/conn.mjs";

/**
 * v2 session: adds v2 metadata to session object.
 */
export async function handleSession(room, webSocket, ip) {
  await coreHandleSessionImpl(room, webSocket, ip);

  // v2-specific: send welcome message with v2 protocol hint
  const session = room.sessions.get(webSocket);
  if (session && session.name) {
    const welcome = {
      v: "v2",
      t: "system",
      d: {
        content: `欢迎加入 ${room.roomName} (v2 protocol)`,
        ts: Date.now(),
      },
    };
    webSocket.send(JSON.stringify(welcome));
  }
}

/**
 * v2 close handler — sends v2 envelope on leave
 */
export function handleClose(room, webSocket, code, reason, wasClean) {
  const session = room.sessions.get(webSocket);
  if (session?.name) {
    const leaveMsg = {
      v: "v2",
      t: "quit",
      d: { name: session.name, ts: Date.now() },
    };
    // Broadcast v2 envelope to all v2 sessions
    room.sessions.forEach((s, ws) => {
      if (ws !== webSocket) {
        try { ws.send(JSON.stringify(leaveMsg)); } catch {}
      }
    });
  }
  return room.webSocketClose(webSocket, code, reason, wasClean);
}
