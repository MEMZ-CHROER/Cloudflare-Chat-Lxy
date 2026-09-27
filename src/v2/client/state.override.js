// v2 state override — extended state with v2-specific properties
import { state as coreState } from "./store.js";

// Extended v2 state
export const v2State = {
  ...coreState,
  // v2-specific properties
  currentChannel: "general",
  channelUnread: {},
  dmTarget: null,
  dmUnread: 0,
  dmCache: {},
  showTime: true,
  notify: true,
  atNotif: true,
  musicVolume: 0.5,
  totalMsgs: 0,
  roomsJoined: 0,
  onlineSeconds: 0,
  achievements: {},
  channelHistory: new Map(),
};

// Override patch to also update v2State
const originalPatch = coreState.patch;
coreState.patch = function(updates) {
  Object.assign(v2State, updates);
  return originalPatch.call(this, updates);
};

export function getV2State() {
  return v2State;
}

window.__v2_state = v2State;
window.__v2_getV2State = getV2State;
