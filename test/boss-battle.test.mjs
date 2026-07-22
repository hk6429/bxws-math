import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

class FakeStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
  key(index) { return [...this.data.keys()][index] ?? null; }
  get length() { return this.data.size; }
}

globalThis.localStorage = new FakeStorage();
const {
  BOSSES, BOSS_MAX_HP, PLAYER_MAX_HP, bossFor, newBossState, bossGate,
  bossPhase, playerDamage, applyAnswer, bossOutcome, getBossFights, recordBossOutcome, reviveWithBlessing,
} = await import("../js/boss.js");
const { collectionBonusFor } = await import("../js/collection.js");

test("5 座神殿各有一隻對應守護者 boss", () => {
  assert.deepEqual(
    Object.keys(BOSSES).sort(),
    ["algebra", "data-uncertainty", "num-quantity", "relation-pattern", "space-shape"].sort()
  );
  assert.equal(bossFor("num-quantity").name, "米諾陶洛斯");
  assert.equal(bossFor("no-such-strand"), null);
});

test("精熟度未達門檻不可挑戰 boss", () => {
  const strand = { id: "algebra", nodes: [{ id: "a" }, { id: "b" }] };
  const lowProgress = { a: { masteryPct: 0.5 }, b: { masteryPct: 0.4 } };
  const highProgress = { a: { masteryPct: 0.85 }, b: { masteryPct: 0.82 } };
  assert.equal(bossGate(strand, lowProgress, 0.8).eligible, false);
  assert.equal(bossGate(strand, highProgress, 0.8).eligible, true);
});

test("Boss 血量跨過 67% 與 34% 時依序進入三個攻擊階段", () => {
  const base = newBossState("algebra");
  assert.deepEqual(bossPhase(base), {
    id: "probe",
    name: "試探攻勢",
    attack: "謎語試探",
    correctBonus: 0,
  });
  assert.equal(bossPhase({ ...base, hp: 66 }).id, "shield");
  assert.equal(bossPhase({ ...base, hp: 34 }).id, "shield");
  assert.equal(bossPhase({ ...base, hp: 33 }).id, "awakened");
});

test("答對造成的傷害隨連擊增加，血量低於 30% 時背水一戰 ×1.5", () => {
  const normal = playerDamage(0, 100, 100);
  const comboed = playerDamage(3, 100, 100);
  const desperate = playerDamage(0, 20, 100);
  assert.equal(normal, 12);
  assert.equal(comboed, 21);
  assert.equal(desperate, 18); // 12 * 1.5
});

test("收集品加成上限 15%，且能疊加進傷害計算", () => {
  const collection = { n1: { tier: 2 }, n2: { tier: 2 }, n3: { tier: 2 }, n4: { tier: 2 }, n5: { tier: 2 } };
  const bonus = collectionBonusFor(["n1", "n2", "n3", "n4", "n5"], collection, {});
  assert.equal(bonus, 0.15);
  const dmgWithBonus = playerDamage(0, 100, 100, bonus);
  assert.equal(dmgWithBonus, Math.round(12 * 1.15));
});

test("答對扣 Boss 血，連續答錯只守住且不直接判定失敗", () => {
  let boss = newBossState("algebra");
  assert.equal(boss.hp, BOSS_MAX_HP);
  assert.equal(boss.playerHp, PLAYER_MAX_HP);
  assert.equal(bossOutcome(boss), null);

  boss = applyAnswer(boss, true, 1, 0);
  assert.ok(boss.hp < BOSS_MAX_HP);

  const playerHpBefore = boss.playerHp;
  for (let i = 0; i < 20; i += 1) {
    boss = applyAnswer(boss, false, 0, 0);
  }
  assert.equal(boss.playerHp, playerHpBefore);
  assert.equal(bossOutcome(boss), null);
  assert.deepEqual(boss.lastEvent, {
    type: "guard",
    dmg: 0,
    phase: "probe",
    phaseName: "試探攻勢",
    attack: "謎語試探",
  });
});

test("謎盾與覺醒階段只在答對時提供破盾反擊，總加成封頂 25%", () => {
  const base = newBossState("algebra");
  const probe = applyAnswer({ ...base, hp: 80 }, true, 0, 0);
  const shield = applyAnswer({ ...base, hp: 60 }, true, 0, 0);
  const awakened = applyAnswer({ ...base, hp: 30 }, true, 0, 0);
  const capped = applyAnswer({ ...base, hp: 30 }, true, 0, 0.25);

  assert.equal(probe.lastEvent.type, "hit");
  assert.equal(probe.lastEvent.dmg, 12);
  assert.equal(shield.lastEvent.type, "break");
  assert.equal(shield.lastEvent.dmg, 13);
  assert.equal(awakened.lastEvent.type, "counter");
  assert.equal(awakened.lastEvent.dmg, 14);
  assert.equal(capped.lastEvent.dmg, 15);
  assert.equal(capped.lastEvent.totalBonus, 0.25);
});

test("Boss 面板顯示階段招式，答錯只呈現守住提示", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /bossPhase\(boss\)/);
  assert.match(app, /className = `boss-phase boss-phase-\$\{phase\.id\}`/);
  assert.match(app, /`\$\{phase\.name\}・\$\{phase\.attack\}`/);
  assert.match(app, /"🛡 守住了"/);
  assert.match(app, /event\.type === "guard"/);
  assert.match(css, /\.boss-phase \{/);
  assert.match(css, /\.damage-guard \{/);
});

test("Boss 題組用盡而未擊敗時只暫退，不以守護力比例送出勝利", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const queueEndBlock = app.slice(
    app.indexOf("if (session.index >= session.queue.length)"),
    app.indexOf("if (session.kind === \"pvp\")", app.indexOf("if (session.index >= session.queue.length)")),
  );
  assert.match(queueEndBlock, /renderBossOutcome\("retreat", quizArea\)/);
  assert.doesNotMatch(queueEndBlock, /boss\.hp \/ boss\.maxHp/);
  assert.match(app, /這一路的作答都已經算進精熟度/);
});

test("擊敗 boss 後寫入 bossFights，累計次數與最佳連擊只升不降", () => {
  localStorage.data.clear();
  recordBossOutcome("space-shape", "defeat", 2);
  let fights = getBossFights();
  assert.equal(fights["space-shape"].defeated, false);
  assert.equal(fights["space-shape"].attempts, 1);

  recordBossOutcome("space-shape", "victory", 5);
  fights = getBossFights();
  assert.equal(fights["space-shape"].defeated, true);
  assert.equal(fights["space-shape"].bestCombo, 5);
  assert.equal(fights["space-shape"].attempts, 2);

  recordBossOutcome("space-shape", "defeat", 1);
  fights = getBossFights();
  assert.equal(fights["space-shape"].defeated, true); // 只升不降
  assert.equal(fights["space-shape"].bestCombo, 5);
});

test("神諭卷軸蠟封祝福：血量回復一半", () => {
  const boss = { ...newBossState("algebra"), playerHp: 0 };
  const revived = reviveWithBlessing(boss);
  assert.equal(revived.playerHp, Math.round(PLAYER_MAX_HP * 0.5));
  assert.equal(bossOutcome(revived), null);
});
