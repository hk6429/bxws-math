import { json, normStr, corsPreflight } from "./_util.js";

const ROOM_CODE_RE = /^[0-9A-Za-z一-鿿_-]{1,40}$/;
const WEEK_RE = /^\d{4}W\d{2}$/;

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const roomCode = normStr(url.searchParams.get("roomCode") ?? "", 40);
  const week = normStr(url.searchParams.get("week") ?? "", 10);

  if (!roomCode || !ROOM_CODE_RE.test(roomCode)) return json({ error: "bad-room-code" }, 400);
  if (!week || !WEEK_RE.test(week)) return json({ error: "bad-week" }, 400);

  const { results } = await env.DB.prepare(
    `SELECT student_name AS name, pct, total_sec AS totalSec, max_streak AS maxStreak,
            flagged, flag_reasons AS flagReasons, submitted_at AS submittedAt
     FROM weekly_results
     WHERE room_code = ? AND week = ?
     ORDER BY pct DESC, total_sec ASC
     LIMIT 100`
  ).bind(roomCode, week).all();

  const rows = results.map((row) => ({
    ...row,
    flagged: !!row.flagged,
    flagReasons: row.flagReasons ? JSON.parse(row.flagReasons) : [],
  }));

  return json({ ok: true, roomCode, week, results: rows });
}
