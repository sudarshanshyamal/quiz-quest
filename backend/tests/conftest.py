"""Shared fixtures.

The API tests must run with no real key and no network, so we replace the LLM
client on app.state after startup with a deterministic fake. The real request
pipeline (validate -> moderate -> cache -> scrub -> sanitize) still runs.
"""
import os

# Must be set before app.main constructs its LLM client during lifespan startup.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("CORS_ORIGINS", "*")

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.schemas import GeneratedQuestion, GeneratedQuiz, GradeResponse, Verdict

get_settings.cache_clear()


# A canonical quiz covering all four question types, all valid.
SAMPLE_QUIZ = GeneratedQuiz(questions=[
    GeneratedQuestion(type="mcq", question="Which planet is known as the Red Planet?",
                      options=["Mars", "Venus", "Earth", "Jupiter"], correctIndex=0,
                      explanation="Mars looks red because of iron dust.", hint="It rhymes with 'bars'."),
    GeneratedQuestion(type="truefalse", question="The Sun is a star.", answer="true",
                      explanation="Yes, it is our closest star.", hint="It twinkles by day."),
    GeneratedQuestion(type="fill", question="Water is made of hydrogen and ___.", answer="oxygen",
                      explanation="Water is H2O.", hint="You breathe it in."),
    GeneratedQuestion(type="subjective", question="Why do plants need sunlight?",
                      answer="To make food through photosynthesis.",
                      keyPoints=["photosynthesis", "makes food/energy"],
                      explanation="Sunlight powers photosynthesis.", hint="Think about food."),
])


class FakeLLM:
    """Stand-in for app.llm.LLMClient with deterministic, offline responses."""

    def __init__(self, quiz=None, verdict=Verdict.correct, feedback="Great effort!", safe=True):
        self._quiz = quiz if quiz is not None else SAMPLE_QUIZ
        self._verdict = verdict
        self._feedback = feedback
        self._safe = safe

    async def generate_quiz(self, req):
        return self._quiz

    async def grade_answer(self, req):
        return GradeResponse(verdict=self._verdict, feedback=self._feedback)

    async def topic_is_safe(self, topic):
        return self._safe


@pytest.fixture
def fake_llm():
    return FakeLLM()


@pytest.fixture
def client(fake_llm):
    from app.main import app
    with TestClient(app) as c:
        # Replace the real client created during startup; keep the real cache.
        app.state.llm = fake_llm
        yield c
