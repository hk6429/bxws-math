#!/usr/bin/env python3
"""獨立驗證七年級兩個試水題庫；數值題由 Python 重新運算。"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUESTION_DIR = ROOT / "data" / "questions"
ARRAYS = ("basicMastery", "conceptId", "errorDiagnosis", "contextApplication")


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
}


def selected_answer(question: dict) -> object:
    if question["type"] in ("basic-mastery", "context-application"):
        return question["options"][question["answer"]]
    if question["type"] == "concept-id":
        return question["correctAnswer"]
    return question["errorOptions"][question["correctErrorIndex"]]


def verify() -> list[str]:
    errors: list[str] = []
    seen_ids: set[str] = set()
    total = 0
    challenge_total = 0

    for node_id, prefix in (("negative-number", "13"), ("linear-eq-1var", "14")):
        bank = json.loads((QUESTION_DIR / f"{node_id}.json").read_text(encoding="utf-8"))
        if bank.get("curriculum", {}).get("sourceType") != "自編":
            errors.append(f"{node_id}: curriculum.sourceType 必須明示自編")

        groups: dict[str, list[dict]] = defaultdict(list)
        type_counts = Counter()
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
                    expected = ARITHMETIC_ORACLES[qid]()
                    if actual != expected:
                        errors.append(f"{qid}: 選中 {actual!r}，Python 重算為 {expected!r}")
                    if question["options"].count(expected) != 1:
                        errors.append(f"{qid}: 重算答案在選項中不是唯一一次")
                elif qid in BOOLEAN_ORACLES:
                    if actual is not BOOLEAN_ORACLES[qid]:
                        errors.append(f"{qid}: 概念判斷 {actual!r}，oracle 為 {BOOLEAN_ORACLES[qid]!r}")
                elif qid in DIAGNOSIS_ORACLES:
                    if DIAGNOSIS_ORACLES[qid] not in str(actual):
                        errors.append(f"{qid}: 選中的迷思診斷不含 {DIAGNOSIS_ORACLES[qid]!r}")
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
        if type_counts != Counter({
            "basic-mastery": 6,
            "concept-id": 6,
            "error-diagnosis": 6,
            "context-application": 6,
        }):
            errors.append(f"{node_id}: 題型分布錯誤 {dict(type_counts)}")

    if len(ARITHMETIC_ORACLES) != 24 or len(BOOLEAN_ORACLES) + len(DIAGNOSIS_ORACLES) != 24:
        errors.append("verifier oracle 數量不是 24+24")
    if total != 48 or challenge_total != 16:
        errors.append(f"總量錯誤：{total} 題、{challenge_total} 挑戰")
    return errors


if __name__ == "__main__":
    failures = verify()
    if failures:
        print("FAIL: jhs pilot verification")
        print("\n".join(failures))
        raise SystemExit(1)
    print("PASS: 2 pilot nodes, 48 questions, 16 challenges, 3 variants each")
    print("PASS: 24 arithmetic oracles + 24 concept/misconception oracles")
