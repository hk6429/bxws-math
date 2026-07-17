// 賢者殘卷的一句話：結算頁隨機語錄（40% 機率出現）
// 署名規則：可考的直接署名（古賢者殘卷｜真實出處，原文與出處一字不改）；創作的一律「守護◯◯殘卷的△△導師說」自我聲明，不捏造名言
export const QUOTES = {
  praise: [
    { text: "「頑固的嚴謹。」凡奇導師守護的這片殘卷上只有四個字——你今天一筆一筆把咒卷喚醒，正合古賢者的座右銘。", by: "古賢者殘卷｜達文西座右銘 Ostinato rigore", kind: "史實", mascot: "davinci" },
    { text: "守護達文西殘卷的凡奇導師說：好咒卷不是第一次就畫對，而是每次都比上一稿更準一點。", by: "創作", kind: "創作", mascot: "davinci" },
    { text: "「寧可少些，但要成熟。」符文塔的殘卷這樣寫著——你把每個規律都看清楚了。", by: "古賢者殘卷｜高斯座右銘 Pauca sed matura", kind: "史實", mascot: "gauss" },
    { text: "守護高斯殘卷的格思導師說：你不是只算得快，而是一眼抓到了藏在題目裡的結構。", by: "創作", kind: "創作", mascot: "gauss" },
    { text: "「通往幾何學沒有王者之路。」稜光塔門楣上刻著這句古賢者的答語——連國王都沒有捷徑，而你今天走完的每一步都算數。", by: "古賢者殘卷｜普羅克洛記載歐幾里得答托勒密王", kind: "史實", mascot: "euclid" },
    { text: "守護歐幾里得殘卷的幾德導師說：定義站穩、線條對齊，證明自然會找到出口。", by: "創作", kind: "創作", mascot: "euclid" },
    { text: "守護斐波那契殘卷的斐蘿導師說：你已經看見數列不是一串數，而是一株會生長的星藤。", by: "創作", kind: "創作", mascot: "fibonacci" },
    { text: "守護斐波那契殘卷的斐蘿導師說：規律一旦被你說清楚，下一步就不再是猜測。", by: "創作", kind: "創作", mascot: "fibonacci" },
    { text: "「心有其理，非理性所能盡知。」星卜塔的殘卷這樣低語——你既算清楚，也保留了判斷。", by: "古賢者殘卷｜帕斯卡《思想錄》", kind: "史實", mascot: "pascal" },
    { text: "守護帕斯卡殘卷的帕嵐導師說：你把不確定拆成可以比較的可能，這就是好推理。", by: "創作", kind: "創作", mascot: "pascal" },
  ],
  cheer: [
    { text: "守護達文西殘卷的凡奇導師說：先別急著擦掉錯線；沿著它回看，下一稿就知道要改哪一筆。", by: "創作", kind: "創作", mascot: "davinci" },
    { text: "守護達文西殘卷的凡奇導師說：把這題換一種畫法再試一次，咒卷會替你留下線索。", by: "創作", kind: "創作", mascot: "davinci" },
    { text: "守護高斯殘卷的格思導師說：先找答案在哪一步突然不合理，那裡通常就是錯誤的入口。", by: "創作", kind: "創作", mascot: "gauss" },
    { text: "守護高斯殘卷的格思導師說：別重算整題；先比對規律、符號和關鍵轉折，錯處會自己現形。", by: "創作", kind: "創作", mascot: "gauss" },
    { text: "守護歐幾里得殘卷的幾德導師說：回到定義，把已知條件逐條畫上去，混亂就會變成秩序。", by: "創作", kind: "創作", mascot: "euclid" },
    { text: "守護歐幾里得殘卷的幾德導師說：圖畫歪了不要緊，先確認每一條線究竟代表什麼。", by: "創作", kind: "創作", mascot: "euclid" },
    { text: "守護斐波那契殘卷的斐蘿導師說：先寫出前三步的變化，再問每一步多了什麼、少了什麼。", by: "創作", kind: "創作", mascot: "fibonacci" },
    { text: "守護斐波那契殘卷的斐蘿導師說：規律躲起來時，就把相鄰兩項放在一起比較。", by: "創作", kind: "創作", mascot: "fibonacci" },
    { text: "守護帕斯卡殘卷的帕嵐導師說：先列出所有可能，再檢查有沒有重複或漏掉，機率才站得穩。", by: "創作", kind: "創作", mascot: "pascal" },
    { text: "守護帕斯卡殘卷的帕嵐導師說：資料不會替你下結論；先看總數、分類和比較基準是否一致。", by: "創作", kind: "創作", mascot: "pascal" },
  ],
  comfort: [
    { text: "守護達文西殘卷的凡奇導師說：今天的星光暗一點沒關係；先圈出一題，慢慢重畫第一步。", by: "創作", kind: "創作", mascot: "davinci" },
    { text: "守護達文西殘卷的凡奇導師說：卡住不代表你做不到；換一張紙，把已知條件重新畫一次。", by: "創作", kind: "創作", mascot: "davinci" },
    { text: "守護高斯殘卷的格思導師說：零顆星只是規律還沒現身；挑一題檢查第一個不合理的步驟。", by: "創作", kind: "創作", mascot: "gauss" },
    { text: "守護高斯殘卷的格思導師說：今天先不用追快；把一題答案代回去，找出是哪個符號出了錯。", by: "創作", kind: "創作", mascot: "gauss" },
    { text: "守護歐幾里得殘卷的幾德導師說：看不懂圖不等於不會；先用筆標出端點、角和已知長度。", by: "創作", kind: "創作", mascot: "euclid" },
    { text: "守護歐幾里得殘卷的幾德導師說：這次沒走到終點也沒關係；回到定義，先說清楚一個圖形特徵。", by: "創作", kind: "創作", mascot: "euclid" },
    { text: "守護斐波那契殘卷的斐蘿導師說：現在看不出規律很正常；把前四項排整齊，逐項寫出差多少。", by: "創作", kind: "創作", mascot: "fibonacci" },
    { text: "守護斐波那契殘卷的斐蘿導師說：猜錯也是一條線索；先檢查你的規則能不能同時解釋前三項。", by: "創作", kind: "創作", mascot: "fibonacci" },
    { text: "守護帕斯卡殘卷的帕嵐導師說：不確定並不可怕；先列一張小表，把所有可能各記一次。", by: "創作", kind: "創作", mascot: "pascal" },
    { text: "守護帕斯卡殘卷的帕嵐導師說：資料一多誰都會亂；先分成兩類，再數每一類有幾筆。", by: "創作", kind: "創作", mascot: "pascal" },
  ],
};

