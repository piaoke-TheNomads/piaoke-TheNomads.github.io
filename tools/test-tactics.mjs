import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultPlacements, applyDrop, applyFormation, sanitizeLibrary, migrateLegacy, parseBackup, appendPlans, makeLibrary, MAX_BACKUP_BYTES } from '../src/lib/tactics.js';
const players = JSON.parse(readFileSync(new URL('../data/players.json', import.meta.url))).players.filter((p) => p.status === 'active');
const person = (id, position, positions = null, number = 1) => ({ id, position, positions, number, name: id });

test('default lineup selects a primary goalkeeper and unique appropriate role groups', () => {
  const lineup = defaultPlacements(players);
  assert.equal(lineup.length, 8);
  assert.equal(new Set(lineup.map((p) => p.playerId)).size, 8);
  const roster = lineup.map((p) => players.find((player) => player.id === p.playerId));
  assert.equal(roster[0].position, 'GK');
  assert.equal(roster[0].number, 87);
  assert.ok(roster.slice(1, 4).every((p) => ['CB', 'LB', 'RB', 'FB'].includes(p.position)));
  assert.ok(roster.slice(4, 6).every((p) => ['DM', 'CM', 'AM', 'LM', 'RM'].includes(p.position)));
  assert.ok(roster.slice(6).every((p) => p.position === 'ST'));
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
  const keeper = lineup.find((p) => players.find((player) => player.id === p.playerId).position === 'GK');
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
