import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const verifierPath = fileURLToPath(new URL("../scripts/verify_jhs_pilot.py", import.meta.url));

test("七年級試水題庫通過 48 題獨立硬算與語意 oracle", async () => {
  const { stdout } = await execFileAsync("python3", [verifierPath]);

  assert.match(stdout, /PASS: 2 pilot nodes, 48 questions, 16 challenges, 3 variants each/);
  assert.match(stdout, /PASS: 24 arithmetic oracles \+ 24 concept\/misconception oracles/);
});
