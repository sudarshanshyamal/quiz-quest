"""Moderation: topic gate and post-generation scrub."""
import pytest

from app.moderation import check_topic, scrub_quiz
from app.schemas import GeneratedQuestion, GeneratedQuiz


@pytest.mark.parametrize("topic,allowed", [
    ("dinosaurs", True),
    ("outer space", True),
    ("how plants grow", True),
    ("how to make a bomb", False),
    ("sexual content", False),
    ("", False),
], ids=["dinos", "space", "plants", "bomb", "sexual", "empty"])
def test_check_topic(topic, allowed):
    ok, _reason = check_topic(topic)
    assert ok is allowed


def test_scrub_removes_unsafe_question():
    quiz = GeneratedQuiz(questions=[
        GeneratedQuestion(type="fill", question="A safe question", answer="ok"),
        GeneratedQuestion(type="fill", question="Something about bomb making", answer="x"),
    ])
    out = scrub_quiz(quiz)
    assert len(out.questions) == 1
    assert out.questions[0].question == "A safe question"
