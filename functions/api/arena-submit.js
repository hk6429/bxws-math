import { json, normStr, clampInt, assessImplausibleResult, corsPreflight } from "./_util.js";

const ROOM_CODE_RE = /^[0-9A-Z]{3,8}$/;
const SEASON_RE = /^\d{4}-\d{2}$/;
const STRAND_RE = /^[a-z-]{1,40}$/;

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid-json" }, 400);
  }

  const roomCode = normStr(body.roomCode, 8).toUpperCase();
  const season = normStr(body.season, 7);
  const strandId = normStr(body.strandId, 40);
  const deviceId = normStr(body.deviceId, 40);
  const name = normStr(body.name, 20) || "匿名";
  const pct = clampInt(body.pct, 0, 100);
  const totalSec = clampInt(body.totalSec, 0, 100000);
  const totalDmg = clampInt(body.totalDmg, 0, 1000000);
  const maxCombo = clampInt(body.maxCombo, 0, 999);
  const questionCount = clampInt(body.questionCount, 1, 999);

  if (!ROOM_CODE_RE.test(roomCode)) return json({ error: "bad-room-code" }, 400);
  if (!SEASON_RE.test(season)) return json({ error: "bad-season" }, 400);
  if (!STRAND_RE.test(strandId)) return json({ error: "bad-strand" }, 400);
  if (!deviceId) return json({ error: "bad-device" }, 400);
  if ([pct, totalSec, totalDmg, maxCombo, questionCount].some((v) => v === null)) {
    return json({ error: "bad-numbers" }, 400);
  }

  const plausibility = assessImplausibleResult({ pct, totalSec, questionCount });

  const existing = await env.DB.prepare(
    "SELECT pct, total_sec FROM arena_results WHERE room_code = ? AND season = ? AND strand_id = ? AND device_id = ?"
  ).bind(roomCode, season, strandId, deviceId).first();

  const better = !existing || pct > existing.pct || (pct === existing.pct && totalSec < existing.total_sec);
  if (!better) {
    return json({ ok: true, updated: false, flagged: plausibility.flagged, reasons: plausibility.reasons });
  }

  await env.DB.prepare(
    `INSERT INTO arena_results
       (room_code, season, strand_id, device_id, student_name, pct, total_sec, total_dmg, max_combo, question_count, flagged, flag_reasons, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(room_code, season, strand_id, device_id) DO UPDATE SET
       student_name = excluded.student_name,
       pct = excluded.pct,
       total_sec = excluded.total_sec,
       total_dmg = excluded.total_dmg,
       max_combo = excluded.max_combo,
       question_count = excluded.question_count,
       flagged = excluded.flagged,
       flag_reasons = excluded.flag_reasons,
       submitted_at = excluded.submitted_at`
  ).bind(
    roomCode, season, strandId, deviceId, name, pct, totalSec, totalDmg, maxCombo, questionCount,
    plausibility.flagged ? 1 : 0, JSON.stringify(plausibility.reasons), Date.now()
  ).run();

  return json({ ok: true, updated: true, flagged: plausibility.flagged, reasons: plausibility.reasons });
}
