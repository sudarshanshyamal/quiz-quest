"""Request-model validation: bounds and cleaning."""
import pytest
from pydantic import ValidationError

from app.schemas import GenerateRequest, GradeRequest, QType


def test_topic_is_stripped():
    assert GenerateRequest(topic="  space  ", age=8, count=3).topic == "space"


def test_types_accepts_enum_values():
    req = GenerateRequest(topic="space", age=8, count=3, types=["mcq", "fill"])
    assert req.types == [QType.mcq, QType.fill]


def test_seed_is_optional():
    assert GenerateRequest(topic="space", age=8, count=3).seed is None


@pytest.mark.parametrize("kw", [
    dict(topic="", age=8, count=3),      # empty topic
    dict(topic="x", age=3, count=3),     # age below 4
    dict(topic="x", age=19, count=3),    # age above 18
    dict(topic="x", age=8, count=0),     # count below 1
    dict(topic="x", age=8, count=16),    # count above 15
], ids=["empty-topic", "age-low", "age-high", "count-low", "count-high"])
def test_generate_request_rejects_out_of_bounds(kw):
    with pytest.raises(ValidationError):
        GenerateRequest(**kw)


def test_grade_request_requires_child_answer():
    with pytest.raises(ValidationError):
        GradeRequest(question="q", child_answer="", age=8)
