// 简易 i18n 实现（admin 前端）
// 目前仅提供中文→英文映射，未实现多语言切换，后续可扩展

export const i18nDict = {
  // 示例：键名为中文原文，值为对应英文或其他语言文本
  "运营数据": "Operations Dashboard",
  "仪表盘": "Dashboard",
  "积分管理": "Points Management",
  "当前在线": "Current Online",
  "今日峰值": "Today Peak",
  "历史峰值": "Historical Peak",
  "注册用户": "Registered Users",
  "总积分": "Total Points",
  "每日消息量（近 7 日）": "Message Trend (Last 7 Days)",
  "暂无消息数据": "No message data",
  "积分吞吐（近 7 日）": "Points Throughput (Last 7 Days)",
  "近 7 日暂无积分流水": "No points flow in last 7 days",
  "房间活跃度": "Room Activity",
  "暂无在线房间": "No active rooms",
  // 更多键值对请自行添加
};

export function t(key) {
  return i18nDict[key] ?? key;
}
