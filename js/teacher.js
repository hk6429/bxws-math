const API_BASE = "https://bxws-math.pages.dev";

export function buildBoardUrl(roomCode, week) {
  return `${API_BASE}/api/weekly-board?roomCode=${encodeURIComponent(String(roomCode).trim())}&week=${encodeURIComponent(String(week).trim())}`;
}

export function buildClassShareText(roomCode) {
  return `同學請開啟《步學吾數》，在本週學院盃輸入班級代碼「${String(roomCode).trim()}」，完成後送出本週成績。`;
}

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function resultsToCsv(results = []) {
  const rows = [["姓名", "正確率", "作答時間秒", "可疑標記", "原因"]];
  results.forEach((row) => rows.push([
    row.name, row.pct, row.totalSec, row.flagged ? "是" : "否", (row.flagReasons ?? []).join("、"),
  ]));
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function currentWeek() {
  const date = new Date();
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - start) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}W${String(week).padStart(2, "0")}`;
}

export function setupTeacherPage(doc = document) {
  const form = doc.getElementById("teacher-query");
  const room = doc.getElementById("teacher-room-code");
  const week = doc.getElementById("teacher-week");
  const status = doc.getElementById("teacher-status");
  const body = doc.querySelector("#teacher-results tbody");
  const copy = doc.getElementById("teacher-copy-room");
  const csv = doc.getElementById("teacher-export-csv");
  let currentResults = [];
  week.value ||= currentWeek();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "讀取中…";
    body.replaceChildren();
    try {
      const response = await fetch(buildBoardUrl(room.value, week.value));
      if (!response.ok) throw new Error("查詢失敗");
      currentResults = (await response.json()).results ?? [];
      currentResults.forEach((entry) => {
        const tr = doc.createElement("tr");
        [entry.name, `${entry.pct}%`, `${entry.totalSec} 秒`, entry.flagged ? "⚠ 建議複驗" : "否"].forEach((value) => {
          const td = doc.createElement("td"); td.textContent = value; tr.appendChild(td);
        });
        if (entry.flagged) tr.title = (entry.flagReasons ?? []).join("、");
        body.appendChild(tr);
      });
      status.textContent = currentResults.length ? `共 ${currentResults.length} 筆結果` : "目前沒有成績";
      csv.disabled = currentResults.length === 0;
    } catch {
      currentResults = [];
      csv.disabled = true;
      status.textContent = "目前無法讀取班級結果，請稍後再試。";
    }
  });

  copy.addEventListener("click", async () => {
    if (!room.value.trim()) { status.textContent = "請先輸入班級代碼。"; return; }
    await navigator.clipboard.writeText(buildClassShareText(room.value));
    status.textContent = "班級代碼分享文字已複製。";
  });
  csv.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob(["\ufeff", resultsToCsv(currentResults)], { type: "text/csv;charset=utf-8" }));
    const link = doc.createElement("a");
    link.href = url; link.download = `${room.value.trim()}-${week.value}-班級成果.csv`; link.click();
    URL.revokeObjectURL(url);
  });
}
