import { PRESET_PLAYER_IDS } from './tactics-presets.js';

export const STORAGE_KEY = 'qmpk-tactics-v3';
export const LEGACY_KEY = 'qmpk-tactics-v2';
export const MAX_PLANS = 50;
export const MAX_BACKUP_BYTES = 1024 * 1024;
export const MAX_ANNOTATIONS = 40;
export const FORMATIONS = {
  '3-2-2': [
    { role: 'GK', x: 8, y: 50 },
    { role: 'D', preferred: ['LB', 'FB'], x: 26, y: 18 },
    { role: 'D', preferred: ['CB'], x: 26, y: 50 },
    { role: 'D', preferred: ['RB', 'FB'], x: 26, y: 82 },
    { role: 'M', preferred: ['DM', 'CM', 'LM'], x: 52, y: 32 },
    { role: 'M', preferred: ['CM', 'AM', 'RM'], x: 52, y: 68 },
    { role: 'F', preferred: ['ST'], x: 76, y: 32 },
    { role: 'F', preferred: ['ST'], x: 76, y: 68 },
  ],
  '2-4-1': [
    { role: 'GK', x: 8, y: 50 },
    { role: 'D', preferred: ['LB', 'CB'], x: 27, y: 32 },
    { role: 'D', preferred: ['CB', 'RB'], x: 27, y: 68 },
    { role: 'M', preferred: ['LM', 'RM'], x: 52, y: 18 },
    { role: 'M', preferred: ['AM', 'CM'], x: 52, y: 39 },
    { role: 'M', preferred: ['DM', 'CM'], x: 52, y: 61 },
    { role: 'M', preferred: ['RM', 'LM'], x: 52, y: 82 },
    { role: 'F', preferred: ['ST'], x: 78, y: 50 },
  ],
  // Kept for already-saved plans and backups; not a current preset.
  '2-3-2': [
    { role: 'GK', x: 8, y: 50 },
    { role: 'D', preferred: ['CB', 'LB', 'FB'], x: 27, y: 32 },
    { role: 'D', preferred: ['CB', 'RB', 'FB'], x: 27, y: 68 },
    { role: 'M', preferred: ['LM', 'CM'], x: 51, y: 18 },
    { role: 'M', preferred: ['DM', 'CM'], x: 51, y: 50 },
    { role: 'M', preferred: ['RM', 'AM'], x: 51, y: 82 },
    { role: 'F', preferred: ['ST'], x: 77, y: 32 },
    { role: 'F', preferred: ['ST'], x: 77, y: 68 },
  ],
};
const GROUPS = { D: ['CB', 'LB', 'RB', 'FB'], M: ['DM', 'CM', 'AM', 'LM', 'RM'], F: ['ST'] };
export const copy = (value) => JSON.parse(JSON.stringify(value));
export const makeId = () => globalThis.crypto?.randomUUID?.() || `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (id) => typeof id === 'string' && id.trim().length > 0 && id.length <= 96;
export const cleanName = (name) => typeof name === 'string' ? name.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60) : '';

function suitability(player, slot) {
  const main = player.position;
  const positions = new Set([main, ...(Array.isArray(player.positions) ? player.positions : [])]);
  if (slot.role === 'GK') return main === 'GK' ? 10000 : positions.has('GK') ? 9000 : -1;
  const group = GROUPS[slot.role];
  if (group.includes(main)) return 200 + (slot.preferred.includes(main) ? 30 : 0);
  if ([...positions].some((p) => group.includes(p))) return 150 + (slot.preferred.some((p) => positions.has(p)) ? 20 : 0);
  if (slot.role === 'F' && ['AM', 'LM', 'RM'].some((p) => positions.has(p))) return 80;
  if (main === 'GK') return 0;
  return 10;
}

/** Keep the agreed preset, then globally assign available players to any missing slots. */
export function defaultPlacements(players, formation = '3-2-2') {
  const key = Object.hasOwn(FORMATIONS, formation) ? formation : '3-2-2';
  const slots = FORMATIONS[key];
  const available = new Set(players.map((p) => p.id));
  const preset = (PRESET_PLAYER_IDS[key] || []).flatMap((playerId, index) => available.has(playerId) ? [{ index, playerId }] : []);
  const used = new Set(preset.map((p) => p.playerId));
  const presetMask = preset.reduce((mask, p) => mask | (1 << p.index), 0);
  let states = new Map([[presetMask, { score: 0, picks: preset }]]);
  const sorted = [...players].sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.id.localeCompare(b.id));
  for (const player of sorted) {
    if (used.has(player.id)) continue;
    const next = new Map(states);
    for (const [mask, state] of states) {
      slots.forEach((slot, index) => {
        if (mask & (1 << index)) return;
        const score = suitability(player, slot);
        if (score < 0) return;
        const key = mask | (1 << index);
        const candidate = { score: state.score + score + 1000, picks: [...state.picks, { index, playerId: player.id }] };
        if (!next.has(key) || candidate.score > next.get(key).score) next.set(key, candidate);
      });
    }
    states = next;
  }
  const best = [...states.values()].reduce((a, b) => b.score > a.score ? b : a);
  return best.picks.sort((a, b) => a.index - b.index).map(({ index, playerId }) => ({ playerId, x: slots[index].x, y: slots[index].y }));
}

export function makePlan(name, placements = [], formation = '3-2-2', details = {}) {
  return {
    id: makeId(), name: cleanName(name) || '新方案', formation, placements: copy(placements),
    annotations: sanitizeAnnotations(details?.annotations).annotations,
    ball: sanitizeBall(details?.ball).ball,
    updatedAt: new Date().toISOString(),
  };
}
export function makeLibrary(players) {
  const plan = makePlan('首发阵容', defaultPlacements(players));
  return { version: 3, activeId: plan.id, plans: [plan] };
}

export function applyDrop(placements, playerId, point, targetId = null) {
  const result = copy(placements);
  const own = result.find((p) => p.playerId === playerId);
  const target = result.find((p) => p.playerId === targetId && p.playerId !== playerId);
  if (target) {
    if (own) {
      const previous = { x: own.x, y: own.y };
      own.x = target.x; own.y = target.y;
      target.x = previous.x; target.y = previous.y;
    } else target.playerId = playerId;
    return { placements: result, changed: true, kind: own ? 'swap' : 'replace' };
  }
  if (!own && result.length >= 8) return { placements: result, changed: false, kind: 'full' };
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return { placements: result, changed: false, kind: 'invalid' };
  const spot = { x: clamp(point.x, 4, 96), y: clamp(point.y, 6, 90) };
  if (own) Object.assign(own, spot);
  else result.push({ playerId, ...spot });
  return { placements: result, changed: true, kind: own ? 'move' : 'add' };
}

export function applyFormation(placements, formation, players = []) {
  const slots = FORMATIONS[formation] || FORMATIONS['3-2-2'];
  const preset = PRESET_PLAYER_IDS[formation];
  const present = new Set(placements.map((p) => p.playerId));
  if (placements.length === 8 && preset?.every((id) => present.has(id))) {
    return preset.map((playerId, index) => ({ playerId, x: slots[index].x, y: slots[index].y }));
  }
  const roster = new Map(players.map((p) => [p.id, p]));
  const ordered = [...placements].sort((a, b) => a.x - b.x || a.y - b.y);
  let goalkeeper = ordered.find((p) => roster.get(p.playerId)?.position === 'GK')
    || ordered.find((p) => roster.get(p.playerId)?.positions?.includes('GK'));
  // An eight-player side without a listed goalkeeper uses its leftmost player
  // as the manually assigned keeper. A depleted side leaves that slot vacant.
  if (!goalkeeper && (ordered.length === 8 || players.length === 0)) goalkeeper = ordered[0];
  const outfield = ordered.filter((p) => p !== goalkeeper).map((p, index) => ({ playerId: p.playerId, x: slots[index + 1].x, y: slots[index + 1].y }));
  return goalkeeper ? [{ playerId: goalkeeper.playerId, x: slots[0].x, y: slots[0].y }, ...outfield] : outfield;
}

export function sanitizePlacements(raw, players) {
  const allowed = new Set(players.map((p) => p.id));
  const seen = new Set();
  const placements = [];
  let repairs = 0;
  if (!Array.isArray(raw)) return { placements, repairs: 1 };
  for (const p of raw) {
    if (!isRecord(p) || !allowed.has(p.playerId) || seen.has(p.playerId) || placements.length >= 8 || !Number.isFinite(p.x) || !Number.isFinite(p.y)) { repairs++; continue; }
    const x = clamp(p.x, 4, 96), y = clamp(p.y, 6, 90);
    if (x !== p.x || y !== p.y) repairs++;
    placements.push({ playerId: p.playerId, x, y });
    seen.add(p.playerId);
  }
  return { placements, repairs };
}

function normalizedPoint(point, min, max) {
  if (!isRecord(point) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: clamp(point.x, min, max), y: clamp(point.y, min, max) };
}

/** Small accidental gestures do not leave a mark. Coordinates are percentages. */
export function makeAnnotation(type, from, to) {
  if (type !== 'run' && type !== 'pass') return null;
  const start = normalizedPoint(from, 2, 98), end = normalizedPoint(to, 2, 98);
  if (!start || !end || Math.hypot(end.x - start.x, end.y - start.y) < 2) return null;
  return { id: makeId(), type, from: start, to: end };
}

export function sanitizeAnnotations(raw) {
  if (raw === undefined) return { annotations: [], repairs: 0 };
  if (!Array.isArray(raw)) return { annotations: [], repairs: 1 };
  const annotations = [], seen = new Set();
  let repairs = 0;
  for (const annotation of raw) {
    if (!isRecord(annotation) || !validId(annotation.id) || seen.has(annotation.id) || annotations.length >= MAX_ANNOTATIONS) { repairs++; continue; }
    const clean = makeAnnotation(annotation.type, annotation.from, annotation.to);
    if (!clean) { repairs++; continue; }
    if (clean.from.x !== annotation.from.x || clean.from.y !== annotation.from.y || clean.to.x !== annotation.to.x || clean.to.y !== annotation.to.y) repairs++;
    annotations.push({ ...clean, id: annotation.id });
    seen.add(annotation.id);
  }
  return { annotations, repairs };
}

export function sanitizeBall(raw) {
  if (raw === undefined || raw === null) return { ball: null, repairs: 0 };
  const ball = normalizedPoint(raw, 3, 97);
  if (!ball) return { ball: null, repairs: 1 };
  return { ball, repairs: ball.x !== raw.x || ball.y !== raw.y ? 1 : 0 };
}

export function sanitizeLibrary(raw, players) {
  if (!isRecord(raw) || raw.version !== 3 || !Array.isArray(raw.plans) || raw.plans.length === 0) throw new Error('备份格式不正确，请选择战术板导出的 JSON 文件。');
  if (raw.plans.length > MAX_PLANS) throw new Error(`每份备份最多包含 ${MAX_PLANS} 套方案。`);
  let repairs = 0;
  const ids = new Set();
  const plans = raw.plans.map((p) => {
    if (!isRecord(p) || !Array.isArray(p.placements) || p.placements.length > 200 || typeof p.name !== 'string' || !cleanName(p.name)) throw new Error('方案信息不完整，未导入任何方案。');
    let id = p.id;
    if (!validId(id) || ids.has(id)) { id = makeId(); repairs++; }
    ids.add(id);
    const checked = sanitizePlacements(p.placements, players);
    const markings = sanitizeAnnotations(p.annotations);
    const football = sanitizeBall(p.ball);
    repairs += checked.repairs + markings.repairs + football.repairs;
    const name = cleanName(p.name);
    const formation = Object.hasOwn(FORMATIONS, p.formation) ? p.formation : '3-2-2';
    if (name !== p.name || formation !== p.formation) repairs++;
    const updatedAt = typeof p.updatedAt === 'string' && p.updatedAt.length <= 40 && Number.isFinite(Date.parse(p.updatedAt)) ? new Date(p.updatedAt).toISOString() : new Date().toISOString();
    return { id, name, formation, placements: checked.placements, annotations: markings.annotations, ball: football.ball, updatedAt };
  });
  const activeId = plans.some((p) => p.id === raw.activeId) ? raw.activeId : plans[0].id;
  if (activeId !== raw.activeId) repairs++;
  return { library: { version: 3, activeId, plans }, repairs };
}

export function parseBackup(text, players) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('备份文件不能超过 1 MiB。');
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('无法读取这个文件，请选择有效的 JSON 备份。'); }
  return sanitizeLibrary(raw, players);
}

export function migrateLegacy(raw, players) {
  if (!isRecord(raw) || !isRecord(raw.onField) || !isRecord(raw.spots)) throw new Error('旧阵容无法读取，已保留原始记录。');
  const byNumber = new Map(players.filter((p) => p.number != null).map((p) => [p.number, p.id]));
  const oldKeys = ['GK', 'D1', 'D2', 'D3', 'M1', 'M2', 'F1', 'F2'];
  const placements = [];
  let repairs = 0;
  for (const [key, number] of Object.entries(raw.onField)) {
    const playerId = byNumber.get(number);
    const slotIndex = oldKeys.indexOf(key);
    const fallback = FORMATIONS['3-2-2'][slotIndex];
    const point = raw.spots[key] || fallback;
    if (!playerId || !point) { repairs++; continue; }
    placements.push({ playerId, x: point.x, y: point.y });
  }
  const checked = sanitizePlacements(placements, players);
  const plan = makePlan('原有阵容', checked.placements);
  return { library: { version: 3, activeId: plan.id, plans: [plan] }, repairs: repairs + checked.repairs };
}

/** Append imports with fresh identities; existing plans remain untouched. */
export function appendPlans(library, imported) {
  if (library.plans.length + imported.plans.length > MAX_PLANS) throw new Error(`最多保存 ${MAX_PLANS} 套方案，请先导出备份并删除不需要的方案。`);
  const names = new Set(library.plans.map((p) => p.name));
  const plans = imported.plans.map((p) => {
    const base = cleanName(p.name);
    let name = base, suffix = 2;
    while (names.has(name)) {
      const ending = ` (${suffix++})`;
      name = `${base.slice(0, 60 - ending.length)}${ending}`;
    }
    names.add(name);
    return { ...copy(p), id: makeId(), name, annotations: sanitizeAnnotations(p.annotations).annotations, ball: sanitizeBall(p.ball).ball };
  });
  return { version: 3, activeId: plans[0].id, plans: [...copy(library.plans), ...plans] };
}
