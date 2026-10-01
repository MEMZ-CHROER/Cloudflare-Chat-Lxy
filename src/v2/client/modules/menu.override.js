// v2 menu override — user right-click menu actions
import { state } from "../store.js";

export function hideUserMenu() {
  const menu = document.getElementById("user-menu");
  if (menu) {
    menu.classList.remove("show");
    menu.style.display = "none";
  }
}

export async function handleMenuAction(action) {
  const menu = document.getElementById("user-menu");
  if (!menu) return;
  const target = menu.dataset.target;
  if (!target) return;
  hideUserMenu();
  const token = localStorage.getItem("chat_token") || "";
  const isAdmin = document.cookie.includes("admin_logged=1");
  const k = localStorage.getItem("admin_key") || "";

  switch (action) {
    case "at": {
      const input = document.getElementById("chat-input");
      if (input) {
        const pos = input.selectionStart || input.value.length;
        const before = input.value.substring(0, pos);
        const after = input.value.substring(pos);
        input.value = before + "@" + target + " " + after;
        input.setSelectionRange(pos + target.length + 2, pos + target.length + 2);
        input.focus();
      }
      break;
    }
    case "dm": {
      if (target === state.user?.name) {
        window.__v2_showToast?.("不能给自己发私信", "error");
        break;
      }
      window.__v2_openDM?.(target);
      break;
    }
    case "profile": {
      window.__v2_showUserProfile?.(target);
      break;
    }
    case "note": {
      const notes = JSON.parse(localStorage.getItem("v2_notes") || "{}");
      const existing = notes[target] || "";
      const alias = prompt("输入「" + target + "」的备注名（留空清除）:", existing);
      if (alias !== null) {
        if (alias.trim()) {
          notes[target] = alias.trim();
        } else {
          delete notes[target];
        }
        localStorage.setItem("v2_notes", JSON.stringify(notes));
        window.__v2_showToast?.(alias?.trim() ? "已设置备注: " + alias.trim() : "已清除备注", "success");
      }
      break;
    }
    case "block": {
      const blocked = JSON.parse(localStorage.getItem("v2_blocked") || "[]");
      if (!blocked.includes(target)) {
        blocked.push(target);
        localStorage.setItem("v2_blocked", JSON.stringify(blocked));
        window.__v2_showToast?.("已屏蔽 " + target, "success");
      }
      break;
    }
    case "unblock": {
      let blocked = JSON.parse(localStorage.getItem("v2_blocked") || "[]");
      blocked = blocked.filter(function(u) { return u !== target; });
      localStorage.setItem("v2_blocked", JSON.stringify(blocked));
      window.__v2_showToast?.("已取消屏蔽 " + target, "success");
      break;
    }
    case "pay": {
      if (target === state.user?.name) {
        window.__v2_showToast?.("不能给自己转账", "error");
        break;
      }
      const amt = prompt("输入要转给「" + target + "」的积分数量:");
      if (!amt || isNaN(amt) || parseInt(amt) <= 0) {
        window.__v2_showToast?.("已取消或数量无效", "error");
        break;
      }
      try {
        const r = await fetch("/api/points/transfer?sender=" + encodeURIComponent(state.user.name) + "&receiver=" + encodeURIComponent(target) + "&amount=" + parseInt(amt) + "&token=" + encodeURIComponent(token));
        const text = await r.text();
        if (r.status === 403) {
          window.__v2_showToast?.("请先登录账号", "error");
        } else {
          window.__v2_showToast?.(text || "转账成功", r.ok ? "success" : "error");
        }
      } catch (e) {
        window.__v2_showToast?.("转账失败: " + e.message, "error");
      }
      break;
    }
    case "kick": {
      if (target === state.user?.name) {
        window.__v2_showToast?.("不能踢出自己", "error");
        break;
      }
      if (!isAdmin) {
        window.__v2_showToast?.("请先登录管理后台", "error");
        break;
      }
      if (!confirm("确定要踢出「" + target + "」吗？")) break;
      try {
        const r = await fetch("/api/admin/kick-user/" + encodeURIComponent(state.currentRoom) + "?key=" + encodeURIComponent(k) + "&name=" + encodeURIComponent(target) + "&caller=" + encodeURIComponent(state.user.name));
        const text = await r.text();
        window.__v2_showToast?.(text || "操作完成", r.ok ? "success" : "error");
      } catch (e) {
        window.__v2_showToast?.("踢出失败: " + e.message, "error");
      }
      break;
    }
    case "mute": {
      if (target === state.user?.name) {
        window.__v2_showToast?.("不能禁言自己", "error");
        break;
      }
      if (!isAdmin) {
        window.__v2_showToast?.("请先登录管理后台", "error");
        break;
      }
      const choice = prompt("选择禁言时长：\n1 - 1分钟\n2 - 10分钟\n3 - 1小时\n4 - 永久\n\n输入数字");
      if (!choice) break;
      const durations = { "1": "1m", "2": "10m", "3": "1h", "4": "permanent" };
      const duration = durations[choice];
      if (!duration) {
        window.__v2_showToast?.("无效时长", "error");
        break;
      }
      const reason = prompt("禁言原因（可选，留空跳过）:", "") || "";
      try {
        const r = await fetch("/api/admin/mute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: target, duration: duration, reason: reason })
        });
        const res = await r.json();
        if (res.ok) {
          window.__v2_showToast?.("已禁言 " + target + (duration === "permanent" ? "（永久）" : ""), "success");
        } else {
          window.__v2_showToast?.("禁言失败: " + (res.error || ""), "error");
        }
      } catch (e) {
        window.__v2_showToast?.("禁言失败: 网络错误", "error");
      }
      break;
    }
    case "ban": {
      if (!isAdmin) {
        window.__v2_showToast?.("请先登录管理后台", "error");
        break;
      }
      if (!confirm("确定要永久封禁「" + target + "」吗？（将同时封禁IP）")) break;
      try {
        await fetch("/api/admin/global-kick?key=" + encodeURIComponent(k) + "&name=" + encodeURIComponent(target));
        const r = await fetch("/api/admin/ban/add?key=" + encodeURIComponent(k) + "&name=" + encodeURIComponent(target));
        const text = await r.text();
        window.__v2_showToast?.(text || "封禁成功", r.ok ? "success" : "error");
      } catch (e) {
        window.__v2_showToast?.("封禁失败: " + e.message, "error");
      }
      break;
    }
    case "banip": {
      if (!isAdmin) {
        window.__v2_showToast?.("请先登录管理后台", "error");
        break;
      }
      if (!confirm("确定要封禁「" + target + "」的IP吗？")) break;
      try {
        const r = await fetch("/api/admin/user-ips?key=" + encodeURIComponent(k));
        const ipMap = await r.json();
        const ip = ipMap[target];
        if (!ip) {
          window.__v2_showToast?.("未找到 " + target + " 的IP记录", "error");
          break;
        }
        const r2 = await fetch("/api/admin/ip-ban/add?key=" + encodeURIComponent(k) + "&ip=" + encodeURIComponent(ip));
        const text = await r2.text();
        window.__v2_showToast?.(text || "IP封禁成功", r2.ok ? "success" : "error");
      } catch (e) {
        window.__v2_showToast?.("IP封禁失败: " + e.message, "error");
      }
      break;
    }
    case "tag": {
      if (!isAdmin) {
        window.__v2_showToast?.("请先登录管理后台", "error");
        break;
      }
      const newTag = prompt("输入「" + target + "」的新标签（留空取消）:");
      if (!newTag || !newTag.trim()) break;
      const newColor = prompt("标签颜色（留空默认）: red/blue/green/purple/pink/cyan/gray/orange") || "";
      let url = "/api/admin/tag/set?key=" + encodeURIComponent(k) + "&name=" + encodeURIComponent(target) + "&tag=" + encodeURIComponent(newTag.trim());
      if (newColor) url += "&color=" + encodeURIComponent(newColor);
      try {
        const r = await fetch(url);
        const text = await r.text();
        window.__v2_showToast?.(text || "标签已更新", r.ok ? "success" : "error");
      } catch (e) {
        window.__v2_showToast?.("更新失败: " + e.message, "error");
      }
      break;
    }
    case "batch-kick": {
      if (!isAdmin) {
        window.__v2_showToast?.("请先登录管理后台", "error");
        break;
      }
      const names = prompt("输入要批量踢出的用户名，用逗号分隔：");
      if (!names || !names.trim()) break;
      const nameList = names.split(/[,，\s]+/).filter(Boolean);
      if (nameList.length === 0) break;
      if (!confirm("确定要踢出 " + nameList.length + " 个用户吗？")) break;
      for (let i = 0; i < nameList.length; i++) {
        const n = nameList[i];
        try {
          const r = await fetch("/api/admin/kick-user/" + encodeURIComponent(state.currentRoom) + "?key=" + encodeURIComponent(k) + "&name=" + encodeURIComponent(n));
          const text = await r.text();
          console.log("[v2] batch-kick " + n + ":", text);
        } catch (e) {
          console.error("[v2] batch-kick " + n + " failed:", e);
        }
      }
      window.__v2_showToast?.("已提交批量踢出 " + nameList.length + " 个用户", "success");
      break;
    }
    default:
      console.warn("[v2] Unknown menu action:", action);
  }
}

window.__v2_hideUserMenu = hideUserMenu;
window.__v2_handleMenuAction = handleMenuAction;
