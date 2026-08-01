// 用户备注(本地) - 给其他用户设置本地别名
import { state } from './state.js';
import { addChatMessage } from './renderers.js';
import { showSuccess } from './state.js';

const STORAGE_KEY = "chat_usernotes";

function loadAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (e) { return {}; }
}

function saveAll(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function getNote(name) {
  return loadAll()[name] || null;
}

export function setNote(name, alias) {
  let notes = loadAll();
  if (alias && alias.trim()) {
    notes[name] = alias.trim();
    showSuccess("已将「" + name + "」的备注设为: " + alias.trim());
  } else {
    delete notes[name];
    showSuccess("已清除「" + name + "」的备注");
  }
  saveAll(notes);
}

export function getDisplayName(name) {
  let notes = loadAll();
  return notes[name] || name;
}

export function resolveAlias(input) {
  let notes = loadAll();
  for (let [real, alias] of Object.entries(notes)) {
    if (alias === input) return real;
  }
  return input;
}
