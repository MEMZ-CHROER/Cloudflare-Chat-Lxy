// v2 ascii art override — fun ASCII decorations for messages
const ASCII_ARTS = {
  "happy": "(◕‿◕)",
  "sad": "(╥﹏╥)",
  "cool": "(╯°□°)╯",
  "thinking": "(⊙_☉)",
  "laugh": "ʘ‿ʘ",
  "wave": "ノ(￣▽￣)ノ",
  "bow": "m(_ _)m",
  "dance": "�(ﾟДﾟノ)ノ",
  "angel": "(☆▽☆)",
  "devil": "(ᵟຶ︵ ᵟຶ)",
  "shrug": "(ノಠ益ಠ)ノ彡┻━┻",
  "tableflip": "┬─┬ノ( º _ ºノ)",
};

export function tryParseAscii(text) {
  for (const [key, art] of Object.entries(ASCII_ARTS)) {
    if (text.includes("/" + key)) {
      return art;
    }
  }
  return null;
}

export function replaceAscii(text) {
  let result = text;
  for (const [key, art] of Object.entries(ASCII_ARTS)) {
    result = result.replace(new RegExp(`/\\b${key}\\b`, "g"), art);
  }
  return result;
}

window.__v2_asciiArts = ASCII_ARTS;
