import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { PNG } from './png.mjs';

// Browser contexts and generated artifacts are isolated from the user's saved plans.
const url = process.argv[2] || 'http://127.0.0.1:4321/tactics/';
const key = 'qmpk-tactics-v3';
const output = await mkdtemp(join(tmpdir(), 'qmpk-tactics-drawing-'));
const browser = await chromium.launch();
const errors = [];
const current = (library) => library.plans.find((plan) => plan.id === library.activeId);
const state = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
const active = async (page) => current(await state(page));
const markings = (plan) => ({
  annotations: (plan.annotations ?? []).map(({ type, from, to }) => ({ type, from, to })),
  ball: plan.ball ?? null,
});
const action = (page, name) => page.locator(`[data-action="${name}"]`).click();
const tool = (page, name) => page.locator(`[data-tool="${name}"]`).click();
const token = (page, number) => page.locator(`.tactics-token[data-number="${number}"]`);
const pass = (message) => console.log(`PASS ${message}`);
const near = (point, expected, message) => assert.ok(Math.abs(point.x - expected.x) < 1 && Math.abs(point.y - expected.y) < 1, message);
async function open(context) {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-plan-select]')?.options.length > 0);
  return page;
}
async function boardPoint(page, point) {
  const board = page.locator('[data-board]');
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox();
  return { x: box.x + box.width * point.x / 100, y: box.y + box.height * point.y / 100 };
}
async function clickBoard(page, point) {
  const target = await boardPoint(page, point);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(150);
}
async function draw(page, from, to) {
  const start = await boardPoint(page, from);
  const end = await boardPoint(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}
async function holdElementDrag(page, locator, target) {
  await page.locator('[data-board]').scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const end = await boardPoint(page, target);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
}
async function dragElement(page, locator, target) {
  await holdElementDrag(page, locator, target);
  await page.mouse.up();
  await page.waitForTimeout(150);
}
async function namePlan(page, actionName, name) {
  await action(page, actionName);
  await page.locator('[data-plan-name]').fill(name);
  await page.locator('[data-name-form] button[type="submit"]').click();
  await page.locator('[data-name-dialog]').waitFor({ state: 'hidden' });
}
async function exportPNG(page, filename) {
  await action(page, 'image');
  await page.locator('[data-image-download]').waitFor({ state: 'visible' });
  const download = page.waitForEvent('download');
  await page.locator('[data-image-download]').click();
  const bytes = await readFile(await (await download).path());
  await writeFile(join(output, filename), bytes);
  await action(page, 'close-image');
  const decoded = PNG.decode(bytes);
  assert.equal(decoded.width, 1800);
  assert.ok(decoded.height > 700);
  return decoded;
}
function changedPixels(a, b) {
  assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 50) count++;
  }
  return count;
}
async function touchDrag(context, page, from, to, { cancel = false } = {}) {
  const session = await context.newCDPSession(page);
  const start = await boardPoint(page, from);
  const end = await boardPoint(page, to);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (let step = 1; step <= 10; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * step / 10, y: start.y + (end.y - start.y) * step / 10 }] });
  }
  if (cancel) assert.ok(await page.locator('[data-draft]').count() > 0, 'touch movement has a visible draft before cancellation');
  await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  await session.detach();
  await page.waitForTimeout(150);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1800 }, acceptDownloads: true });
  const page = await open(context);
  const baseline = await active(page);
  const unmarkedPNG = await exportPNG(page, 'before-markings.png');
  const originalId = baseline.id;
  const initialPositions = baseline.placements;
  await tool(page, 'run');
  const keeper = await token(page, 6).boundingBox();
  const board = await page.locator('[data-board]').boundingBox();
  const keeperPoint = { x: (keeper.x + keeper.width / 2 - board.x) * 100 / board.width, y: (keeper.y + keeper.height / 2 - board.y) * 100 / board.height };
  await draw(page, keeperPoint, { x: 30, y: 43 });
  let plan = await active(page);
  assert.equal(plan.annotations.length, 1);
  assert.equal(plan.annotations[0].type, 'run');
  near(plan.annotations[0].from, keeperPoint, 'running arrow starts on the player');
  near(plan.annotations[0].to, { x: 30, y: 43 }, 'running arrow ends at the drag destination');
  assert.deepEqual(plan.placements, initialPositions, 'drawing from a player does not move that player');
  await tool(page, 'pass');
  await draw(page, { x: 35, y: 18 }, { x: 70, y: 35 });
  plan = await active(page);
  assert.equal(plan.annotations.length, 2);
  assert.equal(plan.annotations[1].type, 'pass');
  near(plan.annotations[1].to, { x: 70, y: 35 }, 'passing arrow ends at the drag destination');
  assert.deepEqual(plan.placements, initialPositions);
  pass('桌面拖画跑位与传球，可从球员起笔且不移动球员');

  await tool(page, 'run');
  const beforeCancelledPoint = await state(page);
  await clickBoard(page, { x: 40, y: 70 });
  assert.equal(await page.locator('[data-draft]').count(), 1, 'first tap displays a pending endpoint');
  assert.equal((await active(page)).annotations.length, 2, 'first tap is not a saved line');
  await page.keyboard.press('Escape'); // Do not focus manually: this verifies pointerdown moved focus off the tool button.
  assert.equal(await page.locator('[data-draft]').count(), 0);
  assert.equal(await page.locator('[data-tool="move"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await state(page), beforeCancelledPoint, 'Escape discards the draft without touching saved data');
  pass('点第一端后直接按Esc取消，草稿消失并回到移动工具，已存阵容不变');

  await tool(page, 'run');
  await clickBoard(page, { x: 40, y: 70 });
  assert.equal((await active(page)).annotations.length, 2, 'first tap is only a draft endpoint');
  await clickBoard(page, { x: 70, y: 80 });
  plan = await active(page);
  assert.equal(plan.annotations.length, 3);
  near(plan.annotations[2].from, { x: 40, y: 70 }, 'tap endpoint one');
  near(plan.annotations[2].to, { x: 70, y: 80 }, 'tap endpoint two');
  pass('点按两端生成箭头，第一点不会提前保存半条线');

  await tool(page, 'ball');
  await clickBoard(page, { x: 55, y: 50 });
  assert.equal(await page.locator('[data-ball]').count(), 1);
  near((await active(page)).ball, { x: 55, y: 50 }, 'ball placement');
  assert.equal(await page.locator('[data-ball]').evaluate((ball) => document.activeElement === ball), true, 'newly placed football receives keyboard focus');
  await page.keyboard.press('ArrowRight');
  near((await active(page)).ball, { x: 56, y: 50 }, 'keyboard nudge immediately after placement');
  await page.keyboard.press('Shift+ArrowDown');
  near((await active(page)).ball, { x: 56, y: 54 }, 'Shift plus arrow moves the football four percent');
  const keyboardBall = (await active(page)).ball;
  await page.keyboard.press('Delete');
  assert.equal((await active(page)).ball, null);
  assert.equal(await page.locator('[data-ball]').count(), 0);
  assert.deepEqual((await active(page)).placements, initialPositions, 'keyboard deletion removes only the football');
  await action(page, 'undo');
  assert.deepEqual((await active(page)).ball, keyboardBall);
  assert.equal(await page.locator('[data-ball]').count(), 1);
  pass('放球后立即方向键微调、Shift加速、Delete移除和撤销恢复，无需手动重新聚焦');
  await tool(page, 'move');
  await dragElement(page, page.locator('[data-ball]'), { x: 73, y: 60 });
  near((await active(page)).ball, { x: 73, y: 60 }, 'ball drag');
  assert.deepEqual((await active(page)).placements, initialPositions);
  const withMarkings = markings(await active(page));
  const markedPNG = await exportPNG(page, 'with-markings.png');
  assert.ok(changedPixels(unmarkedPNG, markedPNG) > 1000, 'export renders the annotations and football');
  pass('足球放置与拖动独立于球员，标记和球会出现在PNG中');

  await tool(page, 'erase');
  const removedLine = (await active(page)).annotations[0];
  await clickBoard(page, { x: (removedLine.from.x + removedLine.to.x) / 2, y: (removedLine.from.y + removedLine.to.y) / 2 });
  plan = await active(page);
  assert.equal(plan.annotations.length, 2);
  assert.ok(!plan.annotations.some((line) => line.id === removedLine.id), 'erase affects only the chosen line');
  assert.deepEqual(plan.ball, withMarkings.ball);
  await action(page, 'undo');
  assert.deepEqual(markings(await active(page)), withMarkings);
  await action(page, 'clear-markings');
  assert.deepEqual(markings(await active(page)), { annotations: [], ball: null });
  assert.deepEqual((await active(page)).placements, initialPositions);
  await action(page, 'undo');
  assert.deepEqual(markings(await active(page)), withMarkings);
  pass('单条擦除、清空标记和撤销，球员站位不受影响');

  await namePlan(page, 'save-as', '定位球演练');
  const copiedId = (await active(page)).id;
  assert.notEqual(copiedId, originalId);
  assert.deepEqual(markings(await active(page)), withMarkings);
  await action(page, 'clear-markings');
  await page.locator('[data-plan-select]').selectOption(originalId);
  assert.deepEqual(markings(await active(page)), withMarkings);
  await page.locator('[data-plan-select]').selectOption(copiedId);
  assert.deepEqual(markings(await active(page)), { annotations: [], ball: null });
  await page.locator('[data-plan-select]').selectOption(originalId);
  const beforeReload = await state(page);
  await page.reload({ waitUntil: 'networkidle' });
  assert.deepEqual(await state(page), beforeReload);
  assert.deepEqual(markings(await active(page)), withMarkings);
  const download = page.waitForEvent('download');
  await action(page, 'backup');
  const backup = await readFile(await (await download).path(), 'utf8');
  assert.deepEqual(JSON.parse(backup), await state(page));
  await page.locator('[data-import-file]').setInputFiles({ name: 'drawing-plans.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.waitForFunction(({ key, count }) => JSON.parse(localStorage.getItem(key)).plans.length === count, { key, count: beforeReload.plans.length * 2 });
  const imported = await state(page);
  assert.equal(imported.plans.length, beforeReload.plans.length * 2);
  assert.deepEqual(imported.plans.slice(0, beforeReload.plans.length), beforeReload.plans);
  const newCopies = imported.plans.slice(beforeReload.plans.length);
  assert.ok(newCopies.some((copy) => JSON.stringify(markings(copy)) === JSON.stringify(withMarkings)));
  pass('方案复制、独立切换、刷新和备份导入保留箭头与足球，导入不覆盖原方案');
  await page.locator('[data-plan-select]').selectOption(originalId);
  await page.screenshot({ path: join(output, 'drawing-desktop.png'), fullPage: true });

  const raceContext = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
  const racePage = await open(raceContext);
  const raceOriginalId = (await active(racePage)).id;
  await namePlan(racePage, 'save-as', '切换目标');
  const raceOtherId = (await active(racePage)).id;
  await dragElement(racePage, token(racePage, 6), { x: 15, y: 62 });
  await racePage.locator('[data-plan-select]').selectOption(raceOriginalId);
  const beforeToolSwitch = await state(racePage);
  await holdElementDrag(racePage, token(racePage, 6), { x: 20, y: 44 });
  assert.equal(await token(racePage, 6).evaluate((element) => element.classList.contains('is-dragging')), true, 'player drag passes the movement threshold before changing tool');
  await racePage.locator('[data-tool="run"]').focus();
  await racePage.keyboard.press('Enter');
  assert.equal(await racePage.locator('[data-tool="run"]').getAttribute('aria-pressed'), 'true');
  await racePage.mouse.up();
  await racePage.waitForTimeout(150);
  assert.deepEqual((await state(racePage)).plans, beforeToolSwitch.plans, 'late pointerup after keyboard tool change cannot commit the old player drag');
  assert.equal(await racePage.locator('.is-dragging, .tactics-token--ghost').count(), 0);
  await tool(racePage, 'move');
  const beforePlanSwitch = await state(racePage);
  assert.notDeepEqual(beforePlanSwitch.plans[0].placements, beforePlanSwitch.plans[1].placements, 'test plans have different placements to expose cross-plan writes');
  await holdElementDrag(racePage, token(racePage, 6), { x: 21, y: 70 });
  assert.equal(await token(racePage, 6).evaluate((element) => element.classList.contains('is-dragging')), true);
  await racePage.locator('[data-plan-select]').selectOption(raceOtherId);
  await racePage.mouse.up();
  await racePage.waitForTimeout(150);
  assert.equal((await state(racePage)).activeId, raceOtherId);
  assert.deepEqual((await state(racePage)).plans, beforePlanSwitch.plans, 'late pointerup after plan change cannot alter either the source or destination plan');
  assert.equal(await racePage.locator('.is-dragging, .tactics-token--ghost').count(), 0);
  pass('球员拖动途中键盘切工具或切方案，随后抬起不会提交旧拖拽，两套阵容保持原样');

  const legacyContext = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const legacy = structuredClone(beforeReload);
  legacy.plans.forEach((item) => { delete item.annotations; delete item.ball; });
  legacy.plans[0].formation = '2-3-2';
  await legacyContext.addInitScript(({ key, legacy }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(legacy));
  }, { key, legacy });
  const legacyPage = await open(legacyContext);
  const legacyPlan = await active(legacyPage);
  assert.deepEqual(legacyPlan.placements, current(legacy).placements);
  assert.equal(legacyPlan.formation, '2-3-2');
  assert.deepEqual(markings(legacyPlan), { annotations: [], ball: null });
  pass('旧v3方案和232阵型可继续读取，未被新默认阵容覆盖');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mobile = await open(mobileContext);
  const mobilePositions = (await active(mobile)).placements;
  await tool(mobile, 'run');
  const beforeTouchCancel = await state(mobile);
  await touchDrag(mobileContext, mobile, { x: 8, y: 50 }, { x: 36, y: 43 }, { cancel: true });
  assert.equal(await mobile.locator('[data-draft]').count(), 0, 'pointercancel removes the drawn preview');
  assert.deepEqual(await state(mobile), beforeTouchCancel, 'cancelled touch does not save a partial line or move a player');
  pass('触摸拖画中触发真实touchCancel，预览消失且无半条线进入存储');
  await touchDrag(mobileContext, mobile, { x: 8, y: 50 }, { x: 36, y: 43 });
  assert.equal((await active(mobile)).annotations.length, 1);
  near((await active(mobile)).annotations[0].to, { x: 36, y: 43 }, 'touch drawing destination');
  assert.deepEqual((await active(mobile)).placements, mobilePositions);
  await tool(mobile, 'pass');
  const mobileStart = await boardPoint(mobile, { x: 38, y: 20 });
  await mobile.touchscreen.tap(mobileStart.x, mobileStart.y);
  const mobileEnd = await boardPoint(mobile, { x: 76, y: 32 });
  await mobile.touchscreen.tap(mobileEnd.x, mobileEnd.y);
  assert.equal((await active(mobile)).annotations.length, 2);
  assert.equal((await active(mobile)).annotations[1].type, 'pass');
  await tool(mobile, 'ball');
  const ballPoint = await boardPoint(mobile, { x: 50, y: 50 });
  await mobile.touchscreen.tap(ballPoint.x, ballPoint.y);
  await mobile.waitForTimeout(150);
  await tool(mobile, 'move');
  await touchDrag(mobileContext, mobile, { x: 50, y: 50 }, { x: 75, y: 62 });
  near((await active(mobile)).ball, { x: 75, y: 62 }, 'touch football drag');
  assert.deepEqual((await active(mobile)).placements, mobilePositions);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no mobile overflow');
  await mobile.screenshot({ path: join(output, 'drawing-mobile.png'), fullPage: true });
  pass('手机真实触摸拖画、两次点按、足球拖动及390px布局');

  const cappedContext = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
  const capped = structuredClone(beforeReload);
  current(capped).annotations = Array.from({ length: 40 }, (_, index) => ({
    id: `limit-${index}`, type: index % 2 ? 'pass' : 'run',
    from: { x: 15, y: 10 + index * 2 }, to: { x: 32, y: 10 + index * 2 },
  }));
  await cappedContext.addInitScript(({ key, capped }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(capped));
  }, { key, capped });
  const cappedPage = await open(cappedContext);
  await tool(cappedPage, 'run');
  await draw(cappedPage, { x: 60, y: 10 }, { x: 80, y: 20 });
  assert.equal((await active(cappedPage)).annotations.length, 40);
  assert.match(await cappedPage.locator('[data-status]').innerText(), /40/);
  assert.deepEqual((await active(cappedPage)).placements, current(capped).placements);
  pass('达到40条标记上限后不增加第41条，不影响已有站位');
  assert.deepEqual(errors, []);
  pass('新增绘图场景无浏览器脚本异常');
  console.log(`Artifacts: ${output}`);
} finally {
  await browser.close();
}
