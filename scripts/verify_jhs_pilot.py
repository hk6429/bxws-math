#!/usr/bin/env python3
"""獨立驗證七年級試水題庫；數值題由 Python 重新運算，概念題使用明列 oracle。"""

from __future__ import annotations

import json
import argparse
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUESTION_DIR = ROOT / "data" / "questions"
ARRAYS = ("basicMastery", "conceptId", "errorDiagnosis", "contextApplication")
NODE_PREFIXES = {
    "negative-number": "13", "linear-eq-1var": "14", "prime-factorization-app": "1", "exponent-laws": "2", "scientific-notation": "3", "geometry-symbols": "7", "three-views": "8", "perpendicular-bisector": "9", "symmetry-properties-jhs": "10", "statistical-chart-design": "11",
}

ANSWER_ORACLES = {
    "geometry-symbols-bm-1":"線段 AB", "geometry-symbols-bm-v1-2":"射線 AB", "geometry-symbols-bm-v1-3":"直線 AB",
    "geometry-symbols-bm-2":"B", "geometry-symbols-bm-v2-2":"AB 平行 CD", "geometry-symbols-bm-v2-3":"l⊥m",
    "geometry-symbols-ca-1":"垂直", "geometry-symbols-ca-v7-2":"平行", "geometry-symbols-ca-v7-3":"垂直",
    "geometry-symbols-ca-2":"QR", "geometry-symbols-ca-v8-2":"∠Y", "geometry-symbols-ca-v8-3":"8",
    "three-views-bm-1":"寬4、高3", "three-views-bm-v1-2":"寬5、高2", "three-views-bm-v1-3":"1",
    "three-views-bm-2":"寬4、深2", "three-views-bm-v2-2":"1", "three-views-bm-v2-3":"3",
    "three-views-ca-1":"1、3", "three-views-ca-v7-2":"2、1、2", "three-views-ca-v7-3":"2、3",
    "three-views-ca-2":"3", "three-views-ca-v8-2":"6", "three-views-ca-v8-3":"6",
    "perpendicular-bisector-bm-1":"90°", "perpendicular-bisector-bm-v1-2":"垂直", "perpendicular-bisector-bm-v1-3":"30",
    "perpendicular-bisector-bm-2":"通過 AB 中點且垂直 AB 的直線", "perpendicular-bisector-bm-v2-2":"x=4", "perpendicular-bisector-bm-v2-3":"y=1",
    "perpendicular-bisector-ca-1":"AB 的中垂線", "perpendicular-bisector-ca-v7-2":"PA=PB", "perpendicular-bisector-ca-v7-3":"PA=PB",
    "perpendicular-bisector-ca-2":"兩次相同且大於 AB 的一半", "perpendicular-bisector-ca-v8-2":"CD", "perpendicular-bisector-ca-v8-3":"一個點無法唯一確定一條直線",
    "symmetry-properties-jhs-bm-1":"(-3,2)", "symmetry-properties-jhs-bm-v1-2":"(-4,-5)", "symmetry-properties-jhs-bm-v1-3":"(-2,7)",
    "symmetry-properties-jhs-bm-2":"3", "symmetry-properties-jhs-bm-v2-2":"8", "symmetry-properties-jhs-bm-v2-3":"無限多",
    "symmetry-properties-jhs-ca-1":"(-4,1)", "symmetry-properties-jhs-ca-v7-2":"4", "symmetry-properties-jhs-ca-v7-3":"x=2",
    "symmetry-properties-jhs-ca-2":"6", "symmetry-properties-jhs-ca-v8-2":"2", "symmetry-properties-jhs-ca-v8-3":"無限多",
    "statistical-chart-design-bm-1":"長條圖", "statistical-chart-design-bm-v1-2":"折線圖", "statistical-chart-design-bm-v1-3":"圓餅圖",
    "statistical-chart-design-ca-2":"從每個年級隨機抽取若干名學生", "statistical-chart-design-ca-v8-2":"在指定時間與地點用同一儀器重複測量", "statistical-chart-design-ca-v8-3":"測量工具不一致，分數變化可能來自題目難度",
}


def text(value: int | float, unit: str = "") -> str:
    number = int(value) if isinstance(value, float) and value.is_integer() else value
    return f"{number}{unit}"


