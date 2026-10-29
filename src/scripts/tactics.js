import { STORAGE_KEY, LEGACY_KEY, MAX_PLANS, MAX_BACKUP_BYTES, FORMATIONS, copy, clamp, cleanName, makePlan, makeLibrary, defaultPlacements, applyDrop, applyFormation, parseBackup, migrateLegacy, appendPlans } from '../lib/tactics.js';
import { createTacticsImage } from '../lib/tactics-image.js';
import { initializeMarkings } from './tactics-markings.js';

const root = document.querySelector('.tactics-page');
if (root) initialize();

function initialize() {
  const players = JSON.parse(document.getElementById('tactics-players').textContent);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const $ = (selector) => document.querySelector(selector);
  const board = $('[data-board]'), onfield = $('[data-onfield]'), bench = $('[data-bench]');
  const planSelect = $('[data-plan-select]'), formationSelect = $('[data-formation]');
  const status = $('[data-status]'), saveState = $('[data-save-state]');
  const nameDialog = $('[data-name-dialog]'), imageDialog = $('[data-image-dialog]');
  let library, selectedId = null, history = [], drag = null, nameAction = null, suppressClickUntil = 0;
  let imageUrl = null, imageFile = null, imageGeneration = 0, storageBlocked = false;
  const current = () => library.plans.find((p) => p.id === library.activeId);
  const describe = (id) => { const p = playerMap.get(id); return p ? `${p.number ?? '—'} 号 ${p.name}` : ''; };
  const say = (message, error = false) => { status.textContent = message; status.classList.toggle('is-error', error); };

  const markings = initializeMarkings({ board, getPlan: current, change: (edit, message) => change(() => edit(current()), message), say, onToolChange: () => { cancelPlayerDrag(); selectedId = null; render(); } });

  function persist(message = '') {
    try {
      if (storageBlocked) throw new Error('original backup unavailable');
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
      saveState.textContent = '已保存在当前浏览器';
      saveState.classList.remove('is-error');
      if (message) say(message);
      return true;
    } catch {
      saveState.textContent = '尚未保存 · 请导出备份';
      saveState.classList.add('is-error');
      say(`${message ? `${message}。` : ''}当前浏览器无法保存，请导出方案备份；刷新会丢失本次改动。`, true);
      return false;
    }
  }
  function preserveRaw(key, raw) {
    try {
      const backupKey = `${key}-backup`;
      if (window.localStorage.getItem(backupKey) == null) window.localStorage.setItem(backupKey, raw);
      else if (window.localStorage.getItem(backupKey) !== raw) window.localStorage.setItem(`${backupKey}-${Date.now()}`, raw);
      return true;
    } catch { storageBlocked = true; return false; }
  }
  function load() {
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw != null) {
        const restored = parseBackup(raw, players);
        library = restored.library;
        if (restored.repairs) {
          preserveRaw(STORAGE_KEY, raw);
          persist(`已恢复阵容并修正 ${restored.repairs} 项无效记录，原始数据已保留`);
        }
        return;
      }
      raw = window.localStorage.getItem(LEGACY_KEY);
      if (raw != null) {
        preserveRaw(LEGACY_KEY, raw);
        const migrated = migrateLegacy(JSON.parse(raw), players);
        library = migrated.library;
        persist(`已迁移原有阵容${migrated.repairs ? `，修正 ${migrated.repairs} 项无效记录` : ''}。旧数据已保留`);
        return;
      }
      library = makeLibrary(players);
      persist();
    } catch {
      if (raw != null) preserveRaw(STORAGE_KEY, raw);
      library = makeLibrary(players);
      // Keep corrupt data available for recovery until the user makes a deliberate edit.
      saveState.textContent = '当前为临时阵容';
      say('无法读取原有方案，已保留原始记录并显示默认阵容。可导入备份恢复，或编辑后保存新阵容。', true);
    }
  }
  function cancelPlayerDrag() {
    if (!drag) return false;
    const previous = drag; drag = null;
    try { previous.source.releasePointerCapture(previous.pointerId); } catch { /* Capture may already be released. */ }
    if (previous.fromBench && previous.moved) previous.el.remove();
    previous.source.classList.remove('is-dragging');
    return true;
  }
  window.addEventListener('blur', () => { if (cancelPlayerDrag()) render(); });
  window.addEventListener('lostpointercapture', (event) => {
    if (drag?.pointerId === event.pointerId && cancelPlayerDrag()) render();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && cancelPlayerDrag()) {
      event.preventDefault(); event.stopImmediatePropagation(); render();
    }
  }, true);
  function remember() {
    history.push(copy(library));
    if (history.length > 30) history.shift();
  }
  function change(mutator, message) {
    markings.cancel();
    cancelPlayerDrag();
    remember();
    mutator();
    current().updatedAt = new Date().toISOString();
    persist(message);
    render();
  }
  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function token(id, point) {
    const p = playerMap.get(id), el = element('button', 'tactics-token');
    el.type = 'button'; el.dataset.playerId = id; el.dataset.number = String(p.number ?? '');
    el.style.left = `${point.x}%`; el.style.top = `${point.y}%`;
    el.setAttribute('aria-label', `${describe(id)}，场上队员，可拖动或使用方向键调整`);
    el.setAttribute('aria-pressed', String(id === selectedId));
    el.classList.toggle('is-selected', id === selectedId);
    el.append(element('span', 'tactics-token__num num', p.number ?? '—'), element('span', 'tactics-token__name', p.name));
    return el;
  }
  function render() {
    const focused = document.activeElement;
    const restoreId = focused?.dataset.playerId;
    const restoreField = focused?.classList.contains('tactics-token');
    planSelect.replaceChildren(...library.plans.map((plan) => {
      const option = element('option', '', plan.name); option.value = plan.id; return option;
    }));
    planSelect.value = library.activeId;
    const plan = current();
    formationSelect.querySelector('[data-legacy-formation]')?.remove();
    if (plan.formation === '2-3-2') {
      const legacy = element('option', '', '2–3–2（原有方案）');
      legacy.value = '2-3-2'; legacy.dataset.legacyFormation = ''; formationSelect.append(legacy);
    }
    formationSelect.value = plan.formation;
    onfield.replaceChildren(...plan.placements.map((p) => token(p.playerId, p)));
    const active = new Set(plan.placements.map((p) => p.playerId));
    bench.replaceChildren(...players.map((p) => {
      const chip = element('button', 'tactics-chip'); chip.type = 'button';
      chip.dataset.playerId = p.id; chip.dataset.number = String(p.number ?? '');
      chip.classList.toggle('is-on', active.has(p.id)); chip.classList.toggle('is-selected', selectedId === p.id);
      chip.setAttribute('aria-label', `${describe(p.id)}${p.positionLabel ? `，${p.positionLabel}` : ""}，${active.has(p.id) ? '已在场上' : '替补，选择后安排上场'}`);
      chip.setAttribute('aria-pressed', String(selectedId === p.id));
      chip.append(element('span', 'tactics-chip__num num', p.number ?? '—'), element('span', 'tactics-chip__name', p.name), element('span', 'tactics-chip__position', p.positionLabel));
      return chip;
    }));
    $('[data-count]').textContent = `场上 ${plan.placements.length} / 8`;
    $('[data-action="undo"]').disabled = history.length === 0;
    $('[data-action="remove"]').disabled = !active.has(selectedId);
    $('[data-action="cancel-selection"]').hidden = !selectedId;
    $('[data-selection]').textContent = selectedId ? `${describe(selectedId)} · ${active.has(selectedId) ? '场上' : '选择场上位置或队员'}` : '选择队员后可安排上场或下场';
    markings.render();
    if (restoreId) {
      const candidates = restoreField ? onfield.children : bench.children;
      [...candidates].find((p) => p.dataset.playerId === restoreId)?.focus({ preventScroll: true });
    }
  }
  function removeSelected() {
    if (!current().placements.some((p) => p.playerId === selectedId)) return;
    const id = selectedId;
    change(() => { current().placements = current().placements.filter((p) => p.playerId !== id); selectedId = null; }, `${describe(id)}已下场`);
  }
  function activate(id, fromBench) {
    if (markings.tool !== 'move') markings.setTool('move');
    const on = current().placements.some((p) => p.playerId === id);
    const selectedIsBench = selectedId && !current().placements.some((p) => p.playerId === selectedId);
    if (!fromBench && selectedIsBench && selectedId !== id) {
      drop(selectedId, null, id);
    } else {
      selectedId = id;
      render();
      if (fromBench && on) [...onfield.children].find((p) => p.dataset.playerId === id)?.focus({ preventScroll: true });
      if (!on) say(current().placements.length >= 8 ? '场上已满，选择一名场上队员换人。' : '点击球场安排上场，也可以拖动这名队员。');
    }
  }
  function drop(id, point, targetId) {
    const result = applyDrop(current().placements, id, point, targetId);
    if (!result.changed) { render(); say(result.kind === 'full' ? '场上已有 8 人，请覆盖一名队员换人，或先安排队员下场。' : '站位未改变。', result.kind !== 'full'); return; }
    change(() => { current().placements = result.placements; selectedId = id; }, result.kind === 'swap' ? '已交换站位' : result.kind === 'replace' ? '已完成换人' : '站位已更新');
  }
  function pointAt(clientX, clientY, offset = { x: 0, y: 0 }) {
    const r = board.getBoundingClientRect();
    const sample = onfield.querySelector('.tactics-token');
    const width = sample?.offsetWidth || (window.innerWidth <= 700 ? 34 : 58);
    const nameWidth = Math.max(60, ...players.map((p) => p.name.length * (window.innerWidth <= 700 ? 9 : 11) + 12));
    const edgeX = Math.max(width / 2 + 3, nameWidth / 2 + 2) / r.width * 100;
    const top = (width / 2 + 3) / r.height * 100;
    const bottom = (width / 2 + 24) / r.height * 100;
    return { x: clamp((clientX + offset.x - r.left) / r.width * 100, Math.max(4, edgeX), Math.min(96, 100 - edgeX)), y: clamp((clientY + offset.y - r.top) / r.height * 100, Math.max(6, top), Math.min(90, 100 - bottom)) };
  }
  function near(point, except) {
    const r = board.getBoundingClientRect();
    const radius = (onfield.querySelector('.tactics-token')?.offsetWidth || 44) * .75;
    let target = null, best = radius;
    current().placements.forEach((p) => {
      if (p.playerId === except) return;
      const dist = Math.hypot((p.x - point.x) * r.width / 100, (p.y - point.y) * r.height / 100);
      if (dist < best) { target = p.playerId; best = dist; }
    });
    return target;
  }
  function begin(e, fromBench) {
    const source = e.target.closest(fromBench ? '.tactics-chip' : '.tactics-token');
    if (!source || drag || e.button !== 0 || !e.isPrimary) return;
    if (markings.tool !== 'move') { if (fromBench) markings.setTool('move'); else return; }
    const id = source.dataset.playerId;
    if (fromBench && current().placements.some((p) => p.playerId === id)) return;
    e.preventDefault(); source.focus({ preventScroll: true });
    const bounds = source.getBoundingClientRect();
    const offset = fromBench ? { x: 0, y: 0 } : { x: bounds.left + bounds.width / 2 - e.clientX, y: bounds.top + bounds.height / 2 - e.clientY };
    drag = { id, source, el: source, pointerId: e.pointerId, fromBench, offset, startX: e.clientX, startY: e.clientY, moved: false, point: null };
    try { source.setPointerCapture(e.pointerId); } catch { /* Window listeners remain active. */ }
  }
  onfield.addEventListener('pointerdown', (e) => begin(e, false));
  bench.addEventListener('pointerdown', (e) => begin(e, true));
  window.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      if (drag.fromBench) {
        drag.el = token(drag.id, { x: 0, y: 0 });
        drag.el.classList.add('tactics-token--ghost');
        drag.el.tabIndex = -1; drag.el.setAttribute('aria-hidden', 'true');
        document.body.append(drag.el);
      }
      drag.el.classList.add('is-dragging');
    }
    drag.point = pointAt(e.clientX, e.clientY, drag.offset);
    drag.el.style.left = drag.fromBench ? `${e.clientX}px` : `${drag.point.x}%`;
    drag.el.style.top = drag.fromBench ? `${e.clientY}px` : `${drag.point.y}%`;
  }, { passive: false });
  function finish(e, cancelled = false) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const d = drag; drag = null; suppressClickUntil = Date.now() + 100;
    try { d.source.releasePointerCapture(d.pointerId); } catch { /* Capture may be cancelled by the browser. */ }
    if (d.fromBench && d.moved) d.el.remove();
    d.source.classList.remove('is-dragging');
    if (cancelled) { render(); return; }
    if (!d.moved) { activate(d.id, d.fromBench); return; }
    const r = board.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { render(); say('未放入球场，站位保持原样。'); return; }
    const point = pointAt(e.clientX, e.clientY, d.offset);
    drop(d.id, point, near(point, d.id));
  }
  window.addEventListener('pointerup', (e) => finish(e));
  window.addEventListener('pointercancel', (e) => finish(e, true));
  for (const [container, fromBench] of [[onfield, false], [bench, true]]) {
    container.addEventListener('click', (e) => {
      const el = e.target.closest('[data-player-id]');
      if (!el || Date.now() < suppressClickUntil) return;
      // Keyboard activation and already-on-field bench chips do not start a drag.
      if (e.detail === 0 || (fromBench && current().placements.some((p) => p.playerId === el.dataset.playerId))) activate(el.dataset.playerId, fromBench);
    });
  }
  board.addEventListener('click', (e) => {
    if (markings.tool !== 'move' || e.target.closest('[data-ball]') || Date.now() < suppressClickUntil || e.target.closest('.tactics-token') || !selectedId || current().placements.some((p) => p.playerId === selectedId)) return;
    const point = pointAt(e.clientX, e.clientY);
    drop(selectedId, point, near(point, selectedId));
  });
  board.addEventListener('keydown', (e) => {
    const id = e.target.closest('.tactics-token')?.dataset.playerId || selectedId;
    if (e.key === 'Escape') { selectedId = null; render(); return; }
    if (!id) return;
    const placement = current().placements.find((p) => p.playerId === id);
    if (e.key === 'Enter' && !placement && e.target === board) { e.preventDefault(); drop(id, { x: 50, y: 50 }, null); return; }
    if (!placement) return;
    selectedId = id;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); board.focus({ preventScroll: true }); return; }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!delta) return;
    e.preventDefault();
    const step = e.shiftKey ? 4 : 1;
    const r = board.getBoundingClientRect();
    const point = pointAt(r.left + (placement.x + delta[0] * step) / 100 * r.width, r.top + (placement.y + delta[1] * step) / 100 * r.height);
    drop(id, point, null);
  });
  planSelect.addEventListener('change', () => { markings.cancel(); cancelPlayerDrag(); library.activeId = planSelect.value; selectedId = null; persist('已切换方案'); render(); });
  formationSelect.addEventListener('change', () => {
    const formation = formationSelect.value;
    if (!Object.hasOwn(FORMATIONS, formation)) return;
    change(() => { current().placements = applyFormation(current().placements, formation, players); current().formation = formation; }, '已调整阵型，场上队员保持不变');
  });

  function namePrompt(action) {
    if ((action === 'new' || action === 'save-as') && library.plans.length >= MAX_PLANS) { say(`最多保存 ${MAX_PLANS} 套方案，请先导出并整理现有方案。`, true); return; }
    nameAction = action;
    $('[data-dialog-title]').textContent = { new: '新建空白方案', 'save-as': '另存为新方案', rename: '重命名方案' }[action];
    $('[data-plan-name]').value = action === 'new' ? '' : action === 'save-as' ? `${current().name} 副本`.slice(0, 60) : current().name;
    $('[data-name-error]').textContent = '';
    nameDialog.showModal(); $('[data-plan-name]').focus(); $('[data-plan-name]').select();
  }
  $('[data-name-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = cleanName($('[data-plan-name]').value);
    if (!name) { $('[data-name-error]').textContent = '请输入方案名称。'; return; }
    if (library.plans.some((p) => p.name === name && !(nameAction === 'rename' && p.id === current().id))) { $('[data-name-error]').textContent = '已有同名方案，请换一个名称。'; return; }
    change(() => {
      if (nameAction === 'rename') current().name = name;
      else {
        const plan = makePlan(name, nameAction === 'save-as' ? current().placements : [], current().formation, nameAction === 'save-as' ? { annotations: current().annotations, ball: current().ball } : undefined);
        library.plans.push(plan); library.activeId = plan.id; selectedId = null;
      }
    }, nameAction === 'rename' ? '方案已重命名' : '新方案已建立');
    nameDialog.close();
  });
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), link = element('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function exportBackup() {
    download(new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' }), '球门飘客-战术方案.json');
    say('已生成备份文件，可在其他设备导入。');
  }
  $('[data-import-file]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('备份文件不能超过 1 MB。');
      const parsed = parseBackup(await file.text(), players);
      const next = appendPlans(library, parsed.library);
      change(() => { library = next; selectedId = null; }, `已追加 ${parsed.library.plans.length} 套方案${parsed.repairs ? `，修正 ${parsed.repairs} 项无效记录` : ''}；原有方案保留`);
    } catch (error) { say(error.message || '导入失败，原有方案保持不变。', true); }
  });
  function releaseImage() {
    imageGeneration++;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null; imageFile = null;
    $('[data-image-preview]').removeAttribute('src'); $('[data-image-preview]').hidden = true;
    $('[data-image-download]').removeAttribute('href'); $('[data-image-download]').hidden = true;
    $('[data-action="share"]').hidden = true;
  }
  async function showImage() {
    releaseImage(); const generation = imageGeneration;
    $('[data-image-status]').textContent = '正在生成图片…'; imageDialog.showModal();
    try {
      const plan = copy(current());
      const { blob } = await createTacticsImage(plan, players);
      if (generation !== imageGeneration || !imageDialog.open) return;
      imageUrl = URL.createObjectURL(blob);
      const filename = `${plan.name.replace(/[\\/:*?"<>|]/g, '-') || '战术图'}.png`;
      imageFile = new File([blob], filename, { type: 'image/png' });
      const preview = $('[data-image-preview]'); preview.src = imageUrl; preview.hidden = false;
      const link = $('[data-image-download]'); link.href = imageUrl; link.download = filename; link.hidden = false;
      let canShare = false;
      try { canShare = typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [imageFile] }); } catch { /* Download stays available. */ }
      $('[data-action="share"]').hidden = !canShare;
      $('[data-image-status]').textContent = canShare ? '可下载图片，或使用系统分享。' : '可下载 PNG；手机也可长按预览图保存。';
    } catch (error) {
      if (generation === imageGeneration) $('[data-image-status]').textContent = `${error.message || '图片生成失败。'} 请关闭后重试，阵容已保留。`;
    }
  }
  imageDialog.addEventListener('close', releaseImage);
  async function shareImage() {
    if (!imageFile) return;
    try { await navigator.share({ files: [imageFile], title: '球门飘客 · 战术图' }); }
    catch (error) { if (error.name !== 'AbortError') $('[data-image-status]').textContent = '暂时无法分享，请下载图片后发送。'; }
  }
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (cancelPlayerDrag()) render();
    if (['new', 'save-as', 'rename'].includes(action)) { namePrompt(action); return; }
    if (action === 'close-name') nameDialog.close();
    if (action === 'close-image') imageDialog.close();
    if (action === 'image') showImage();
    if (action === 'share') shareImage();
    if (action === 'backup') exportBackup();
    if (action === 'import') $('[data-import-file]').click();
    if (action === 'remove') removeSelected();
    if (action === 'cancel-selection') { selectedId = null; render(); }
    if (action === 'reset') change(() => { current().placements = defaultPlacements(players, current().formation); selectedId = null; }, '当前方案已恢复默认阵型，可撤销');
    if (action === 'delete') {
      const name = current().name;
      change(() => {
        library.plans = library.plans.filter((p) => p.id !== library.activeId);
        if (!library.plans.length) library.plans = [makePlan('新方案')];
        library.activeId = library.plans[0].id; selectedId = null;
      }, `已删除「${name}」，可撤销`);
    }
    if (action === 'undo' && history.length) { markings.cancel(); cancelPlayerDrag(); library = history.pop(); selectedId = null; persist('已撤销上一步'); render(); }
  });
  load(); render();
}
