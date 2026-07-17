import { readFile, writeFile } from "node:fs/promises";

const types = ["basic-mastery", "concept-id", "error-diagnosis", "context-application"];
const keys = ["basicMastery", "conceptId", "errorDiagnosis", "contextApplication"];
const ids = ["bm", "ci", "ed", "ca"];
function buildBank(nodeId, prefix, curriculum, groups) {
  const bank = { nodeId, curriculum };
  groups.forEach((rows, group) => {
    bank[keys[group]] = rows.map((row, index) => {
      const base = { id: `${nodeId}-${ids[group]}-${index + 1}`, type: types[group], challenge: `${prefix}-${group * 2 + (index % 2) + 1}` };
      if (group === 0) return { ...base, stem: row[0], options: row[1], answer: row[2], explanation: row[3], difficulty: row[4], errorPath: row[5] };
      if (group === 1) return { ...base, statement: row[0], correctAnswer: row[1], explanation: row[2], difficulty: row[3] };
      if (group === 2) return { ...base, problem: row[0], wrongSolution: row[1], errorOptions: row[2], correctErrorIndex: row[3], explanation: row[4], difficulty: row[5], errorPath: row[6] };
      return { ...base, scenario: row[0], question: row[1], options: row[2], answer: row[3], explanation: row[4], difficulty: row[5], errorPath: row[6] };
    });
  });
  return bank;
}

