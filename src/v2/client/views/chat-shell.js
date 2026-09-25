/**
 * v2 chat shell view — minimal placeholder for Phase 3.
 * Will be replaced by Vue 3 components in later phases.
 */

/**
 * Render the v2 chat shell into a container element.
 */
export function renderChatShell(container) {
  container.innerHTML = `
    <div id="v2-chat-shell">
      <div id="v2-header">
        <h1>CloudChat v2</h1>
        <span id="v2-status">connecting...</span>
      </div>
      <div id="v2-messages">
        <div class="v2-placeholder">v2 chat interface loading...</div>
      </div>
      <div id="v2-input-area">
        <input id="v2-msg-input" placeholder="Type a message..." maxlength="5000" />
        <button id="v2-send-btn">Send</button>
      </div>
    </div>
  `;

  const sendBtn = container.querySelector("#v2-send-btn");
  const msgInput = container.querySelector("#v2-msg-input");

  sendBtn.addEventListener("click", () => {
    const text = msgInput.value.trim();
    // Use window.__v2_state and window.__v2_subscribe from app.js
    const state = window.__v2_state;
    const subscribe = window.__v2_subscribe;
    if (!text || !state?.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({ type: "msg", content: text }));
    msgInput.value = "";
  });

  msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  // Subscribe via window global
  const state = window.__v2_state;
  const subscribe = window.__v2_subscribe;
  if (subscribe) {
    subscribe("connected", (connected) => {
      const statusEl = container.querySelector("#v2-status");
      if (statusEl) {
        statusEl.textContent = connected ? "connected" : "disconnected";
        statusEl.style.color = connected ? "#4ade80" : "#f87171";
      }
    });

    subscribe("messages", (msgs) => {
      const msgList = container.querySelector("#v2-messages");
      if (!msgList || !msgs) return;
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg !== msgList.dataset.lastId) {
        const div = document.createElement("div");
        div.className = "v2-msg";
        div.textContent = `${lastMsg.name || "Anonymous"}: ${lastMsg.content}`;
        msgList.appendChild(div);
        msgList.scrollTop = msgList.scrollHeight;
        msgList.dataset.lastId = lastMsg.id || String(msgs.length - 1);
      }
    });
  }
}
