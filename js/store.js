const NS = "bxws:";
const BUNDLE_KIND = "bxws-travel-case";
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const MAX_VALUE_BYTES = 256 * 1024;
const byteSize = (text) => new TextEncoder().encode(text).byteLength;
const KEY_TYPES = {
  accessibilitySettings: "object",
  activityStreak: "object",
  bestStreak: "number", progress: "progress", leitner: "object", activeSession: "nullable-object",
  badges: "array", collection: "object", encounterPity: "number", encounterPityByRarity: "object", encounterWins: "number",
  errorbook: "object", inkDays: "array", lastChallengeResult: "nullable-object",
  lastCreatedChallenge: "nullable-object", lastPlayed: "nullable-object", lastStrategy: "nullable-string",
  leaderboard: "array", manuscriptCare: "object", masterTrialBest: "nullable-object",
  masterTrialTiers: "object",
  player: "nullable-string", playerId: "string", roomCode: "nullable-string", rareStampBook: "object", rareStamps: "array-or-object",
  schemaVersion: "number", seenTip: "boolean", sfxOn: "boolean", stardustBonus: "number",
  stardustMilestones: "object",
};

export const CURRENT_SCHEMA_VERSION = 2;
let storageBroken = false;

function expectedTypeFor(key) {
  const bare = key.slice(NS.length);
  return KEY_TYPES[bare] ?? (/^(daily|weekly|ghost):/.test(bare) ? "object" : null);
}

function validValue(type, value) {
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";
  if (type === "nullable-string") return value === null || typeof value === "string";
  if (type === "array") return Array.isArray(value);
  if (type === "array-or-object") return value && typeof value === "object";
  if (type === "object") return value && typeof value === "object" && !Array.isArray(value);
  if (type === "nullable-object") return value === null || (value && typeof value === "object" && !Array.isArray(value));
  if (type === "progress") return value && typeof value === "object" && !Array.isArray(value)
    && Object.values(value).every((entry) => entry && typeof entry === "object" && Array.isArray(entry.attempts));
  return false;
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch {
    storageBroken = true;
    return false;
  }
}

export function isStorageBroken() {
  return storageBroken;
}

export function migrateProgress(progress = {}, tree = null) {
  const thresholds = tree?.masteryThresholds ?? {};
  const tierById = new Map(
    (tree?.strands ?? []).flatMap((strand) => strand.nodes ?? []).map((node) => [node.id, node.tier])
  );
  let changed = false;
  const migrated = {};
  Object.entries(progress).forEach(([nodeId, source]) => {
    const entry = { ...source, attempts: [...(source?.attempts ?? [])] };
    const totalAttempts = Number.isFinite(entry.totalAttempts) ? entry.totalAttempts : entry.attempts.length;
    const correctAttempts = Number.isFinite(entry.correctAttempts)
      ? entry.correctAttempts
      : entry.attempts.filter((attempt) => attempt.correct).length;
    const questionStats = { ...(entry.questionStats ?? {}) };
    if (!entry.questionStats) {
      entry.attempts.forEach((attempt) => {
        const stats = questionStats[attempt.questionId] ?? { totalAttempts: 0, correctAttempts: 0 };
        stats.totalAttempts += 1;
        if (attempt.correct) stats.correctAttempts += 1;
        questionStats[attempt.questionId] = stats;
      });
    }
    Object.assign(entry, { totalAttempts, correctAttempts, questionStats });
    if (entry.attempts.length > 50) entry.attempts = entry.attempts.slice(-50);
    if (entry.masteryVersion !== 2) {
      const threshold = thresholds[tierById.get(nodeId)] ?? tree?.masteryThreshold ?? 0.8;
      entry.mastered = (entry.masteryPct ?? 0) >= threshold;
      entry.masteryVersion = 2;
    }
    migrated[nodeId] = entry;
    if (JSON.stringify(entry) !== JSON.stringify(source)) changed = true;
  });
  return { progress: migrated, changed };
}

function migrationWrite(storage, key, value, strict) {
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    storageBroken = true;
    if (strict) throw error;
    return false;
  }
}

function migrationRemove(storage, key, strict) {
  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    storageBroken = true;
    if (strict) throw error;
    return false;
  }
}

