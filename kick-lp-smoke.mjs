// v1.49 修复冒烟：/do-kick 与 /do-kick-all 纳入 LP kickUser（用户反馈：LIU false 仍能踢的绕过路径修复验证）
const BASE = "https://chat.liuxiyu.cn";
const ROOM = "lp_kickfix_smoke" + String(Date.now()).slice(-6);
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
    ws.addEventListener("error", e => console.error("  WS error " + name + ":", e.message || e));
    const t = setTimeout(() => reject(new Error("ws open timeout: " + name)), 9000);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      ws.send(JSON.stringify({ name, token }));
      setTimeout(() => resolve(ws), 600);
    });
  });
}
async function waitMsg(ws, pred, timeout = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const i = ws.inbox.findIndex(pred);
    if (i >= 0) return ws.inbox.splice(i, 1)[0];
    await sleep(150);
  }
  return null;
}
const sysOf = x => (x && typeof x.system === "string" ? x.system : "");
async function lpExec(cmd) {
  const r = await j("/api/admin/lp/exec?key=" + SUPER, { method: "POST", body: JSON.stringify({ cmd }) });
  return r.status === 200 && r.d.ok ? (r.d.text || "") : ("ERR:" + r.status);
}

async function main() {
  console.log("ROOM = " + ROOM);
  console.log("=== 登录 + 建 WS ===");
  const la = await j("/api/login", { method: "POST", body: JSON.stringify({ name: A, password: AP }) });
  const lb = await j("/api/login", { method: "POST", body: JSON.stringify({ name: B, password: BP }) });
  const ta = la.d && la.d.token, tb = lb.d && lb.d.token;
  check(!!ta && !!tb, "0. 双 token");
  const wa = await wsOpen(A, ta);
  const wb = await wsOpen(B, tb);
  await sleep(500);
  check(wa.inbox.some(x => x.joined === A), "1. A 进房");
  check(wb.inbox.some(x => x.joined === B), "1. B 进房");

  console.log("=== A 设 kickUser=false ===");
  let s = await lpExec("/lp user " + A + " permission set chat.admin.kickUser false");
  check(s.includes("chat.admin.kickUser = false"), "2a. A 设 kick false", s);
  s = await lpExec("/lp check " + A + " chat.admin.kickUser");
  check(s.includes("拒绝 (false)"), "2b. check A kickUser 拒绝", s);

  console.log("=== 带 caller 踢（roster//kick 路径）→ 应被 LP 拦 ===");
  let r = await j("/api/admin/kick-user/" + encodeURIComponent(ROOM) + "?key=" + SUPER + "&name=" + encodeURIComponent(B) + "&caller=" + encodeURIComponent(A));
  check(r.status === 403 && String(r.t).includes("你无权执行该操作"), "3. caller=A 踢 B 被 LP 拦(403)", { status: r.status, t: r.t });

  console.log("=== 不带 caller 踢（管理后台/运维路径）→ 不受 LP 限 ===");
  r = await j("/api/admin/kick-user/" + encodeURIComponent(ROOM) + "?key=" + SUPER + "&name=" + encodeURIComponent(B));
  check(r.status === 200 && String(r.t).includes("已踢出"), "4. 不带 caller 踢 B 正常(200)", { status: r.status, t: r.t });
  await sleep(300);

  console.log("=== A unset 后带 caller 踢 → 恢复 ===");
  // B 重新进房
  const wb2 = await wsOpen(B, tb);
  await sleep(500);
  s = await lpExec("/lp user " + A + " permission unset chat.admin.kickUser");
  check(s.includes("已移除用户"), "5a. A unset kickUser", s);
  r = await j("/api/admin/kick-user/" + encodeURIComponent(ROOM) + "?key=" + SUPER + "&name=" + encodeURIComponent(B) + "&caller=" + encodeURIComponent(A));
  check(r.status === 200 && String(r.t).includes("已踢出"), "5b. unset 后 caller=A 踢 B 恢复(200)", { status: r.status, t: r.t });
  await sleep(300);

  console.log("=== 清理 ===");
  // 清 A 的 kickUser 状态已 unset；A 其他 LP 记录从 lp-smoke 已有，不清理以防影响
  try { wa.close(); } catch (_) {}
  try { wb.close(); } catch (_) {}
  try { wb2.close(); } catch (_) {}
  await sleep(300);

  console.log(fails === 0 ? "\n🎉 全部通过" : `\n⚠️ ${fails} 项失败`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
