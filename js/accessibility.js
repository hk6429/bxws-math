import { store } from "./store.js";

const DEFAULTS = { fontSize: "standard", sprintWarning: true, comboBreakEffect: true };
const FONT_SIZES = { standard: "16px", large: "18px", xlarge: "20px" };

export function getAccessibilitySettings() {
  return { ...DEFAULTS, ...(store.read("accessibilitySettings", {}) ?? {}) };
}

export function setAccessibilitySetting(key, value) {
  const next = { ...getAccessibilitySettings(), [key]: value };
  store.write("accessibilitySettings", next);
  return next;
}

export function applyAccessibilitySettings(root = document.documentElement) {
  const settings = getAccessibilitySettings();
  root.style.setProperty("--base-font-size", FONT_SIZES[settings.fontSize] ?? FONT_SIZES.standard);
  root.dataset.sprintWarning = settings.sprintWarning ? "on" : "off";
  root.dataset.comboBreakEffect = settings.comboBreakEffect ? "on" : "off";
  return settings;
}
