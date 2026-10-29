import { readFileSync, writeFileSync } from "node:fs";
const { players } = JSON.parse(readFileSync("data/players.json", "utf8"));

const STATUS = { active: "现役", retired: "退役" };

const rows = [["号码", "姓名", "状态(现役/退役)", "位置(GK/CB/LB/RB/FB/DM/CM/AM/LM/RM/ST)", "照片文件名", "加入年份", "备注"]];
for (const p of players) {
  rows.push([
    p.number ?? "",
    p.name,
    p.status ? STATUS[p.status] : "",
    p.positions?.join("/") ?? p.position ?? "",
    p.photo ?? "",
    p.joined ?? "",
    "",
  ]);
}

const esc = (c) => {
  const s = String(c);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
writeFileSync("data/players.todo.csv", csv);
console.log("wrote", rows.length - 1, "rows");
