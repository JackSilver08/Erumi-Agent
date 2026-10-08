from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="ERUMI_",
        extra="ignore",
    )

    app_env: str = Field(default="development", alias="APP_ENV")
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins_raw: str = Field(
        default="http://localhost:5173,http://localhost:8080",
        alias="ERUMI_CORS_ORIGINS",
    )
    database_url: str = "postgresql+asyncpg://erumi:erumi@localhost:5432/erumi"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "change-me-in-production"
    default_model: str = "erumi-auto"
    mock_model: bool = True

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins_raw.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
