import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

// Use an isolated browser; never alters the user's saved plans.
// Start the dev/preview server first, or pass the published tactics URL.
const url = process.argv[2] || 'http://127.0.0.1:4321/tactics/';
const key = 'qmpk-tactics-v3';
const legacyKey = 'qmpk-tactics-v2';
const output = await mkdtemp(join(tmpdir(), 'qmpk-tactics-e2e-'));
const browser = await chromium.launch();
const errors = [];
const watch = (page) => page.on('pageerror', (e) => errors.push(e.message));
const state = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
const current = (library) => library.plans.find((p) => p.id === library.activeId);
const positions = (page) => page.locator('.tactics-token').evaluateAll((tokens) => Object.fromEntries(tokens.map((el) => [el.dataset.number, { id: el.dataset.playerId, x: parseFloat(el.style.left), y: parseFloat(el.style.top) }])));
const action = (page, name) => page.locator(`[data-action="${name}"]`).click();
const token = (page, number) => page.locator(`.tactics-token[data-number="${number}"]`);
const chip = (page, number) => page.locator(`.tactics-chip[data-number="${number}"]`);
const pass = (name) => console.log(`PASS ${name}`);
async function open(context) {
  const page = await context.newPage(); watch(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-plan-select]')?.options.length > 0);
  return page;
}
async function drag(page, source, x, y) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const board = await page.locator('[data-board]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(board.x + board.width * x / 100, board.y + board.height * y / 100, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(130); // pointer click suppression expires
}
async function namePlan(page, actionName, name) {
  await action(page, actionName);
  await page.locator('[data-plan-name]').fill(name);
  await page.locator('[data-name-form] button[type="submit"]').click();
  await page.locator('[data-name-dialog]').waitFor({ state: 'hidden' });
}
async function importFile(page, content) {
  await page.locator('[data-import-file]').setInputFiles({ name: 'plans.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await page.waitForTimeout(150);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1800 }, acceptDownloads: true });
  const page = await open(context);
  const initial = await positions(page);
  assert.equal(Object.keys(initial).length, 8);
  assert.equal(new Set(Object.values(initial).map((p) => p.id)).size, 8);
  assert.equal(initial[87].x, 8, 'registered primary goalkeeper starts in goal');
  assert.equal(initial[87].y, 50);
  pass('默认八人阵容，真实门将优先且无人重复');

  const benchNumber = await page.locator('.tactics-chip:not(.is-on)').first().getAttribute('data-number');
  await drag(page, chip(page, benchNumber), 90, 15);
  assert.deepEqual(await positions(page), initial);
  assert.match(await page.locator('[data-status]').innerText(), /8 人/);
  pass('满员时不能增加第九人');

  const replaceNumber = Object.keys(initial).find((n) => n !== '87');
  const replaceSpot = initial[replaceNumber];
  await drag(page, chip(page, benchNumber), replaceSpot.x, replaceSpot.y);
  let now = await positions(page);
  assert.equal(Object.keys(now).length, 8);
  assert.equal(now[replaceNumber], undefined);
  assert.equal(now[benchNumber].x, replaceSpot.x);
  assert.equal(now[benchNumber].y, replaceSpot.y);
  const other = Object.keys(now).find((n) => n !== benchNumber && n !== '87');
  const otherSpot = now[other];
  await drag(page, token(page, benchNumber), otherSpot.x, otherSpot.y);
  now = await positions(page);
  assert.equal(now[other].x, replaceSpot.x);
  assert.equal(now[other].y, replaceSpot.y);
  assert.equal(now[benchNumber].x, otherSpot.x);
  assert.equal(now[benchNumber].y, otherSpot.y);
  pass('替补覆盖换人、场上拖拽换位');

  await token(page, benchNumber).focus();
  await page.keyboard.press('Delete');
  assert.equal(await page.locator('.tactics-token').count(), 7);
  await chip(page, replaceNumber).focus();
  await page.keyboard.press('Enter');
  const board = page.locator('[data-board]');
  await board.click({ position: { x: (await board.boundingBox()).width * .9, y: (await board.boundingBox()).height * .35 } });
  assert.equal(await page.locator('.tactics-token').count(), 8);
  const beforeKey = (await positions(page))[replaceNumber];
  await token(page, replaceNumber).focus(); await page.keyboard.press('ArrowLeft');
  assert.equal((await positions(page))[replaceNumber].x, beforeKey.x - 1);
  const edited = await state(page);
  await page.reload({ waitUntil: 'networkidle' });
  assert.deepEqual(await state(page), edited);
  pass('下场、点击上场、键盘微调及刷新保存');

  const originalId = edited.activeId;
  await namePlan(page, 'save-as', '比赛方案');
  const copiedId = (await state(page)).activeId;
  assert.notEqual(copiedId, originalId);
  assert.deepEqual(current(await state(page)).placements, current(edited).placements);
  await namePlan(page, 'rename', '客场方案');
  await page.locator('[data-formation]').selectOption('2-3-2');
  assert.deepEqual(current(await state(page)).placements.map((p) => p.playerId).sort(), current(edited).placements.map((p) => p.playerId).sort());
  await page.locator('[data-plan-select]').selectOption(originalId);
  assert.deepEqual(current(await state(page)).placements, current(edited).placements);
  await page.locator('[data-plan-select]').selectOption(copiedId);
  await action(page, 'delete');
  assert.equal((await state(page)).plans.length, 1);
  await action(page, 'undo');
  assert.equal((await state(page)).plans.length, 2);
  assert.equal(current(await state(page)).name, '客场方案');
  await namePlan(page, 'new', '空白方案');
  assert.equal(await page.locator('.tactics-token').count(), 0);
  await action(page, 'reset');
  assert.deepEqual(await positions(page), initial);
  await action(page, 'undo');
  assert.equal(await page.locator('.tactics-token').count(), 0);
  await page.locator('[data-plan-select]').selectOption(copiedId);
  pass('新建、另存、重命名、切换独立方案、阵型及撤销');

  const savedBeforeExport = await state(page);
  const backupDownload = page.waitForEvent('download');
  await action(page, 'backup');
  const backup = await readFile(await (await backupDownload).path(), 'utf8');
  assert.deepEqual(JSON.parse(backup), savedBeforeExport);
  await importFile(page, backup);
  const imported = await state(page);
  assert.equal(imported.plans.length, savedBeforeExport.plans.length * 2);
  assert.deepEqual(imported.plans.slice(0, savedBeforeExport.plans.length), savedBeforeExport.plans);
  assert.equal(new Set(imported.plans.map((p) => p.id)).size, imported.plans.length);
  assert.equal(new Set(imported.plans.map((p) => p.name)).size, imported.plans.length);
  await importFile(page, '{broken');
  assert.deepEqual(await state(page), imported);
  assert.match(await page.locator('[data-status]').innerText(), /有效的 JSON/);
  await importFile(page, ' '.repeat(256 * 1024 + 1));
  assert.deepEqual(await state(page), imported);
  pass('备份往返、追加不覆盖、同名处理及无效文件隔离');

  await page.locator('[data-plan-select]').selectOption(copiedId);
  await action(page, 'image');
  await page.locator('[data-image-download]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-action="share"]').isVisible(), false, 'desktop without native file sharing keeps download');
  const pngDownload = page.waitForEvent('download');
  await page.locator('[data-image-download]').click();
  const png = await readFile(await (await pngDownload).path());
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1800);
  await action(page, 'close-image');
  await page.screenshot({ path: join(output, 'tactics-desktop.png'), fullPage: true });
  pass('PNG生成、预览、下载以及系统分享不可用时降级');

  const migrationContext = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const old = { onField: { GK: 87, D1: 10, D2: 10, D3: 999, M1: 22 }, spots: { GK: { x: 12, y: 44 }, D1: { x: 29, y: 17 }, D2: { x: 90, y: 20 }, M1: { x: -10, y: 999 } } };
  await migrationContext.addInitScript(({ legacyKey, old }) => {
    if (!localStorage.getItem(legacyKey)) localStorage.setItem(legacyKey, JSON.stringify(old));
  }, { legacyKey, old });
  const migratedPage = await open(migrationContext);
  const migrated = await positions(migratedPage);
  assert.deepEqual(Object.keys(migrated).sort(), ['10', '22', '87']);
  assert.equal(migrated[87].x, 12); assert.equal(migrated[87].y, 44);
  assert.equal(migrated[22].x, 4); assert.equal(migrated[22].y, 90);
  assert.deepEqual(await migratedPage.evaluate((k) => JSON.parse(localStorage.getItem(k + '-backup')), legacyKey), old);
  pass('旧版迁移保留手工站位、修复重复/缺失球员并备份原记录');

  const blockedContext = await browser.newContext();
  await blockedContext.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
  const blockedPage = await open(blockedContext);
  assert.match(await blockedPage.locator('[data-save-state]').innerText(), /尚未保存/);
  await action(blockedPage, 'reset');
  assert.match(await blockedPage.locator('[data-status]').innerText(), /刷新会丢失/);
  assert.equal(await blockedPage.locator('.tactics-token').count(), 8);
  pass('存储失败明确告知，当前阵容仍可操作和导出');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await mobileContext.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true });
    Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('cancel', 'AbortError'); } });
  });
  const mobile = await open(mobileContext);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no mobile page overflow');
  await mobile.locator('[data-board]').scrollIntoViewIfNeeded();
  const mtoken = token(mobile, 87), box = await mtoken.boundingBox(), mboard = await mobile.locator('[data-board]').boundingBox();
  const session = await mobileContext.newCDPSession(mobile);
  const sx = box.x + box.width / 2, sy = box.y + box.height / 2;
  const ex = mboard.x + mboard.width * .15, ey = mboard.y + mboard.height * .6;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  for (let step = 1; step <= 8; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (ex - sx) * step / 8, y: sy + (ey - sy) * step / 8 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const moved = (await positions(mobile))[87];
  assert.ok(Math.abs(moved.x - 15) < 1 && Math.abs(moved.y - 60) < 1, 'touch drag updates placement');
  await mobile.waitForTimeout(150);
  await mobile.screenshot({ path: join(output, 'tactics-mobile.png'), fullPage: true });
  await action(mobile, 'image');
  await mobile.locator('[data-action="share"]').waitFor({ state: 'visible' });
  const shareStatus = await mobile.locator('[data-image-status]').innerText();
  await action(mobile, 'share');
  assert.equal(await mobile.locator('[data-image-status]').innerText(), shareStatus, 'cancelled sharing is not reported as error');
  assert.equal(await mobile.locator('[data-image-download]').isVisible(), true);
  pass('390px布局、真实触摸事件拖动、分享取消仍可下载');

  assert.deepEqual(errors, []);
  pass('所有浏览器场景无脚本异常');
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
