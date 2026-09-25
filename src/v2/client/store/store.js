/**
 * v2 unified state store (Pinia-style, vanilla JS)
 * Centralized reactive state replacing scattered window globals from v1.
 */

const listeners = new Map(); // key → Set<function>

export const state = {
  user: null,        // { name, token, authenticated, isAdmin, avatar }
  currentRoom: null, // room name string
  ws: null,          // WebSocket instance
  connected: false,
  messages: [],      // current room messages (paged)
  onlineUsers: [],
  lang: "zh",
  theme: "classic",
};

/**
 * Subscribe to state changes.
 * @param {string} key - state key to watch (or "*" for all)
 * @param {function(any): void} fn
 * @returns {function(): void} unsubscribe
 */
export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  // Also subscribe to "*" if watching a specific key
  if (key !== "*" && listeners.has("*")) listeners.get("*").add(fn);
  return () => {
    const set = listeners.get(key);
    if (set) set.delete(fn);
    if (key !== "*") {
      const starSet = listeners.get("*");
      if (starSet) starSet.delete(fn);
    }
  };
}

/**
 * Update state and notify subscribers.
 * @param {string} key
 * @param {any} value
 */
export function set(key, value) {
  const prev = state[key];
  state[key] = value;
  const notify = (set) => {
    if (set) set.forEach((fn) => { try { fn(value, prev); } catch(e) { console.error("store subscriber error:", e); } });
  };
  notify(listeners.get(key));
  notify(listeners.get("*"));
}

/**
 * Batch update multiple keys at once (single notification pass).
 * @param {Record<string, any>} patches
 */
export function patch(patches) {
  const keys = Object.keys(patches);
  const prevSnapshot = {};
  for (const k of keys) prevSnapshot[k] = state[k];
  for (const k of keys) state[k] = patches[k];
  for (const k of keys) {
    const notify = (set) => {
      if (set) set.forEach((fn) => { try { fn(state[k], prevSnapshot[k]); } catch(e) { console.error("store subscriber error:", e); } });
    };
    notify(listeners.get(k));
    notify(listeners.get("*"));
  }
}

export const getState = () => state;
