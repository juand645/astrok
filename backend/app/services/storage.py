"""Object-storage helpers backed by an S3-compatible service.

Configured for Cloudflare R2 by default but works against any S3 endpoint —
set the credentials in ``Settings`` and you get presigned uploads + public
URLs for free. Keep all R2/S3 specifics inside this module so endpoint code
stays vendor-agnostic.
"""

from __future__ import annotations

import hashlib
import io
from functools import lru_cache
from typing import BinaryIO

import boto3
from botocore.client import BaseClient, Config
from PIL import Image

from app.core.config import settings

AVATAR_SIZE = (256, 256)
AVATAR_FORMAT = "WEBP"
AVATAR_EXT = "webp"
AVATAR_MIME = "image/webp"
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB raw upload cap; the resized blob is ~10-20 KB


class StorageNotConfiguredError(RuntimeError):
    """Raised when an object-storage operation is attempted without R2 creds."""


class InvalidImageError(ValueError):
    """Raised when the uploaded bytes cannot be decoded as an image."""


def storage_is_configured() -> bool:
    """True when the bare-minimum R2 / S3 env vars are present."""
    return bool(
        settings.r2_bucket
        and settings.r2_access_key_id
        and settings.r2_secret_access_key
        and settings.r2_public_url
    )


@lru_cache(maxsize=1)
def get_s3_client() -> BaseClient:
    """Return a cached boto3 S3 client wired for the configured endpoint."""
    if not storage_is_configured():
        raise StorageNotConfiguredError(
            "Object storage is not configured. Set R2_* env vars to enable uploads.",
        )

    endpoint_url = settings.r2_endpoint_url
    if not endpoint_url:
        if not settings.r2_account_id:
            raise StorageNotConfiguredError(
                "Set R2_ACCOUNT_ID or R2_ENDPOINT_URL.",
            )
        endpoint_url = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4", region_name="auto"),
    )


def _resize_to_webp(source: BinaryIO) -> bytes:
    """Decode + center-crop to a square + resize to ``AVATAR_SIZE`` + encode WebP."""
    try:
        image = Image.open(source)
    except Exception as exc:  # noqa: BLE001
        raise InvalidImageError("Could not decode the uploaded file as an image.") from exc

    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")

    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    image = image.resize(AVATAR_SIZE, Image.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format=AVATAR_FORMAT, quality=85, method=6)
    return buffer.getvalue()


def upload_avatar(*, user_id: int, raw: bytes) -> str:
    """Resize + push the bytes to ``avatars/<user_id>.webp`` and return the public URL.

    Raises:
        StorageNotConfiguredError: When R2 settings are missing.
        InvalidImageError: When ``raw`` isn't a decodable image.
        ValueError: When ``raw`` exceeds ``MAX_UPLOAD_BYTES``.
    """
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"Upload exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
        )

    blob = _resize_to_webp(io.BytesIO(raw))
    content_hash = hashlib.sha256(blob).hexdigest()[:8]

    client = get_s3_client()
    key = f"avatars/{user_id}.{AVATAR_EXT}"
    client.put_object(
        Bucket=settings.r2_bucket,
        Key=key,
        Body=blob,
        ContentType=AVATAR_MIME,
        CacheControl="public, max-age=3600",
    )

    return f"{settings.r2_public_url.rstrip('/')}/{key}?v={content_hash}"


def delete_avatar(user_id: int) -> None:
    """Best-effort delete of the user's avatar object. Silent if not configured."""
    if not storage_is_configured():
        return
    client = get_s3_client()
    client.delete_object(
        Bucket=settings.r2_bucket,
        Key=f"avatars/{user_id}.{AVATAR_EXT}",
    )
