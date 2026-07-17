import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const tree = JSON.parse(await readFile(new URL("data/skilltree.json", root), "utf8"));
const nodes = tree.strands.flatMap((strand) => strand.nodes.map((node) => ({ ...node, strand: strand.id })));
const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
const expected = {
  "simple-classification": ["data-uncertainty", "elem-low"],
  "pictogram-simple-table": ["data-uncertainty", "elem-low"],
  "table-reading-making": ["data-uncertainty", "elem-mid"],
  "two-dimensional-pattern": ["relation-pattern", "elem-mid"],
};
for (const [id, [strand, tier]] of Object.entries(expected)) {
  assert.equal(byId[id]?.strand, strand);
  assert.equal(byId[id]?.tier, tier);
  assert.equal(byId[id]?.contentPending, true);
  assert.ok(Array.isArray(byId[id]?.gateChallenges));
  await assert.rejects(access(new URL(`data/questions/${id}.json`, root)));
}
assert.deepEqual(byId["exponent-laws"].prereq, ["prime-factor"]);

const docsBase = new URL("../100_Todo/projects/bxws-curriculum/", root);
const total = await readFile(new URL("00-總綱-統一裁決.md", docsBase), "utf8");
const g7 = await readFile(new URL("06-國中七年級.md", docsBase), "utf8");
for (const code of ["D-1-1", "D-2-1", "D-3-1", "R-4-4"]) assert.match(total, new RegExp(code));
for (const code of ["A-7-7", "A-7-8", "N-7-6", "N-7-7"]) assert.match(g7, new RegExp(code));
assert.match(total, /relation-pattern.*algebra|algebra.*relation-pattern/s);
assert.match(g7, /PDF 第 40 頁/);
assert.match(g7, /移除 `negative-number`/);
console.log("OK E: pending nodes, no banks, strand bridge, official-code docs, and exponent prereq decision verified");
