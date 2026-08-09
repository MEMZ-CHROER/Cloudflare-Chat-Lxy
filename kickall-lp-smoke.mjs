// /kickall 纳入 LP kickUser 冒烟：A false 时 /kickall(except=A) 应 403
const BASE = "https://chat.liuxiyu.cn";
const ROOM = "lp_kickall_smoke" + String(Date.now()).slice(-6);
const A = "hntest_1785912234", AP = "test123456";
const B = "hntest533931", BP = "test123456";
const SUPER = "9167c945079746dbfa6cd249df4ad64f102e9e34a366624539ee3ac7cfefa16e";
async function j(path, opts = {}) {
  const r = await fetch(BASE + path, { headers: { "Content-Type": "application/json", "User-Agent": "CloudChat-Lxy" }, ...opts });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: r.status, d, t };
}
let fails = 0;
function check(cond, label, extra) { console.log((cond ? "✅ " : "❌ ") + label + (extra !== undefined ? "  " + JSON.stringify(extra) : "")); if (!cond) fails++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function wsOpen(name, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://chat.liuxiyu.cn/api/room/${ROOM}/websocket`);
    ws.inbox = [];
    ws.addEventListener("message", ev => { try { ws.inbox.push(JSON.parse(ev.data)); } catch (_) {} });
    const t = setTimeout(() => reject(new Error("ws timeout " + name)), 9000);
    ws.addEventListener("open", () => { clearTimeout(t); ws.send(JSON.stringify({ name, token })); setTimeout(() => resolve(ws), 600); });
  });
}
async function lpExec(cmd) {
  const r = await j("/api/admin/lp/exec?key=" + SUPER, { method: "POST", body: JSON.stringify({ cmd }) });
  return r.status === 200 && r.d.ok ? (r.d.text || "") : ("ERR:" + r.status);
}
async function main() {
  console.log("ROOM = " + ROOM);
  const la = await j("/api/login", { method: "POST", body: JSON.stringify({ name: A, password: AP }) });
  const lb = await j("/api/login", { method: "POST", body: JSON.stringify({ name: B, password: BP }) });
  const wa = await wsOpen(A, la.d.token);
  const wb = await wsOpen(B, lb.d.token);
  await sleep(500);
  check(wa.inbox.some(x => x.joined === A) && wb.inbox.some(x => x.joined === B), "1. A/B 进房");
  let s = await lpExec("/lp user " + A + " permission set chat.admin.kickUser false");
  check(s.includes("chat.admin.kickUser = false"), "2. A 设 kick false", s);
  // 带 except=A 的 /kickall（模拟 /kickall 命令触发者留场）→ 应 403
  let r = await j("/api/admin/room-kick-all?room=" + encodeURIComponent(ROOM) + "&except=" + encodeURIComponent(A) + "&key=" + SUPER);
  check(r.status === 403 && String(r.t).includes("你无权执行该操作"), "3. A false 时 /kickall 被拦(403)", { status: r.status, t: r.t });
  // A unset 后 → 恢复
  s = await lpExec("/lp user " + A + " permission unset chat.admin.kickUser");
  check(s.includes("已移除用户"), "4. A unset", s);
  r = await j("/api/admin/room-kick-all?room=" + encodeURIComponent(ROOM) + "&except=" + encodeURIComponent(A) + "&key=" + SUPER);
  check(r.status === 200 && String(r.t).includes("已踢出"), "5. unset 后 /kickall 恢复(200)", { status: r.status, t: r.t });
  try { wa.close(); wb.close(); } catch (_) {}
  console.log(fails === 0 ? "\n🎉 全部通过" : `\n⚠️ ${fails} 项失败`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
