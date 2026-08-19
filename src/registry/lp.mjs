// 🧪 v1.49 LuckPerms 风格权限系统（registry 层）
//
// 以 CHAT_PERMISSIONS.txt 的 chat.<域>.<动作> 节点体系为基础，提供 LuckPerms 语义的权限管理：
//   · User（直接权限 + 所属组）
//   · Group（权限 + 父组继承，BFS 防环）
//   · 通配符：*（全局）/ chat.admin.*（前缀通配符）
//   · 解析优先级：精确节点(3) > 前缀通配符(2) > 全局 *(1)；同层级 deny(false) 优先于 allow(true)
//   · 与基础层合并：LP 有显式结果 → 用 LP 结果（可给非管理员授权、可禁真管理员）；
//     无结果 → 由 chatroom.hasPerm 回退现有基础层（游客/登录用户/红青金管理员）
//
// 数据：reg.lp = { users: Map<name,{permissions:Map<node,bool>, groups:Set}>,
//                  groups: Map<gname,{permissions:Map<node,bool>, parents:Set}> }
// 持久化 storage key "lpData"
//
// 端点（全部经 registry.mjs dispatch "/lp/" 前缀）：
//   POST /lp/exec {cmd:"/lp ..."}   → {ok, text}  命令执行（chatroom 已做命令门控后调用）
//   GET  /lp/check?name&node        → {result}    内部解析（chatroom hasPerm / lp.manage 门控）
//   GET  /lp/data                   → {groups, users} 网页编辑器数据（api/admin/lp 鉴权后转发）
//
// 安全：
//   · L1 脱敏：整体 try/catch，异常只回 500"权限系统暂时不可用"
//   · 名称/节点/组名一律正则白名单
//   · 所有写操作完成后 saveLp
//   · /lp/exec 仅接受 chatroom 门控后的调用（命令执行者须是管理员或持 chat.lp.manage，见 chatroom.mjs）

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {status, headers: {"Content-Type": "application/json"}});
}

// 常量时间字符串比较（admin API 转发 /lp/exec 时的 super 校验）
function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- 白名单 ----------

const NAME_RE = /^[A-Za-z0-9_-]{1,24}$/;          // 组名 / 用户名
// 节点：仅字母数字下划线连字符与点；* 仅允许独立成节点或作为 .* 后缀
const NODE_RE = /^[A-Za-z0-9_.*-]{1,64}$/;

function validNode(node) {
  if (!NODE_RE.test(node)) return false;
  if (node.includes("*") && node !== "*" && !node.endsWith(".*")) return false;
  return true;
}

// true/false 解析：true/allow/1/yes → true；false/deny/0/no → false；其余 null
function parseBool(v) {
  if (v === undefined || v === null) return null;
  let s = String(v).trim().toLowerCase();
  if (s === "true" || s === "allow" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "deny" || s === "0" || s === "no") return false;
  return null;
}

// ---------- 数据 helper（惰性创建） ----------

function getGroup(reg, name, create) {
  let g = reg.lp.groups.get(name);
  if (!g && create) {
    g = {permissions: new Map(), parents: new Set()};
    reg.lp.groups.set(name, g);
  }
  return g || null;
}

function getUserLp(reg, name, create) {
  let u = reg.lp.users.get(name);
  if (!u && create) {
    u = {permissions: new Map(), groups: new Set()};
    reg.lp.users.set(name, u);
  }
  return u || null;
}

// BFS 收集用户所属全部组（自身组 + 递归父组，visited 防环）
function collectGroups(lp, userGroups) {
  const seen = new Set();
  const queue = [...(userGroups || [])];
  while (queue.length) {
    const g = queue.shift();
    if (seen.has(g)) continue;
    seen.add(g);
    const gp = lp.groups.get(g);
    if (gp) queue.push(...(gp.parents || []));
  }
  return seen;
}