const banks = [
  buildBank("linear-equation-modeling", "4", {
    codes: ["A-7-2", "A-7-3", "a-IV-2"],
    note: "以一元一次方程式表徵具體情境、求解、驗算並解釋答案。",
  }, [
    [
      ["每枝筆 x 元，買 3 枝再付 20 元，共 95 元。下列何者正確？", ["3x+20=95", "3(x+20)=95", "x+23=95", "20x+3=95"], 0, "三枝的價錢是 3x，再加固定費用 20，所以列式 3x+20=95。", "easy", "operation-translation"],
      ["某數 x 的 2 倍減 7 等於 19，方程式為何？", ["2(x-7)=19", "2x-7=19", "x-14=19", "7-2x=19"], 1, "先取 2 倍得 2x，再減 7。", "easy", "operation-translation"],
      ["長方形長為 x 公分、寬為 5 公分，周長 34 公分。方程式為何？", ["x+5=34", "2x+5=34", "2(x+5)=34", "5x=34"], 2, "周長為 2×(長+寬)，所以 2(x+5)=34。", "medium", "quantity-reference"],
      ["小安原有 x 元，買 48 元文具後剩 72 元。方程式為何？", ["x+48=72", "48-x=72", "x-48=72", "72-48=x"], 2, "原有金額減支出等於剩餘：x-48=72。", "easy", "quantity-reference"],
      ["三個連續整數最小為 x，總和是 63。方程式為何？", ["3x=63", "x+(x+1)+(x+2)=63", "x+(x+2)+(x+4)=63", "3(x+1)=60"], 1, "三數依序為 x、x+1、x+2。", "hard", "quantity-reference"],
    ],
    [
      ["建模時，未知數要先說明代表哪一個量以及單位。", true, "如此才能判斷方程式與最後答案是否符合情境。", "easy"],
      ["列出方程式後，只要解出 x，不必檢查是否符合題目條件。", false, "應代回驗算，並檢查數值與單位是否合理。", "easy"],
      ["『比 x 的 3 倍多 5』可寫成 3x+5。", true, "先乘 3，再增加 5。", "easy"],
      ["同一個情境只能列出唯一外觀的方程式。", false, "等價方程式可能外觀不同，例如 x-48=72 與 x=120。", "medium"],
      ["方程式的解在應用題中仍需配合人數、長度等限制解釋。", true, "代數解不一定自動符合情境限制。", "medium"],
    ],
    [
      ["每張票 x 元，4 張加手續費 30 元共 430 元", "列成 4(x+30)=430", ["手續費只收一次，不應每張都加 30", "4 張應寫 x+4", "總價應用減法", "未知數不能代表票價"], 0, "正確方程式是 4x+30=430。", "medium", "operation-translation"],
      ["哥哥 x 歲，弟弟比哥哥小 3 歲，兩人共 27 歲", "列成 x+(x+3)=27", ["弟弟應是 x-3", "總年齡不能相加", "哥哥應是 3x", "27 應移到左邊"], 0, "弟弟較小，應列 x+(x-3)=27。", "medium", "quantity-reference"],
      ["5 本同價筆記本加 15 元運費共 215 元", "解得 x=40，回答總價是 40 元", ["方程式無解", "40 是每本單價，不是總價", "應把 40 乘運費", "單位應是本"], 1, "5x+15=215 得 x=40；x 代表每本單價。", "easy", "solution-interpretation"],
      ["某數的 3 倍再減 8 等於 25", "列成 3(x-8)=25", ["應先減 8 再乘 3", "3 只乘未知數，應列 3x-8=25", "應列 x-24=25", "等號方向錯誤"], 1, "語句是先取三倍，再減 8。", "medium", "operation-translation"],
      ["長方形寬 x、長比寬多 4，周長 28", "列成 x+(x+4)=28", ["只算了半周長，右邊應是 14 或左邊乘 2", "長應是 x-4", "周長應用乘法 x(x+4)", "未知數不能是寬"], 0, "x+(x+4)=14，或 2[x+(x+4)]=28。", "hard", "quantity-reference"],
    ],
    [
      ["園遊會門票每張 x 元，買 6 張另付 40 元郵資，共 640 元。", "每張門票多少元？", ["90 元", "100 元", "106 元", "600 元"], 1, "6x+40=640，6x=600，x=100。", "medium", "operation-translation"],
      ["一條繩子剪去 2 段，每段 35 公分後，還剩 80 公分。原長為 x 公分。", "原繩長是多少？", ["10 公分", "115 公分", "150 公分", "220 公分"], 2, "x-2×35=80，所以 x=150。", "easy", "quantity-reference"],
      ["長方形的長比寬多 3 公分，周長 30 公分。設寬為 x。", "寬是多少？", ["5 公分", "6 公分", "7 公分", "9 公分"], 1, "2[x+(x+3)]=30，4x+6=30，x=6。", "hard", "quantity-reference"],
      ["媽媽與小芸年齡和為 52 歲，媽媽年齡是小芸的 3 倍。", "小芸幾歲？", ["12 歲", "13 歲", "17 歲", "39 歲"], 1, "設小芸 x 歲，x+3x=52，x=13。", "medium", "solution-interpretation"],
      ["三個連續奇數的和為 57，設最小奇數為 x。", "最大的奇數是多少？", ["17", "19", "21", "23"], 2, "x+(x+2)+(x+4)=57，3x+6=57，x=17，最大為 21。", "hard", "solution-interpretation"],
    ],
  ]),
  buildBank("linear-inequality-meaning", "5", {
    codes: ["A-7-7", "a-IV-3"], note: "理解不等式、由具體情境列式並辨認解與邊界。",
  }, [
    [
      ["x 至少是 8，可寫成？", ["x>8", "x≥8", "x<8", "x≤8"], 1, "至少包含 8，所以是 x≥8。", "easy", "boundary-symbol"],
      ["x 小於 5，可寫成？", ["x≤5", "x>5", "x<5", "x≥5"], 2, "『小於』不包含 5。", "easy", "boundary-symbol"],
      ["每枝筆 12 元，帶 100 元買 x 枝且錢足夠，可列？", ["12x≥100", "12x≤100", "12+x≤100", "100x≤12"], 1, "總價 12x 不可超過 100。", "medium", "direction-translation"],
      ["下列哪一個數符合 2x+1>9？", ["x=3", "x=4", "x=5", "x=0"], 2, "代入 x=5 得 11>9；x=4 只得到 9，不符合嚴格大於。", "medium", "single-value-as-set"],
      ["氣溫 t 不高於 18°C，可列？", ["t<18", "t≤18", "t>18", "t≥18"], 1, "不高於包含等於 18。", "easy", "boundary-symbol"],
    ],
    [
      ["不等式 x>3 的解不只一個數。", true, "所有大於 3 的數都是解。", "easy"],
      ["符號 ≥ 表示大於，但不包含等於。", false, "≥ 表示大於或等於。", "easy"],
      ["判斷某數是否為不等式的解，可以代入檢查。", true, "代入後若敘述成立，就是一個解。", "easy"],
      ["x<2 與 2>x 表示相同的範圍。", true, "兩者都表示 x 在 2 的左側。", "medium"],
      ["不等式只用來描述整數範圍。", false, "不等式也可描述分數、小數與所有實數範圍。", "medium"],
    ],
    [
      ["身高 h 至少 140 公分", "寫成 h>140", ["至少要包含 140，應用 ≥", "方向應改成 h<140", "h 應寫在右邊", "不等式不能有單位"], 0, "正確為 h≥140。", "easy", "boundary-symbol"],
      ["預算 500 元，花費 x 元不可超支", "寫成 x≥500", ["不可超支表示 x≤500", "500 應除以 x", "應用等號", "x 只能是整數"], 0, "花費的上限是 500。", "easy", "direction-translation"],
      ["解集為 x<4", "只寫答案 x=3", ["3 不符合", "把整個解集誤成單一解", "應寫 x>4", "4 也一定是解"], 1, "3 只是眾多解中的一個，完整範圍是 x<4。", "medium", "single-value-as-set"],
      ["年齡 a 未滿 18 歲", "寫成 a≤18", ["未滿不包含 18，應為 a<18", "應為 a≥18", "年齡不能用未知數", "18 應放左邊"], 0, "『未滿』是嚴格小於。", "easy", "boundary-symbol"],
      ["搭電梯總重不可超過 600 公斤，已有 420 公斤，再上 x 公斤", "列成 420+x≥600", ["總重應小於 0", "不可超過表示 420+x≤600", "應列 420x≤600", "只能列等式"], 1, "600 是上限，總重不得超過。", "medium", "direction-translation"],
    ],
    [
      ["遊樂設施規定身高至少 130 公分。小安身高 h 公分。", "正確不等式為何？", ["h>130", "h≥130", "h<130", "h≤130"], 1, "至少包含邊界 130。", "easy", "boundary-symbol"],
      ["每本書 75 元，帶 500 元買 x 本，不可超出預算。", "正確不等式為何？", ["75x≤500", "75x≥500", "75+x≤500", "500x≤75"], 0, "總價不超過 500。", "medium", "direction-translation"],
      ["班級活動至少需要 24 人，已有 17 人，還需 x 人。", "正確不等式為何？", ["17+x≤24", "17+x≥24", "17x≥24", "x-17≥24"], 1, "總人數至少 24。", "medium", "direction-translation"],
      ["包裹重量不得超過 5 公斤，目前重 w 公斤。", "w 的範圍為何？", ["w<5", "w≤5", "w>5", "w≥5"], 1, "不得超過包含等於 5。", "easy", "boundary-symbol"],
      ["不等式 3x-2<10 描述可接受的 x。", "下列何者符合？", ["x=4", "x=5", "x=6", "x=10"], 0, "代入 4 得 10<10 為假——修正檢查：3×4-2=10，不符合；題目選項應無正解。", "hard", "single-value-as-set"],
    ],
  ]),
];

