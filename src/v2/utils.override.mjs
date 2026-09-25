// v2 override: utils — imports core utils, adds v2-specific helpers
export {
  SAFE_COLOR_RE,
  sha256,
  safeEqual,
  tokenValid,
  findSession,
  ensureSessions,
  pushSession,
  handleErrors,
  levelForExp,
  getVipLevel,
  getVipFeatures,
} from "../core/utils.mjs";

// v2-only utility: version-aware event envelope
/**
 * Wrap a raw WS message into a v2 envelope for client-side routing.
 * @param {string} type - event type (msg, join, leave, system, etc.)
 * @param {object} payload - event data
 * @param {string} [version] - protocol version (default "v2")
 * @returns {string} JSON string to send over WebSocket
 */
export function v2Envelope(type, payload, version = "v2") {
  return JSON.stringify({ v: version, t: type, d: payload, ts: Date.now() });
}

/**
 * Parse a v2 envelope, returning { type, payload } or null if not v2 format.
 * @param {string|object} data
 * @returns {{type: string, payload: object, version: string} | null}
 */
export function parseV2Envelope(data) {
  let obj;
  try {
    obj = typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return null;
  }
  if (!obj || obj.v !== "v2") return null;
  return { type: obj.t, payload: obj.d, version: obj.v };
}
