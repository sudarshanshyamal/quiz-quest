"""Turn a (schema-valid) GeneratedQuiz into clean, renderable questions.

Structured outputs guarantee the *shape* of the data, not its correctness — e.g.
correctIndex can still be out of range, an mcq can arrive with one option, or a
true/false answer can be phrased oddly. This layer enforces those semantics.
"""
import json
import re
from typing import List, Optional

from .schemas import GeneratedQuestion, GeneratedQuiz, QType, QuizQuestion


def _norm_bool(s: str) -> str:
    return "true" if s.strip().lower() in {"true", "t", "yes", "1"} else "false"


def sanitize(quiz: GeneratedQuiz) -> List[QuizQuestion]:
    out: List[QuizQuestion] = []
    for q in quiz.questions:
        if not q.question.strip():
            continue
        if q.type == QType.mcq:
            if len(q.options) < 2:
                continue
            idx = q.correctIndex if 0 <= q.correctIndex < len(q.options) else 0
            q = q.model_copy(update={"options": q.options[:4], "correctIndex": min(idx, 3)})
        elif q.type == QType.truefalse:
            q = q.model_copy(update={"answer": _norm_bool(q.answer)})
        elif q.type in (QType.fill, QType.subjective):
            if not q.answer.strip():
                continue
        out.append(QuizQuestion(id=len(out), **q.model_dump()))
    return out


# ---------- fallback parsing (used only if native structured output is unavailable) ----------

def extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    t = re.sub(r"```(?:json)?", "", text).strip()
    start, end = t.find("{"), t.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(t[start : end + 1])
    except json.JSONDecodeError:
        return None