// 修正最後一題的選項，確保唯一正解 x=3。
banks[1].contextApplication[4].options = ["x=3", "x=4", "x=5", "x=10"];
banks[1].contextApplication[4].answer = 0;
banks[1].contextApplication[4].explanation = "代入 x=3 得 3×3-2=7<10；其餘選項不符合。";

banks.push(
  buildBank("linear-inequality-solving", "6", {
    codes: ["A-7-8", "a-IV-3"], note: "解單一一元一次不等式、在數線表示解集並解應用問題。",
  }, [
    [
      ["解 x+3>7", ["x>4", "x<4", "x≥4", "x≤4"], 0, "兩邊同減 3，得 x>4。", "easy", "move-term-sign"],
      ["解 2x≤10", ["x≤5", "x≥5", "x<8", "x≤8"], 0, "兩邊同除以正數 2，不等號方向不變。", "easy", "coefficient-inverse-operation"],
      ["解 -3x>6", ["x>−2", "x<−2", "x≥−2", "x≤−2"], 1, "兩邊同除以負數 -3，不等號方向要反轉。", "medium", "negative-reverse"],
      ["解 5-2x≥1", ["x≥2", "x≤2", "x>−2", "x≤−2"], 1, "-2x≥-4，再除以 -2 並反轉，得 x≤2。", "hard", "negative-reverse"],
      ["解 (x-1)/3<2", ["x<5", "x<7", "x>7", "x≤7"], 1, "兩邊乘 3 得 x-1<6，再加 1 得 x<7。", "medium", "coefficient-inverse-operation"],
    ],
    [
      ["不等式兩邊同加一個數，不等號方向不變。", true, "加減同一數保持大小關係。", "easy"],
      ["不等式兩邊同乘負數時，不等號方向要反轉。", true, "例如 2<3 同乘 -1 後為 -2>-3。", "easy"],
      ["x≤4 在數線上以 4 的實心點並向左表示。", true, "包含 4 用實心點，小於範圍向左。", "medium"],
      ["解 2x>8 時，因為除以 2，所以不等號要反轉。", false, "只有乘除負數才反轉；2 是正數。", "easy"],
      ["應用題解出範圍後，若 x 代表人數，仍需取符合條件的整數。", true, "人數不能取任意小數。", "medium"],
    ],
    [
      ["解 x-5>2", "寫成 x>2-5=-3", ["-5 移項應變 +5，得 x>7", "不等號應反轉", "應除以 5", "x 應為等號"], 0, "兩邊同加 5 得 x>7。", "easy", "move-term-sign"],
      ["解 4x≤20", "寫成 x≤20-4=16", ["消去係數要除以 4，得 x≤5", "應反轉不等號", "20-4 算錯", "應加 4"], 0, "係數 4 以除法消去。", "easy", "coefficient-inverse-operation"],
      ["解 -2x≤8", "兩邊除以 -2，寫成 x≤-4", ["除法算錯", "除以負數忘了反轉，應 x≥-4", "應寫 x≤4", "不等式無解"], 1, "乘除負數必須反轉不等號。", "medium", "negative-reverse"],
      ["解 3x+2<11", "移項寫成 3x<11+2", ["+2 移項應變 -2，得 3x<9", "應反轉不等號", "3 應加到右邊", "應用等號"], 0, "兩邊同減 2。", "medium", "move-term-sign"],
      ["解 6-3x>0", "得到 -3x>-6 後寫 x>-2", ["-6 算錯", "除以負數未反轉，應 x<2", "應得 x<-2", "應用實心點"], 1, "6-3x>0 得 -3x>-6，除以 -3 後 x<2。", "hard", "negative-reverse"],
    ],
    [
      ["計程車起跳 70 元，每公里加 20 元，預算不超過 250 元，行駛 x 公里。", "最多可行駛幾公里？", ["8 公里", "9 公里", "12 公里", "16 公里"], 1, "70+20x≤250，20x≤180，x≤9。", "medium", "coefficient-inverse-operation"],
      ["電梯限重 600 公斤，已有 455 公斤，每位學生 48 公斤。", "最多還可進入幾位學生？", ["2 位", "3 位", "4 位", "5 位"], 1, "455+48x≤600，x≤145/48≈3.02，取整數最多 3 位。", "hard", "solution-interpretation"],
      ["小考至少 70 分才及格，已得 18 分作業分，考試分數為 x。", "考試至少幾分？", ["52 分", "70 分", "88 分", "42 分"], 0, "18+x≥70，所以 x≥52。", "easy", "move-term-sign"],
      ["租借單車 30 元，之後每小時 25 元，帶 130 元。", "最多租幾小時？", ["3 小時", "4 小時", "5 小時", "6 小時"], 1, "30+25x≤130，25x≤100，x≤4。", "medium", "coefficient-inverse-operation"],
      ["某數的 5 倍減 4 小於 21。", "這個數 x 的範圍為何？", ["x<5", "x≤5", "x>5", "x<17/5"], 0, "5x-4<21，5x<25，x<5。", "medium", "move-term-sign"],
    ],
  ]),
  buildBank("histogram-contingency", "12", {
    codes: ["D-7-1", "d-IV-1"], note: "整理與判讀直方圖、長條圖及列聯表。",
  }, [
    [
      ["某直方圖中 10–未滿20 分有 7 人，20–未滿30 分有 12 人。哪組人數較多？", ["10–未滿20", "20–未滿30", "一樣多", "無法判斷"], 1, "12>7，所以 20–未滿30 分組較多。", "easy", "interval-reading"],
      ["列聯表：男生喜歡球類 8 人、音樂 5 人；女生喜歡球類 6 人、音樂 9 人。喜歡音樂共幾人？", ["11", "13", "14", "15"], 2, "音樂欄合計 5+9=14。", "easy", "row-column-total"],
      ["同上表，受調查總人數為何？", ["20", "24", "28", "30"], 2, "8+5+6+9=28。", "medium", "row-column-total"],
      ["直方圖的 30–未滿40 組有 4 人。分數恰為 40 的人屬於哪組？", ["30–未滿40", "40–未滿50", "兩組都算", "兩組都不算"], 1, "區間右端不包含 40，應歸入下一組。", "medium", "interval-boundary"],
      ["哪一項最能區分一般長條圖與連續資料直方圖？", ["直方圖的柱通常相連", "直方圖一定是圓形", "長條圖不能標人數", "直方圖沒有橫軸"], 0, "連續組距相接，因此直方圖柱通常相連。", "medium", "chart-type-confusion"],
    ],
    [
      ["直方圖適合呈現分組後的連續數量資料。", true, "例如身高、時間或分數區間。", "easy"],
      ["列聯表可以同時呈現兩個分類變項的交叉人數。", true, "每一格代表兩種分類條件的交集。", "easy"],
      ["直方圖柱子相連，是因為相鄰組距代表連續區間。", true, "柱子相連具有資料連續性的意義。", "medium"],
      ["列聯表只要看其中一格，就能知道全班總人數。", false, "必須加總所有互斥分類格或使用總計。", "easy"],
      ["10–未滿20 與 20–未滿30 的區間會把 20 重複計算兩次。", false, "第一組不包含 20，第二組包含 20。", "medium"],
    ],
    [
      ["區間 0–未滿10 有 3 人、10–未滿20 有 6 人", "把分數 10 算進第一組", ["10 應進 10–未滿20 組", "10 不屬於任何組", "兩組都要算", "人數應相乘"], 0, "『未滿10』不包含 10。", "easy", "interval-boundary"],
      ["列聯表中球類欄為男 7、女 8", "說喜歡球類共 8 人", ["只看了女生格，應加 7+8=15", "應算 8-7", "應看列總計", "列聯表不能加總"], 0, "欄總計要加總同欄各列。", "easy", "row-column-total"],
      ["類別是紅、藍、綠三種顏色", "用柱子相連的直方圖呈現", ["顏色是離散類別，宜用有間隔的長條圖", "直方圖不能有顏色", "柱高不能是人數", "應改用數線"], 0, "直方圖用於連續分組資料。", "medium", "chart-type-confusion"],
      ["列聯表四格為 5、6、7、8", "總人數算成 5+8=13", ["只加對角格，應四格全加得 26", "應相乘", "應取最大值", "應只加第一列"], 0, "總數是所有互斥交叉格的合計。", "medium", "row-column-total"],
      ["20–未滿30 組有 9 人", "說分數 30 也算在這組", ["30 應進下一組", "30 應同時計兩組", "30 不可出現在資料", "9 人應改成 30 人"], 0, "右端點『未滿30』不包含 30。", "easy", "interval-boundary"],
    ],
    [
      ["班級通勤時間直方圖：0–未滿10 分有 6 人，10–未滿20 分有 11 人，20–未滿30 分有 8 人。", "哪一組人數最多？", ["0–未滿10", "10–未滿20", "20–未滿30", "一樣多"], 1, "11 人最多。", "easy", "interval-reading"],
      ["列聯表：七年級搭公車 12、步行 8；八年級搭公車 9、步行 11。", "步行學生共有幾人？", ["17", "19", "20", "40"], 1, "8+11=19。", "easy", "row-column-total"],
      ["同上資料。", "受調查學生共幾人？", ["20", "21", "40", "48"], 2, "12+8+9+11=40。", "medium", "row-column-total"],
      ["閱讀時間分組為 0–未滿15、15–未滿30、30–未滿45 分。", "恰好閱讀 30 分鐘歸入哪組？", ["15–未滿30", "30–未滿45", "兩組", "皆非"], 1, "30 不在前組的『未滿30』內，屬於下一組。", "medium", "interval-boundary"],
      ["要比較不同社團（籃球、合唱、美術）人數。", "較適合哪一種圖？", ["柱子相連的直方圖", "有間隔的長條圖", "數線", "散布圖"], 1, "社團是離散類別，適合長條圖。", "medium", "chart-type-confusion"],
    ],
  ])
);

