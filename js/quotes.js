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

export function pickQuote(stars, mascot) {
  if (Math.random() >= 0.4) return null;
  const pool = stars >= 3 ? QUOTES.praise : stars >= 1 ? QUOTES.cheer : QUOTES.comfort;
  const preferred = pool.filter((q) => q.mascot === mascot);
  const candidates = preferred.length > 0 ? preferred : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
