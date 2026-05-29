from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Gym AI Assistant API"
    environment: str = "development"
    database_url: str = "sqlite:///./gym.db"
    database_schema: str | None = None
    frontend_origin: str = "http://192.168.100.5:5173"
    frontend_origins: str | None = None
    ai_provider: str = "anthropic"
    ai_api_key: str = ""
    ai_model: str = "claude-haiku-4-5"
    ai_language: str = "es"
    jwt_secret_key: str = "change-this-secret-in-development"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Object storage (Cloudflare R2, S3, or any S3-compatible).
    # Leave the account/key empty to disable avatar uploads in dev.
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = ""
    r2_public_url: str = ""  # e.g. https://pub-<hash>.r2.dev or a custom domain
    r2_endpoint_url: str | None = None  # auto-derived from account_id when blank

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins(self) -> list[str]:
        """List of allowed CORS origins parsed from ``FRONTEND_ORIGIN(S)``.

        Accepts either a single value via ``FRONTEND_ORIGIN`` or a comma-
        separated list via ``FRONTEND_ORIGINS``. The latter wins if set.
        """
        raw_origins = self.frontend_origins or self.frontend_origin
        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a process-wide singleton of the parsed ``Settings`` (from `.env`)."""
    return Settings()


settings = get_settings()