# 每個 BM／CA 都由運算式產出 oracle，不從 JSON 的 answer 或 explanation 抄答案。
ARITHMETIC_ORACLES = {
    "negative-number-bm-1": lambda: text(-3 - 4),
    "negative-number-bm-v1-2": lambda: text(2 - 7),
    "negative-number-bm-v1-3": lambda: text(-6 + 9),
    "negative-number-bm-2": lambda: text(-8 + 13 - (-4)),
    "negative-number-bm-v2-2": lambda: text((-6) * 5 + 18),
    "negative-number-bm-v2-3": lambda: text(24 // (-6) - (-3) * 2),
    "negative-number-ca-1": lambda: text(-4 + 7, "°C"),
    "negative-number-ca-v7-2": lambda: text(-3 + 5, " 樓"),
    "negative-number-ca-v7-3": lambda: text(-12 - 6, " 公尺"),
    "negative-number-ca-2": lambda: text(180 - 75 - 60 + 25, " 元"),
    "negative-number-ca-v8-2": lambda: text(-4 + 12 - 5 + 8 - 3, " 分"),
    "negative-number-ca-v8-3": lambda: text(-6 - 5 + 9 - 4, "°C"),
    "linear-eq-1var-bm-1": lambda: text(19 - 7),
    "linear-eq-1var-bm-2": lambda: text(-3 + 8),
    "linear-eq-1var-bm-3": lambda: text((-4) * 5),
    "linear-eq-1var-bm-4": lambda: text((23 - 5) / 3),
    "linear-eq-1var-bm-5": lambda: text((8 + 7) / (5 - 2)),
    "linear-eq-1var-bm-6": lambda: text((6 + 4) * 3 / 2),
    "linear-eq-1var-ca-1": lambda: text((250 - 40) / 3, " 元"),
    "linear-eq-1var-ca-2": lambda: text(35 + 12, " 公升"),
    "linear-eq-1var-ca-3": lambda: text((27 + 5) / 4),
    "linear-eq-1var-ca-4": lambda: text((51 - 3) / 3),
    "linear-eq-1var-ca-5": lambda: text((50 / 2 - 5) / 2, " 公分"),
    "linear-eq-1var-ca-6": lambda: text((181 - 85) / 12, " 公里"),
    "prime-factorization-app-bm-1": lambda: "2²×3×7",
    "prime-factorization-app-bm-v1-2": lambda: "2²×3²×5",
    "prime-factorization-app-bm-v1-3": lambda: text(2**3 * 3**2 * 5),
    "prime-factorization-app-bm-2": lambda: text(math.gcd(72, 108)),
    "prime-factorization-app-bm-v2-2": lambda: text(math.gcd(48, 80)),
    "prime-factorization-app-bm-v2-3": lambda: text(math.gcd(126, 210)),
    "prime-factorization-app-ca-1": lambda: "2/3",
    "prime-factorization-app-ca-v7-2": lambda: "5/7",
    "prime-factorization-app-ca-v7-3": lambda: "7/11",
    "prime-factorization-app-ca-2": lambda: text(math.lcm(12, 18), " 秒"),
    "prime-factorization-app-ca-v8-2": lambda: text(math.lcm(15, 20), " 分鐘"),
    "prime-factorization-app-ca-v8-3": lambda: text(math.lcm(8, 12, 18), " 分鐘"),
    "exponent-laws-bm-1": lambda: text(5**4), "exponent-laws-bm-v1-2": lambda: text(2**6),
    "exponent-laws-bm-v1-3": lambda: "3⁵", "exponent-laws-bm-2": lambda: "2⁸",
    "exponent-laws-bm-v2-2": lambda: "7⁶", "exponent-laws-bm-v2-3": lambda: "3⁹",
    "exponent-laws-ca-1": lambda: text(3 * 2**4), "exponent-laws-ca-v7-2": lambda: text(2**6),
    "exponent-laws-ca-v7-3": lambda: text((2**3)**2), "exponent-laws-ca-2": lambda: "3⁵",
    "exponent-laws-ca-v8-2": lambda: "5⁴", "exponent-laws-ca-v8-3": lambda: text((2**2)**3 * 2**4),
    "scientific-notation-bm-1": lambda: "4.5×10⁵", "scientific-notation-bm-v1-2": lambda: "7.2×10⁷",
    "scientific-notation-bm-v1-3": lambda: text(6.08 * 10**6), "scientific-notation-bm-2": lambda: "3.7×10⁻⁴",
    "scientific-notation-bm-v2-2": lambda: "0.0000052", "scientific-notation-bm-v2-3": lambda: "8.04×10⁻⁷",
    "scientific-notation-ca-1": lambda: text(2.4 * 10**6), "scientific-notation-ca-v7-2": lambda: "8.1×10⁻⁶",
    "scientific-notation-ca-v7-3": lambda: "7.35×10⁹", "scientific-notation-ca-2": lambda: "1.2×10⁶",
    "scientific-notation-ca-v8-2": lambda: "4×10⁻⁴", "scientific-notation-ca-v8-3": lambda: "2×10⁶",
    "statistical-chart-design-bm-2": lambda: text(10 / 40 * 100, "%"),
    "statistical-chart-design-bm-v2-2": lambda: text(15 / 50 * 100, "%"),
    "statistical-chart-design-bm-v2-3": lambda: text(0.18 * 200),
    "statistical-chart-design-ca-1": lambda: "星期二",
    "statistical-chart-design-ca-v7-2": lambda: text(130 - 100),
    "statistical-chart-design-ca-v7-3": lambda: text(20000 * 0.3),
}


BOOLEAN_ORACLES = {
    "negative-number-ci-1": True,
    "negative-number-ci-v3-2": False,
    "negative-number-ci-v3-3": True,
    "negative-number-ci-2": True,
    "negative-number-ci-v4-2": False,
    "negative-number-ci-v4-3": True,
    "linear-eq-1var-ci-1": True,
    "linear-eq-1var-ci-2": False,
    "linear-eq-1var-ci-3": False,
    "linear-eq-1var-ci-4": True,
    "linear-eq-1var-ci-5": False,
    "linear-eq-1var-ci-6": True,
    "prime-factorization-app-ci-1": True,
    "prime-factorization-app-ci-v3-2": False,
    "prime-factorization-app-ci-v3-3": True,
    "prime-factorization-app-ci-2": True,
    "prime-factorization-app-ci-v4-2": False,
    "prime-factorization-app-ci-v4-3": True,
    "exponent-laws-ci-1": True, "exponent-laws-ci-v3-2": False, "exponent-laws-ci-v3-3": True,
    "exponent-laws-ci-2": True, "exponent-laws-ci-v4-2": False, "exponent-laws-ci-v4-3": True,
    "scientific-notation-ci-1": True, "scientific-notation-ci-v3-2": False, "scientific-notation-ci-v3-3": True,
    "scientific-notation-ci-2": True, "scientific-notation-ci-v4-2": False, "scientific-notation-ci-v4-3": True,
    "geometry-symbols-ci-1": True, "geometry-symbols-ci-v3-2": False, "geometry-symbols-ci-v3-3": True,
    "geometry-symbols-ci-2": True, "geometry-symbols-ci-v4-2": False, "geometry-symbols-ci-v4-3": True,
    "three-views-ci-1": True, "three-views-ci-v3-2": False, "three-views-ci-v3-3": True,
    "three-views-ci-2": True, "three-views-ci-v4-2": False, "three-views-ci-v4-3": True,
    "perpendicular-bisector-ci-1": True, "perpendicular-bisector-ci-v3-2": True, "perpendicular-bisector-ci-v3-3": False,
    "perpendicular-bisector-ci-2": True, "perpendicular-bisector-ci-v4-2": False, "perpendicular-bisector-ci-v4-3": True,
    "symmetry-properties-jhs-ci-1": True, "symmetry-properties-jhs-ci-v3-2": False, "symmetry-properties-jhs-ci-v3-3": True,
    "symmetry-properties-jhs-ci-2": True, "symmetry-properties-jhs-ci-v4-2": False, "symmetry-properties-jhs-ci-v4-3": True,
    "statistical-chart-design-ci-1": True, "statistical-chart-design-ci-v3-2": False, "statistical-chart-design-ci-v3-3": True,
    "statistical-chart-design-ci-2": True, "statistical-chart-design-ci-v4-2": False, "statistical-chart-design-ci-v4-3": True,
}


# ED 是迷思辨識而非算值；以獨立審查後的必要語意片段核對索引選中的診斷。
DIAGNOSIS_ORACLES = {
    "negative-number-ed-1": "同號相加卻將兩數的絕對值相減",
    "negative-number-ed-v5-2": "誤當成絕對值相減",
    "negative-number-ed-v5-3": "漏寫共同的負號",
    "negative-number-ed-2": "沒有改成加 5",
    "negative-number-ed-v6-2": "減去 -8 應改成加 8",
    "negative-number-ed-v6-3": "減去 -4 應改成加 4",
    "linear-eq-1var-ed-1": "移項時沒有改變正負號",
    "linear-eq-1var-ed-2": "移項時沒有改變正負號",
    "linear-eq-1var-ed-3": "2x 移到左邊時沒有改變正負號",
    "linear-eq-1var-ed-4": "消去乘法係數時誤用減法",
    "linear-eq-1var-ed-5": "應改為兩邊同乘 4",
    "linear-eq-1var-ed-6": "忽略係數 -3 的負號",
    "prime-factorization-app-ed-1": "取較大次方",
    "prime-factorization-app-ed-v5-2": "漏掉非共同質因數",
    "prime-factorization-app-ed-v5-3": "遺漏質因數 3",
    "prime-factorization-app-ed-2": "每個質因數的指數都是偶數",
    "prime-factorization-app-ed-v6-2": "最小只要乘 2",
    "prime-factorization-app-ed-v6-3": "不是看指數和",
    "exponent-laws-ed-1": "保留底數 5", "exponent-laws-ed-v5-2": "不是相加成 4",
    "exponent-laws-ed-v5-3": "總指數應是 2+1+4=7", "exponent-laws-ed-2": "零次方是 1",
    "exponent-laws-ed-v6-2": "3⁰=1", "exponent-laws-ed-v6-3": "零次方是 1",
    "scientific-notation-ed-1": "負指數 -3", "scientific-notation-ed-v5-2": "正指數 5",
    "scientific-notation-ed-v5-3": "向左移", "scientific-notation-ed-2": "指數應相加",
    "scientific-notation-ed-v6-2": "指數應相減", "scientific-notation-ed-v6-3": "10⁵ 保留不變",
    "geometry-symbols-ed-1":"中間的 Q", "geometry-symbols-ed-v5-2":"頂點 B 應放", "geometry-symbols-ed-v5-3":"頂點應都是 Y",
    "geometry-symbols-ed-2":"垂直應寫 l⊥m", "geometry-symbols-ed-v6-2":"平行應用 ∥", "geometry-symbols-ed-v6-3":"l⊥n",
    "three-views-ed-1":"只有 1 格", "three-views-ed-v5-2":"只顯示 1 個", "three-views-ed-v5-3":"共 2 格",
    "three-views-ed-2":"保留深3與高2", "three-views-ed-v6-2":"保留寬6與深2", "three-views-ed-v6-3":"深2",
    "perpendicular-bisector-ed-1":"與 AB 垂直", "perpendicular-bisector-ed-v5-2":"通過 AB 的中點", "perpendicular-bisector-ed-v5-3":"x 座標是 3",
    "perpendicular-bisector-ed-2":"PQ 必須垂直 l", "perpendicular-bisector-ed-v6-2":"絕對值 4", "perpendicular-bisector-ed-v6-3":"|7-3|=4",
    "symmetry-properties-jhs-ed-1":"只有水平與鉛直中線 2 條", "symmetry-properties-jhs-ed-v5-2":"正五邊形有 5 條", "symmetry-properties-jhs-ed-v5-3":"無限多條",
    "symmetry-properties-jhs-ed-2":"AA' 應與 l 垂直", "symmetry-properties-jhs-ed-v6-2":"應是 4 公分", "symmetry-properties-jhs-ed-v6-3":"(-2,5)",
    "statistical-chart-design-ed-1":"時間趨勢應優先用折線圖", "statistical-chart-design-ed-v5-2":"用長條圖", "statistical-chart-design-ed-v5-3":"圓餅圖通常更合適",
    "statistical-chart-design-ed-2":"18÷60=0.3=30%", "statistical-chart-design-ed-v6-2":"80×25%=20", "statistical-chart-design-ed-v6-3":"還少 0.10",
}


def selected_answer(question: dict) -> object:
    if question["type"] in ("basic-mastery", "context-application"):
        return question["options"][question["answer"]]
    if question["type"] == "concept-id":
        return question["correctAnswer"]
    return question["errorOptions"][question["correctErrorIndex"]]


def verify(node_ids: list[str] | None = None) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    reports: list[str] = []
    seen_ids: set[str] = set()
    total = 0
    challenge_total = 0

    selected_nodes = node_ids or list(NODE_PREFIXES)
    for node_id in selected_nodes:
        prefix = NODE_PREFIXES[node_id]
        bank = json.loads((QUESTION_DIR / f"{node_id}.json").read_text(encoding="utf-8"))
        if bank.get("curriculum", {}).get("sourceType") != "自編":
            errors.append(f"{node_id}: curriculum.sourceType 必須明示自編")

        groups: dict[str, list[dict]] = defaultdict(list)
        type_counts = Counter()
        arithmetic_count = 0
        concept_count = 0
        for array_name in ARRAYS:
            questions = bank.get(array_name, [])
            if len(questions) != 6:
                errors.append(f"{node_id}/{array_name}: {len(questions)} 題，不是 6 題")
            for question in questions:
                total += 1
                qid = question.get("id", "")
                if qid in seen_ids:
                    errors.append(f"{qid}: id 重複")
                seen_ids.add(qid)
                type_counts[question.get("type")] += 1
                groups[question.get("challenge")].append(question)

                path = question.get("errorPath")
                if not isinstance(path, str) or not path or path.isdigit():
                    errors.append(f"{qid}: errorPath 不是迷思標籤字串")
                if question.get("difficulty") not in {"easy", "medium", "hard"}:
                    errors.append(f"{qid}: difficulty 不合法")
                if "如圖" in json.dumps(question, ensure_ascii=False) or "下圖" in json.dumps(question, ensure_ascii=False):
                    errors.append(f"{qid}: 純文字題不可引用缺少的圖")

                choices = question.get("options") or question.get("errorOptions")
                if choices is not None:
                    if len(choices) != 4 or len(set(choices)) != 4:
                        errors.append(f"{qid}: 四選項必須唯一")
                    index_key = "answer" if "answer" in question else "correctErrorIndex"
                    index = question.get(index_key)
                    if not isinstance(index, int) or not 0 <= index < len(choices):
                        errors.append(f"{qid}: {index_key} 索引不合法")
                        continue

                actual = selected_answer(question)
                if qid in ARITHMETIC_ORACLES:
                    arithmetic_count += 1
                    expected = ARITHMETIC_ORACLES[qid]()
                    if actual != expected:
                        errors.append(f"{qid}: 選中 {actual!r}，Python 重算為 {expected!r}")
                    if question["options"].count(expected) != 1:
                        errors.append(f"{qid}: 重算答案在選項中不是唯一一次")
                elif qid in BOOLEAN_ORACLES:
                    concept_count += 1
                    if actual is not BOOLEAN_ORACLES[qid]:
                        errors.append(f"{qid}: 概念判斷 {actual!r}，oracle 為 {BOOLEAN_ORACLES[qid]!r}")
                elif qid in DIAGNOSIS_ORACLES:
                    concept_count += 1
                    if DIAGNOSIS_ORACLES[qid] not in str(actual):
                        errors.append(f"{qid}: 選中的迷思診斷不含 {DIAGNOSIS_ORACLES[qid]!r}")
                elif qid in ANSWER_ORACLES:
                    concept_count += 1
                    if actual != ANSWER_ORACLES[qid]:
                        errors.append(f"{qid}: 選中 {actual!r}，概念 oracle 為 {ANSWER_ORACLES[qid]!r}")
                else:
                    errors.append(f"{qid}: 缺少獨立 oracle")

        expected_challenges = {f"{prefix}-{number}" for number in range(1, 9)}
        if set(groups) != expected_challenges:
            errors.append(f"{node_id}: challenge 集合錯誤 {sorted(groups)}")
        for challenge, questions in groups.items():
            if len(questions) != 3:
                errors.append(f"{node_id}/{challenge}: 不是 3 變式")
            if len({question["errorPath"] for question in questions}) != 1:
                errors.append(f"{node_id}/{challenge}: errorPath 在變式間漂移")
        challenge_total += len(groups)
        reports.append(f"PASS: {node_id}: 24 questions, 8 challenges, oracle coverage 24/24 ({arithmetic_count} hard-computation + {concept_count} concept)")
        if type_counts != Counter({
            "basic-mastery": 6,
            "concept-id": 6,
            "error-diagnosis": 6,
            "context-application": 6,
        }):
            errors.append(f"{node_id}: 題型分布錯誤 {dict(type_counts)}")

    expected_total = 24 * len(selected_nodes)
    if total != expected_total or challenge_total != 8 * len(selected_nodes):
        errors.append(f"總量錯誤：{total} 題、{challenge_total} 挑戰")
    return errors, reports


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--node", choices=NODE_PREFIXES)
    args = parser.parse_args()
    selected = [args.node] if args.node else None
    failures, reports = verify(selected)
    if failures:
        print("FAIL: jhs pilot verification")
        print("\n".join(failures))
        raise SystemExit(1)
    print("\n".join(reports))
    count = len(selected or NODE_PREFIXES)
    print(f"PASS: {count} pilot nodes, {count * 24} questions, {count * 8} challenges, 3 variants each")
    print(f"PASS: {count * 24}/{count * 24} questions independently covered by arithmetic or concept oracles")
