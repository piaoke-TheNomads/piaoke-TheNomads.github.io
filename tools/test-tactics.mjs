import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultPlacements, applyDrop, applyFormation, sanitizeLibrary, migrateLegacy, parseBackup, appendPlans, makeLibrary, makePlan, makeAnnotation, MAX_ANNOTATIONS, MAX_BACKUP_BYTES } from '../src/lib/tactics.js';
const players = JSON.parse(readFileSync(new URL('../data/players.json', import.meta.url))).players.filter((p) => p.status === 'active');
const person = (id, position, positions = null, number = 1) => ({ id, position, positions, number, name: id });

test('default 3-2-2 follows the agreed players and exact positions using stable identities', () => {
  const lineup = defaultPlacements(players);
  assert.equal(lineup.length, 8);
  assert.equal(new Set(lineup.map((p) => p.playerId)).size, 8);
  assert.deepEqual(lineup.map((p) => players.find((player) => player.id === p.playerId).number), [6, 10, 25, 60, 88, 22, 9, 11]);
  assert.deepEqual(lineup.map(({ x, y }) => [x, y]), [[8, 50], [26, 18], [26, 50], [26, 82], [52, 32], [52, 68], [76, 32], [76, 68]]);
  const renumbered = players.map((p) => ({ ...p, number: p.number + 100 }));
  assert.deepEqual(defaultPlacements(renumbered), lineup);
});

test('generic fallback still favors a primary goalkeeper over an alternate', () => {
  const roster = [person('alternate', 'CB', ['CB', 'GK'], 1), person('primary', 'GK', null, 99)];
  const lineup = defaultPlacements(roster);
  assert.equal(lineup[0].playerId, 'primary');
  assert.equal(lineup[0].x, 8);
});

test('global assignment reserves the only midfield-capable player instead of consuming them at fullback', () => {
  const roster = [person('g', 'GK'), person('versatile', 'RB', ['RB', 'CM'], 2), person('d1', 'CB', null, 3), person('d2', 'LB', null, 4), person('d3', 'FB', null, 5), person('m', 'DM', null, 6), person('f1', 'ST', null, 7), person('f2', 'ST', null, 8)];
  const lineup = defaultPlacements(roster);
  assert.equal(lineup.find((p) => p.playerId === 'versatile').x, 52);
  assert.equal(lineup.length, 8);
});

test('missing goalkeeper leaves that position open; secondary goalkeepers work', () => {
  const roster = players.filter((p) => p.position !== 'GK' && !p.positions?.includes('GK'));
  const lineup = defaultPlacements(roster);
  assert.equal(lineup.length, 7);
  assert.ok(lineup.every((p) => p.x !== 8));
  const secondary = defaultPlacements(players.filter((p) => p.position !== 'GK'));
  assert.equal(players.find((p) => p.id === secondary[0].playerId).number, 6);
  assert.equal(defaultPlacements([]).length, 0);
});

test('full board rejects a ninth player but accepts a replacement and an on-field swap', () => {
  const lineup = defaultPlacements(players), before = structuredClone(lineup);
  const sub = players.find((p) => !lineup.some((v) => v.playerId === p.id));
  assert.equal(applyDrop(lineup, sub.id, { x: 90, y: 20 }).kind, 'full');
  const replaced = applyDrop(lineup, sub.id, null, lineup[0].playerId);
  assert.equal(replaced.kind, 'replace');
  assert.equal(replaced.placements.length, 8);
  assert.deepEqual(replaced.placements[0], { ...lineup[0], playerId: sub.id });
  const swapped = applyDrop(lineup, lineup[0].playerId, null, lineup[1].playerId);
  assert.deepEqual(swapped.placements[0], { playerId: lineup[0].playerId, x: lineup[1].x, y: lineup[1].y });
  assert.deepEqual(swapped.placements[1], { playerId: lineup[1].playerId, x: lineup[0].x, y: lineup[0].y });
  assert.deepEqual(lineup, before, 'actions must not mutate history');
});

