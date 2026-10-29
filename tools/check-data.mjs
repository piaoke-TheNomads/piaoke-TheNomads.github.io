// 数据体检：站点上线前跑一遍，避免把错数字发出去。
import { readFileSync } from "node:fs";

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const players = read("players.json").players;
const seasons = read("seasons.json").seasons;
const honors = read("honors.json").honors;

let bad = 0;
const fail = (msg) => { console.log("  ✗ " + msg); bad++; };

// 1. 号码唯一、1–99
const seen = new Set();
for (const p of players) {
  if (!Number.isInteger(p.number) || p.number < 1 || p.number > 99) fail(`号码不合法：${p.name} ${p.number}`);
  if (seen.has(p.number)) fail(`号码重复：${p.number}`);
  seen.add(p.number);
  if (!p.name || !p.name.trim()) fail(`缺姓名：${p.number}`);
  if (p.position && !["GK", "DF", "MF", "FW"].includes(p.position)) fail(`位置不认识：${p.name} ${p.position}`);
}

// 2. 赛季名次与场次
for (const s of seasons) {
  if (!/^\d{4}-\d{2}$/.test(s.id)) fail(`赛季名格式不对：${s.id}`);
  if (s.played != null && s.played <= 0) fail(`${s.id} 场次不合法`);
  if (s.rank != null && s.teams != null && s.rank > s.teams) fail(`${s.id} 名次大于参赛队数`);
  if (s.rank != null && s.played != null && s.played < s.teams - 1) fail(`${s.id} 场次少于单循环下限`);
}

// 3. 荣誉的赛季必须在赛季表里
const ids = new Set(seasons.map((s) => s.id));
for (const h of honors) if (!ids.has(h.season)) fail(`荣誉赛季不存在：${h.season} ${h.trophy}`);

const champ = new Set(honors.filter((h) => h.kind === "champion").map((h) => h.season));
console.log("══════════════════════════════════════════");
console.log("球门飘客 · 数据体检");
console.log("══════════════════════════════════════════");
console.log(`球员 ${players.length} 人 · 赛季 ${seasons.length} 个 · 荣誉 ${honors.length} 项 · 冠军赛季 ${champ.size} 个`);
console.log(`位置已填 ${players.filter((p) => p.position).length}/${players.length} · 照片已填 ${players.filter((p) => p.photo).length}/${players.length}`);
console.log(bad === 0 ? "✅ 全部通过" : `❌ ${bad} 处问题`);
process.exit(bad === 0 ? 0 : 1);
