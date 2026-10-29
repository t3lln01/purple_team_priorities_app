import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTactic, tacticNames, techniqueIsEnabled } from "./tacticScope.ts";
import { actorTidRisks, calculateActorPriority } from "./actorPriority.ts";

const registry = new Map([
  ["T1001", new Set(["defense evasion", "command and control"])],
  ["T1002", new Set(["collection"])],
]);

test("names, STIX slugs and ATT&CK tactic IDs match the same selection", () => {
  for (const name of [" Defense Evasion ", "defense-evasion", "defense_evasion", "TA0005"]) {
    assert.equal(normalizeTactic(name), "defense evasion");
  }
  assert.deepEqual(tacticNames("Collection, command-and-control"), ["collection", "command and control"]);
});

test("any disabled tactic excludes a multi-tactic TID, including sub-techniques", () => {
  const disabled = new Set(["defense evasion"]);
  assert.equal(techniqueIsEnabled(" t1001 ", [], registry, disabled), false);
  assert.equal(techniqueIsEnabled("T1002", [], registry, disabled), true);
  assert.equal(techniqueIsEnabled("T1001.001", "TA0005", registry, disabled), false);
  assert.equal(techniqueIsEnabled("T1001", [], registry, new Set()), true);
});

test("imported technique metadata respects persisted selections", () => {
  const persisted = JSON.stringify(["defense evasion"]);
  const afterRefresh = new Set(JSON.parse(persisted));
  assert.equal(techniqueIsEnabled("T9999", "defense-evasion", new Map(), afterRefresh), false);
  const afterImport = new Map([["T9999", new Set(["defense evasion"])]]);
  assert.equal(techniqueIsEnabled("T9999", [], afterImport, afterRefresh), false);
  assert.equal(techniqueIsEnabled("T9999", [], afterImport, new Set()), true);
});

test("both actor priority numerator and denominator exclude disabled TIDs", () => {
  const raw = [
    { actor: "A", mitreId: "T1001", procedure: "Observed", risk: 100 },
    { actor: "A", mitreId: "T1002", procedure: "Observed", risk: 10 },
  ];
  const active = raw.filter(p => techniqueIsEnabled(p.mitreId, [], registry, new Set(["defense evasion"])));
  const result = calculateActorPriority(3, 4, actorTidRisks(active, {}).get("A"));
  assert.equal(result.tidCount, 1);
  assert.equal(result.averageRisk, 10);
  assert.equal(result.priority, 120);
  assert.equal(raw.length, 2, "underlying evidence is preserved");
});

test("all disabled tactics exclude known mapped baseline TIDs without deleting rows", () => {
  const data = JSON.parse(readFileSync(new URL("../data.json", import.meta.url), "utf8"));
  const map = new Map(Object.entries(data.techTacticMap).map(([id, names]) => [id, new Set(tacticNames(names))]));
  const disabled = new Set(data.tactics.map(t => normalizeTactic(t.tactic)));
  const mapped = [...map.entries()].filter(([, names]) => names.size);
  assert.ok(mapped.length > 0);
  assert.equal(mapped.filter(([id]) => techniqueIsEnabled(id, [], map, disabled)).length, 0);
  assert.equal(mapped.filter(([id]) => techniqueIsEnabled(id, [], map, new Set())).length, mapped.length);
});
