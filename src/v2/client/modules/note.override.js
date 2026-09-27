// v2 note override — sticky notes / personal notepad
import { state } from "./store.js";
import { escapeHtml } from "../renderers.override.js";

const NOTES_KEY = "v2_notes";

export function getNotes() {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"); }
  catch { return []; }
}

export function saveNotes(notes) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

export function openNotes() {
  let panel = document.getElementById("v2-notes-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-notes-panel";
  panel.className = "v2-notes-overlay";
  panel.innerHTML = `
    <div class="v2-notes-modal">
      <div class="v2-notes-header">
        <h2>📝 便签</h2>
        <button class="v2-notes-close" onclick="window.__v2_closeNotes()">&times;</button>
      </div>
      <div class="v2-notes-toolbar">
        <button class="v2-notes-add" onclick="window.__v2_addNote()">+ 新建</button>
      </div>
      <div id="v2-notes-list" class="v2-notes-list"></div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.addEventListener("click", e => { if (e.target === panel) window.__v2_closeNotes(); });
  renderNotes();
}

export function closeNotes() {
  const p = document.getElementById("v2-notes-panel");
  if (p) p.remove();
}

function renderNotes() {
  const list = document.getElementById("v2-notes-list");
  if (!list) return;
  const notes = getNotes();
  if (notes.length === 0) {
    list.innerHTML = '<div class="v2-notes-empty">还没有便签，点击"+新建"添加</div>';
    return;
  }
  list.innerHTML = notes.map((n, i) => `
    <div class="v2-note-item${n.pinned ? ' pinned' : ''}">
      <textarea class="v2-note-text" rows="3" onchange="window.__v2_updateNote(${i}, this.value)" oninput="window.__v2_updateNote(${i}, this.value)">${escapeHtml(n.content)}</textarea>
      <div class="v2-note-meta">
        <span class="v2-note-date">${new Date(n.timestamp).toLocaleString()}</span>
        <button class="v2-note-pin" onclick="window.__v2_togglePin(${i})">${n.pinned ? '📌' : '☆'}</button>
        <button class="v2-note-delete" onclick="window.__v2_deleteNote(${i})">✕</button>
      </div>
    </div>
  `).join("");
}

export function addNote() {
  const notes = getNotes();
  notes.unshift({ content: "", timestamp: Date.now(), pinned: false });
  saveNotes(notes);
  renderNotes();
}

export function updateNote(idx, content) {
  const notes = getNotes();
  if (notes[idx]) { notes[idx].content = content; notes[idx].timestamp = Date.now(); saveNotes(notes); }
}

export function togglePin(idx) {
  const notes = getNotes();
  if (notes[idx]) { notes[idx].pinned = !notes[idx].pinned; saveNotes(notes); renderNotes(); }
}

export function deleteNote(idx) {
  const notes = getNotes().filter((_, i) => i !== idx);
  saveNotes(notes);
  renderNotes();
}

window.__v2_openNotes = openNotes;
window.__v2_closeNotes = closeNotes;
window.__v2_addNote = addNote;
window.__v2_updateNote = updateNote;
window.__v2_togglePin = togglePin;
window.__v2_deleteNote = deleteNote;
