"""Application configuration, loaded from environment / .env."""
from functools import lru_cache
from typing import Annotated, List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")

    #gen_model: str = Field(default="claude-sonnet-4-6", alias="GEN_MODEL")
    gen_model: str = Field(default="claude-haiku-4-5", alias="GEN_MODEL")
    grade_model: str = Field(default="claude-haiku-4-5", alias="GRADE_MODEL")

    cors_origins: Annotated[List[str], NoDecode] = Field(default=["*"], alias="CORS_ORIGINS")

    cache_ttl_seconds: int = Field(default=3600, alias="CACHE_TTL_SECONDS")
    cache_max_entries: int = Field(default=500, alias="CACHE_MAX_ENTRIES")

    rate_window_seconds: int = Field(default=60, alias="RATE_WINDOW_SECONDS")
    generate_rate_limit: int = Field(default=30, alias="GENERATE_RATE_LIMIT")
    grade_rate_limit: int = Field(default=60, alias="GRADE_RATE_LIMIT")

    llm_topic_moderation: bool = Field(default=False, alias="LLM_TOPIC_MODERATION")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
