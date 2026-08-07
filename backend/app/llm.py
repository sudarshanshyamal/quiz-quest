"""Anthropic client wrapper.

Uses native structured outputs (`messages.parse` + a Pydantic model) so the
model's response is guaranteed to match our schema via constrained decoding.
Falls back to plain `messages.create` + JSON extraction if the installed SDK
predates `parse()`, so the service still runs on older versions.

The official SDK calls are synchronous; we run them in a threadpool to avoid
blocking FastAPI's event loop.
"""
import logging

from anthropic import Anthropic
from fastapi.concurrency import run_in_threadpool
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .config import Settings
from .prompts import (
    GEN_SYSTEM,
    GRADE_SYSTEM,
    build_generation_prompt,
    build_grading_prompt,
    topic_moderation_prompt,
)
from .schemas import (
    GeneratedQuiz,
    GenerateRequest,
    GradeRequest,
    GradeResponse,
    Verdict,
)
from .validation import extract_json

log = logging.getLogger("quizquest.llm")

# Anthropic exceptions we consider transient and worth retrying.
try:
    from anthropic import APIConnectionError, APIStatusError, RateLimitError
    _TRANSIENT = (APIConnectionError, APIStatusError, RateLimitError)
except Exception:  # pragma: no cover - defensive
    _TRANSIENT = (Exception,)


class LLMError(RuntimeError):
    pass


def _retry():
    return retry(
        retry=retry_if_exception_type(_TRANSIENT),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.6, max=6),
        reraise=True,
    )


class LLMClient:
    def __init__(self, settings: Settings):
        if not settings.anthropic_api_key:
            raise LLMError("ANTHROPIC_API_KEY is not set.")
        self._client = Anthropic(api_key=settings.anthropic_api_key)
        self._settings = settings

    # ---- generation ----

    async def generate_quiz(self, req: GenerateRequest) -> GeneratedQuiz:
        prompt = build_generation_prompt(req)

        @_retry()
        def _call() -> GeneratedQuiz:
            parse = getattr(self._client.messages, "parse", None)
            if parse is not None:
                resp = parse(
                    model=self._settings.gen_model,
                    max_tokens=2048,
                    temperature=0.7,
                    system=GEN_SYSTEM,
                    messages=[{"role": "user", "content": prompt}],
                    output_format=GeneratedQuiz,
                )
                parsed = getattr(resp, "parsed_output", None)
                if parsed is not None:
                    return parsed
            # Fallback: constrain via prompt, then extract + validate.
            resp = self._client.messages.create(
                model=self._settings.gen_model,
                max_tokens=2048,
                temperature=0.7,
                system=GEN_SYSTEM + " Return ONLY valid JSON: {\"questions\":[...]}.",
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
            data = extract_json(text)
            if not data:
                raise LLMError("Model did not return parseable quiz JSON.")
            return GeneratedQuiz.model_validate(data)

        return await run_in_threadpool(_call)

    # ---- grading ----

    async def grade_answer(self, req: GradeRequest) -> GradeResponse:
        prompt = build_grading_prompt(req)

        @_retry()
        def _call() -> GradeResponse:
            parse = getattr(self._client.messages, "parse", None)
            if parse is not None:
                resp = parse(
                    model=self._settings.grade_model,
                    max_tokens=300,
                    temperature=0.2,
                    system=GRADE_SYSTEM,
                    messages=[{"role": "user", "content": prompt}],
                    output_format=GradeResponse,
                )
                parsed = getattr(resp, "parsed_output", None)
                if parsed is not None:
                    return parsed
            resp = self._client.messages.create(
                model=self._settings.grade_model,
                max_tokens=300,
                temperature=0.2,
                system=GRADE_SYSTEM + ' Return ONLY JSON: {"verdict":"...","feedback":"..."}.',
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
            data = extract_json(text) or {}
            verdict = data.get("verdict")
            if verdict not in (v.value for v in Verdict):
                verdict = Verdict.partial.value
            return GradeResponse(verdict=verdict, feedback=data.get("feedback", ""))

        try:
            return await run_in_threadpool(_call)
        except Exception as e:  # grading should never hard-fail the UX
            log.warning("grading failed, defaulting to partial: %s", e)
            return GradeResponse(
                verdict=Verdict.partial,
                feedback="I couldn't fully check that one, so here's half a point. Great effort!",
            )

    # ---- optional topic moderation ----

    async def topic_is_safe(self, topic: str) -> bool:
        def _call() -> bool:
            resp = self._client.messages.create(
                model=self._settings.grade_model,
                max_tokens=8,
                temperature=0,
                messages=[{"role": "user", "content": topic_moderation_prompt(topic)}],
            )
            text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
            return "unsafe" not in text.strip().lower()

        try:
            return await run_in_threadpool(_call)
        except Exception as e:  # fail open to keyword filter, which already ran
            log.warning("LLM topic moderation failed, allowing: %s", e)
            return True
