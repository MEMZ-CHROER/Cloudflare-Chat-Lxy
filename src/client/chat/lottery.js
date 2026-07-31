// 抽奖弹窗
import { state } from './state.js';

export function openLottery() {
  document.getElementById("lottery-overlay").classList.add("show");
  loadLotteryPools();
}
export function closeLottery() {
  document.getElementById("lottery-overlay").classList.remove("show");
}

async function loadLotteryPools() {
  let loading = document.getElementById("lottery-loading");
  let poolsDiv = document.getElementById("lottery-pools");
  let resultDiv = document.getElementById("lottery-result");
  if (loading) loading.style.display = "block";
  if (poolsDiv) poolsDiv.style.display = "none";
  if (resultDiv) resultDiv.style.display = "none";
  try {
    let r = await fetch("/api/lottery/pools");
    let data = await r.json();
    if (loading) loading.style.display = "none";
    if (!data || data.length === 0) {
      if (poolsDiv) { poolsDiv.innerHTML = '<div style="text-align:center;color:#888;padding:40px">暂无可用抽奖池</div>'; poolsDiv.style.display = "block"; }
      return;
    }
    let html = data.map(p => '<div class="lottery-pool-card" style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:12px;background:var(--card-bg,#fff)">'
      + '<div style="font-weight:600;font-size:16px;margin-bottom:4px">' + p.name + '</div>'
      + '<div style="font-size:13px;color:#666;margin-bottom:8px">' + (p.description || "") + '</div>'
      + '<div style="font-size:13px;margin-bottom:8px">每次 <strong>' + p.cost + '</strong> 积分</div>'
      + '<div style="font-size:12px;color:#888;margin-bottom:10px">奖品: ' + (p.prizes || []).map(pr => pr.name + "(" + pr.stock + "/" + pr.initialStock + ")").join(", ") + '</div>'
      + '<button class="auth-btn" onclick="doDraw(\'' + p.id + '\')" style="padding:6px 20px;font-size:14px">抽一次</button>'
      + '</div>').join("");
    if (poolsDiv) { poolsDiv.innerHTML = html; poolsDiv.style.display = "block"; }
  } catch (e) {
    if (loading) loading.style.display = "none";
    if (poolsDiv) { poolsDiv.innerHTML = '<div style="text-align:center;color:#c00;padding:40px">加载失败: ' + e.message + '</div>'; poolsDiv.style.display = "block"; }
  }
}

export async function doDraw(poolId) {
  if (!state.username) { alert("请先登录"); return; }
  let resultDiv = document.getElementById("lottery-result");
  let poolsDiv = document.getElementById("lottery-pools");
  if (poolsDiv) poolsDiv.style.display = "none";
  if (resultDiv) { resultDiv.style.display = "block"; resultDiv.innerHTML = '<div style="padding:20px;font-size:18px">🎰 抽奖中...</div>'; }
  try {
    let r = await fetch("/api/lottery/draw", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: state.username, pool: poolId, token: localStorage.getItem("chat_token") || ""})});
    let data = await r.json();
    if (data.ok && data.prize) {
      let tagMsg = data.prize.tag ? "<br><span style=\"font-size:14px;color:#888\">🏷️ 标签已自动装备!</span>" : "";
      if (resultDiv) resultDiv.innerHTML = '<div style="padding:20px"><div style="font-size:48px;margin-bottom:12px">🎉</div><div style="font-size:20px;font-weight:600;margin-bottom:8px">恭喜获得:</div><div style="font-size:24px;color:#e67e22">' + data.prize.name + '</div>' + tagMsg + '</div>';
    } else {
      if (resultDiv) resultDiv.innerHTML = '<div style="padding:20px"><div style="font-size:48px;margin-bottom:12px">😅</div><div style="font-size:16px;color:#666">' + (data.error || "抽奖失败") + '</div></div>';
    }
  } catch (e) {
    if (resultDiv) resultDiv.innerHTML = '<div style="padding:20px"><div style="font-size:16px;color:#c00">错误: ' + e.message + '</div></div>';
  }
}
