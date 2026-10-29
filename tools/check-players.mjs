#!/usr/bin/env node
/**
 * 名单体检：跑 `node tools/check-players.mjs`
 * 只读 data/players.json，不改任何东西。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { players, source, updated } = JSON.parse(
  readFileSync(join(root, "data/players.json"), "utf8")
);

const POS = ["GK", "CB", "LB", "RB", "FB", "DM", "CM", "AM", "LM", "RM", "ST"];
const STATUS = ["active", "retired"];
const errors = [];
const warns = [];

// 1. 号码唯一 + 范围
const seen = new Map();
const noNumber = [];
for (const p of players) {
  if (p.number == null) {
    noNumber.push(p.name);
    continue;
  }
  if (!Number.isInteger(p.number) || p.number < 1 || p.number > 99) {
    errors.push(`号码非法：${p.name} -> ${p.number}`);
  }
  if (seen.has(p.number)) {
    errors.push(`号码重复：${p.number}（${seen.get(p.number)} / ${p.name}）`);
  }
  seen.set(p.number, p.name);
}

// 2. 必填
if (!players.length) errors.push("名单是空的");

// 3. 位置
const noPos = players.filter((p) => !p.position);
const badPos = players.filter((p) => {
  const codes = p.positions ?? (p.position ? [p.position] : []);
  return codes.some((c) => !POS.includes(c));
});
const badStatus = players.filter((p) => p.status != null && !STATUS.includes(p.status));
if (badStatus.length) {
  errors.push(`状态取值非法（只能是 active / retired）：` + badStatus.map((p) => `${p.name}=${p.status}`).join(", "));
}
if (badPos.length) {
  errors.push(
    `位置取值非法（只能是 ${POS.join("/")}）：` +
      badPos.map((p) => `${p.name}=${p.position}`).join(", ")
  );
}

// 4. 照片
const noPhoto = players.filter((p) => !p.photo);
const noJoined = players.filter((p) => !p.joined);

// 输出
const bar = (c = "─") => console.log(c.repeat(58));
bar("═");
console.log(`球门飘客 · 名单体检`);
bar("═");
console.log(`来源      ${source}`);
console.log(`更新      ${updated}`);
console.log(`总人数    ${players.length}`);
console.log(`现役/退役 ${players.filter((p) => p.status === "active").length} / ${players.filter((p) => p.status === "retired").length}（待确认 ${players.filter((p) => !p.status).length}）`);
const nums = players.map((p) => p.number).filter((n) => n != null);
console.log(`号码范围  ${Math.min(...nums)} – ${Math.max(...nums)}${noNumber.length ? ` · 无号码 ${noNumber.length} 人` : ""}`);
console.log(`位置已填  ${players.length - noPos.length}/${players.length}`);
console.log(`照片已填  ${players.length - noPhoto.length}/${players.length}`);
console.log(`加入年已填 ${players.length - noJoined.length}/${players.length}`);

if (noPos.length) {
  bar();
  console.log(`缺位置（${noPos.length} 人）—— 按 ${POS.join(" / ")} 填：`);
  console.log("  " + noPos.map((p) => `${p.number} ${p.name}`).join("  ·  "));
}

if (noPhoto.length) {
  bar();
  console.log(`缺照片（${noPhoto.length} 人）—— 填 public/photos/ 下的文件名：`);
  console.log("  " + noPhoto.map((p) => `${p.number} ${p.name}`).join("  ·  "));
}

bar();
if (errors.length) {
  console.log(`❌ ${errors.length} 个错误，构建会被拦住：`);
  for (const e of errors) console.log("   · " + e);
  process.exitCode = 1;
} else {
  console.log("✅ 结构校验通过（号码唯一、范围合法）");
}