function removeStaleKeys(storage, now = new Date(), strict = false) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const currentWeek = (() => {
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}W${String(week).padStart(2, "0")}`;
  })();
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) keys.push(storage.key(index));
  keys.filter(Boolean).forEach((key) => {
    const daily = /^bxws:daily:(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (daily && new Date(`${daily[1]}T00:00:00`) < cutoff) migrationRemove(storage, key, strict);
    const weekly = /^bxws:weekly:(\d{4}W\d{2})$/.exec(key);
    if (weekly && weekly[1] !== currentWeek) migrationRemove(storage, key, strict);
  });
}

export function runMigrations(fromVersion = 0, tree = null, storage = localStorage, strict = false) {
  let version = Number(fromVersion) || 0;
  if (version < 2) {
    const rawProgress = storage.getItem(`${NS}progress`);
    const sourceProgress = rawProgress ? JSON.parse(rawProgress) : {};
    const { progress, changed } = migrateProgress(sourceProgress, tree);
    if (changed) migrationWrite(storage, `${NS}progress`, JSON.stringify(progress), strict);

    const legacyRaw = storage.getItem(`${NS}rareStamps`);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const bookRaw = storage.getItem(`${NS}rareStampBook`);
      const book = bookRaw ? JSON.parse(bookRaw) : {};
      const ids = Array.isArray(legacy) ? legacy : Object.keys(legacy ?? {});
      ids.forEach((id) => {
        if (!book[id]) book[id] = { at: legacy?.[id]?.at ?? null };
      });
      migrationWrite(storage, `${NS}rareStampBook`, JSON.stringify(book), strict);
      migrationRemove(storage, `${NS}rareStamps`, strict);
    }
    version = 2;
  }
  removeStaleKeys(storage, new Date(), strict);
  migrationWrite(storage, `${NS}schemaVersion`, JSON.stringify(CURRENT_SCHEMA_VERSION), strict);
  return version;
}

export const store = { read, write };

function activityDateKey(now) {
  const date = new Date(now);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateSerial(key) {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function getActivityStreak() {
  return store.read("activityStreak", { count: 0, lastDate: null });
}

export function recordActivityStreak(now = Date.now()) {
  const today = activityDateKey(now);
  const current = getActivityStreak();
  if (current.lastDate === today) return current;
  const consecutive = current.lastDate && dateSerial(today) - dateSerial(current.lastDate) === 1;
  const next = { count: consecutive ? current.count + 1 : 1, lastDate: today };
  store.write("activityStreak", next);
  return next;
}

export function exportNamespace(storage = localStorage) {
  const data = {};
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith(NS)) data[key] = storage.getItem(key);
  }
  return { kind: BUNDLE_KIND, version: 1, exportedAt: new Date().toISOString(), data };
}

export function importNamespace(bundle, storage = localStorage, tree = null) {
  if (!bundle || bundle.kind !== BUNDLE_KIND || bundle.version !== 1 || !bundle.data || Array.isArray(bundle.data)) {
    throw new Error("這不是《步學吾數》的魔法行囊檔");
  }
  const entries = Object.entries(bundle.data);
  if (entries.length > 5000) throw new Error("存檔項目過多，已停止匯入");
  const totalBytes = entries.reduce((sum, [key, value]) => sum + byteSize(key) + (typeof value === "string" ? byteSize(value) : 0), 0);
  if (totalBytes > MAX_BUNDLE_BYTES) throw new Error("存檔超過 2MB，已停止匯入");
  for (const [key, value] of entries) {
    if (!key.startsWith(NS) || typeof value !== "string") throw new Error("存檔含有不相容的資料");
    if (byteSize(value) > MAX_VALUE_BYTES) throw new Error("單筆存檔資料過大，已停止匯入");
    const expected = expectedTypeFor(key);
    if (!expected || !validValue(expected, JSON.parse(value))) throw new Error("存檔含有不相容的資料");
  }
  const snapshot = new Map();
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(NS)) snapshot.set(key, storage.getItem(key));
  }
  try {
    entries.forEach(([key, value]) => storage.setItem(key, value));
    const importedVersion = JSON.parse(storage.getItem(`${NS}schemaVersion`) ?? "0");
    runMigrations(importedVersion, tree, storage, true);
  } catch (error) {
    const currentKeys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(NS)) currentKeys.push(key);
    }
    currentKeys.forEach((key) => storage.removeItem?.(key));
    snapshot.forEach((value, key) => storage.setItem(key, value));
    throw new Error(`魔法行囊匯入失敗，已還原原存檔：${error.message}`);
  }
  return entries.length;
}
