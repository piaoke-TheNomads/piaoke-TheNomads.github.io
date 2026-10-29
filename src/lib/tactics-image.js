const WIDTH = 1800;
const MARGIN = 60;
const PAPER = "#faf8f4";
const INK = "#101a2e";
const CJK = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", system-ui, sans-serif';
const DISPLAY = `"Barlow Condensed", "Arial Narrow", ${CJK}`;

const cleanText = (value, fallback = "") =>
  typeof value === "string" ? value.replace(/\s+/gu, " ").trim() || fallback : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

async function loadFonts() {
  if (!document.fonts) return;
  let timer;
  try {
    // Font faces are already declared by the site's local stylesheet. A timeout
    // keeps export available when a font fails; the system CJK stack remains usable.
    await Promise.race([
      Promise.allSettled([
        document.fonts.load(`700 58px ${DISPLAY}`, "0123456789"),
        document.fonts.load(`600 28px ${DISPLAY}`, "THE NOMADS"),
        document.fonts.load(`600 48px ${CJK}`, "球门飘客"),
      ]),
      new Promise((resolve) => { timer = window.setTimeout(resolve, 2000); }),
    ]);
  } catch {
    // Some browsers reject a font query. Canvas still has system-font fallbacks.
  } finally {
    window.clearTimeout(timer);
  }
}

function fitLines(ctx, text, maxWidth, maxLines) {
  const chars = Array.from(text);
  const lines = [];
  let line = "";
  for (let i = 0; i < chars.length; i += 1) {
    const next = line + chars[i];
    if (!line || ctx.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      while (line && ctx.measureText(`${line}…`).width > maxWidth) {
        line = Array.from(line).slice(0, -1).join("");
      }
      return [...lines, `${line}…`];
    }
    lines.push(line.trim());
    line = chars[i];
  }
  if (line) lines.push(line.trim());
  return lines;
}

