const NS = "bxws:";
const BUNDLE_KIND = "bxws-travel-case";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(NS + key, JSON.stringify(value));
}

export const store = { read, write };

export function exportNamespace(storage = localStorage) {
  const data = {};
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith(NS)) data[key] = storage.getItem(key);
  }
  return { kind: BUNDLE_KIND, version: 1, exportedAt: new Date().toISOString(), data };
}

export function importNamespace(bundle, storage = localStorage) {
  if (!bundle || bundle.kind !== BUNDLE_KIND || bundle.version !== 1 || !bundle.data || Array.isArray(bundle.data)) {
    throw new Error("這不是《步學吾數》的旅行皮箱檔");
  }
  const entries = Object.entries(bundle.data);
  if (entries.length > 5000) throw new Error("存檔項目過多，已停止匯入");
  for (const [key, value] of entries) {
    if (!key.startsWith(NS) || typeof value !== "string") throw new Error("存檔含有不相容的資料");
    JSON.parse(value);
  }
  entries.forEach(([key, value]) => storage.setItem(key, value));
  return entries.length;
}
