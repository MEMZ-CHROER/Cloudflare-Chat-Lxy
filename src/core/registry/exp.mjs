// ⭐ 经验等级管理（管理后台用）— 查看 + 调整用户经验
// 写端点（set/add/batch）仅管理方（adminAuthorized）可调用；
// registry 层 adminExactPaths 已把写端点纳入 needsAdmin 校验（防未授权直连）
import { levelForExp } from "../utils.mjs";
import { checkAchievements } from "./achievements.mjs";

export async function handleExp(reg, request, url) {
  switch (url.pathname) {
    case "/exp/get": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400, headers: {"Content-Type": "application/json"}});
      let user = reg.registeredUsers.get(name);
      if (!user) return new Response(JSON.stringify({name, exp: 0, level: 1, expCurrent: 0, expNext: 100}), {headers: {"Content-Type": "application/json"}});
      let info = levelForExp(user.exp || 0);
      return new Response(JSON.stringify({name, exp: user.exp || 0, level: info.level, expCurrent: info.current, expNext: info.next}), {headers: {"Content-Type": "application/json"}});
    }

    case "/exp/all": {
      let result = {};
      for (let [name, user] of reg.registeredUsers) {
        let exp = user.exp || 0;
        result[name] = {exp, level: levelForExp(exp).level};
      }
      return new Response(JSON.stringify(result), {headers: {"Content-Type": "application/json"}});
    }

    case "/exp/set": {
      // 🔒 安全修复（M15）：写端点仅管理方（带有效管理密钥 auth）可调用（registry 层纵深防御）
      if (!reg.adminAuthorized(url.searchParams.get("auth") || "")) return new Response("无权操作", {status: 403});
      let name = url.searchParams.get("name");
      let raw = url.searchParams.get("exp");
      if (!name) return new Response("请提供用户名", {status: 400});
      if (raw == null || raw === "") return new Response("请提供有效经验值", {status: 400});
      let exp = parseInt(raw, 10);
      if (isNaN(exp) || exp < 0 || exp > 99999999) return new Response("经验值无效", {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!user) return new Response("用户不存在", {status: 404});
      user.exp = exp;
      await reg.saveRegisteredUsers();
      let info = levelForExp(exp);
      let newAch = await checkAchievements(reg, name, user);
      return new Response(JSON.stringify({ok: true, name, exp, level: info.level, achievements: newAch}), {headers: {"Content-Type": "application/json"}});
    }

    case "/exp/add": {
      // 🔒 安全修复（M15）：写端点仅管理方（带有效管理密钥 auth）可调用（registry 层纵深防御）
      if (!reg.adminAuthorized(url.searchParams.get("auth") || "")) return new Response("无权操作", {status: 403});
      let name = url.searchParams.get("name");
      let raw = url.searchParams.get("amount");
      if (!name) return new Response("请提供用户名", {status: 400});
      if (raw == null || raw === "") return new Response("请提供有效经验值", {status: 400});
      let amount = parseInt(raw, 10);
      if (isNaN(amount) || amount === 0 || Math.abs(amount) > 99999999) return new Response("经验值无效", {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!user) return new Response("用户不存在", {status: 404});
      let oldExp = user.exp || 0;
      let newExp = Math.max(0, oldExp + amount);
      user.exp = newExp;
      await reg.saveRegisteredUsers();
      let info = levelForExp(newExp);
      let newAch = await checkAchievements(reg, name, user);
      return new Response(JSON.stringify({ok: true, name, exp: newExp, delta: newExp - oldExp, level: info.level, achievements: newAch}), {headers: {"Content-Type": "application/json"}});
    }

    case "/exp/batch": {
      // 🔒 安全修复（M15）：写端点仅管理方（带有效管理密钥 auth）可调用（registry 层纵深防御）
      if (!reg.adminAuthorized(url.searchParams.get("auth") || "")) return new Response("无权操作", {status: 403});
      let names = url.searchParams.get("names");
      let raw = url.searchParams.get("exp") || url.searchParams.get("amount");
      let action = url.searchParams.get("action") || "add";
      if (!names) return new Response("请提供用户名列表", {status: 400});
      if (raw == null || raw === "") return new Response("请提供有效经验值", {status: 400});
      let value = parseInt(raw, 10);
      if (isNaN(value) || value === 0 || Math.abs(value) > 99999999) return new Response("经验值无效", {status: 400});
      let nameList = names.split(",").map(n => n.trim()).filter(n => n);
      if (!nameList.length) return new Response("请提供至少一个用户名", {status: 400});
      let changed = 0;
      for (let nm of nameList) {
        let user = reg.registeredUsers.get(nm);
        if (!user) continue;
        user.exp = action === "set" ? Math.max(0, value) : Math.max(0, (user.exp || 0) + value);
        changed++;
      }
      await reg.saveRegisteredUsers();
      // 批量改值后统一跑一遍成就检查（等级类成就随经验变化解锁）
      for (let nm of nameList) {
        let user = reg.registeredUsers.get(nm);
        if (user) { try { await checkAchievements(reg, nm, user); } catch (e) {} }
      }
      return new Response(JSON.stringify({ok: true, changed}), {headers: {"Content-Type": "application/json"}});
    }

    default:
      return null;
  }
}
