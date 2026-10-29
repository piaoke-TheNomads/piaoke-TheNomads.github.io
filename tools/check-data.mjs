// 数据体检：站点上线前跑一遍，避免把错数字发出去。
import { readFileSync } from "node:fs";

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const players = read("players.json").players;
const seasons = read("seasons.json").seasons;
const honors = read("honors.json").honors;

let bad = 0;
const fail = (msg) => { console.log("  ✗ " + msg); bad++; };

// 1. 号码唯一、1–99（number 为 null 表示号码未确认，允许）
const POS = ["GK", "CB", "LB", "RB", "FB", "DM", "CM", "AM", "LM", "RM", "ST"];
const STATUS = ["active", "retired"];
const seen = new Set();
const playerIds = new Set();
let noNumber = 0;
for (const p of players) {
  if (typeof p.id !== "string" || !/^[a-zA-Z0-9_-]{3,64}$/.test(p.id)) fail(`球员 ID 不合法：${p.name}`);
  if (playerIds.has(p.id)) fail(`球员 ID 重复：${p.id}`);
  playerIds.add(p.id);
  if (!p.name || !p.name.trim()) fail(`缺姓名：${p.number ?? "(无号码)"}`);
  if (p.number == null) {
    noNumber++;
  } else {
    if (!Number.isInteger(p.number) || p.number < 1 || p.number > 99) fail(`号码不合法：${p.name} ${p.number}`);
    if (seen.has(p.number)) fail(`号码重复：${p.number}（${p.name}）`);
    seen.add(p.number);
  }
  if (p.status != null && !STATUS.includes(p.status)) fail(`状态不认识：${p.name} ${p.status}`);
  if (p.position != null && !POS.includes(p.position)) fail(`主位置不认识：${p.name} ${p.position}`);
  if (p.positions != null && !Array.isArray(p.positions)) fail(`兼任位置必须为数组：${p.name}`);
  const codes = Array.isArray(p.positions) ? p.positions : [];
  for (const c of codes) if (!POS.includes(c)) fail(`位置不认识：${p.name} ${c}`);
}

// 1b. 页面要拿号码当地址，没号码的人不能重复姓名
const names = new Map();
for (const p of players) {
  if (names.has(p.name)) fail(`姓名重复：${p.name}`);
  names.set(p.name, true);
}

// 2. 赛季名次与场次
const seasonIds = new Set();
for (const s of seasons) {
  if (!/^\d{4}-\d{2}$/.test(s.id)) fail(`赛季名格式不对：${s.id}`);
  if (seasonIds.has(s.id)) fail(`赛季重复：${s.id}`);
  seasonIds.add(s.id);
  if (s.status != null && !["planned", "ongoing", "completed"].includes(s.status)) fail(`${s.id} 赛季状态不合法`);
  if (s.played != null && (!Number.isInteger(s.played) || s.played < 0)) fail(`${s.id} 场次不合法`);
  if (s.teams != null && (!Number.isInteger(s.teams) || s.teams < 1)) fail(`${s.id} 参赛队数不合法`);
  if (s.rank != null && (!Number.isInteger(s.rank) || s.rank < 1)) fail(`${s.id} 名次不合法`);
  if (s.rank != null && s.teams != null && s.rank > s.teams) fail(`${s.id} 名次大于参赛队数`);
}

// 3. 荣誉的赛季必须在赛季表里
const ids = new Set(seasons.map((s) => s.id));
for (const h of honors) if (!ids.has(h.season)) fail(`荣誉赛季不存在：${h.season} ${h.trophy}`);

const champ = new Set(honors.filter((h) => h.kind === "champion").map((h) => h.season));
console.log("══════════════════════════════════════════");
console.log("球门飘客 · 数据体检");
console.log("══════════════════════════════════════════");
console.log(`球员 ${players.length} 人 · 赛季 ${seasons.length} 个 · 荣誉 ${honors.length} 项 · 冠军赛季 ${champ.size} 个`);
console.log(`现役 ${players.filter((p) => p.status === "active").length} 人 · 退役 ${players.filter((p) => p.status === "retired").length} 人 · 状态待确认 ${players.filter((p) => !p.status).length} 人`);
console.log(`位置已填 ${players.filter((p) => p.position).length}/${players.length} · 照片已填 ${players.filter((p) => p.photo).length}/${players.length} · 无号码 ${noNumber} 人`);
console.log(bad === 0 ? "✅ 全部通过" : `❌ ${bad} 处问题`);
process.exit(bad === 0 ? 0 : 1);
