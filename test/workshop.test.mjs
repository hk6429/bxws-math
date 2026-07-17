import test from "node:test";
import assert from "node:assert/strict";
import { computeWorkshop } from "../js/workshop.js";

test("工作室修復度由精熟、落款與稀有章加權推導，不另存進度", () => {
  const tree = {
    strands: [
      { id: "num-quantity", name: "數與量", nodes: [{ id: "n1" }, { id: "n2" }] },
      { id: "space-shape", name: "空間與形狀", nodes: [], status: "coming-soon" },
    ],
  };
  const workshop = computeWorkshop(tree, {
    progress: { n1: { masteryPct: 1 }, n2: { masteryPct: 0.5 } },
    collection: { n1: { tier: 2 }, n2: { tier: 1 } },
    rareStamps: { "stamp-n1": { at: 1 } },
  });

  assert.equal(workshop.rooms[0].repairPct, 71);
  assert.equal(workshop.rooms[0].stage, "mending");
  assert.equal(workshop.rooms[1].stage, "blueprint");
  assert.equal(workshop.rooms[1].available, false);
});

test("目前已上線房間全數重光時，觸發工作室終局", () => {
  const tree = { strands: [{ id: "algebra", name: "代數", nodes: [{ id: "a1" }] }] };
  const workshop = computeWorkshop(tree, {
    progress: { a1: { masteryPct: 1 } },
    collection: { a1: { tier: 2 } },
    rareStamps: { "stamp-a1": { at: 1 } },
  });
  assert.equal(workshop.overallPct, 100);
  assert.equal(workshop.allRestored, true);
});
