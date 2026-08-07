"""Pydantic models.

Two roles:
  * API contract models (requests + responses to/from the frontend)
  * The structured-output target the LLM must conform to (GeneratedQuiz)
"""
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class QType(str, Enum):
    mcq = "mcq"
    fill = "fill"
    truefalse = "truefalse"
    subjective = "subjective"


class Verdict(str, Enum):
    correct = "correct"
    partial = "partial"
    incorrect = "incorrect"


# ---------- requests ----------

class GenerateRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=120)
    age: int = Field(ge=4, le=18)
    count: int = Field(ge=1, le=15)
    # Empty list => "surprise mix" of all types.
    types: List[QType] = Field(default_factory=list)
    # Optional variety/idempotency token. A new value yields a fresh quiz;
    # reusing the same value (e.g. on a retry) hits the cache.
    seed: Optional[str] = Field(default=None, max_length=64)

    @field_validator("topic")
    @classmethod
    def _clean_topic(cls, v: str) -> str:
        return v.strip()


class GradeRequest(BaseModel):
    question: str = Field(min_length=1)
    model_answer: str = ""
    key_points: List[str] = Field(default_factory=list)
    child_answer: str = Field(min_length=1, max_length=2000)
    age: int = Field(ge=4, le=18)


# ---------- structured-output target (what the model must return) ----------

class GeneratedQuestion(BaseModel):
    type: QType
    question: str
    options: List[str] = Field(default_factory=list)   # mcq only
    correctIndex: int = 0                               # mcq only
    answer: str = ""                                    # fill / truefalse / subjective
    keyPoints: List[str] = Field(default_factory=list)  # subjective only
    explanation: str = ""
    hint: str = ""


class GeneratedQuiz(BaseModel):
    questions: List[GeneratedQuestion]


# ---------- responses to the frontend ----------

class QuizQuestion(GeneratedQuestion):
    id: int


class QuizResponse(BaseModel):
    topic: str
    age: int
    questions: List[QuizQuestion]
    cached: bool = False


class GradeResponse(BaseModel):
    verdict: Verdict
    feedback: str


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
