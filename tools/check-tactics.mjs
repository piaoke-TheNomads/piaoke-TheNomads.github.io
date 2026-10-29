import { chromium } from "playwright";

// 战术板端到端自检：跑现役名单拖拽、换位、双击下场、刷新持久化、恢复默认五条路径。
// 用法：node tools/check-tactics.mjs [url]
// 注意：playwright 拖拽必须在 mouse.down() 后等待约 80ms 再移动，
// 否则第一次 pointermove 与按下过近，会被当成「没拖」而回滚。

const URL = process.argv[2] || "https://piaoke-thenomads.github.io/tactics/";
const PICK = "77";
const OTHER = "9";

// 默认阵型的八人站位，供「恢复默认」断言比对
const defaultSpot = {
  5: "8%,50%",
  9: "26%,18%",
  10: "26%,50%",
  11: "26%,82%",
  12: "52%,32%",
  22: "52%,68%",
  25: "76%,32%",
  37: "76%,68%",
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const boardBox = () =>
  page.evaluate(() => {
    const r = document.querySelector("[data-board]").getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height };
  });

// 取元素几何中心。必须用 height 算 y —— chip 不是正方形，用 width 会点到上方空白。
const center = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);

const positions = () =>
  page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll(".tactics-token")) {
      out[el.dataset.number] = `${el.style.left},${el.style.top}`;
    }
    return out;
  });

async function drag(fromSel, fx, fy) {
  const from = await center(fromSel);
  if (!from) throw new Error(`找不到元素 ${fromSel}`);
  const board = await boardBox();
  await page.mouse.move(from.x, from.y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.move(from.x + 10, from.y - 20, { steps: 3 });
  await page.mouse.move(board.l + board.w * fx, board.t + board.h * fy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);

// A 场下棋子拖到空地
await drag(`.tactics-chip[data-number="${PICK}"]`, 0.7, 0.2);
const a = await positions();
check("A 场下拖上场", !!a[PICK], `${PICK} → ${a[PICK]}`);

// B 两枚棋子换位
await drag(`.tactics-token[data-number="${PICK}"]`, 0.26, 0.18);
const bPos = await positions();
check(
  "B 场上换位",
  bPos[OTHER]?.startsWith("70%") && bPos[PICK]?.startsWith("26%"),
  `${PICK}=${bPos[PICK]} ${OTHER}=${bPos[OTHER]}`,
);

// C 双击下场
const target = await center(`.tactics-token[data-number="${OTHER}"]`);
await page.mouse.move(target.x, target.y);
await page.waitForTimeout(60);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(120);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(400);
const cPos = await positions();
check("C 双击下场", !cPos[OTHER], `剩 ${Object.keys(cPos).length} 人`);

// D 刷新后保留
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);
const dPos = await positions();
check("D 刷新后状态保留", dPos[PICK] === bPos[PICK], `${PICK} 仍在 ${dPos[PICK]}`);

// E 恢复默认
await page.click("[data-action='reset']");
await page.waitForTimeout(400);
const ePos = await positions();
// 默认阵型按号码升序优先占位：后卫取 9/10/11，77 号（RB）会落在替补席上
const DEFAULT_ON_FIELD = ["5", "9", "10", "11", "12", "22", "25", "37"];
const eKeys = Object.keys(ePos).sort((x, y) => x - y);
check(
  "E 恢复默认阵型",
  eKeys.length === 8 && DEFAULT_ON_FIELD.every((n) => ePos[n] === defaultSpot[n]),
  `${eKeys.length} 人在场`,
);

check("无 JS 报错", errors.length === 0, errors.join("; "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
