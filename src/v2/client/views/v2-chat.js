export default `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudChat v2</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; }
    #v2-app { display: flex; flex-direction: column; height: 100vh; max-width: 800px; margin: 0 auto; }
    .v2-header { padding: 16px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .v2-header h1 { font-size: 1.25rem; }
    #v2-status { font-size: 0.875rem; padding: 4px 12px; border-radius: 9999px; background: #334155; }
    #v2-messages { flex: 1; overflow-y: auto; padding: 16px; }
    .v2-msg { padding: 8px 12px; margin-bottom: 8px; background: #1e293b; border-radius: 8px; word-wrap: break-word; }
    .v2-msg-header { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.875rem; }
    .v2-msg-name { font-weight: 600; color: #60a5fa; }
    .v2-msg-time { color: #64748b; font-size: 0.75rem; }
    .v2-msg-content { color: #e2e8f0; }
    #v2-input-area { padding: 16px; background: #1e293b; border-top: 1px solid #334155; display: flex; gap: 8px; }
    #v2-msg-input { flex: 1; padding: 12px; border: 1px solid #334155; border-radius: 8px; background: #0f172a; color: #e2e8f0; font-size: 1rem; }
    #v2-msg-input:focus { outline: none; border-color: #3b82f6; }
    #v2-send-btn { padding: 12px 24px; border: none; border-radius: 8px; background: #3b82f6; color: white; font-size: 1rem; cursor: pointer; }
    #v2-send-btn:hover { background: #2563eb; }
    /* Auth styles */
    #v2-auth { display: flex; align-items: center; justify-content: center; height: 100vh; }
    .v2-auth-card { background: #1e293b; padding: 32px; border-radius: 12px; width: 100%; max-width: 400px; }
    .v2-auth-card h1 { text-align: center; margin-bottom: 24px; }
    .v2-auth-tabs { display: flex; gap: 8px; margin-bottom: 24px; }
    .v2-auth-tab { flex: 1; padding: 8px; border: none; border-radius: 6px; background: #334155; color: #94a3b8; cursor: pointer; }
    .v2-auth-tab.active { background: #3b82f6; color: white; }
    .v2-auth-input { width: 100%; padding: 12px; margin-bottom: 12px; border: 1px solid #334155; border-radius: 6px; background: #0f172a; color: #e2e8f0; font-size: 1rem; }
    .v2-auth-btn { width: 100%; padding: 12px; border: none; border-radius: 6px; background: #3b82f6; color: white; font-size: 1rem; cursor: pointer; }
    .v2-auth-btn:hover { background: #2563eb; }
    .v2-auth-error { color: #f87171; font-size: 0.875rem; margin-top: 8px; display: none; }
    .v2-auth-skip { display: block; text-align: center; margin-top: 16px; color: #64748b; font-size: 0.875rem; cursor: pointer; background: none; border: none; }
    .v2-auth-skip:hover { color: #94a3b8; }
    /* Room list styles */
    #v2-room-list { padding: 16px; }
    .v2-room-input { display: flex; gap: 8px; margin-bottom: 16px; }
    .v2-room-input input { flex: 1; padding: 12px; border: 1px solid #334155; border-radius: 6px; background: #1e293b; color: #e2e8f0; }
    .v2-room-input button { padding: 12px 24px; border: none; border-radius: 6px; background: #3b82f6; color: white; cursor: pointer; }
    .v2-room-divider { text-align: center; color: #64748b; margin-bottom: 16px; }
    #v2-rooms { display: flex; flex-direction: column; gap: 8px; }
    .v2-room-btn { padding: 12px 16px; border: 1px solid #334155; border-radius: 6px; background: #1e293b; color: #e2e8f0; text-align: left; cursor: pointer; }
    .v2-room-btn:hover { background: #334155; }
    #v2-user-info { font-size: 0.875rem; color: #64748b; }
  </style>
</head>
<body>
  <div id="v2-app"></div>
  <script type="module">
    import { initV2App } from '/static/app.js';
    initV2App();
  </script>
</body>
</html>`;
