// v2 doc store override — document storage and retrieval
import { state } from "./store.js";

const DOC_PREFIX = "doc:";

export async function saveDoc(title, content) {
  const token = localStorage.getItem("chat_token") || "";
  const res = await fetch(`/api/doc/${encodeURIComponent(state.currentRoom)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
    body: JSON.stringify({ title, content }),
  });
  return res.json();
}

export async function getDoc(docId) {
  const token = localStorage.getItem("chat_token") || "";
  const res = await fetch(`/api/doc/${encodeURIComponent(state.currentRoom)}/${encodeURIComponent(docId)}`, {
    headers: { "Cookie": `token=${token}` },
  });
  return res.json();
}

export async function listDocs() {
  const token = localStorage.getItem("chat_token") || "";
  const res = await fetch(`/api/doc/${encodeURIComponent(state.currentRoom)}/list`, {
    headers: { "Cookie": `token=${token}` },
  });
  return res.json();
}

export async function deleteDoc(docId) {
  const token = localStorage.getItem("chat_token") || "";
  const res = await fetch(`/api/doc/${encodeURIComponent(state.currentRoom)}/${encodeURIComponent(docId)}`, {
    method: "DELETE",
    headers: { "Cookie": `token=${token}` },
  });
  return res.json();
}

// Reference a doc in a message: [[docId:title]]
export function resolveDocRef(text) {
  const refMatch = text.match(/\[\[([^\]]+):([^\]]+)\]\]/);
  if (!refMatch) return text;
  const docId = refMatch[1];
  const title = refMatch[2];
  return `<a href="#" onclick="window.__v2_openDoc('${docId}');return false" class="v2-doc-ref">📄 ${title}</a>`;
}

window.__v2_saveDoc = saveDoc;
window.__v2_getDoc = getDoc;
window.__v2_listDocs = listDocs;
window.__v2_deleteDoc = deleteDoc;
