"""Render background worker entry point: `python -m scripts.worker`."""

from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

from lib.observability import configure_logging, init_sentry  # noqa: E402
from lib.worker import Worker  # noqa: E402


if __name__ == "__main__":
    configure_logging()
    init_sentry()
    Worker().run()
