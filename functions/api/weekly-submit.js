import { json, normStr, clampInt, assessImplausibleResult } from "./_util.js";

const ROOM_CODE_RE = /^[0-9A-Za-z一-鿿_-]{1,40}$/;
const WEEK_RE = /^\d{4}W\d{2}$/;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid-json" }, 400);
  }

  const roomCode = normStr(body.roomCode, 40);
  const week = normStr(body.week, 10);
  const deviceId = normStr(body.deviceId, 40);
  const name = normStr(body.name, 20) || "匿名";
  const pct = clampInt(body.pct, 0, 100);
  const totalSec = clampInt(body.totalSec, 0, 100000);
  const maxStreak = clampInt(body.maxStreak, 0, 999);
  const questionCount = clampInt(body.questionCount, 1, 999);

  if (!roomCode || !ROOM_CODE_RE.test(roomCode)) return json({ error: "bad-room-code" }, 400);
  if (!week || !WEEK_RE.test(week)) return json({ error: "bad-week" }, 400);
  if (!deviceId) return json({ error: "bad-device" }, 400);
  if (pct === null || totalSec === null || maxStreak === null || questionCount === null) {
    return json({ error: "bad-numbers" }, 400);
  }

  const plausibility = assessImplausibleResult({ pct, totalSec, questionCount });

  const existing = await env.DB.prepare(
    "SELECT pct, total_sec FROM weekly_results WHERE room_code = ? AND week = ? AND device_id = ?"
  ).bind(roomCode, week, deviceId).first();

  const better = !existing || pct > existing.pct || (pct === existing.pct && totalSec < existing.total_sec);
  if (!better) {
    return json({ ok: true, updated: false, flagged: plausibility.flagged, reasons: plausibility.reasons });
  }

  await env.DB.prepare(
    `INSERT INTO weekly_results
       (room_code, week, device_id, student_name, pct, total_sec, max_streak, question_count, flagged, flag_reasons, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(room_code, week, device_id) DO UPDATE SET
       student_name = excluded.student_name,
       pct = excluded.pct,
       total_sec = excluded.total_sec,
       max_streak = excluded.max_streak,
       question_count = excluded.question_count,
       flagged = excluded.flagged,
       flag_reasons = excluded.flag_reasons,
       submitted_at = excluded.submitted_at`
  ).bind(
    roomCode, week, deviceId, name, pct, totalSec, maxStreak, questionCount,
    plausibility.flagged ? 1 : 0, JSON.stringify(plausibility.reasons), Date.now()
  ).run();

  return json({ ok: true, updated: true, flagged: plausibility.flagged, reasons: plausibility.reasons });
}
