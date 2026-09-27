// v2 hacknet override — hacknet-style terminal game
import { state } from "./store.js";
import { showToast, showSuccess, showError } from "./toast.override.js";

let hacknetState = null;
const PORTS = [21, 22, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 3306, 3389, 5432, 5900, 8080, 8443];

export function openHacknet() {
  let panel = document.getElementById("v2-hacknet-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-hacknet-panel";
  panel.className = "v2-hacknet-overlay";
  panel.innerHTML = `
    <div class="v2-hacknet-terminal">
      <div class="v2-hacknet-header">
        <span>🖥️ Hacknet Terminal</span>
        <button class="v2-hacknet-close" onclick="window.__v2_closeHacknet()">&times;</button>
      </div>
      <div class="v2-hacknet-output" id="v2-hacknet-output"></div>
      <div class="v2-hacknet-input-area">
        <span class="v2-hacknet-prompt">$ </span>
        <input type="text" id="v2-hacknet-input" placeholder="输入命令..." autocomplete="off" maxlength="200">
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.addEventListener("click", e => { if (e.target === panel) window.__v2_closeHacknet(); });

  const input = document.getElementById("v2-hacknet-input");
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") executeCommand(input.value.trim());
  });
  input.focus();

  hacknetState = {
    connected: false,
    target: null,
    crackedPorts: new Set(),
    keys: 0,
    ram: 4,
    maxRam: 16,
    log: [],
  };

  printToTerminal("Hacknet OS v2.0 - Terminal Emulator");
  printToTerminal("Type 'help' for available commands.");
  printToTerminal("");
}

export function closeHacknet() {
  const p = document.getElementById("v2-hacknet-panel");
  if (p) p.remove();
  hacknetState = null;
}

function printToTerminal(text) {
  const output = document.getElementById("v2-hacknet-output");
  if (!output || !hacknetState) return;
  const line = document.createElement("div");
  line.className = "v2-hacknet-line";
  line.textContent = text;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
  hacknetState.log.push(text);
}

function executeCommand(cmd) {
  if (!hacknetState) return;
  printToTerminal(`$ ${cmd}`);
  const parts = cmd.split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case "help":
      printToTerminal("可用命令: connect, crack, scan, keys, ram, list, clear, exit, whoami");
      break;
    case "connect":
      if (!args[0]) { showError("用法: connect <主机名>"); return; }
      hacknetState.connected = true;
      hacknetState.target = args[0];
      hacknetState.crackedPorts = new Set();
      printToTerminal(`连接到 ${args[0]}...`);
      printToTerminal("扫描开放端口...");
      setTimeout(() => {
        const openPorts = args.length > 1 ? args.slice(1).map(Number) : [22, 80, 443];
        printToTerminal(`发现开放端口: [${openPorts.join(", ")}]`);
      }, 500);
      break;
    case "crack":
      if (!hacknetState.connected) { printToTerminal("请先 connect 到目标"); return; }
      if (!args[0]) { printToTerminal("用法: crack <端口>"); return; }
      const port = parseInt(args[0]);
      if (!PORTS.includes(port)) { printToTerminal(`端口 ${port} 不存在`); return; }
      if (hacknetState.crackedPorts.has(port)) { printToTerminal(`端口 ${port} 已被破解`); return; }
      printToTerminal(`破解端口 ${port}...`);
      setTimeout(() => {
        hacknetState.crackedPorts.add(port);
        const reward = Math.floor(Math.random() * 10) + 5;
        hacknetState.keys += reward;
        printToTerminal(`✅ 端口 ${port} 破解成功! 获得 ${reward} keys`);
      }, 1000);
      break;
    case "scan":
      if (!hacknetState.connected) { printToTerminal("请先 connect 到目标"); return; }
      printToTerminal("正在扫描...");
      const allPorts = PORTS.filter(p => !hacknetState.crackedPorts.has(p));
      printToTerminal(`开放端口: [${allPorts.slice(0, 3).join(", ")}]`);
      break;
    case "keys":
      printToTerminal(`当前 Keys: ${hacknetState.keys}`);
      break;
    case "ram":
      printToTerminal(`RAM: ${hacknetState.ram}GB / ${hacknetState.maxRam}GB`);
      break;
    case "list":
      printToTerminal(`已破解端口: [${[...hacknetState.crackedPorts].join(", ") || "无"}]`);
      break;
    case "clear":
      document.getElementById("v2-hacknet-output").innerHTML = "";
      hacknetState.log = [];
      break;
    case "exit":
      hacknetState.connected = false;
      hacknetState.target = null;
      hacknetState.crackedPorts = new Set();
      printToTerminal("断开连接");
      break;
    default:
      printToTerminal(`未知命令: ${command} (输入 help 查看帮助)`);
  }
}

window.__v2_openHacknet = openHacknet;
window.__v2_closeHacknet = closeHacknet;
