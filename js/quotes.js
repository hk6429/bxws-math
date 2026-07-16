// 大師的一句話：結算頁隨機語錄（40% 機率出現）
// 署名規則：可考的直接署名；創作的一律「如果◯◯在場，大概會說」自我聲明，不捏造名言
const QUOTES = {
  praise: [
    { text: "「寧可少些，但要成熟。」你這一輪，兩者都有了。", by: "高斯座右銘 Pauca sed matura", mascot: "gauss" },
    { text: "「數學是科學的皇后。」今天她多了一位小侍衛。", by: "高斯", mascot: "gauss" },
    { text: "如果達文西在場，大概會說：這一頁草稿，我願意簽上名字。", by: "", mascot: "davinci" },
    { text: "如果高斯在場，大概會說：全對不稀奇，稀奇的是你每一題都想過為什麼。", by: "", mascot: "gauss" },
  ],
  cheer: [
    { text: "「頑固的嚴謹。」錯的那幾題，就用這四個字對付它。", by: "達文西座右銘 Ostinato rigore", mascot: "davinci" },
    { text: "如果達文西在場，大概會說：我的草稿本裡，塗改的地方比完成的地方多。", by: "", mascot: "davinci" },
    { text: "如果高斯在場，大概會說：我算錯的次數，比你這輩子做過的題目還多。", by: "", mascot: "gauss" },
    { text: "如果達文西在場，大概會說：畫歪的線不用擦掉，它告訴你直線在哪裡。", by: "", mascot: "davinci" },
  ],
  comfort: [
    { text: "如果高斯在場，大概會說：今天卡住的地方，就是明天要開工的地方。", by: "", mascot: "gauss" },
    { text: "如果達文西在場，大概會說：飛行器我也摔了很多台，摔壞的每一台都在教我。", by: "", mascot: "davinci" },
    { text: "如果高斯在場，大概會說：你已經把不會的地方找出來了，這才是今天的收穫。", by: "", mascot: "gauss" },
    { text: "如果達文西在場，大概會說：闔上草稿本沒關係，明天翻開時它還在等你。", by: "", mascot: "davinci" },
  ],
};

// 墨水瓶番外語錄：每集滿 7 滴墨解鎖一則（署名規則同上，不捏造名言）
export const EXTRA_QUOTES = [
  { text: "如果達文西在場，大概會說：我的每一本筆記，都是從第一頁的塗鴉開始的。你已經翻開第七頁了。", by: "" },
  { text: "「數學是科學的皇后，數論是數學的皇后。」你每天練的加減乘除，正是皇后的階梯。", by: "高斯" },
  { text: "如果達文西在場，大概會說：持續，是天分做不到的事。", by: "" },
  { text: "如果高斯在場，大概會說：我小時候算 1 加到 100，靠的不是快，是看出規律——你也開始看出自己的規律了。", by: "" },
  { text: "「頑固的嚴謹。」一個月的墨水瓶，就是這四個字最好的證明。", by: "達文西座右銘 Ostinato rigore" },
  { text: "如果達文西與高斯同時在場，大概會一起說：工作室的門，永遠為每天回來的人開著。", by: "" },
];

export function unlockedExtraQuotes(inkDropCount) {
  return EXTRA_QUOTES.slice(0, Math.floor(inkDropCount / 7));
}

export function pickQuote(stars, mascot) {
  if (Math.random() >= 0.4) return null;
  const pool = stars >= 3 ? QUOTES.praise : stars >= 1 ? QUOTES.cheer : QUOTES.comfort;
  const preferred = pool.filter((q) => q.mascot === mascot);
  const candidates = preferred.length > 0 ? preferred : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
