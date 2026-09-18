import { test } from "node:test";
import assert from "node:assert/strict";
import { actorTidRisks, calculateActorPriority } from "./actorPriority.ts";

const procedure = (actor, mitreId, extra = {}) => ({
  actor, mitreId, procedure: "Observed procedure", risk: 999, ...extra,
});

test("priority uses the average risk of distinct TIDs, not procedure frequency", () => {
  const risks = actorTidRisks([
    procedure("Actor A", "T1001"),
    procedure("ACTOR A", "T1001"),
    procedure(" actor a ", "T1001.001"),
    procedure("Actor B", "T1002"),
  ], { T1001: 10, "T1001.001": 30, T1002: 500 });
  assert.deepEqual(calculateActorPriority(3, 4, risks.get("ACTOR A")), {
    tidCount: 2, missingRiskCount: 0, riskSum: 40, averageRisk: 20, priority: 240,
  });
});

test("evidence includes old, recent and undated procedures", () => {
  const risks = actorTidRisks([
    procedure("A", "T1001", { date: 0 }),
    procedure("A", "T1002", { date: Date.UTC(2026, 8, 18) }),
    procedure("A", "T1003", { date: null }),
  ], { T1001: 10, T1002: 20, T1003: 30 });
  assert.equal(calculateActorPriority(7, 7, risks.get("A")).priority, 980);
});

test("empty or placeholder procedures are not observations", () => {
  const risks = actorTidRisks([
    procedure("A", "T1001", { procedure: "" }),
    procedure("A", "T1002", { procedure: "[Actor A] - " }),
    procedure("A", "invalid"),
  ], {});
  assert.equal(calculateActorPriority(7, 7, risks.get("A")).priority, 0);
  assert.equal(calculateActorPriority(7, 7, risks.get("A")).tidCount, 0);
});

test("a legitimate zero risk is retained and missing risk is explicit", () => {
  const risks = actorTidRisks([
    procedure("A", "T1001"),
    procedure("B", "T1002", { risk: undefined }),
  ], { T1001: 0 });
  assert.equal(calculateActorPriority(7, 7, risks.get("A")).priority, 0);
  assert.equal(calculateActorPriority(7, 7, risks.get("B")).priority, null);
  assert.equal(calculateActorPriority(7, 7, risks.get("B")).missingRiskCount, 1);
});

test("legacy risk fallback is deterministic and does not inflate TID counts", () => {
  const procedures = [procedure("A", "T1001", { risk: 10 }), procedure("A", "T1001", { risk: 20 })];
  const forward = calculateActorPriority(2, 3, actorTidRisks(procedures, {}).get("A"));
  const reverse = calculateActorPriority(2, 3, actorTidRisks([...procedures].reverse(), {}).get("A"));
  assert.deepEqual(forward, reverse);
  assert.equal(forward.priority, 120);
  assert.equal(forward.tidCount, 1);
});