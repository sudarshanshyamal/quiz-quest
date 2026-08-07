"""Validation-layer tests: sanitize() semantics + per-type contract + fallback JSON."""
import pytest

from app.schemas import GeneratedQuestion, GeneratedQuiz
from app.validation import extract_json, sanitize
from tests.invariants import assert_question_invariants


def _q(**kw):
    base = dict(type="mcq", question="Q?", options=[], correctIndex=0,
                answer="", keyPoints=[], explanation="", hint="")
    base.update(kw)
    return GeneratedQuestion(**base)


def test_sanitize_drops_malformed_and_fixes_semantics():
    quiz = GeneratedQuiz(questions=[
        _q(type="mcq", question="Good MCQ", options=["a", "b", "c", "d"], correctIndex=2),
        _q(type="mcq", question="Bad index", options=["a", "b"], correctIndex=9),  # clamp -> 0
        _q(type="mcq", question="Too few options", options=["only"]),              # drop
        _q(type="truefalse", question="TF yes", answer="Yes"),                     # -> "true"
        _q(type="truefalse", question="TF junk", answer="nope"),                   # -> "false"
        _q(type="fill", question="Fill ___", answer="word"),
        _q(type="fill", question="Empty fill", answer=""),                         # drop
        _q(type="subjective", question="Why?", answer="because", keyPoints=["k"]),
        _q(type="subjective", question="No answer", answer=""),                    # drop
        _q(type="mcq", question="   ", options=["a", "b"]),                          # blank -> drop
    ])

    qs = sanitize(quiz)

    assert [q.type.value for q in qs] == ["mcq", "mcq", "truefalse", "truefalse", "fill", "subjective"]
    assert [q.id for q in qs] == list(range(len(qs)))  # ids are re-issued sequentially
    assert qs[1].correctIndex == 0                      # out-of-range index clamped
    assert qs[2].answer == "true" and qs[3].answer == "false"  # tf normalized
    for q in qs:
        assert_question_invariants(q.model_dump())


@pytest.mark.parametrize("question", [
    _q(type="mcq", question="Pick one", options=["a", "b", "c", "d"], correctIndex=1),
    _q(type="truefalse", question="A statement", answer="true"),
    _q(type="fill", question="Fill the ___", answer="gap"),
    _q(type="subjective", question="Explain something", answer="an answer", keyPoints=["p"]),
], ids=["mcq", "truefalse", "fill", "subjective"])
def test_per_type_contract(question):
    """A well-formed question of each type survives and satisfies its invariants."""
    qs = sanitize(GeneratedQuiz(questions=[question]))
    assert len(qs) == 1
    assert_question_invariants(qs[0].model_dump())


def test_mcq_options_capped_at_four():
    q = _q(type="mcq", question="Too many", options=["a", "b", "c", "d", "e", "f"], correctIndex=0)
    out = sanitize(GeneratedQuiz(questions=[q]))[0]
    assert len(out.options) == 4


@pytest.mark.parametrize("text,expected", [
    ('{"a": 1}', {"a": 1}),
    ("```json\n{\"a\": 1}\n```", {"a": 1}),
    ("prefix noise {\"a\": 1} trailing", {"a": 1}),
    ("no json here", None),
    ("", None),
])
def test_extract_json(text, expected):
    assert extract_json(text) == expected
