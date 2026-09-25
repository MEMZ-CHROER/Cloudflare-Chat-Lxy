/**
 * v2 Auth module — login/register/session management
 */
import { state, set, patch } from "./store.js";

const TOKEN_KEY = "v2_token";
const USER_KEY = "v2_user";

export async function login(username, password) {
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, password }),
    });
    const data = await res.json();
    if (data.ok) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data));
      patch({ user: data });
      return { ok: true, user: data };
    }
    return { ok: false, error: data.error || "登录失败" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function register(username, password) {
  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, password }),
    });
    const data = await res.json();
    if (data.ok) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data));
      patch({ user: data });
      return { ok: true, user: data };
    }
    return { ok: false, error: data.error || "注册失败" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function checkAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  const userStr = localStorage.getItem(USER_KEY);
  if (token && userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.token === token) {
        patch({ user });
        return { ok: true, user };
      }
    } catch {}
  }
  return { ok: false };
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  patch({ user: null });
  set("currentRoom", null);
}

export function skipAuth() {
  patch({ user: { name: "Guest", authenticated: false } });
}
