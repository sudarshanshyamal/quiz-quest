"""Kid-safety moderation.

This is a *first line of defense*, not a complete solution. For a real
children's product, back it with a dedicated moderation model / endpoint and a
maintained blocklist. The keyword list here is deliberately small and obvious.
"""
import re
from typing import Tuple

from .schemas import GeneratedQuiz

# Obvious adult / unsafe themes. Expand and/or replace with a real classifier.
_BLOCKED = {
    "sex", "sexual", "porn", "nude", "naked",
    "suicide", "self-harm", "kill yourself",
    "cocaine", "heroin", "meth", "how to make a bomb", "bomb making",
    "gore", "behead", "terrorist attack",
}

_WORD = re.compile(r"[a-z0-9']+")


def _contains_blocked(text: str) -> str | None:
    lowered = text.lower()
    for term in _BLOCKED:
        if term in lowered:
            return term
    return None


def check_topic(topic: str) -> Tuple[bool, str]:
    """Return (allowed, reason)."""
    hit = _contains_blocked(topic)
    if hit:
        return False, f"Topic looks inappropriate for kids (matched: {hit})."
    if len(_WORD.findall(topic)) == 0:
        return False, "Topic is empty."
    return True, ""


def scrub_quiz(quiz: GeneratedQuiz) -> GeneratedQuiz:
    """Drop any generated question that trips the blocklist. Belt and braces."""
    safe = []
    for q in quiz.questions:
        blob = " ".join([q.question, q.answer, q.explanation, q.hint, *q.options, *q.keyPoints])
        if _contains_blocked(blob) is None:
            safe.append(q)
    return GeneratedQuiz(questions=safe)
