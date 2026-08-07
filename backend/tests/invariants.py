"""The contract every rendered question must satisfy.

Structured outputs guarantee shape; these invariants assert the *semantics* the
frontend relies on. Used both on sanitize() output and on live API responses.
Accepts a plain dict (API JSON) or anything dict-convertible.
"""
from app.schemas import QType

VALID_TYPES = {t.value for t in QType}


def assert_question_invariants(q: dict) -> None:
    assert isinstance(q.get("id"), int) and q["id"] >= 0, q
    t = q["type"]
    assert t in VALID_TYPES, f"unknown type: {t}"
    assert isinstance(q["question"], str) and q["question"].strip(), "empty question"
    assert isinstance(q.get("explanation", ""), str)
    assert isinstance(q.get("hint", ""), str)

    if t == "mcq":
        opts = q["options"]
        assert 2 <= len(opts) <= 4, f"mcq needs 2-4 options, got {len(opts)}"
        assert all(isinstance(o, str) and o.strip() for o in opts), "blank option"
        assert 0 <= q["correctIndex"] < len(opts), "correctIndex out of range"
    elif t == "truefalse":
        assert q["answer"] in {"true", "false"}, f"tf answer not normalized: {q['answer']!r}"
    elif t == "fill":
        assert isinstance(q["answer"], str) and q["answer"].strip(), "fill needs an answer"
    elif t == "subjective":
        assert isinstance(q["answer"], str) and q["answer"].strip(), "subjective needs a model answer"
        assert isinstance(q.get("keyPoints", []), list), "keyPoints must be a list"