// 节点匹配优先级：精确 3 / 前缀通配符 2 / 全局 1 / 不匹配 0
function nodeMatch(perm, node) {
  if (perm === node) return 3;
  if (perm.endsWith(".*")) {
    if (node.startsWith(perm.slice(0, -1))) return 2;
  }
  if (perm === "*") return 1;
  return 0;
}

// 解析用户对某节点的有效权限：true | false | null（未定义）
export function resolvePerm(lp, name, node) {
  const user = lp.users.get(name);
  if (!user) return null;
  const hits = [];
  for (const [perm, val] of user.permissions) {
    const p = nodeMatch(perm, node);
    if (p) hits.push({p, val});
  }
  const groups = collectGroups(lp, user.groups);
  for (const g of groups) {
    const gp = lp.groups.get(g);
    if (!gp) continue;
    for (const [perm, val] of gp.permissions) {
      const p = nodeMatch(perm, node);
      if (p) hits.push({p, val});
    }
  }
  if (!hits.length) return null;
  const maxP = Math.max(...hits.map(h => h.p));
  const top = hits.filter(h => h.p === maxP);
  // 同一层级 deny 优先（LuckPerms 语义）
  if (top.some(h => h.val === false)) return false;
  return true;
}

// ---------- 命令执行 ----------

function cmdErr(text) { return jsonRes({ok: false, text}); }
function cmdOk(text) { return jsonRes({ok: true, text}); }

