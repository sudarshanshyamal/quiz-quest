"""A tiny async-safe TTL cache.

Deliberately behind a small interface so it can be swapped for Redis/Memcached
in production without touching call sites. Keying is done by the caller via
`make_key`, which hashes the request so identical requests share a result.
"""
import asyncio
import hashlib
import json
import time
from typing import Any, Optional


def make_key(*parts: Any) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


class TTLCache:
    def __init__(self, ttl_seconds: int, max_entries: int):
        self._ttl = ttl_seconds
        self._max = max_entries
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Any]:
        if self._ttl <= 0:
            return None
        async with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            expires_at, value = item
            if time.monotonic() > expires_at:
                self._store.pop(key, None)
                return None
            return value

    async def set(self, key: str, value: Any) -> None:
        if self._ttl <= 0:
            return
        async with self._lock:
            # crude size cap: evict the oldest entry when full
            if len(self._store) >= self._max and key not in self._store:
                oldest = min(self._store, key=lambda k: self._store[k][0])
                self._store.pop(oldest, None)
            self._store[key] = (time.monotonic() + self._ttl, value)
