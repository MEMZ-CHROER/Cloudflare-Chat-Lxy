/**
 * v2 Store — centralized state management
 * Replaces scattered window globals from v1
 */

const listeners = new Map();
export const state = {
  user: null,
  currentRoom: null,
  ws: null,
  connected: false,
  messages: [],
  onlineUsers: [],
  lang: "zh",
  theme: "classic",
};

export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  if (key !== "*" && listeners.has("*")) listeners.get("*").add(fn);
  return () => {
    const s = listeners.get(key);
    if (s) s.delete(fn);
    if (key !== "*" && listeners.has("*")) listeners.get("*").delete(fn);
  };
}

export function set(key, value) {
  const prev = state[key];
  state[key] = value;
  const notify = (set) => {
    if (set) set.forEach((fn) => { try { fn(value, prev); } catch(e) { console.error("v2 store error:", e); } });
  };
  notify(listeners.get(key));
  notify(listeners.get("*"));
}

export function patch(patches) {
  const keys = Object.keys(patches);
  const prev = {};
  for (const k of keys) prev[k] = state[k];
  for (const k of keys) state[k] = patches[k];
  for (const k of keys) {
    const notify = (set) => {
      if (set) set.forEach((fn) => { try { fn(state[k], prev[k]); } catch(e) { console.error("v2 store error:", e); } });
    };
    notify(listeners.get(k));
    notify(listeners.get("*"));
  }
}

export const getState = () => state;
