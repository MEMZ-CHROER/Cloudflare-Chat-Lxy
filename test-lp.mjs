// 本地单元测试：LP 权限系统（模拟 registry 环境，不依赖网络）
import { handleLp, resolvePerm } from "./src/registry/lp.mjs";

function makeReg() {
  return {
    lp: { users: new Map(), groups: new Map() },
    saveLp: async function () {}
  };
}

async function exec(reg, cmd) {
  let req = { method: "POST", json: async () => ({ cmd }) };
  let url = new URL("https://dummy/lp/exec");
  let r = await handleLp(reg, req, url);
  let d = await r.json();
  return d;
}

async function check(reg, name, node) {
  let url = new URL("https://dummy/lp/check?name=" + encodeURIComponent(name) + "&node=" + encodeURIComponent(node));
  let r = await handleLp(reg, { method: "GET" }, url);
  return (await r.json()).result;
}

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log("  ✅ " + label); }
  else { fail++; console.log("  ❌ " + label); }
}

console.log("== 用户示例：组授权 + 继承 ==");
{
  let reg = makeReg();
  let r;
  r = await exec(reg, "/lp creategroup thatcankick"); assert(r.ok && r.text.includes("创建"), "creategroup thatcankick");
  r = await exec(reg, "/lp creategroup thatcankick"); assert(!r.ok, "重复创建被拒");
  r = await exec(reg, "/lp group thatcankick permission set chat.admin.kickUser true"); assert(r.ok, "组授 kickUser");
  r = await exec(reg, "/lp user LIU parent add thatcankick"); assert(r.ok, "LIU 加入组");
  assert(await check(reg, "LIU", "chat.admin.kickUser") === true, "LIU 继承组 → kickUser=true");
  assert(await check(reg, "LIU", "chat.admin.pinMessage") === null, "未授节点 → null(回退基础层)");
  assert(await check(reg, "nobody", "chat.admin.kickUser") === null, "无记录用户 → null");
}

console.log("== 通配符 * ==");
{
  let reg = makeReg();
  await exec(reg, "/lp user LIU permission set * true");
  assert(await check(reg, "LIU", "chat.admin.kickUser") === true, "* → kickUser=true");
  assert(await check(reg, "LIU", "chat.super.destroyRoom") === true, "* → destroyRoom=true");
  assert(await check(reg, "LIU", "chat.lp.manage") === true, "* → lp.manage=true");
}

console.log("== 前缀通配符 chat.admin.* ==");
{
  let reg = makeReg();
  await exec(reg, "/lp creategroup mods");
  await exec(reg, "/lp group mods permission set chat.admin.* true");
  await exec(reg, "/lp user LIU parent add mods");
  assert(await check(reg, "LIU", "chat.admin.kickUser") === true, "chat.admin.* → kickUser=true");
  assert(await check(reg, "LIU", "chat.admin.pinMessage") === true, "chat.admin.* → pinMessage=true");
  assert(await check(reg, "LIU", "chat.super.destroyRoom") === null, "chat.admin.* 不含 super");
  assert(await check(reg, "LIU", "chat.user.send") === null, "chat.admin.* 不含 user 域? (user 域由基础层覆盖, LP 未定义→null)");
}

console.log("== deny 优先（用户直接 false 覆盖组继承 true）==");
{
  let reg = makeReg();
  await exec(reg, "/lp creategroup admins");
  await exec(reg, "/lp group admins permission set chat.admin.kickUser true");
  await exec(reg, "/lp user LIU parent add admins");
  assert(await check(reg, "LIU", "chat.admin.kickUser") === true, "组 true → true");
  await exec(reg, "/lp user LIU permission set chat.admin.kickUser false");
  assert(await check(reg, "LIU", "chat.admin.kickUser") === false, "用户显式 false 覆盖组 true");
  await exec(reg, "/lp user LIU permission unset chat.admin.kickUser");
  assert(await check(reg, "LIU", "chat.admin.kickUser") === true, "unset 后回组继承 true");
}

console.log("== 组继承传递 + 环检测 ==");
{
  let reg = makeReg();
  await exec(reg, "/lp creategroup a");
  await exec(reg, "/lp creategroup b");
  await exec(reg, "/lp creategroup c");
  await exec(reg, "/lp group a permission set chat.admin.kickUser true");
  await exec(reg, "/lp group b parent add a");
  await exec(reg, "/lp group c parent add b");
  await exec(reg, "/lp user LIU parent add c");
  assert(await check(reg, "LIU", "chat.admin.kickUser") === true, "c→b→a 传递继承 true");
  let r = await exec(reg, "/lp group a parent add c");
  assert(!r.ok && r.text.includes("环"), "a 继承 c 检测到环");
}

console.log("== 权限值解析 / 参数校验 ==");
{
  let reg = makeReg();
  let r = await exec(reg, "/lp creategroup 组名!@#"); assert(!r.ok, "非法组名被拒");
  r = await exec(reg, "/lp user LIU permission set chat.admin.kickUser true"); assert(r.ok, "set 显式 true");
  r = await exec(reg, "/lp user LIU permission set chat.admin.kickUser deny"); assert(r.ok && r.text.includes("false"), "deny → false");
  r = await exec(reg, "/lp user LIU permission set chat.admin.kickUser badvalue"); assert(r.ok && r.text.includes("true"), "非法值默认 true");
  r = await exec(reg, "/lp user LIU permission set chat.admin.kicku*ser true"); assert(!r.ok, "非法节点(中间*)被拒");
}

console.log("== 数据导出 /lp/data ==");
{
  let reg = makeReg();
  await exec(reg, "/lp creategroup mods");
  await exec(reg, "/lp user LIU parent add mods");
  await exec(reg, "/lp user LIU permission set chat.admin.kickUser true");
  let url = new URL("https://dummy/lp/data");
  let r = await handleLp(reg, { method: "GET" }, url);
  let d = await r.json();
  assert(d.ok && d.groups.length === 1 && d.groups[0].name === "mods", "groups 导出");
  assert(d.groups[0].members.includes("LIU"), "组 members 导出");
  assert(d.users[0].permissions[0][0] === "chat.admin.kickUser", "用户 permissions 导出");
}

console.log("== 复数别名 permissions（容忍用户误写）==");
{
  let reg = makeReg();
  let r = await exec(reg, "/lp user LIU permissions set chat.admin.kickUser true");
  assert(r.ok && r.text.includes("chat.admin.kickUser = true"), "user permissions(复数) set 正常");
  assert(await check(reg, "LIU", "chat.admin.kickUser") === true, "复数设置生效");
  r = await exec(reg, "/lp creategroup mods");
  assert(r.ok, "creategroup mods 正常");
  r = await exec(reg, "/lp group mods permissions set chat.admin.ban true");
  assert(r.ok, "group permissions(复数) 正常");
  r = await exec(reg, "/lp user LIU permissions unset chat.admin.kickUser");
  assert(r.ok, "user permissions(复数) unset 正常");
  r = await exec(reg, "/lp user LIU permissions set chat.admin.pin true");
  assert(r.ok, "复数再次 set 正常");
  r = await exec(reg, "/lp user LIU permissions clear");
  assert(r.ok, "user permissions(复数) clear 正常");
}

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
