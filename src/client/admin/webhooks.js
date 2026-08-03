// 管理后台 - 房间 Webhook 管理（list/gen/del）
import { state } from './state.js';
import { escapeHtml } from './utils.js';

export async function loadWebhooksSection() {
  let el = document.getElementById("webhooks-list");
  if (!el) return;
  el.innerHTML = '<div style="color:#888;text-align:center;padding:20px">加载中...</div>';
  try {
    let r = await fetch("/api/admin/webhook/list" + (state.adminKey ? "?key=" + encodeURIComponent(state.adminKey) : ""));
    if (!r.ok) { el.innerHTML = '<div style="color:#d33;padding:12px">加载失败（' + r.status + '）</div>'; return; }
    let data = await r.json();
    let rooms = Object.keys(data);
    if (!rooms.length) { el.innerHTML = '<div style="color:#888;padding:12px">暂无房间</div>'; return; }
    el.innerHTML = rooms.map(name => {
      let w = data[name];
      let escName = name.replace(/'/g, "\\'");
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee">'
        + '<span style="flex:1;font-weight:600">#' + escapeHtml(name) + '</span>'
        + (w.hasWebhook
          ? '<span style="color:#2a6;font-size:90%">✓ 已开启</span>'
          : '<span style="color:#888;font-size:90%">未开启</span>')
        + (w.hasWebhook
          ? '<button onclick="delWebhook(\'' + escName + '\')" style="padding:4px 10px;background:#e55;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">删除</button>'
          : '<button onclick="genWebhook(\'' + escName + '\')" style="padding:4px 10px;background:var(--primary);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">生成</button>')
        + '</div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div style="color:#d33;padding:12px">加载失败</div>';
  }
}

export async function genWebhook(room) {
  if (!confirm('为 #' + room + ' 生成 Webhook？生成后外部系统即可向该房间推送消息。')) return;
  try {
    let r = await fetch("/api/admin/webhook/gen/" + encodeURIComponent(room) + (state.adminKey ? "?key=" + encodeURIComponent(state.adminKey) : ""));
    let d = await r.json();
    if (!r.ok) { alert(d.error || "生成失败"); return; }
    let baseUrl = location.origin + "/api/webhook/" + encodeURIComponent(room);
    let curl = 'curl -X POST "' + baseUrl + '" -H "X-Webhook-Secret: ' + d.secret + '" -H \'Content-Type: application/json\' -d \'{"content":"你好"}\'';
    let detail = document.createElement('div');
    detail.innerHTML = '<div style="margin:10px 0 14px 0;padding:12px;background:#f6f8fa;border:1px solid #e1e4e8;border-radius:6px;font-size:13px">'
      + '<div style="margin-bottom:6px"><strong>Webhook 地址（不含密钥，密钥通过请求头鉴权）：</strong></div>'
      + '<div style="word-break:break-all;font-family:monospace;background:#fff;padding:8px;border-radius:4px;border:1px solid #e1e4e8">' + escapeHtml(baseUrl) + '</div>'
      + '<div style="margin:10px 0 6px 0"><strong>Secret（请保密，仅显示一次）：</strong></div>'
      + '<div style="word-break:break-all;font-family:monospace;background:#fff;padding:8px;border-radius:4px;border:1px solid #e1e4e8">' + escapeHtml(d.secret) + '</div>'
      + '<div style="margin:10px 0 6px 0"><strong>调用示例：</strong></div>'
      + '<div style="word-break:break-all;font-family:monospace;background:#fff;padding:8px;border-radius:4px;border:1px solid #e1e4e8;white-space:pre-wrap">' + escapeHtml(curl) + '</div>'
      + '<div style="margin-top:8px;color:#888">可选字段：sender（发送者名，默认 Webhook）、channel（目标频道，默认 general）；secret 请通过 X-Webhook-Secret 请求头发送，勿放进 URL</div>'
      + '<button onclick="this.parentElement.remove()" style="margin-top:8px;padding:4px 10px;background:#888;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">关闭</button>'
      + '</div>';
    let list = document.getElementById("webhooks-list");
    if (list) list.prepend(detail);
    loadWebhooksSection();
  } catch (e) {
    alert("生成失败: " + e.message);
  }
}

export async function delWebhook(room) {
  if (!confirm('删除 #' + room + ' 的 Webhook？外部系统将无法再推送。')) return;
  try {
    let r = await fetch("/api/admin/webhook/del/" + encodeURIComponent(room) + (state.adminKey ? "?key=" + encodeURIComponent(state.adminKey) : ""));
    let d = await r.json();
    if (!r.ok) { alert(d.error || "删除失败"); return; }
    alert("已删除 " + room + " 的 Webhook");
    loadWebhooksSection();
  } catch (e) {
    alert("删除失败: " + e.message);
  }
}
