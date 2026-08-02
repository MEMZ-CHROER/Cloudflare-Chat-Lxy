// 管理后台认证
import { state } from './state.js';
import { navigateTo, getCurrentRoute } from './routing.js';
import { loadRooms } from './rooms.js';
import { loadGlobalUsers, loadBannedList, loadIpBannedList } from './users.js';
import { loadHistoryUsers } from './history.js';
import { loadAdminKeyInfo } from './key.js';
import { loadPointsSection } from './points.js';
import { loadExpSection } from './exp.js';
import { loadGlobalBlacklist } from './users.js';
import { startAutoRefresh } from './routing.js';

export function isSuper() { return state.adminLevel === "super"; }
export function isAdmin() { return state.adminLevel === "admin"; }

function showSuperSections(show) {
  document.querySelectorAll(".nav-super").forEach(el => { el.style.display = show ? "block" : "none"; });
  if (!show) {
    let activeNav = document.querySelector(".nav-item.active");
    if (activeNav && activeNav.classList.contains("nav-super")) navigateTo("/admin/rooms/");
  }
}

export async function checkAuthAndLoad() {
  try {
    let r = await fetch("/api/admin/auth-check?key=" + encodeURIComponent(state.adminKey));
    let data = await r.json();
    if (!data.level) { localStorage.removeItem("admin_key"); return false; }
    state.adminLevel = data.level;
    document.querySelector("#login-form").style.display = "none";
    document.querySelector("#admin-panel").style.display = "block";
    showSuperSections(isSuper());
    loadRooms();
    loadGlobalBlacklist();
    if (isSuper()) {
      loadGlobalUsers();
      loadBannedList();
      loadIpBannedList();
      loadHistoryUsers();
      loadAdminKeyInfo();
      loadPointsSection();
      loadExpSection();
    }
    startAutoRefresh();
    navigateTo(getCurrentRoute(), false);
    return true;
  } catch (e) { return false; }
}

export { showSuperSections };
