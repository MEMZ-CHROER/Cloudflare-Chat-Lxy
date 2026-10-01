// v2 hacknet game — simplified Hacknet terminal battle
import { state } from "../store.js";
import { showToast } from "./toast.override.js";

let _pollTimer = null;
let _currentStatus = null;

export function openHacknetGame() {
  const existing = document.getElementById("v2-hacknet-game");
  if (existing) { existing.remove(); return; }
  initHacknetGame();
}

function initHacknetGame() {
  const panel = document.createElement("div");
  panel.id = "v2-hacknet-game";
  panel.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#0a0a0a;border:2px solid #333;border-radius:8px;padding:16px;z-index:999;width:90%;max-width:600px;max-height:80vh;overflow:auto;font-family:monospace;color:#0f0;";
  
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #333;padding-bottom:8px;">
      <h2 style="margin:0;font-size:1rem;color:#0f0;">🟢 HACKNET TERMINAL</h2>
      <button onclick="window.__v2_closeHacknetGame()" style="background:none;border:none;color:#0f0;font-size:1.5rem;cursor:pointer;">&times;</button>
    </div>
    <div id="hn-status" style="margin-bottom:12px;font-size:12px;">连接中...</div>
    <div id="hn-body" style="margin-bottom:12px;">
      <div id="hn-msg" style="max-height:200px;overflow-y:auto;font-size:12px;line-height:1.6;"></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button onclick="hnCommand('status')" style="padding:4px 12px;background:#1a1a1a;color:#0f0;border:1px solid #0f0;border-radius:4px;cursor:pointer;font-family:monospace;font-size:11px;">status</button>
      <button onclick="hnCommand('rooms')" style="padding:4px 12px;background:#1a1a1a;color:#0f0;border:1px solid #0f0;border-radius:4px;cursor:pointer;font-family:monospace;font-size:11px;">rooms</button>
      <button onclick="hnCommand('connect')" style="padding:4px 12px;background:#1a1a1a;color:#0f0;border:1px solid #0f0;border-radius:4px;cursor:pointer;font-family:monospace;font-size:11px;">connect</button>
      <button onclick="hnCommand('scan')" style="padding:4px 12px;background:#1a1a1a;color:#0f0;border:1px solid #0f0;border-radius:4px;cursor:pointer;font-family:monospace;font-size:11px;">scan</button>
    </div>
  `;
  
  document.body.appendChild(panel);
  hnPrint("HACKNET TERMINAL v2.0");
  hnPrint("输入命令或使用按钮操作");
  startPolling();
}

function hnPrint(text, isError) {
  const msgEl = document.getElementById("hn-msg");
  if (!msgEl) return;
  const line = document.createElement("div");
  line.className = "hn-msg-line" + (isError ? " hn-msg-error" : "");
  line.textContent = "> " + text;
  msgEl.appendChild(line);
  msgEl.scrollTop = msgEl.scrollHeight;
}

async function hnCommand(cmd) {
  hnPrint(cmd);
  try {
    const token = localStorage.getItem("chat_token") || "";
    const name = state.user?.name || "";
    
    if (cmd === "status") {
      const r = await fetch("/api/hn/status?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token));
      const d = await r.json();
      if (d && d.game) {
        _currentStatus = d.game;
        hnPrint(JSON.stringify(d.game, null, 2));
      } else {
        hnPrint("未找到游戏数据", true);
      }
    } else if (cmd === "rooms") {
      const r = await fetch("/api/hn/rooms?" + new URLSearchParams({ name: name, token: token }).toString());
      const d = await r.json();
      if (d && d.rooms) {
        d.rooms.forEach(function(room) {
          hnPrint("房间 #" + room.room + " - " + (room.status || "online"));
        });
      }
    } else if (cmd === "connect") {
      hnPrint("等待连接...");
      showToast("正在连接Hacknet房间...", "info");
    } else if (cmd === "scan") {
      hnPrint("扫描中...");
      const r = await fetch("/api/hn/scan?" + new URLSearchParams({ name: name, token: token }).toString());
      const d = await r.json();
      if (d && d.targets) {
        d.targets.forEach(function(t) {
          hnPrint("发现目标: " + t.name + " (" + t.ip + ")");
        });
      }
    }
  } catch (e) {
    hnPrint("错误: " + e.message, true);
  }
}

function startPolling() {
  if (_pollTimer) return;
  _pollTimer = setInterval(function() {
    hnCommand("status");
  }, 5000);
}

window.__v2_closeHacknetGame = function() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  document.getElementById("v2-hacknet-game")?.remove();
};
window.__v2_openHacknetGame = openHacknetGame;
window.__v2_hnCommand = hnCommand;

// 导出给games模块使用
export function launchHacknetGame() {
  openHacknetGame();
}

window.__v2_launchHacknetGame = launchHacknetGame;