function roundedRect(ctx, x, y, width, height, radius) {
  // Explicit curves also work in browsers that do not implement roundRect().
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawPitch(ctx, rect) {
  const scale = rect.width / 96;
  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#4f8d5c";
  ctx.fillRect(0, 0, 96, 66);
  for (let stripe = 0; stripe < 8; stripe += 1) {
    ctx.fillStyle = stripe % 2 ? "rgba(0,0,0,0.045)" : "rgba(255,255,255,0.045)";
    ctx.fillRect(stripe * 12, 0, 12, 66);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.84)";
  ctx.fillStyle = "rgba(255,255,255,0.84)";
  ctx.lineWidth = 0.19;
  ctx.lineCap = "round";
  ctx.strokeRect(3, 3, 90, 60);
  ctx.beginPath();
  ctx.moveTo(48, 3);
  ctx.lineTo(48, 63);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(48, 33, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(3, 18, 9, 30);
  ctx.strokeRect(84, 18, 9, 30);
  ctx.strokeRect(3, 25.5, 3.75, 15);
  ctx.strokeRect(89.25, 25.5, 3.75, 15);
  for (const x of [15, 48, 81]) {
    ctx.beginPath();
    ctx.arc(x, 33, 0.33, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const path of [
    "M12 24.515 A9 9 0 0 1 12 41.485",
    "M84 24.515 A9 9 0 0 0 84 41.485",
    "M3 4.5 A1.5 1.5 0 0 0 4.5 3",
    "M91.5 3 A1.5 1.5 0 0 0 93 4.5",
    "M4.5 63 A1.5 1.5 0 0 0 3 61.5",
    "M93 61.5 A1.5 1.5 0 0 0 91.5 63",
  ]) {
    ctx.stroke(new Path2D(path));
  }
  // The goals align with the two goal lines, leaving the 96 × 66 board intact.
  for (const x of [0.8, 93]) {
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(x, 27, 2.2, 12);
    ctx.strokeRect(x, 27, 2.2, 12);
    ctx.save();
    ctx.lineWidth = 0.045;
    for (let y = 28; y < 39; y += 1) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2.2, y);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawPlayer(ctx, placement, player, rect) {
  const x = rect.x + placement.x / 100 * rect.width;
  const y = rect.y + placement.y / 100 * rect.height;
  const radius = 39;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.shadowColor = "rgba(16,26,46,0.25)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAPER;
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.font = `700 47px ${DISPLAY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const number = player.number == null ? "—" : String(player.number);
  ctx.fillText(number, x, y + 2, radius * 1.6);

  ctx.font = `500 27px ${CJK}`;
  const lines = fitLines(ctx, cleanText(player.name, "未命名队员"), 230, 2);
  const lineHeight = 35;
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 24;
  const height = lines.length * lineHeight + 10;
  // Keep labels inside the pitch at its left/right edges. Near the bottom,
  // place the label above its token so even y=100 remains fully visible.
  const labelX = clamp(x - width / 2, rect.x + 8, rect.x + rect.width - width - 8);
  const below = y + radius + 10;
  const labelY = below + height <= rect.y + rect.height - 8
    ? below
    : y - radius - height - 10;
  ctx.fillStyle = "rgba(16,26,46,0.93)";
  roundedRect(ctx, labelX, labelY, width, height, 6);
  ctx.fill();
  ctx.fillStyle = PAPER;
  lines.forEach((line, index) => {
    ctx.fillText(line, labelX + width / 2, labelY + 5 + lineHeight * (index + 0.5));
  });
  ctx.restore();
}

/**
 * Render a portable PNG from normalized board data, without reading page DOM.
 * @param {{id: string, name: string, formation: string, placements: Array<{playerId: string, x: number, y: number}>, updatedAt?: string}} plan
 * @param {Array<{id: string, number: number|null, name: string}>} players
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 */
export async function createTacticsImage(plan, players) {
  if (typeof document === "undefined") {
    throw new Error("请在浏览器中打开战术板后导出图片。");
  }
  if (!Array.isArray(plan?.placements) || !Array.isArray(players) || plan.placements.length > 8) {
    throw new Error("阵容数据不完整，请重新载入方案后再导出。");
  }
  const byId = new Map(players.map((player) => [player.id, player]));
  const seen = new Set();
  for (const placement of plan.placements) {
    if (!placement || !byId.has(placement.playerId) || seen.has(placement.playerId)
      || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)
      || placement.x < 0 || placement.x > 100 || placement.y < 0 || placement.y > 100) {
      throw new Error("阵容中的队员或站位数据有误，请调整后再导出。");
    }
    seen.add(placement.playerId);
  }
  await loadFonts();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器无法生成图片，请换用浏览器打开战术板。");

  ctx.font = `600 52px ${CJK}`;
  const title = cleanText(plan.name, "战术方案");
  const titleLines = fitLines(ctx, title, WIDTH - MARGIN * 2, 2);
  const rect = {
    x: MARGIN,
    y: 112 + titleLines.length * 68 + 100,
    width: WIDTH - MARGIN * 2,
    height: (WIDTH - MARGIN * 2) * 66 / 96,
  };
  canvas.width = WIDTH;
  canvas.height = rect.y + rect.height + 88;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = INK;
  ctx.font = `600 34px ${CJK}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("球门飘客", MARGIN, 66);
  ctx.font = `600 28px ${DISPLAY}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "#6e7691";
  ctx.fillText("THE NOMADS", WIDTH - MARGIN, 66);
  ctx.strokeStyle = "#cec6b6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 91);
  ctx.lineTo(WIDTH - MARGIN, 91);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `600 52px ${CJK}`;
  titleLines.forEach((line, index) => ctx.fillText(line, MARGIN, 161 + index * 68));
  ctx.font = `400 26px ${CJK}`;
  ctx.fillStyle = "#6e7691";
  const formation = cleanText(plan.formation);
  const formationLabel = /^\d(?:-\d){1,3}$/.test(formation) ? ` · ${formation}` : "";
  ctx.fillText(`八人制${formationLabel} · 场上 ${plan.placements.length} 人`, MARGIN, rect.y - 68);
  drawPitch(ctx, rect);
  plan.placements.forEach((placement) => drawPlayer(ctx, placement, byId.get(placement.playerId), rect));

  let blob;
  try {
    blob = await new Promise((resolve, reject) => {
      try { canvas.toBlob(resolve, "image/png"); } catch (error) { reject(error); }
    });
  } catch {
    throw new Error("图片生成失败，请重试或换用浏览器打开战术板。");
  }
  if (!blob?.size) throw new Error("图片生成失败，请重试或换用浏览器打开战术板。");
  return { blob, width: canvas.width, height: canvas.height };
}
