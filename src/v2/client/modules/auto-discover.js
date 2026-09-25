/**
 * v2 module auto-discovery — replaces v1's CHAT_MODULES registry.
 * Uses import.meta.glob for Vite build-time resolution.
 * In CF Workers (no Vite), falls back to explicit import.
 */

// Explicit imports for CF Workers environment (no ESM glob support)
// When porting to Vite, replace these with:
// const modules = import.meta.glob('./**/*.js', { eager: true });

/** @type {Record<string, any>} */
const registeredModules = {};

/**
 * Register a module under a name.
 * @param {string} name
 * @param {object} mod
 */
export function register(name, mod) {
  registeredModules[name] = mod;
  console.log(`[v2] module registered: ${name}`);
}

/**
 * Get a registered module.
 * @param {string} name
 * @returns {object | undefined}
 */
export function get(name) {
  return registeredModules[name];
}

/**
 * Get all registered modules.
 * @returns {Record<string, any>}
 */
export function getAll() {
  return { ...registeredModules };
}

// Placeholder: v2 modules will be registered here as they're built
// Example:
// import chatModules from './chat.js';
// register('chat', chatModules);
