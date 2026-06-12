"""Transactional-email abstraction.

The endpoint code calls ``send_password_reset_email(...)`` and doesn't know
or care which provider runs the SMTP/HTTP call. Today the only backend wired
up is Resend; swapping to SendGrid/SES later means editing this file alone.

When ``EMAIL_PROVIDER`` (or ``EMAIL_API_KEY``) is unset, the helper falls
back to logging the email contents to stdout. This is the dev workflow:
trigger a password reset, copy the URL from the backend log, paste into the
browser. No external service required to iterate locally.
"""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def email_is_configured() -> bool:
    return bool(
        settings.email_provider
        and settings.email_api_key
        and settings.email_from
    )


def send_password_reset_email(
    *,
    to_email: str,
    full_name: str,
    reset_url: str,
) -> None:
    """Send the "click here to set a new password" email.

    Best-effort: failures are logged but never raised — we do NOT want the
    request endpoint to reveal "email send failed" to the caller, because
    that's a backchannel for user enumeration. The user just sees the
    standard "if an account exists, you'll get an email" message and the
    operator sees the error in the logs.
    """
    subject = "Reset your password"
    text_body = (
        f"Hi {full_name},\n\n"
        f"We received a request to reset the password on your account. "
        f"Click the link below to choose a new one. The link expires in "
        f"{settings.password_reset_token_ttl_minutes} minutes.\n\n"
        f"{reset_url}\n\n"
        f"If you didn't request this, you can safely ignore this email — "
        f"your password won't change.\n"
    )
    html_body = (
        f"<p>Hi {full_name},</p>"
        f"<p>We received a request to reset the password on your account. "
        f"Click the link below to choose a new one. The link expires in "
        f"{settings.password_reset_token_ttl_minutes} minutes.</p>"
        f'<p><a href="{reset_url}">Reset password</a></p>'
        f"<p>If you didn't request this, you can safely ignore this email — "
        f"your password won't change.</p>"
    )

    if not email_is_configured():
        logger.info(
            "[email:console-fallback] password reset → %s | url=%s",
            to_email,
            reset_url,
        )
        return

    provider = settings.email_provider.strip().lower()
    if provider == "resend":
        _send_via_resend(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )
        return

    # Unknown provider — log and fall through to console.
    logger.warning(
        "Unknown EMAIL_PROVIDER %r; falling back to console log.", provider
    )
    logger.info(
        "[email:console-fallback] password reset → %s | url=%s",
        to_email,
        reset_url,
    )


def _send_via_resend(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
) -> None:
    """Send through Resend's HTTP API.

    Import is local so the ``resend`` package is only required when this
    provider is actually configured — the rest of the app still works (with
    the console fallback) on installs that don't pull it in.
    """
    try:
        import resend  # type: ignore[import-not-found]
    except ImportError:
        logger.error(
            "EMAIL_PROVIDER=resend but the `resend` package is not installed. "
            "Add it to requirements.txt or fall back to the console logger by "
            "clearing EMAIL_PROVIDER.",
        )
        return

    resend.api_key = settings.email_api_key
    try:
        resend.Emails.send(
            {
                "from": settings.email_from,
                "to": [to_email],
                "subject": subject,
                "text": text_body,
                "html": html_body,
            }
        )
    except Exception as exc:  # noqa: BLE001 — never let email surface to caller
        logger.exception("Resend send failed for %s: %s", to_email, exc)
