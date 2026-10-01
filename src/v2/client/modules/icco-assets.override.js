// v2 ICCO assets — simplified without base64 images, uses CSS generation
// Provides the same visual effect as v1's icco-assets.js but self-contained

export const ICCO_ICON = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="red" stroke-width="3"/><polygon points="50,20 80,80 20,80" fill="none" stroke="red" stroke-width="3"/></svg>');
export const ICCO_ICONBG = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="black"/></svg>');
export const ICCO_STRIPE = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="0" y1="0" x2="24" y2="24" stroke="red" stroke-width="2"/></svg>');
export const ICCO_FONT = ""; // Will use monospace fallback

console.log("[v2] ICCO assets loaded (simplified mode)");
