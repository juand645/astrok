from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Gym AI Assistant API"
    environment: str = "development"
    database_url: str = "sqlite:///./gym.db"
    database_schema: str | None = None
    frontend_origin: str = "http://192.168.100.5:5173"
    frontend_origins: str | None = None
    ai_provider: str = "mock"
    ai_api_key: str = ""
    jwt_secret_key: str = "change-this-secret-in-development"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins(self) -> list[str]:
        raw_origins = self.frontend_origins or self.frontend_origin
        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
