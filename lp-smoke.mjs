// v1.49 LuckPerms 权限系统线上冒烟脚本 v2（诊断版）
const BASE = "https://chat.liuxiyu.cn";
const ROOM = "lp_smoke_room3";
const A = "hntest_1785912234", AP = "test123456";
const B = "hntest533931", BP = "test123456";
const SUPER = "9167c945079746dbfa6cd249df4ad64f102e9e34a366624539ee3ac7cfefa16e";

async function j(path, opts = {}) {
  const r = await fetch(BASE + path, { headers: { "Content-Type": "application/json", "User-Agent": "CloudChat-Lxy" }, ...opts });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: r.status, d };
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
    ws.addEventListener("close", e => console.error("  WS close " + name + ":", e.code, e.reason));
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
const errOf = x => (x && typeof x.error === "string" ? x.error : "");
// A 执行 /lp 命令并等待含某关键词的 system 响应
async function lpA(ws, cmd, kw) {
  ws.send(JSON.stringify({ message: cmd }));
  const m = await waitMsg(ws, x => sysOf(x).includes(kw));
  return m ? sysOf(m) : null;
}
// B 发动作（kick/pin），等待任意 error/system
async function actB(ws, obj) {
  ws.send(JSON.stringify(obj));
  return await waitMsg(ws, x => errOf(x).length > 0 || sysOf(x).length > 0);
}

async function main() {
  console.log("=== Phase 0: 登录 ===");
  const la = await j("/api/login", { method: "POST", body: JSON.stringify({ name: A, password: AP }) });
  const lb = await j("/api/login", { method: "POST", body: JSON.stringify({ name: B, password: BP }) });
  const ta = la.d && la.d.token, tb = lb.d && lb.d.token;
  check(!!ta && !!tb, "0. 双 token");

  console.log("\n=== Phase 1: A 红标 + 建 WS ===");
  const r = await j("/api/admin/tag/set?key=" + SUPER + "&name=" + encodeURIComponent(A) + "&tag=red&color=red");
  console.log("  tag/set:", r.status, r.d);
  const wsA = await wsOpen(A, ta);
  const wsB = await wsOpen(B, tb);
  await sleep(600);
  check(wsA.inbox.some(x => x.joined === A), "1. A 进房");
  check(wsB.inbox.some(x => x.joined === B), "1. B 进房");

  console.log("\n=== Phase 2: 门控 ===");
  wsB.send(JSON.stringify({ message: "/lp groups" }));
  let m = await waitMsg(wsB, x => errOf(x).length > 0 || sysOf(x).length > 0);
  check(errOf(m).includes("无权限使用 /lp"), "2. B 被拒", m);
  console.log("  A /lp groups →", await lpA(wsA, "/lp groups", "暂无权限组") ?? "TIMEOUT");

  console.log("\n=== Phase 3: B 未授权踢人基线（普通用户默认无权） ===");
  m = await actB(wsB, { type: "kick", target: "ghost1_xyz" });
  check(errOf(m).includes("你无权执行该操作"), "3a. B 普通用户踢人被拒", m);

  console.log("\n=== Phase 4: A 执行 LP 链（组授权 B kickUser） ===");
  let s = await lpA(wsA, "/lp creategroup thatcankick", "已创建权限组"); check(!!s, "4a. creategroup", s);
  s = await lpA(wsA, "/lp group thatcankick permission set chat.admin.kickUser true", "chat.admin.kickUser = true"); check(!!s, "4b. 组授 kickUser", s);
  s = await lpA(wsA, `/lp user ${B} parent add thatcankick`, "已加入组"); check(!!s, "4c. B 入组", s);
  s = await lpA(wsA, `/lp check ${B} chat.admin.kickUser`, "允许"); check(!!s, "4d. exec check B kickUser 允许", s);
  s = await lpA(wsA, `/lp user ${B} info`, "权限"); console.log("  📋 B info:", s);

  console.log("\n=== Phase 5: B 直接授权 pin（测 hasPerm GET 路径） ===");
  s = await lpA(wsA, `/lp user ${B} permission set chat.admin.pinMessage true`, "chat.admin.pinMessage = true"); check(!!s, "5a. B 直接授 pin", s);
  // pin 成功时广播 {type:"pinned", ...}（无 error/system 字段），等该广播即证 hasPerm 放行
  wsB.send(JSON.stringify({ type: "pin", text: "lp-diag-pin", timestamp: Date.now() }));
  let pm = await waitMsg(wsB, x => x.type === "pinned", 6000);
  check(!!pm, "5b. B pin 走通（hasPerm 读到 LP）", pm && pm.pinned);

  console.log("\n=== Phase 6: B 授权后踢人（测组继承 hasPerm） ===");
  m = await actB(wsB, { type: "kick", target: "ghost1_xyz" });
  check(errOf(m).includes("未找到用户 ghost1_xyz"), "6a. B 授权后能踢（hasPerm 生效）", m);

  console.log("\n=== Phase 6.5: B 退出组后恢复无权 ===");
  s = await lpA(wsA, `/lp user ${B} parent remove thatcankick`, "已退出组"); check(!!s, "6b. B 退出组", s);
  m = await actB(wsB, { type: "kick", target: "ghost1_xyz" });
  check(errOf(m).includes("你无权执行该操作"), "6c. B 退出组后踢人被拒", m);
  s = await lpA(wsA, `/lp user ${B} parent add thatcankick`, "已加入组"); check(!!s, "6d. B 重新入组", s);

  console.log("\n=== Phase 7: LP false 覆盖管理员 ===");
  s = await lpA(wsA, `/lp user ${A} permission set chat.admin.pinMessage false`, "chat.admin.pinMessage = false"); check(!!s, "7a. A 设 false", s);
  wsA.send(JSON.stringify({ type: "pin", text: "lp-diag-pin2", timestamp: Date.now() }));
  m = await waitMsg(wsA, x => errOf(x).includes("仅管理员可置顶消息"), 4000);
  check(!!m, "7b. A pin 被拒（LP false 覆盖红标）", m);
  s = await lpA(wsA, `/lp user ${A} permission unset chat.admin.pinMessage`, "已移除用户"); check(!!s, "7c. A unset false", s);

  console.log("\n=== Phase 7.5: LP false 硬拦管理员踢人（用户核心场景） ===");
  s = await lpA(wsA, `/lp user ${A} permission set chat.admin.kickUser false`, "chat.admin.kickUser = false"); check(!!s, "7d. A 设 kick false", s);
  wsA.send(JSON.stringify({ type: "kick", target: "ghost1_xyz" }));
  m = await waitMsg(wsA, x => errOf(x).includes("你无权执行该操作"), 4000);
  check(!!m, "7e. A(红标管理员)踢人被拒（LP false 硬拦）", m);
  s = await lpA(wsA, `/lp user ${A} permission unset chat.admin.kickUser`, "已移除用户"); check(!!s, "7f. A unset kick false", s);

  console.log("\n=== Phase 8: 清理 ===");
  s = await lpA(wsA, "/lp deletegroup thatcankick", "已删除权限组"); check(!!s, "8a. 删组", s);
  s = await lpA(wsA, "/lp groups", "暂无权限组"); check(!!s, "8b. 组空", s);
  const r2 = await j("/api/admin/tag/remove?key=" + SUPER + "&name=" + encodeURIComponent(A));
  check(r2.status === 200, "8c. 移除红标", r2.status);
  wsA.close(); wsB.close();
  await sleep(300);

  console.log(fails === 0 ? "\n🎉 全部通过" : `\n⚠️ ${fails} 项失败`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
