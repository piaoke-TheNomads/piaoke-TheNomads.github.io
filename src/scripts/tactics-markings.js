import { MAX_ANNOTATIONS, makeAnnotation, clamp } from '../lib/tactics.js';

const NS = 'http://www.w3.org/2000/svg';
const COLORS = { run: '#f3ce63', pass: '#ffffff' };
const LABELS = { run: '跑位箭头', pass: '传球线' };
const HELP = {
  move: '拖动队员或足球，调整位置。',
  run: '从起点拖到终点画跑位箭头，也可依次点击两端。',
  pass: '从起点拖到终点画传球线，也可依次点击两端。',
  ball: '点击球场放置足球，拖动足球调整位置。',
  erase: '点击线条或足球删除，可撤销。',
};

function svg(tag, attributes = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/** Independent pointer gestures keep drawing and player movement mutually exclusive. */
export function initializeMarkings({ board, getPlan, change, say, onToolChange }) {
  const layer = board.querySelector('[data-markings]');
  const ballLayer = board.querySelector('[data-ball-layer]');
  const buttons = [...document.querySelectorAll('[data-tool]')];
  const help = document.querySelector('[data-tool-help]');
  let tool = 'move', gesture = null, pending = null, preview = null;

  const inside = (event) => {
    const box = board.getBoundingClientRect();
    return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
  };
  function pointAt(event, isBall = false) {
    const box = board.getBoundingClientRect();
    const pad = isBall ? 17 : 12;
    const min = isBall ? 3 : 2;
    const px = Math.max(min, pad / box.width * 100), py = Math.max(min, pad / box.height * 100);
    return { x: clamp((event.clientX - box.left) / box.width * 100, px, 100 - px), y: clamp((event.clientY - box.top) / box.height * 100, py, 100 - py) };
  }
  function lineNode(annotation, index, draft = false) {
    const from = { x: annotation.from.x * 9.6, y: annotation.from.y * 6.6 };
    const to = { x: annotation.to.x * 9.6, y: annotation.to.y * 6.6 };
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const size = Math.max(14, 10 * 960 / Math.max(board.clientWidth, 1));
    const wing = .48;
    const head = `M ${to.x - size * Math.cos(angle - wing)} ${to.y - size * Math.sin(angle - wing)} L ${to.x} ${to.y} L ${to.x - size * Math.cos(angle + wing)} ${to.y - size * Math.sin(angle + wing)}`;
    const body = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    const group = svg('g', draft ? { 'data-draft': '', opacity: .75 } : {
      'data-annotation-id': annotation.id, 'data-type': annotation.type,
      tabindex: tool === 'erase' ? 0 : -1, role: 'button',
      'aria-label': `删除第 ${index + 1} 条${LABELS[annotation.type]}`,
    });
    for (const [color, width] of [['#101a2e', 5.5], [COLORS[annotation.type], 3]]) {
      const common = { fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' };
      group.append(svg('path', { ...common, d: body, ...(annotation.type === 'pass' ? { 'stroke-dasharray': '10 8' } : {}) }));
      group.append(svg('path', { ...common, d: head }));
    }
    return group;
  }
  function renderLines() {
    const nodes = getPlan().annotations.map((line, index) => lineNode(line, index));
    if (preview) nodes.push(lineNode(preview, -1, true));
    if (pending) nodes.push(svg('circle', { cx: pending.x * 9.6, cy: pending.y * 6.6, r: 5, fill: COLORS[tool], stroke: '#101a2e', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'data-draft': '' }));
    layer.replaceChildren(...nodes);
  }
  function renderBall(point = getPlan().ball) {
    const focused = document.activeElement?.hasAttribute('data-ball');
    ballLayer.replaceChildren();
    if (!point) return;
    const ball = document.createElement('button');
    ball.type = 'button'; ball.className = 'tactics-ball'; ball.dataset.ball = '';
    ball.style.left = `${point.x}%`; ball.style.top = `${point.y}%`;
    ball.setAttribute('aria-label', '足球，可拖动或用方向键移动，Delete 键移除');
    const icon = svg('svg', { viewBox: '0 0 40 40', 'aria-hidden': true });
    icon.append(svg('circle', { cx: 20, cy: 20, r: 18, fill: '#ffffff', stroke: '#101a2e', 'stroke-width': 2 }));
    icon.append(svg('path', { d: 'M20 11 L28.6 17.3 L25.3 27.4 L14.7 27.4 L11.4 17.3 Z', fill: '#101a2e' }));
    icon.append(svg('path', { d: 'M20 2 L20 11 M37.1 14.4 L28.6 17.3 M30.6 34.6 L25.3 27.4 M9.4 34.6 L14.7 27.4 M2.9 14.4 L11.4 17.3', fill: 'none', stroke: '#101a2e', 'stroke-width': 1.6 }));
    ball.append(icon); ballLayer.append(ball);
    if (focused) ball.focus({ preventScroll: true });
  }
  function render() {
    board.dataset.toolMode = tool;
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)));
    help.textContent = pending ? '起点已选定，点击终点完成；按 Esc 取消。' : HELP[tool];
    document.querySelector('[data-action="clear-markings"]').disabled = !getPlan().annotations.length && !getPlan().ball;
    renderLines(); renderBall();
  }
  function cancel() {
    if (gesture) { try { board.releasePointerCapture(gesture.pointerId); } catch { /* Already released. */ } }
    gesture = null; pending = null; preview = null;
  }
  function setTool(value) {
    if (!Object.hasOwn(HELP, value)) return;
    cancel(); tool = value; onToolChange(); render();
  }
  function removeLine(id) {
    change((plan) => { plan.annotations = plan.annotations.filter((line) => line.id !== id); }, '已删除标线，可撤销');
  }
  function eraseAt(event) {
    const box = board.getBoundingClientRect(), plan = getPlan();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    if (plan.ball && Math.hypot(plan.ball.x / 100 * box.width - x, plan.ball.y / 100 * box.height - y) <= 22) {
      change((p) => { p.ball = null; }, '已移除足球，可撤销'); return;
    }
    let nearest = null, distance = 15;
    for (const line of [...plan.annotations].reverse()) {
      const ax = line.from.x / 100 * box.width, ay = line.from.y / 100 * box.height;
      const bx = line.to.x / 100 * box.width, by = line.to.y / 100 * box.height;
      const dx = bx - ax, dy = by - ay;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      if (d < distance) { distance = d; nearest = line; }
    }
    if (nearest) removeLine(nearest.id);
    else say('点击线条或足球即可删除。');
  }
  board.addEventListener('pointerdown', (event) => {
    const ball = event.target.closest('[data-ball]');
    if (tool === 'move' && !ball) return;
    if (event.button !== 0 || !event.isPrimary || gesture) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if ((tool === 'run' || tool === 'pass') && getPlan().annotations.length >= MAX_ANNOTATIONS) {
      say(`每套方案最多 ${MAX_ANNOTATIONS} 条标线，请先删除不需要的线条。`, true); return;
    }
    board.focus({ preventScroll: true });
    const kind = tool === 'move' ? 'ball' : tool;
    const point = pointAt(event, kind === 'ball');
    gesture = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, from: pending || point, hadPending: !!pending };
    try { board.setPointerCapture(event.pointerId); } catch { /* Window events remain available. */ }
    if (kind === 'ball') { renderBall(point); ballLayer.querySelector('[data-ball]')?.focus({ preventScroll: true }); }
  }, true);
  window.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 6) gesture.moved = true;
    if (!gesture.moved) return;
    const point = pointAt(event, gesture.kind === 'ball');
    if (gesture.kind === 'ball') renderBall(point);
    if (gesture.kind === 'run' || gesture.kind === 'pass') {
      preview = { type: gesture.kind, from: gesture.from, to: point }; renderLines();
    }
  }, { passive: false });
  function finish(event, cancelled = false) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const action = gesture; gesture = null;
    try { board.releasePointerCapture(action.pointerId); } catch { /* Browser may already have released capture. */ }
    preview = null;
    if (cancelled || !inside(event)) { pending = null; render(); return; }
    if (action.kind === 'erase') { eraseAt(event); render(); return; }
    const point = pointAt(event, action.kind === 'ball');
    if (action.kind === 'ball') {
      change((plan) => { plan.ball = point; }, '足球位置已更新'); return;
    }
    if (!action.moved && !action.hadPending) { pending = point; render(); return; }
    const line = makeAnnotation(action.kind, action.from, point);
    pending = null;
    if (!line) { render(); say('两端太近，请重新选择起点和终点。'); return; }
    change((plan) => { plan.annotations.push(line); }, `已添加${LABELS[action.kind]}`);
  }
  window.addEventListener('pointerup', (event) => finish(event));
  window.addEventListener('pointercancel', (event) => finish(event, true));
  board.addEventListener('lostpointercapture', (event) => {
    if (gesture?.pointerId === event.pointerId) { cancel(); render(); }
  });
  board.addEventListener('click', (event) => {
    if (tool !== 'move' || event.target.closest('[data-ball]')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  board.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (tool !== 'move' || pending)) {
      event.preventDefault(); event.stopImmediatePropagation(); setTool('move'); return;
    }
    const line = event.target.closest('[data-annotation-id]');
    if (line && tool === 'erase' && ['Enter', ' ', 'Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation(); removeLine(line.dataset.annotationId); board.focus(); return;
    }
    if (!event.target.closest('[data-ball]')) {
      if (tool !== 'move') event.stopImmediatePropagation();
      return;
    }
    event.stopImmediatePropagation();
    if (['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault(); change((plan) => { plan.ball = null; }, '已移除足球，可撤销'); board.focus(); return;
    }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta || !getPlan().ball) return;
    event.preventDefault();
    const point = getPlan().ball, box = board.getBoundingClientRect(), step = event.shiftKey ? 4 : 1;
    const next = pointAt({ clientX: box.left + (point.x + delta[0] * step) / 100 * box.width, clientY: box.top + (point.y + delta[1] * step) / 100 * box.height }, true);
    change((plan) => { plan.ball = next; }, '足球位置已更新');
  }, true);
  window.addEventListener('blur', () => { cancel(); render(); });
  buttons.forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
  document.querySelector('[data-action="clear-markings"]').addEventListener('click', () => {
    cancel();
    if (getPlan().annotations.length || getPlan().ball) change((plan) => { plan.annotations = []; plan.ball = null; }, '已清空标线和足球，可撤销');
  });
  new ResizeObserver(() => { if (getPlan()) renderLines(); }).observe(board);
  return { render, cancel, setTool, get tool() { return tool; } };
}