test('free spot permits an eighth player and clamps boundaries; invalid coordinates do not change state', () => {
  const lineup = defaultPlacements(players).slice(0, 7), sub = players.find((p) => !lineup.some((v) => v.playerId === p.id));
  const added = applyDrop(lineup, sub.id, { x: -10, y: 120 });
  assert.equal(added.placements.length, 8);
  assert.deepEqual(added.placements[7], { playerId: sub.id, x: 4, y: 90 });
  assert.equal(applyDrop(lineup, sub.id, { x: NaN, y: 20 }).changed, false);
});

test('formation changes preserve players and stable IDs survive shirt number changes', () => {
  const library = makeLibrary(players), plan = library.plans[0];
  assert.deepEqual(new Set(applyFormation(plan.placements, '2-3-2').map((p) => p.playerId)), new Set(plan.placements.map((p) => p.playerId)));
  const renumbered = players.map((p) => ({ ...p, number: p.number + 100 }));
  const restored = sanitizeLibrary(library, renumbered);
  assert.equal(restored.repairs, 0);
  assert.deepEqual(restored.library.plans[0].placements, plan.placements);
});

test('recovery removes unknown, duplicated, invalid and excess entries, and clamps coordinates', () => {
  const library = makeLibrary(players), plan = library.plans[0];
  plan.placements = [{ playerId: players[0].id, x: -30, y: 800 }, { playerId: players[0].id, x: 50, y: 50 }, { playerId: 'unknown', x: 20, y: 40 }, { playerId: players[1].id, x: null, y: 20 }, ...players.slice(2).map((p) => ({ playerId: p.id, x: 40, y: 50 }))];
  const restored = sanitizeLibrary(library, players);
  const placements = restored.library.plans[0].placements;
  assert.equal(placements.length, 8);
  assert.equal(new Set(placements.map((p) => p.playerId)).size, 8);
  assert.deepEqual(placements[0], { playerId: players[0].id, x: 4, y: 90 });
  assert.ok(restored.repairs >= 4);
});

test('legacy migration resolves number-based players, reports damage, and leaves input unchanged', () => {
  const old = { onField: { GK: 87, D1: 10, repeat: 10, invalid: 999, M1: 22 }, spots: { GK: { x: 8, y: 50 }, repeat: { x: 30, y: 40 }, M1: { x: '52', y: 32 } } };
  const original = structuredClone(old), migrated = migrateLegacy(old, players);
  assert.equal(migrated.library.plans[0].name, '原有阵容');
  assert.equal(migrated.library.plans[0].placements.length, 2);
  assert.ok(migrated.repairs >= 3);
  assert.deepEqual(old, original);
});

test('imports reject unsupported and oversized schemas, append copies, and retain existing plans', () => {
  const library = makeLibrary(players), before = structuredClone(library);
  for (const text of ['no json', '{}', '{"version":4,"plans":[]}', JSON.stringify({ version: 3, plans: [{ id: 'x', name: 'bad', placements: {} }] }), ' '.repeat(MAX_BACKUP_BYTES + 1)]) assert.throws(() => parseBackup(text, players));
  const parsed = parseBackup(JSON.stringify(library), players);
  const next = appendPlans(library, parsed.library);
  assert.equal(next.plans.length, 2);
  assert.notEqual(next.plans[0].id, next.plans[1].id);
  next.plans[1].placements[0].x = 66;
  assert.equal(next.plans[0].placements[0].x, 8);
  assert.deepEqual(library, before);
  assert.throws(() => appendPlans({ plans: Array(50).fill(library.plans[0]) }, parsed.library));
});


test('formation changes retain an advanced keeper, keep a vacant keeper slot, and retain eight manual selections', () => {
  const lineup = defaultPlacements(players);
  const keeper = lineup.find((p) => p.x === 8);
  keeper.x = 90;
  assert.deepEqual(applyFormation(lineup, '2-3-2', players)[0], { playerId: keeper.playerId, x: 8, y: 50 });
  const noKeepers = players.filter((p) => p.position !== 'GK' && !p.positions?.includes('GK'));
  const partial = noKeepers.slice(0, 7).map((p, i) => ({ playerId: p.id, x: 20 + i * 5, y: 50 }));
  assert.equal(applyFormation(partial, '2-3-2', players).length, 7);
  assert.ok(applyFormation(partial, '2-3-2', players).every((p) => p.x !== 8));
  const full = [...partial, { playerId: noKeepers[7].id, x: 70, y: 30 }];
  const result = applyFormation(full, '2-3-2', players);
  assert.equal(result.length, 8);
  assert.deepEqual(new Set(result.map((p) => p.playerId)), new Set(full.map((p) => p.playerId)));
  assert.equal(result[0].playerId, partial[0].playerId);
});


