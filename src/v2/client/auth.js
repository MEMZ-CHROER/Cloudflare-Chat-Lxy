/**
 * v2 Auth module — login/register/session management
 */
import { state, set, patch } from "./store.js";

export async function login(username, password) {
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, password }),
    });
    const data = await res.json();
    if (data.ok) {
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
      patch({ user: data });
      return { ok: true, user: data };
    }
    return { ok: false, error: data.error || "注册失败" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function checkAuth() {
  try {
    const res = await fetch("/api/user-profile");
    const data = await res.json();
    if (data.ok) {
      patch({ user: data });
      return { ok: true, user: data };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export function logout() {
  patch({ user: null });
  set("currentRoom", null);
}

export function skipAuth() {
  patch({ user: { name: "Guest", authenticated: false } });
}
