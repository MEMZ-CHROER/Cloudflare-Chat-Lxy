// v1.52 管理后台 Vue3 迁移 - 房间等级样式（🏅 每房间每等级徽章样式自定义）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

// 色名白名单（与服务端 SAFE_COLOR_RE / 聊天端 TAG_COLORS 一致）
const LV_COLORS = ["red","blue","green","purple","pink","cyan","gray","grey","orange","yellow","teal","indigo","brown","lime","deeporange","rose","crimson","coral","gold","amber","forest","seagreen","turquoise","steel","royalblue","mediumpurple","darkviolet","chocolate","olive","firebrick","slateblue","darkcyan","mediumseagreen","indianred","cadetblue"];

export default {
  name: 'LevelStyleSection',
  setup() {
    const rooms = Vue.ref([]);
    const roomInfo = Vue.ref('');
    const room = Vue.ref('');
    const level = Vue.ref('');
    const color = Vue.ref('');
    const icon = Vue.ref('');
    const text = Vue.ref('');
    const loading = Vue.ref(false);

    async function load() {
      loading.value = true;
      try {
        const r = await fetch('/api/rooms/list');
        const data = await r.json();
        rooms.value = Object.entries(data || {}).map(([name, count]) => ({ name, count }));
        roomInfo.value = rooms.value.length ? '共 ' + rooms.value.length + ' 个房间' : '暂无房间';
      } catch (e) { toast('房间加载失败', 'err'); }
      loading.value = false;
    }

    function onRoomChange() {
      roomInfo.value = room.value
        ? '已选择房间 #' + room.value + '。输入等级号 + 样式后点「设置」，将实时推送给该房间所有在线用户。'
        : (rooms.value.length ? '共 ' + rooms.value.length + ' 个房间' : '暂无房间');
    }

    function validate() {
      if (!room.value) { toast('请先选择房间', 'warn'); return false; }
      if (!level.value || isNaN(Number(level.value)) || Number(level.value) < 1 || Number(level.value) > 999) { toast('请输入 1-999 的等级号', 'warn'); return false; }
      if (icon.value.length > 4 || /[<>&"']/.test(icon.value)) { toast('图标不合法（≤4字符且不含HTML特殊字符）', 'warn'); return false; }
      if (text.value.length > 10 || /[<>&"']/.test(text.value)) { toast('文字不合法（≤10字符且不含HTML特殊字符）', 'warn'); return false; }
      return true;
    }

    async function setStyle() {
      if (!validate()) return;
      try {
        const r = await fetch('/api/admin/level-style/set/' + encodeURIComponent(room.value) + '?level=' + encodeURIComponent(level.value) + '&color=' + encodeURIComponent(color.value) + '&icon=' + encodeURIComponent(icon.value) + '&text=' + encodeURIComponent(text.value));
        toast(await r.text());
        onRoomChange();
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
    }

    async function clearStyle() {
      if (!room.value) { toast('请先选择房间', 'warn'); return; }
      if (!level.value || isNaN(Number(level.value)) || Number(level.value) < 1 || Number(level.value) > 999) { toast('请输入 1-999 的等级号', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/level-style/clear/' + encodeURIComponent(room.value) + '?level=' + encodeURIComponent(level.value));
        toast(await r.text());
        onRoomChange();
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
    }

    Vue.onMounted(load);
    return { rooms, roomInfo, room, level, color, icon, text, loading, onRoomChange, setStyle, clearStyle, LV_COLORS };
  },
  template: `
  <div class="av-page">
    <h1>🏅 房间等级样式</h1>
    <p class="av-sub">为指定房间的指定等级定制徽章样式（实时推送在线用户）</p>
    <div class="av-card" style="padding:14px 16px;max-width:640px">
      <div class="av-field" style="margin-bottom:12px">
        <span class="lbl">房间</span>
        <select v-model="room" class="av-input" style="width:220px" @change="onRoomChange">
          <option value="">选择房间...</option>
          <option v-for="r in rooms" :key="r.name" :value="r.name">{{ r.name }}（{{ r.count }} 在线）</option>
        </select>
        <span style="color:var(--text-3);font-size:12px;margin-left:8px">{{ roomInfo }}</span>
      </div>
      <div class="av-field" style="margin-bottom:12px">
        <span class="lbl">等级号</span>
        <input v-model="level" class="av-input" type="number" placeholder="1-999" style="width:90px" />
      </div>
      <div class="av-field" style="margin-bottom:12px">
        <span class="lbl">颜色</span>
        <select v-model="color" class="av-input" style="width:140px">
          <option value="">默认渐变紫</option>
          <option v-for="c in LV_COLORS" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="av-field" style="margin-bottom:12px">
        <span class="lbl">图标</span>
        <input v-model="icon" class="av-input" placeholder="≤4字符" maxlength="4" style="width:110px" />
      </div>
      <div class="av-field" style="margin-bottom:12px">
        <span class="lbl">文字</span>
        <input v-model="text" class="av-input" placeholder="≤10字符" maxlength="10" style="width:140px" />
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="av-btn primary" @click="setStyle">设置样式</button>
        <button class="av-btn danger" @click="clearStyle">清除该等级</button>
      </div>
    </div>
  </div>`
};