test('2-4-1 uses the same eight players, with number 9 as the lone striker', () => {
  const lineup = defaultPlacements(players, '2-4-1');
  assert.deepEqual(lineup.map((p) => players.find((player) => player.id === p.playerId).number), [6, 10, 25, 60, 88, 22, 11, 9]);
  assert.equal(lineup.filter((p) => p.x === 27).length, 2);
  assert.equal(lineup.filter((p) => p.x === 52).length, 4);
  assert.deepEqual(lineup[7], { playerId: players.find((p) => p.number === 9).id, x: 78, y: 50 });
  assert.deepEqual(applyFormation(defaultPlacements(players), '2-4-1', players), lineup);
  assert.deepEqual(applyFormation(lineup, '3-2-2', players), defaultPlacements(players));
});

test('missing preset players are replaced without disturbing remaining requested players', () => {
  const missing = players.find((p) => p.number === 25);
  const roster = players.filter((p) => p.id !== missing.id);
  const complete = defaultPlacements(players), replaced = defaultPlacements(roster);
  assert.equal(replaced.length, 8);
  assert.ok(!replaced.some((p) => p.playerId === missing.id));
  for (const p of complete.filter((p) => p.playerId !== missing.id)) assert.deepEqual(replaced.find((next) => next.playerId === p.playerId), p);
});

test('old v3 plans retain manual coordinates and legacy 2-3-2 while new fields default silently', () => {
  const old = makeLibrary(players);
  const plan = old.plans[0];
  plan.formation = '2-3-2';
  plan.placements[0] = { ...plan.placements[0], x: 43.25, y: 28.125 };
  delete plan.annotations; delete plan.ball;
  const before = structuredClone(plan.placements), { library, repairs } = sanitizeLibrary(old, players);
  assert.equal(repairs, 0);
  assert.equal(library.plans[0].formation, '2-3-2');
  assert.deepEqual(library.plans[0].placements, before);
  assert.deepEqual(library.plans[0].annotations, []);
  assert.equal(library.plans[0].ball, null);
  assert.equal(old.plans[0].annotations, undefined);
});

test('annotation creation accepts finite valid strokes, clamps boundaries, and ignores short gestures', () => {
  for (const type of ['run', 'pass']) {
    const annotation = makeAnnotation(type, { x: -5, y: 120 }, { x: 60, y: 40 });
    assert.equal(annotation.type, type);
    assert.ok(annotation.id);
    assert.deepEqual(annotation.from, { x: 2, y: 98 });
    assert.deepEqual(annotation.to, { x: 60, y: 40 });
  }
  assert.equal(makeAnnotation('unknown', { x: 10, y: 20 }, { x: 30, y: 40 }), null);
  assert.equal(makeAnnotation('run', { x: 10, y: 20 }, { x: 11, y: 20 }), null);
  assert.equal(makeAnnotation('pass', { x: Infinity, y: 20 }, { x: 30, y: 40 }), null);
  assert.equal(makeAnnotation('run', null, { x: 30, y: 40 }), null);
  assert.equal(makeAnnotation('run', { x: '10', y: 20 }, { x: 30, y: 40 }), null);
  assert.notEqual(makeAnnotation('run', { x: 10, y: 20 }, { x: 30, y: 40 }).id, makeAnnotation('run', { x: 10, y: 20 }, { x: 30, y: 40 }).id);
});