async function execCommand(reg, cmd) {
  let tokens = String(cmd || "").trim().split(/\s+/);
  if (tokens[0] && tokens[0].toLowerCase() === "/lp") tokens.shift();
  if (!tokens.length) return cmdErr("用法: /lp <sub> ...（输入 /lp help 查看）");

  const sub = tokens[0].toLowerCase();
  const name = tokens[1];
  const m = (i) => (tokens[i] === undefined ? "" : tokens[i]);

  // ---------- 帮助 ----------
  if (sub === "help" || sub === "?") {
    return cmdOk(
      "LuckPerms 权限系统命令:\n" +
      "/lp creategroup <组名>           创建权限组\n" +
      "/lp deletegroup <组名>           删除权限组\n" +
      "/lp groups                       列出所有组\n" +
      "/lp group <组名> permission set <节点> [true|false]   组设权限(省略值=允许)\n" +
      "/lp group <组名> permission unset <节点>               移除组权限\n" +
      "/lp group <组名> permission clear                      清空组权限\n" +
      "/lp group <组名> parent add <父组> / parent remove <父组>  组继承\n" +
      "/lp group <组名> info            查看组详情\n" +
      "/lp user <用户名> permission set|unset|clear <节点> [true|false]  用户权限\n" +
      "/lp user <用户名> parent add|remove <组>               用户加入/退出组\n" +
      "/lp user <用户名> info            查看用户详情\n" +
      "/lp check <用户名> <节点>         测试权限解析结果\n" +
      "节点示例: chat.admin.kickUser / chat.admin.* / *（* = 全部权限）"
    );
  }

  if (!name && sub !== "groups" && sub !== "check" && sub !== "help" && sub !== "?") {
    return cmdErr("用法: /lp " + sub + " <名称> ...");
  }

  // ---------- 组管理 ----------
  if (sub === "creategroup") {
    if (!NAME_RE.test(name)) return cmdErr("组名仅限字母数字下划线连字符，1-24位");
    if (reg.lp.groups.has(name)) return cmdErr("组 " + name + " 已存在");
    getGroup(reg, name, true);
    await reg.saveLp();
    return cmdOk("已创建权限组 " + name);
  }

  if (sub === "deletegroup") {
    const g = getGroup(reg, name, false);
    if (!g) return cmdErr("组 " + name + " 不存在");
    reg.lp.groups.delete(name);
    // 从所有用户与组的引用中移除
    for (const [, u] of reg.lp.users) u.groups.delete(name);
    for (const [, gp] of reg.lp.groups) gp.parents.delete(name);
    await reg.saveLp();
    return cmdOk("已删除权限组 " + name);
  }

  if (sub === "groups") {
    if (!reg.lp.groups.size) return cmdOk("暂无权限组");
    const lines = ["权限组列表 (" + reg.lp.groups.size + " 个):"];
    for (const [gname, g] of [...reg.lp.groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      const inherit = [...(g.parents || [])].join(", ");
      lines.push("  " + gname + "  [权限 " + g.permissions.size + " 项" + (inherit ? " | 父组: " + inherit : "") + "]");
    }
    return cmdOk(lines.join("\n"));
  }

  // ---------- group <组> 子命令 ----------
  if (sub === "group") {
    const op = (m(2) || "").toLowerCase();
    const g = getGroup(reg, name, op !== "info" && op !== "permission" && op !== "permissions"); // info/读 不建
    if (!g) return cmdErr("组 " + name + " 不存在");

    if (op === "permission" || op === "permissions") {
      const action = (m(3) || "").toLowerCase();
      if (action === "set") {
        const node = m(4);
        if (!validNode(node)) return cmdErr("无效的权限节点: " + node);
        const val = parseBool(m(5)) ?? true; // 省略值默认允许
        g.permissions.set(node, val);
        await reg.saveLp();
        return cmdOk("组 " + name + " 权限 " + node + " = " + val);
      }
      if (action === "unset") {
        const node = m(4);
        if (!validNode(node)) return cmdErr("无效的权限节点: " + node);
        if (!g.permissions.has(node)) return cmdErr("组 " + name + " 没有权限 " + node);
        g.permissions.delete(node);
        await reg.saveLp();
        return cmdOk("已移除组 " + name + " 的权限 " + node);
      }
      if (action === "clear") {
        if (!g.permissions.size) return cmdErr("组 " + name + " 没有权限");
        g.permissions.clear();
        await reg.saveLp();
        return cmdOk("已清空组 " + name + " 的权限");
      }
      return cmdErr("用法: /lp group <组名> permission set|unset|clear <节点> [true|false]");
    }

    if (op === "parent") {
      const action = (m(3) || "").toLowerCase();
      const pname = m(4);
      if (!NAME_RE.test(pname)) return cmdErr("父组名仅限字母数字下划线连字符，1-24位");
      if (pname === name) return cmdErr("组不能继承自己");
      if (action === "add") {
        const pg = getGroup(reg, pname, true); // 父组不存在则创建（LuckPerms 语义）
        if (!pg) return cmdErr("组 " + pname + " 不存在");
        // 防环：目标父组链上不能出现本组
        const seen = new Set([name]);
        const queue = [...(pg.parents || [])];
        let cycle = false;
        while (queue.length) {
          const cur = queue.shift();
          if (seen.has(cur)) { cycle = true; break; }
          seen.add(cur);
          const cg = reg.lp.groups.get(cur);
          if (cg) queue.push(...(cg.parents || []));
        }
        if (cycle) return cmdErr("检测到继承环，已拒绝");
        g.parents.add(pname);
        await reg.saveLp();
        return cmdOk("组 " + name + " 现在继承组 " + pname);
      }
      if (action === "remove") {
        if (!g.parents.has(pname)) return cmdErr("组 " + name + " 没有继承组 " + pname);
        g.parents.delete(pname);
        await reg.saveLp();
        return cmdOk("组 " + name + " 已解除继承组 " + pname);
      }
      return cmdErr("用法: /lp group <组名> parent add|remove <父组>");
    }

    if (op === "info") {
      const lines = ["权限组 " + name + ":"];
      lines.push("  直接权限 (" + g.permissions.size + "):");
      if (g.permissions.size) {
        for (const [node, val] of [...g.permissions].sort((a, b) => a[0].localeCompare(b[0]))) {
          lines.push("    " + node + " = " + val);
        }
      } else {
        lines.push("    （无）");
      }
      const inherit = [...(g.parents || [])];
      lines.push("  父组: " + (inherit.length ? inherit.join(", ") : "（无）"));
      // 继承后的完整权限（含父组）
      const resolved = new Map();
      const allGroups = collectGroups({users: reg.lp.users, groups: reg.lp.groups}, g.parents);
      for (const pgName of allGroups) {
        const pg = reg.lp.groups.get(pgName);
        if (pg) for (const [node, val] of pg.permissions) resolved.set(node, val);
      }
      if (resolved.size) {
        lines.push("  继承权限 (" + resolved.size + "):");
        for (const [node, val] of [...resolved].sort((a, b) => a[0].localeCompare(b[0]))) {
          lines.push("    " + node + " = " + val);
        }
      }
      // 使用该组的用户数
      const memberCount = [...reg.lp.users.values()].filter(u => u.groups.has(name)).length;
      lines.push("  成员: " + memberCount + " 个用户");
      return cmdOk(lines.join("\n"));
    }

    return cmdErr("未知子命令: /lp group " + name + " " + op + "（/lp help 查看用法）");
  }

  // ---------- user <用户> 子命令 ----------
  if (sub === "user") {
    const op = (m(2) || "").toLowerCase();
    const u = getUserLp(reg, name, op !== "info"); // info 只读不建
    if (!u) return cmdErr("用户 " + name + " 不存在");

    if (op === "permission" || op === "permissions") {
      const action = (m(3) || "").toLowerCase();
      if (action === "set") {
        const node = m(4);
        if (!validNode(node)) return cmdErr("无效的权限节点: " + node);
        const val = parseBool(m(5)) ?? true;
        u.permissions.set(node, val);
        await reg.saveLp();
        return cmdOk("用户 " + name + " 权限 " + node + " = " + val);
      }
      if (action === "unset") {
        const node = m(4);
        if (!validNode(node)) return cmdErr("无效的权限节点: " + node);
        if (!u.permissions.has(node)) return cmdErr("用户 " + name + " 没有权限 " + node);
        u.permissions.delete(node);
        await reg.saveLp();
        return cmdOk("已移除用户 " + name + " 的权限 " + node);
      }
      if (action === "clear") {
        if (!u.permissions.size) return cmdErr("用户 " + name + " 没有权限");
        u.permissions.clear();
        await reg.saveLp();
        return cmdOk("已清空用户 " + name + " 的权限");
      }
      return cmdErr("用法: /lp user <用户名> permission set|unset|clear <节点> [true|false]");
    }

    if (op === "parent") {
      const action = (m(3) || "").toLowerCase();
      const gname = m(4);
      if (!NAME_RE.test(gname)) return cmdErr("组名仅限字母数字下划线连字符，1-24位");
      if (action === "add") {
        const g = getGroup(reg, gname, true); // 组不存在则创建
        if (!g) return cmdErr("组 " + gname + " 不存在");
        u.groups.add(gname);
        await reg.saveLp();
        return cmdOk("用户 " + name + " 已加入组 " + gname);
      }
      if (action === "remove") {
        if (!u.groups.has(gname)) return cmdErr("用户 " + name + " 不在组 " + gname);
        u.groups.delete(gname);
        await reg.saveLp();
        return cmdOk("用户 " + name + " 已退出组 " + gname);
      }
      return cmdErr("用法: /lp user <用户名> parent add|remove <组>");
    }

    if (op === "info") {
      const lines = ["用户 " + name + " 的权限:"];
      lines.push("  直接权限 (" + u.permissions.size + "):");
      if (u.permissions.size) {
        for (const [node, val] of [...u.permissions].sort((a, b) => a[0].localeCompare(b[0]))) {
          lines.push("    " + node + " = " + val);
        }
      } else {
        lines.push("    （无）");
      }
      const groups = [...(u.groups || [])];
      lines.push("  所属组: " + (groups.length ? groups.join(", ") : "（无）"));
      return cmdOk(lines.join("\n"));
    }

    // 🧪 v1.50 网页编辑器：删除用户 LP 记录（仅权限数据，不删聊天账号）
    if (op === "delete") {
      reg.lp.users.delete(name);
      await reg.saveLp();
      return cmdOk("已删除用户 " + name + " 的权限记录（聊天账号不受影响）");
    }

    return cmdErr("未知子命令: /lp user " + name + " " + op + "（/lp help 查看用法）");
  }

  // ---------- check ----------
  if (sub === "check") {
    const target = name;
    const node = m(2);
    if (!validNode(node)) return cmdErr("无效的权限节点: " + node);
    const r = resolvePerm(reg.lp, target, node);
    const label = r === null ? "未定义（回退基础层）" : (r ? "允许 (true)" : "拒绝 (false)");
    return cmdOk("权限检查: " + target + " 的 " + node + " → " + label);
  }

  return cmdErr("未知子命令: /lp " + sub + "（/lp help 查看用法）");
}

// ---------- 主入口 ----------

export async function handleLp(reg, request, url) {
  try {
    const path = url.pathname;

    // 命令执行：chatroom 门控后调用（POST，body {cmd}）
    if (path === "/lp/exec") {
      if (request.method !== "POST") return cmdErr("请使用POST");
      // 🧪 v1.50 网页编辑器：admin API 转发时带 auth=super key，非 super 一律 403；
      //    chatroom 内部调用不带 auth（已做 isAdminSession / chat.lp.manage 门控）→ 放行
      let auth = url.searchParams.get("auth") || "";
      if (auth && !(reg.env && reg.env.ADMIN_SECRET_KEY && safeEqual(auth, reg.env.ADMIN_SECRET_KEY))) {
        return jsonRes({error: "无权限管理权限系统"}, 403);
      }
      let body;
      try { body = await request.json(); } catch (e) { return cmdErr("请求解析失败"); }
      let cmdStr = body && body.cmd || "";
      console.log("LPEXEC inst=" + (reg._instId || "?") + " loaded=" + (reg._loaded === true) + " users=" + reg.lp.users.size + " groups=" + reg.lp.groups.size + " cmd=" + String(cmdStr).slice(0, 60));
      return await execCommand(reg, cmdStr);
    }

    // 内部解析：chatroom hasPerm / lp.manage 门控（GET）
    if (path === "/lp/check") {
      const name = url.searchParams.get("name") || "";
      const node = url.searchParams.get("node") || "";
      if (!validNode(node)) return jsonRes({result: null});
      const result = resolvePerm(reg.lp, name, node);
      console.log("LPCHECK inst=" + (reg._instId || "?") + " loaded=" + (reg._loaded === true) + " users=" + reg.lp.users.size + " groups=" + reg.lp.groups.size + " has=" + reg.lp.users.has(name) + " name=" + name + " node=" + node + " result=" + result);
      return jsonRes({result});
    }

    // 网页编辑器数据（api/admin/lp 鉴权后转发）
    if (path === "/lp/data") {
      const groups = [];
      for (const [gname, g] of [...reg.lp.groups].sort((a, b) => a[0].localeCompare(b[0]))) {
        groups.push({
          name: gname,
          permissions: [...g.permissions],
          parents: [...(g.parents || [])],
          members: [...reg.lp.users].filter(([, u]) => u.groups.has(gname)).map(([un]) => un)
        });
      }
      // 🧪 v1.50 网页编辑器：合并全部注册用户（registeredUsers）+ LP 记录用户，
      //    无 LP 记录的注册用户也能被选中添加权限（permissions/groups 为空）
      const lpNames = new Set(reg.lp.users.keys());
      const allNames = new Set(reg.registeredUsers ? reg.registeredUsers.keys() : []);
      for (const n of lpNames) allNames.add(n);
      const users = [];
      for (const uname of [...allNames].sort((a, b) => a.localeCompare(b))) {
        const u = reg.lp.users.get(uname);
        users.push({
          name: uname,
          permissions: u ? [...u.permissions] : [],
          groups: u ? [...(u.groups || [])] : []
        });
      }
      return jsonRes({ok: true, groups, users});
    }

    return null; // registry 兜底 404
  } catch (e) {
    // 🔒 L1 脱敏
    console.error("lp handler error:", e && e.message);
    return jsonRes({error: "权限系统暂时不可用"}, 500);
  }
}
