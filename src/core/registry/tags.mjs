import { safeEqual, getVipLevel } from "../utils.mjs";
// 标签管理

// 🔒 M16：特权标签判定——聊天室 isAdminSession 认可 tag/color 为 red、cyan（管理员色），border 为 gold（超管金边）；
// getVipLevel 识别 VIP1-10/VIP+/MVP（VIP 权益标签）。特权标签/灰色封禁仅限超管设置。
function isPrivilegedTag(tag, color, border) {
  let t = String(tag || "").toLowerCase();
  let c = String(color || "").toLowerCase();
  let b = String(border || "").toLowerCase();
  if (t === "red" || t === "cyan" || c === "red" || c === "cyan" || b === "gold") return true;
  return !!getVipLevel(tag);
}

// 超管判定：与 api/admin.mjs 一致，仅 ADMIN_SECRET_KEY 为 super（普通 ADMIN_KEY 为 admin）
function isSuperAuth(reg, auth) {
  if (!auth) return false;
  if (reg.env && reg.env.ADMIN_SECRET_KEY && safeEqual(auth, reg.env.ADMIN_SECRET_KEY)) return true;
  return false;
}

export async function handleTags(reg, request, url) {
  switch (url.pathname) {
    case "/tag/set": {
      let name = url.searchParams.get("name");
      let tag = url.searchParams.get("tag");
      let color = url.searchParams.get("color") || "";
      let border = url.searchParams.get("border") || "";
      if (!name) return new Response("请提供用户名", { status: 400 });
      if (!tag) return new Response("请提供标签", { status: 400 });
      // 🔒 M16 修复：特权标签（管理/VIP）与灰色封禁均仅限超管（ADMIN_SECRET_KEY），普通 admin 拒绝
      let auth = url.searchParams.get("auth") || "";
      if (isPrivilegedTag(tag, color, border) && !isSuperAuth(reg, auth)) {
        return new Response("特权标签（管理/VIP）仅限超管设置", { status: 403 });
      }
      if (color === "gray" && !isSuperAuth(reg, auth)) {
        return new Response("灰色标签（封禁）仅限超管操作", { status: 403 });
      }
      let userInv = reg.userInventory.get(name);
      if (userInv) {
        for (let [id, info] of userInv) {
          if (info.equipped) {
            return new Response("用户 " + name + " 正在使用商城标签，无法通过此方式修改", { status: 400 });
          }
        }
      }
      reg.tags.set(name, {tag, color, border});
      await reg.saveTags();
      if (color === "gray") {
        reg.banned.add(name);
        reg.globalBlacklist.add(name);
        await reg.saveBanned();
        await reg.saveGlobalBlacklist();
      }
      let colorText = color ? " (颜色: " + color + ")" : "";
      let borderText = border ? " (边框: " + border + ")" : "";
      return new Response("已为 " + name + " 设置标签 [" + tag + "]" + colorText + borderText, { status: 200 });
    }

    case "/tag/remove": {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供用户名", { status: 400 });
      let oldTag = reg.tags.get(name);
      let oldColor = oldTag ? (typeof oldTag === "string" ? "" : oldTag.color || "") : "";
      // 🔒 M16 修复：解除灰色标签（封禁/拉黑）同样仅限超管，防普通 admin 越权解封
      if (oldColor === "gray") {
        let auth = url.searchParams.get("auth") || "";
        if (!isSuperAuth(reg, auth)) {
          return new Response("解除灰色标签（封禁）仅限超管操作", { status: 403 });
        }
      }
      reg.tags.delete(name);
      await reg.saveTags();
      if (oldColor === "gray") {
        reg.banned.delete(name);
        reg.globalBlacklist.delete(name);
        await reg.saveBanned();
        await reg.saveGlobalBlacklist();
      }
      return new Response("已移除 " + name + " 的标签", { status: 200 });
    }

    case "/tag/get": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({tag: "", color: ""}), {
        headers: {"Content-Type": "application/json"}
      });
      let td = reg.tags.get(name) || {tag: "", color: ""};
      if (typeof td === "string") td = {tag: td, color: ""};
      return new Response(JSON.stringify(td), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/tag/list": {
      let result = {};
      for (let [name, td] of reg.tags) {
        if (typeof td === "string") td = {tag: td, color: ""};
        result[name] = td;
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    default:
      return null;
  }
}