test('annotations and ball survive round trips, another plan copy, and appended imports without sharing objects', () => {
  const library = makeLibrary(players), plan = library.plans[0];
  plan.annotations = [makeAnnotation('run', { x: 20, y: 30 }, { x: 40, y: 55 }), makeAnnotation('pass', { x: 45, y: 50 }, { x: 70, y: 15 })];
  plan.ball = { x: 51.25, y: 23.75 };
  const copied = makePlan('角球', plan.placements, plan.formation, plan);
  assert.deepEqual(copied.annotations, plan.annotations);
  assert.deepEqual(copied.ball, plan.ball);
  copied.annotations[0].from.x = 90; copied.ball.x = 90;
  assert.equal(plan.annotations[0].from.x, 20);
  assert.equal(plan.ball.x, 51.25);
  const parsed = parseBackup(JSON.stringify(library), players);
  assert.equal(parsed.repairs, 0);
  assert.deepEqual(parsed.library.plans[0].annotations, plan.annotations);
  assert.deepEqual(parsed.library.plans[0].ball, plan.ball);
  const imported = appendPlans(library, parsed.library);
  imported.plans[1].annotations[0].to.x = 90; imported.plans[1].ball.y = 90;
  assert.equal(imported.plans[0].annotations[0].to.x, 40);
  assert.equal(imported.plans[0].ball.y, 23.75);
});

test('recovery cleans duplicate or invalid markings, enforces 40 strokes, and reports ball correction', () => {
  const library = makeLibrary(players), plan = library.plans[0];
  const valid = makeAnnotation('run', { x: 10, y: 20 }, { x: 40, y: 50 });
  plan.annotations = [valid, { ...valid }, { ...valid, id: 'bad-type', type: 'html' }, { ...valid, id: 'bad-point', from: { x: null, y: 20 } }, { ...valid, id: 'zero', to: { ...valid.from } }, ...Array.from({ length: 45 }, () => makeAnnotation('pass', { x: 15, y: 70 }, { x: 80, y: 40 }))];
  plan.ball = { x: -100, y: 1000 };
  const result = sanitizeLibrary(library, players);
  assert.equal(result.library.plans[0].annotations.length, MAX_ANNOTATIONS);
  assert.equal(new Set(result.library.plans[0].annotations.map((p) => p.id)).size, MAX_ANNOTATIONS);
  assert.deepEqual(result.library.plans[0].ball, { x: 3, y: 97 });
  assert.equal(result.repairs, 11);
  plan.annotations = {};
  plan.ball = { x: '50', y: 50 };
  const invalid = sanitizeLibrary(library, players);
  assert.deepEqual(invalid.library.plans[0].annotations, []);
  assert.equal(invalid.library.plans[0].ball, null);
  assert.equal(invalid.repairs, 2);
});

test('50 complete annotated plans can be exported with readable formatting and imported within 1 MiB', () => {
  assert.equal(MAX_BACKUP_BYTES, 1024 * 1024);
  const plans = Array.from({ length: 50 }, (_, i) => makePlan(`方案 ${i + 1}`, defaultPlacements(players), '3-2-2', {
    annotations: Array.from({ length: MAX_ANNOTATIONS }, (_, j) => makeAnnotation(j % 2 ? 'run' : 'pass', { x: 15.123456789012345, y: 20.123456789012345 }, { x: 80.123456789012345, y: 65.123456789012345 })),
    ball: { x: 50, y: 50 },
  }));
  const library = { version: 3, activeId: plans[0].id, plans };
  const text = JSON.stringify(library, null, 2);
  assert.ok(new TextEncoder().encode(text).length < MAX_BACKUP_BYTES);
  const restored = parseBackup(text, players);
  assert.equal(restored.repairs, 0);
  assert.equal(restored.library.plans.length, 50);
  assert.ok(restored.library.plans.every((p) => p.annotations.length === MAX_ANNOTATIONS));
});


test('blank annotation IDs are discarded during import and blank plan IDs are repaired', () => {
  const library = makeLibrary(players), plan = library.plans[0];
  plan.id = '   '; library.activeId = plan.id;
  plan.annotations = [{ ...makeAnnotation('run', { x: 10, y: 20 }, { x: 40, y: 50 }), id: ' \t ' }];
  const restored = parseBackup(JSON.stringify(library), players);
  assert.deepEqual(restored.library.plans[0].annotations, []);
  assert.ok(restored.library.plans[0].id.trim());
  assert.ok(restored.repairs >= 2);
});