for (const bank of banks) {
  const path = new URL(`../data/questions/${bank.nodeId}.json`, import.meta.url);
  await writeFile(path, `${JSON.stringify(bank, null, 2)}\n`);
}

// 既有兩個資料節點補難度、穩定迷思標籤與課綱錨點。
for (const [nodeId, curriculum, paths] of [
  ["median-mode", { codes: ["D-7-2", "d-IV-1"], note: "用中位數與眾數描述資料特性。" }, ["median-sort-first", "multiple-modes"]],
  ["probability-basic", { codes: ["D-6-2", "D-9-2", "D-9-3"], note: "從國小可能性先備銜接九年級機率；非七年級正式條目。" }, ["total-outcomes-denominator", "incomplete-favorable-outcomes"]],
]) {
  const path = new URL(`../data/questions/${nodeId}.json`, import.meta.url);
  const bank = JSON.parse(await readFile(path, "utf8"));
  bank.curriculum = curriculum;
  keys.forEach((key, group) => (bank[key] ?? []).forEach((question, index) => {
    question.difficulty = index < 2 ? "easy" : index < 4 ? "medium" : "hard";
    if (group === 2) question.errorPath = index < 3 ? paths[0] : paths[1];
    else if (question.errorPath !== undefined) question.errorPath = index < 3 ? paths[0] : paths[1];
  }));
  await writeFile(path, `${JSON.stringify(bank, null, 2)}\n`);
}
