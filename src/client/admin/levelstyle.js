// 房间等级样式管理（🏅 每房间每等级徽章样式自定义）
import { state } from './state.js';
import { escapeHtml } from './utils.js';

// 色名白名单（与服务端 SAFE_COLOR_RE / 聊天端 TAG_COLORS 一致）
const LV_COLORS = ["red","blue","green","purple","pink","cyan","gray","grey","orange","yellow","teal","indigo","brown","lime","deeporange","rose","crimson","coral","gold","amber","forest","seagreen","turquoise","steel","royalblue","mediumpurple","darkviolet","chocolate","olive","firebrick","slateblue","darkcyan","mediumseagreen","indianred","cadetblue"];

export async function loadLevelStyleSection() {
  try {
    let r = await fetch("/api/rooms/list");
    let rooms = await r.json();
    let sel = document.querySelector("#ls-room");
    if (!sel) return;
    sel.innerHTML = '<option value="">选择房间...</option>';
    let names = Object.keys(rooms || {});
    names.forEach(name => {
      let opt = document.createElement("option");
      opt.value = String(name);
      opt.textContent = String(name) + "（" + (rooms[name] || 0) + " 在线）";
      sel.appendChild(opt);
    });
    let info = document.querySelector("#ls-room-info");
    if (info) info.textContent = names.length ? "共 " + names.length + " 个房间" : "暂无房间";
    // 填充颜色下拉（白名单色名）
    let colorSel = document.querySelector("#ls-color");
    if (colorSel) {
      colorSel.innerHTML = '<option value="">默认渐变紫</option>' + LV_COLORS.map(c => '<option value="' + c + '">' + c + '</option>').join('');
    }
  } catch (e) {}
}

export function onLevelStyleRoomChange() {
  let room = document.querySelector("#ls-room").value;
  let list = document.querySelector("#ls-current");
  if (list) {
    list.innerHTML = room
      ? '<div style="color:#888;padding:4px 0">已选择房间 #' + escapeHtml(room) + '。输入等级号 + 样式后点「设置」，将实时推送给该房间所有在线用户。</div>'
      : "";
  }
}

export async function setLevelStyle() {
  let room = document.querySelector("#ls-room").value;
  let level = document.querySelector("#ls-level").value;
  let color = document.querySelector("#ls-color").value;
  let icon = document.querySelector("#ls-icon").value.trim();
  let text = document.querySelector("#ls-text").value.trim();
  if (!room) { alert("请先选择房间"); return; }
  if (!level || isNaN(Number(level)) || Number(level) < 1 || Number(level) > 999) { alert("请输入 1-999 的等级号"); return; }
  // 防护：前端先拦一道（服务端 DO 层再兜底）
  if (icon.length > 4 || /[<>&"']/.test(icon)) { alert("图标不合法（≤4字符且不含HTML特殊字符）"); return; }
  if (text.length > 10 || /[<>&"']/.test(text)) { alert("文字不合法（≤10字符且不含HTML特殊字符）"); return; }
  try {
    let r = await fetch("/api/admin/level-style/set/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey) + "&level=" + encodeURIComponent(level) + "&color=" + encodeURIComponent(color) + "&icon=" + encodeURIComponent(icon) + "&text=" + encodeURIComponent(text));
    let msg = await r.text();
    alert(msg);
    onLevelStyleRoomChange();
  } catch (e) { alert("操作失败: " + e.message); }
}

export async function clearLevelStyle() {
  let room = document.querySelector("#ls-room").value;
  let level = document.querySelector("#ls-level").value;
  if (!room) { alert("请先选择房间"); return; }
  if (!level || isNaN(Number(level)) || Number(level) < 1 || Number(level) > 999) { alert("请输入 1-999 的等级号"); return; }
  try {
    let r = await fetch("/api/admin/level-style/clear/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey) + "&level=" + encodeURIComponent(level));
    let msg = await r.text();
    alert(msg);
    onLevelStyleRoomChange();
  } catch (e) { alert("操作失败: " + e.message); }
}

export { LV_COLORS };