// 星屑瓶番外語錄：每集滿 7 粒星屑解鎖一則（署名規則同上，不捏造名言）
export const EXTRA_QUOTES = [
  { text: "守護達文西殘卷的凡奇導師說：每一卷咒文都從第一頁的試畫開始；你已經耐心喚醒到第七頁了。", by: "創作", kind: "創作" },
  { text: "「數學是科學的皇后，數論是數學的皇后。」古賢者殘卷這樣寫著——你正在練習看見數字背後的秩序。", by: "古賢者殘卷｜高斯名言", kind: "史實" },
  { text: "守護達文西殘卷的凡奇導師說：今天多注入一縷星光，明天的咒卷就多一種可能。", by: "創作", kind: "創作" },
  { text: "守護高斯殘卷的格思導師說：算 1 加到 100 的關鍵不是手快，而是先看出首尾配對的規律。", by: "創作", kind: "創作" },
  { text: "「頑固的嚴謹。」一整個月的星屑瓶，就是這句古賢者座右銘最好的證明。", by: "古賢者殘卷｜達文西座右銘 Ostinato rigore", kind: "史實" },
  { text: "守護達文西與高斯殘卷的凡奇、格思兩位導師說：一個願意反覆試畫，一個善於抓出規律，星穹學院永遠歡迎每天回來的你。", by: "創作", kind: "創作" },
];

export function unlockedExtraQuotes(inkDropCount) {
  return EXTRA_QUOTES.slice(0, Math.floor(inkDropCount / 7));
}

export function pickQuote(stars, mascot) {
  if (stars > 1 && Math.random() >= 0.4) return null;
  const pool = stars >= 3 ? QUOTES.praise : stars >= 2 ? QUOTES.cheer : QUOTES.comfort;
  const preferred = pool.filter((q) => q.mascot === mascot);
  const candidates = preferred.length > 0 ? preferred : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
