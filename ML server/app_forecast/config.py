import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("FORECAST_APP_NAME", "HRSP Forecast Microservice")
    app_version: str = os.getenv("APP_VERSION", "1.0.0")

    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    minio_secure: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"
    minio_results_bucket: str = os.getenv(
        "MINIO_FORECAST_BUCKET",
        os.getenv("MINIO_RESULTS_BUCKET", "ml-forecast"),
    )

    callback_timeout_seconds: int = int(os.getenv("CALLBACK_TIMEOUT_SECONDS", "10"))
    callback_max_retries: int = int(os.getenv("CALLBACK_MAX_RETRIES", "3"))

    test_days: int = int(os.getenv("TEST_DAYS", "7"))

    # Folder containing static CSV dependencies required by existing ML pipeline.
    base_data_dir: str = os.getenv("BASE_DATA_DIR", ".")


settings = Settings()
