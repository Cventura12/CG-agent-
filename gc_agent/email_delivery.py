"""SMTP-based email delivery helpers for outbound quote messages."""

from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from email.utils import formataddr, make_msgid


def _bool_env(name: str, default: bool) -> bool:
    """Parse a boolean environment variable with a sane default."""
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _smtp_settings() -> dict[str, object]:
    """Load and validate SMTP configuration from environment variables."""
    host = os.getenv("SMTP_HOST", "").strip()
    if not host:
        raise RuntimeError("SMTP_HOST is required for email delivery")

    try:
        port = int(os.getenv("SMTP_PORT", "").strip() or "587")
    except ValueError as exc:
        raise RuntimeError("SMTP_PORT must be a valid integer") from exc

    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    if bool(username) ^ bool(password):
        raise RuntimeError("SMTP_USERNAME and SMTP_PASSWORD must be set together")

    from_email = os.getenv("SMTP_FROM_EMAIL", "").strip() or username
    if not from_email:
        raise RuntimeError("SMTP_FROM_EMAIL or SMTP_USERNAME is required for email delivery")

    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "from_email": from_email,
        "from_name": os.getenv("SMTP_FROM_NAME", "").strip() or "GC Agent",
        "use_ssl": _bool_env("SMTP_USE_SSL", False),
        "use_starttls": _bool_env("SMTP_USE_STARTTLS", True),
    }


def send_email_message(
    to_email: str,
    subject: str,
    body: str,
    *,
    pdf_bytes: bytes | None = None,
    pdf_filename: str = "gc-agent-quote.pdf",
) -> str:
    """Send one email and return the outbound Message-ID."""
    destination = to_email.strip()
    if "@" not in destination:
        raise RuntimeError("A valid destination email address is required")

    settings = _smtp_settings()
    message = EmailMessage()
    message["To"] = destination
    message["From"] = formataddr((str(settings["from_name"]), str(settings["from_email"])))
    message["Subject"] = subject.strip() or "Your quote from GC Agent"
    domain = str(settings["from_email"]).split("@", 1)[1] if "@" in str(settings["from_email"]) else None
    message_id = make_msgid(domain=domain)
    message["Message-ID"] = message_id
    message.set_content(body.strip() or "Your quote is attached.")

    if pdf_bytes:
        message.add_attachment(
            pdf_bytes,
            maintype="application",
            subtype="pdf",
            filename=pdf_filename,
        )

    if bool(settings["use_ssl"]):
        with smtplib.SMTP_SSL(str(settings["host"]), int(settings["port"]), timeout=30) as smtp:
            if settings["username"]:
                smtp.login(str(settings["username"]), str(settings["password"]))
            smtp.send_message(message)
        return message_id

    with smtplib.SMTP(str(settings["host"]), int(settings["port"]), timeout=30) as smtp:
        smtp.ehlo()
        if bool(settings["use_starttls"]):
            smtp.starttls()
            smtp.ehlo()
        if settings["username"]:
            smtp.login(str(settings["username"]), str(settings["password"]))
        smtp.send_message(message)
    return message_id


__all__ = ["send_email_message"]
