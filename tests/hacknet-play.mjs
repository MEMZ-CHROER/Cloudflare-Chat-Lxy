// 本地对局助手：管理双账号 token 缓存，按子命令打真实域名 chat.liuxiyu.cn
// 用法:
//   node hacknet-play.mjs login <name> <password>
//   node hacknet-play.mjs new <name> x=<n> opponent=<opp>
//   node hacknet-play.mjs accept <name> <gameId>
//   node hacknet-play.mjs status <name>
//   node hacknet-play.mjs connect <name> <room>
//   node hacknet-play.mjs act <name> <cmd> [port=<p>|code=<c>|tag=<t>]
//   node hacknet-play.mjs quit <name>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const BASE = "https://chat.liuxiyu.cn/api";
const SESS = "I:/Cloudflare-Workers-Chat-master/.hn-sess.json";

function loadSess() { return existsSync(SESS) ? JSON.parse(readFileSync(SESS, "utf8")) : {}; }
function saveSess(s) { writeFileSync(SESS, JSON.stringify(s)); }

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, d: await r.json().catch(() => ({})) };
}
async function get(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, d: await r.json().catch(() => ({})) };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const sess = loadSess();
  if (cmd === "login") {
    const [name, password] = rest;
    const { status, d } = await post("/login", { name, password });
    if (d.token) { sess[name] = d.token; saveSess(sess); }
    console.log("login", status, d.token ? "ok" : JSON.stringify(d));
    return;
  }
  if (cmd === "new") {
    const name = rest[0];
    const x = parseInt((rest.find(a => a.startsWith("x=")) || "x=3").slice(2), 10);
    const opponent = (rest.find(a => a.startsWith("opponent=")) || "opponent=").slice(9);
    const { status, d } = await post("/hn/new", { name, token: sess[name], mode: "pvp", x, opponent });
    console.log("new", status, JSON.stringify(d));
    return;
  }
  if (cmd === "accept") {
    const [name, gameId] = rest;
    const { status, d } = await post("/hn/accept", { name, token: sess[name], gameId });
    console.log("accept", status, JSON.stringify(d));
    return;
  }
  if (cmd === "status") {
    const name = rest[0];
    const { status, d } = await get("/hn/status?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(sess[name] || ""));
    const g = d.game;
    if (!g) { console.log("status", status, "game=null"); return; }
    const m = (g.bases.mine || []).map(r => "#" + r.room + (r.crackedBy ? "!!" : "")).join(" ");
    const e = (g.bases.enemy || []).map(r => {
      let s = "#" + r.room + (r.crackedBy ? "!" : "");
      if (r.proxy && r.proxy.present) s += r.proxy.broken ? " [P✓]" : r.proxy.cracking ? " [P…]" : " [P]";
      if (r.firewall && r.firewall.present) s += r.firewall.broken ? " [FW✓]" : " [FW " + (r.firewall.revealed || 0) + "/" + (r.firewall.totalLen || 0) + "]";
      return s;
    }).join(" ");
    const ports = (g.bases.enemy || []).map(r => "#" + r.room + "[" + r.ports.map(p => p.port + (p.cracked ? "✓" : "")).join(",") + "]").join(" ");
    console.log("state=" + g.state, "winner=" + (g.winner || "-"));
    console.log("  mine:", m);
    console.log("  enemy:", e);
    console.log("  enemy ports:", ports);
    console.log("  tracer(双方基地守护):", JSON.stringify(g.tracer || {}));
    console.log("  target:", g.player.currentTarget || "-", "| trace:", g.player.trace ? g.player.trace.kind + " " + Math.round(g.player.trace.remainingMs / 1000) + "s" : "none");
    if (g.state === "ended") console.log("  ENDED winner=" + (g.winner === g.side ? "YOU" : g.sides[g.winner]));
    return;
  }
  if (cmd === "connect") {
    const [name, room] = rest;
    const { status, d } = await post("/hn/connect", { name, token: sess[name], room });
    console.log("connect #" + room, status, "mode=" + d.mode, d.error || d.msg || "");
    return;
  }
  if (cmd === "act") {
    const name = rest[0];
    const a = rest[1];
    const body = { name, token: sess[name], cmd: a };
    const port = rest.find(x => x.startsWith("port="));
    const code = rest.find(x => x.startsWith("code="));
    const tag = rest.find(x => x.startsWith("tag="));
    if (port) body.port = parseInt(port.slice(5), 10);
    if (code) body.code = decodeURIComponent(code.slice(5));
    if (tag) body.tag = decodeURIComponent(tag.slice(4));
    const { status, d } = await post("/hn/action", body);
    console.log("act " + a, status, JSON.stringify(d).slice(0, 400));
    return;
  }
  if (cmd === "disconnect") {
    const name = rest[0];
    const { status, d } = await post("/hn/disconnect", { name, token: sess[name] });
    console.log("disconnect", status, JSON.stringify(d).slice(0, 200));
    return;
  }
  if (cmd === "quit") {
    const name = rest[0];
    const { status, d } = await post("/hn/quit", { name, token: sess[name] });
    console.log("quit", status, JSON.stringify(d));
    return;
  }
  console.log("未知命令");
}
main().catch(e => { console.error("err:", e && e.message || e); process.exit(1); });
