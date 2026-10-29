import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMatches, summarizeMatches, seasonSummary, nextMatch, latestResult,
  shanghaiDate, validDate, validTime, filterMatches, sortMatches,
} from "../src/lib/matches.js";
const season = { id: "2025-26", played: 14, rank: 1, status: "completed", matchCoverage: "partial" };
const fixture = (overrides = {}) => ({
  id: "test-match", season: season.id, competition: "测试赛事", stage: "regular",
  opponent: "测试对手", date: "2026-04-03", time: "18:00", status: "finished",
  score: { for: 0, against: 0 }, penalties: null, venue: null,
  originalDate: null, originalTime: null, ...overrides,
});

test("0:0 counts as a completed draw, without relying on score truthiness", () => {
  assert.deepEqual(summarizeMatches([fixture()]), { played: 1, wins: 0, draws: 1, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 });
  assert.deepEqual(validateMatches({ matches: [fixture()] }, [season]), []);
});
test("penalties stay separate from goals and the match draw", () => {
  const match = fixture({ score: { for: 1, against: 1 }, penalties: { for: 4, against: 3 } });
  const stats = summarizeMatches([match]);
  assert.equal(stats.goalsFor, 1); assert.equal(stats.goalsAgainst, 1); assert.equal(stats.draws, 1);
  assert.deepEqual(validateMatches({ matches: [match] }, [season]), []);
});
test("scheduled, postponed, cancelled and missing-score fixtures never enter statistics", () => {
  const matches = ["scheduled", "postponed", "cancelled", "finished"].map((status) => fixture({ status, score: null }));
  assert.equal(summarizeMatches(matches).played, 0);
});
test("partial history preserves official totals and keeps friendlies separate", () => {
  const matches = [fixture(), fixture({ id: "friendly", stage: "friendly", score: { for: 9, against: 0 } })];
  const summary = seasonSummary(season, matches);
  assert.equal(summary.played, 14); assert.equal(summary.officialPlayed, 14);
  assert.equal(summary.totals.played, 1); assert.equal(summary.totals.goalsFor, 0);
  assert.equal(summary.stages.find((row) => row.key === "friendly").goalsFor, 9);
  assert.equal(seasonSummary({ ...season, matchCoverage: "complete" }, matches).played, 1);
});
test("a new season with zero matches is valid and has zero played", () => {
  const planned = { id: "2026-27", played: 0, rank: null, status: "planned", matchCoverage: "complete" };
  assert.deepEqual(validateMatches({ matches: [] }, [planned]), []);
  assert.equal(seasonSummary(planned, []).played, 0);
});
test("next match is chosen at visit time in Shanghai, skipping elapsed and uncertain starts", () => {
  const now = new Date("2026-10-28T16:30:00Z"); // Shanghai 29 October 00:30.
  const matches = [
    fixture({ id: "elapsed", status: "scheduled", date: "2026-10-29", time: "00:10", score: null }),
    fixture({ id: "today-unknown", status: "scheduled", date: "2026-10-29", time: null, score: null }),
    fixture({ id: "postponed", status: "postponed", date: "2026-10-29", time: "12:00", score: null }),
    fixture({ id: "cancelled", status: "cancelled", date: "2026-10-29", time: "12:00", score: null }),
    fixture({ id: "tomorrow", status: "scheduled", date: "2026-10-30", time: null, score: null }),
    fixture({ id: "unknown", status: "scheduled", date: null, time: null, score: null }),
  ];
  assert.equal(shanghaiDate(now), "2026-10-29");
  assert.equal(nextMatch(matches, now).id, "tomorrow");
  assert.equal(nextMatch(matches, new Date("2026-10-30T16:00:00Z")), null);
  assert.equal(matches[0].status, "scheduled", "passing kickoff never changes a match status");
});
test("latest result excludes unknown dates, incomplete scores and future dates", () => {
  const matches = [fixture(), fixture({ id: "no-date", date: null, time: null }), fixture({ id: "no-score", date: "2026-10-01", score: null }), fixture({ id: "future", date: "2027-01-01" })];
  assert.equal(latestResult(matches, new Date("2026-10-29T00:00:00Z")).id, "test-match");
});
test("filter combines season, status and stage and keeps sorting stable", () => {
  const records = [fixture(), fixture({ id: "other", season: "2024-25", stage: "playoff", date: null })];
  assert.equal(filterMatches(records, { season: "2025-26", status: "finished", stage: "regular" }).length, 1);
  assert.equal(filterMatches(records, { stage: "friendly" }).length, 0);
  assert.equal(sortMatches(records)[1].id, "other");
});
test("rejects unknown seasons, impossible dates, invalid times, negative and fractional scores", () => {
  for (const patch of [
    { season: "absent" }, { date: "2026-02-29" }, { date: "2026-04-31" },
    { time: "24:00" }, { date: null, time: "18:00" }, { score: { for: -1, against: 0 } },
    { score: { for: 0.5, against: 0 } }, { score: { for: "0", against: 0 } },
    { status: "scheduled" }, { originalDate: "2026-13-01" },
    { penalties: { for: 4, against: 4 } }, { score: { for: 2, against: 1 }, penalties: { for: 4, against: 3 } },
  ]) assert.ok(validateMatches({ matches: [fixture(patch)] }, [season]).length > 0, JSON.stringify(patch));
  assert.equal(validDate("2024-02-29"), true); assert.equal(validDate("2026-2-03"), false); assert.equal(validTime("09:05"), true);
});
test("duplicate IDs and duplicate fixtures are rejected", () => {
  assert.ok(validateMatches({ matches: [fixture(), fixture()] }, [season]).some((error) => error.includes("id 重复")));
  assert.ok(validateMatches({ matches: [fixture(), fixture({ id: "another" })] }, [season]).some((error) => error.includes("比赛记录重复")));
});
test("coverage declaration must agree with the entered records", () => {
  assert.ok(validateMatches({ matches: [fixture()] }, [{ ...season, matchCoverage: "none" }]).length);
  assert.ok(validateMatches({ matches: [fixture({ score: null })] }, [{ ...season, matchCoverage: "complete" }]).length);
  assert.ok(validateMatches({ matches: [] }, [{ ...season, matchCoverage: "complete" }]).length);
  assert.ok(validateMatches({ matches: [fixture()] }, [{ ...season, matchCoverage: "complete" }]).some((error) => error.includes("官方场次")));
  assert.deepEqual(validateMatches({ matches: [fixture()] }, [{ ...season, played: 1, matchCoverage: "complete" }]), []);
  assert.ok(validateMatches({ matches: [fixture({ status: "postponed", score: null })] }, [{ ...season, matchCoverage: "complete" }]).length);
});
