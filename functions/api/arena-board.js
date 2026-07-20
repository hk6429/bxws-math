import { json, normStr, corsPreflight } from "./_util.js";

const ROOM_CODE_RE = /^[0-9A-Z]{3,8}$/;
const SEASON_RE = /^\d{4}-\d{2}$/;
const STRAND_RE = /^[a-z-]{1,40}$/;

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const roomCode = normStr(url.searchParams.get("roomCode") ?? "", 8).toUpperCase();
  const season = normStr(url.searchParams.get("season") ?? "", 7);
  const strandId = normStr(url.searchParams.get("strandId") ?? "", 40);

  if (!ROOM_CODE_RE.test(roomCode)) return json({ error: "bad-room-code" }, 400);
  if (!SEASON_RE.test(season)) return json({ error: "bad-season" }, 400);
  if (!STRAND_RE.test(strandId)) return json({ error: "bad-strand" }, 400);

  // 白帽：只露前五、暱稱由學生 opt-in（未填名者存「匿名」）
  const { results } = await env.DB.prepare(
    `SELECT student_name AS name, pct, total_sec AS totalSec, total_dmg AS totalDmg,
            max_combo AS maxCombo, flagged, submitted_at AS submittedAt
     FROM arena_results
     WHERE room_code = ? AND season = ? AND strand_id = ?
     ORDER BY pct DESC, total_sec ASC
     LIMIT 5`
  ).bind(roomCode, season, strandId).all();

  const rows = results.map((row) => ({ ...row, flagged: !!row.flagged }));
  return json({ ok: true, roomCode, season, strandId, results: rows });
}
