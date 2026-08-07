"""End-to-end API tests through FastAPI's TestClient with the LLM faked.

These exercise the real pipeline (validation, moderation, cache, scrub,
sanitize) and assert the per-type contract on live responses.
"""
from tests.invariants import assert_question_invariants

GEN_BODY = {"topic": "space", "age": 8, "count": 4, "types": [], "seed": "t1"}


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_generate_happy_path(client):
    r = client.post("/api/generate", json=GEN_BODY)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["topic"] == "space"
    assert data["cached"] is False
    assert len(data["questions"]) == 4
    for q in data["questions"]:
        assert_question_invariants(q)


def test_generate_is_cached_on_second_call(client):
    body = {**GEN_BODY, "seed": "cache-me"}
    first = client.post("/api/generate", json=body).json()
    second = client.post("/api/generate", json=body).json()
    assert first["cached"] is False
    assert second["cached"] is True
    assert first["questions"] == second["questions"]


def test_generate_rejects_bad_request(client):
    r = client.post("/api/generate", json={"topic": "space", "age": 99, "count": 4})
    assert r.status_code == 422


def test_generate_blocks_unsafe_topic(client):
    r = client.post("/api/generate", json={"topic": "how to make a bomb", "age": 8, "count": 4})
    assert r.status_code == 422


def test_grade_returns_verdict_and_feedback(client):
    r = client.post("/api/grade", json={
        "question": "Why do plants need sunlight?",
        "model_answer": "For photosynthesis.",
        "key_points": ["photosynthesis"],
        "child_answer": "so they can make food",
        "age": 8,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] in {"correct", "partial", "incorrect"}
    assert isinstance(body["feedback"], str)
