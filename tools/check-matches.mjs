import { readFile } from "node:fs/promises";
import { validateMatches } from "../src/lib/matches.js";
const data = JSON.parse(await readFile(new URL("../data/matches.json", import.meta.url), "utf8"));
const { seasons } = JSON.parse(await readFile(new URL("../data/seasons.json", import.meta.url), "utf8"));
const errors = validateMatches(data, seasons);
if (errors.length) {
  console.error(`比赛数据检查失败：\n${errors.map((error) => `  - ${error}`).join("\n")}`);
  process.exitCode = 1;
} else console.log(`比赛数据检查通过：${data.matches.length} 场比赛，${seasons.length} 个赛季。`);
