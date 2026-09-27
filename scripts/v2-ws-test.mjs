/**
 * v2 WebSocket 消息发送端到端测试
 * 验证 v2 发送消息后服务端能正确广播
 */
import WebSocket from "ws";

const BASE_V2 = "https://chatnew.liuxiyu.cn";
const USERNAME = "ClaudeTest";
const PASSWORD = "12345678";
const TEST_ROOM = "v2-msg-test-" + Date.now();

async function login(baseUrl, user, pass) {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: user, password: pass }),
  });
  const data = await res.json();
  if (!data.token) throw new Error("登录失败: " + JSON.stringify(data));
  return data.token;
}

async function main() {
  console.log("=== v2 WS Message Test ===");
  console.log(`Room: ${TEST_ROOM}`);

  // Login on v2
  const token = await login(BASE_V2, USERNAME, PASSWORD);
  console.log(`✓ Logged in as ${USERNAME}, token=${token.substring(0, 8)}...`);

  // Join room via WS (v1 format)
  const wsUrl = `${BASE_V2.replace("https", "wss")}/api/room/${encodeURIComponent(TEST_ROOM)}/websocket`;

  // Pre-warm the DO instance via HTTP first
  await fetch(`${BASE_V2}/api/room/${encodeURIComponent(TEST_ROOM)}/messages?limit=1`, {
    headers: { "Cookie": `token=${token}` }
  }).catch(() => {});

  const ws = new WebSocket(wsUrl, {
    headers: { "Cookie": `token=${token}` },
  });

  const messages = [];

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WS connect timeout 10s")), 10000);

    ws.onopen = () => {
      console.log("✓ WS connected");
      // Send join
      ws.send(JSON.stringify({ name: USERNAME, token }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("  ←", JSON.stringify(msg).substring(0, 100));
        messages.push(msg);
        if (msg.type === "ready" || msg.joined) {
          clearTimeout(timer);
          resolve();
        }
      } catch {}
    };

    ws.onerror = (err) => {
      clearTimeout(timer);
      reject(new Error("WS error: " + err.message));
    };
  });

  // Send a message and wait for broadcast
  console.log("→ Sending message...");
  const testMsg = "test message " + Date.now();
  ws.send(JSON.stringify({ message: testMsg }));

  // Wait for the broadcast message
  const found = await new Promise((resolve) => {
    const timer = setTimeout(() => { resolve(false); }, 5000);
    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("  ← broadcast:", JSON.stringify(msg).substring(0, 150));
        if ((msg.message || (msg.d && msg.d.message)) && String(msg.message || msg.d?.message).includes("test message ")) {
          clearTimeout(timer);
          ws.removeEventListener("message", handler);
          resolve(true);
        }
      } catch {}
    };
    ws.addEventListener("message", handler);
  });

  if (found) {
    console.log("✅ SUCCESS: message broadcast received correctly");
  } else {
    console.log("❌ FAILED: message broadcast not received within 5s");
  }

  ws.close();
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
