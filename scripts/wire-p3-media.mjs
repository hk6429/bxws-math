import { readFileSync, writeFileSync, existsSync } from "node:fs";

// P3 幾何配圖接線：把已生成的家族概念圖掛到對應節點的每一題（question.media = {src, alt}）。
// 圖為退飽和線稿、無文字數字，不會洩答，可安全當全節點參考插圖。renderMedia 缺圖自動隱藏。
const IMG = {
  "geometry-shapes-solids": "各種平面圖形與立體形體及其構成要素的示意圖",
  "geometry-angle-family": "角的種類與量角器示意圖",
  "geometry-quadrilateral-family": "三角形與四邊形家族示意圖",
  "geometry-circle-family": "圓、扇形、圓周長與圓面積示意圖",
  "geometry-area-family": "周長、面積與平面圖形面積公式示意圖",
  "geometry-symmetry": "線對稱示意圖",
  "geometry-box-volume": "長方體與柱體的體積與表面積示意圖",
  "geometry-nets": "柱體、錐體與展開圖示意圖",
  "geometry-scale": "放大、縮小與比例尺示意圖",
};
const NODE_IMG = {
  "shape-recognize": "geometry-shapes-solids", "shape-feature": "geometry-shapes-solids",
  "angle-basic": "geometry-angle-family", "angle-degree": "geometry-angle-family",
  "circle-parts": "geometry-circle-family", "circle-measure": "geometry-circle-family",
  "tri-quad-types": "geometry-quadrilateral-family", "tri-quad-property": "geometry-quadrilateral-family",
  "perimeter-area-formula": "geometry-area-family", "plane-area-formula": "geometry-area-family",
  "area-cm2": "geometry-area-family", "area-m2": "geometry-area-family", "area-large-units": "geometry-area-family",
  "line-symmetry": "geometry-symmetry",
  "cuboid-volume": "geometry-box-volume", "prism-volume": "geometry-box-volume",
  "volume-cm3": "geometry-box-volume", "capacity-volume": "geometry-box-volume",
  "solids-nets": "geometry-nets",
  "scale-map": "geometry-scale",
};
const TYPE_KEYS = ["basicMastery", "conceptId", "errorDiagnosis", "contextApplication"];
let nodes = 0, questions = 0;
for (const [node, img] of Object.entries(NODE_IMG)) {
  const path = `data/questions/${node}.json`;
  if (!existsSync(path)) { console.log("SKIP (no file)", node); continue; }
  if (!existsSync(`assets/geometry/${img}.webp`)) { console.log("SKIP (no image)", img); continue; }
  const data = JSON.parse(readFileSync(path, "utf8"));
  const media = { src: `assets/geometry/${img}.webp`, alt: IMG[img] };
  let n = 0;
  for (const key of TYPE_KEYS) {
    if (!Array.isArray(data[key])) continue;
    for (const q of data[key]) { q.media = { ...media }; n++; }
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  nodes++; questions += n;
  console.log(`WIRED ${node} <- ${img}  (${n} questions)`);
}
console.log(`\nDone: ${nodes} nodes, ${questions} questions wired.`);
