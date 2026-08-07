"""Fixed-window per-IP rate limiting.

In-memory and per-process — fine for a single instance or local dev. For
multi-instance production, move this to Redis (or enforce at the gateway/nginx).
"""
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    def _client_id(self, request: Request) -> str:
        # Honor a proxy header if present, else fall back to the socket peer.
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def __call__(self, request: Request) -> None:
        now = time.monotonic()
        cid = self._client_id(request)
        recent = [t for t in self._hits[cid] if now - t < self.window]
        if len(recent) >= self.limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Slow down a moment and try again.",
            )
        recent.append(now)
        self._hits[cid] = recent
