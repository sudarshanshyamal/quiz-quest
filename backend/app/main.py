"""QuizQuest API — a safe LLM proxy for the kids' quiz frontend.

Endpoints:
  GET  /health         liveness
  POST /api/generate   topic -> validated, moderated, cached quiz
  POST /api/grade      open-ended answer -> verdict + feedback
"""
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .cache import TTLCache, make_key
from .config import get_settings
from .llm import LLMClient, LLMError
from .moderation import check_topic, scrub_quiz
from .rate_limit import RateLimiter
from .schemas import (
    ErrorResponse,
    GenerateRequest,
    GradeRequest,
    GradeResponse,
    QuizResponse,
)
from .validation import sanitize

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("quizquest")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm = LLMClient(settings)
    app.state.cache = TTLCache(settings.cache_ttl_seconds, settings.cache_max_entries)
    log.info("QuizQuest API ready (gen=%s grade=%s)", settings.gen_model, settings.grade_model)
    yield


app = FastAPI(title="QuizQuest API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

generate_limiter = RateLimiter(settings.generate_rate_limit, settings.rate_window_seconds)
grade_limiter = RateLimiter(settings.grade_rate_limit, settings.rate_window_seconds)


@app.exception_handler(LLMError)
async def llm_error_handler(_request, exc: LLMError):
    log.error("LLM error: %s", exc)
    return JSONResponse(
        status_code=502,
        content=ErrorResponse(error="upstream_failure", detail=str(exc)).model_dump(),
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/generate", response_model=QuizResponse)
async def generate(req: GenerateRequest, _rl=Depends(generate_limiter)) -> QuizResponse:
    allowed, reason = check_topic(req.topic)
    if not allowed:
        raise HTTPException(status_code=422, detail=reason)

    if settings.llm_topic_moderation and not await app.state.llm.topic_is_safe(req.topic):
        raise HTTPException(status_code=422, detail="That topic isn't suitable for kids.")

    key = make_key("gen", req.topic.lower(), req.age, req.count,
                   sorted(t.value for t in req.types), req.seed)
    cached = await app.state.cache.get(key)
    if cached is not None:
        return QuizResponse(**{**cached, "cached": True})

    quiz = await app.state.llm.generate_quiz(req)
    quiz = scrub_quiz(quiz)
    questions = sanitize(quiz)
    if not questions:
        raise HTTPException(
            status_code=502,
            detail="Couldn't build good questions for that topic. Try rephrasing it.",
        )

    payload = QuizResponse(topic=req.topic, age=req.age, questions=questions, cached=False)
    await app.state.cache.set(key, payload.model_dump())
    return payload


@app.post("/api/grade", response_model=GradeResponse)
async def grade(req: GradeRequest, _rl=Depends(grade_limiter)) -> GradeResponse:
    return await app.state.llm.grade_answer(req)
