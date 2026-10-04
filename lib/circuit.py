"""Per-provider circuit breakers so a dead Twilio/Mailgun/Paystack fails fast."""

from __future__ import annotations

import logging
import threading
import time
from typing import Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

FAILURE_THRESHOLD = 5
RESET_AFTER_SEC = 30.0


class CircuitOpenError(RuntimeError):
    """Raised without calling the provider while its breaker is open."""

    def __init__(self, name: str, retry_in: float):
        super().__init__(f"{name} is temporarily unavailable; retry in {max(1, int(retry_in))}s")
        self.provider = name
        self.retry_in = retry_in


class ProviderServerError(RuntimeError):
    """A provider answered with 5xx; counts against its breaker."""


def is_http_provider_failure(exc: BaseException) -> bool:
    import httpx

    return isinstance(exc, (httpx.TransportError, ProviderServerError))


class CircuitBreaker:
    """Closed -> open after N consecutive provider failures -> one trial call after a pause.

    Only failures the caller classifies as provider-side (network, timeout, 5xx) count.
    """

    def __init__(
        self,
        name: str,
        *,
        failure_threshold: int = FAILURE_THRESHOLD,
        reset_after: float = RESET_AFTER_SEC,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_after = reset_after
        self._clock = clock
        self._lock = threading.Lock()
        self._failures = 0
        self._opened_at: float | None = None
        self._trial_in_flight = False

    @property
    def state(self) -> str:
        with self._lock:
            return self._state_locked()

    def _state_locked(self) -> str:
        if self._opened_at is None:
            return "closed"
        if self._clock() - self._opened_at >= self.reset_after:
            return "half_open"
        return "open"

    def before_call(self) -> None:
        with self._lock:
            state = self._state_locked()
            if state == "closed":
                return
            if state == "half_open" and not self._trial_in_flight:
                self._trial_in_flight = True
                return
            retry_in = self.reset_after - (self._clock() - (self._opened_at or 0.0))
            raise CircuitOpenError(self.name, retry_in if state == "open" else 1.0)

    def record_success(self) -> None:
        with self._lock:
            if self._opened_at is not None:
                logger.info("Circuit %s closed", self.name)
            self._failures = 0
            self._opened_at = None
            self._trial_in_flight = False

    def record_failure(self) -> None:
        with self._lock:
            self._failures += 1
            reopen = self._trial_in_flight
            self._trial_in_flight = False
            if reopen or self._failures >= self.failure_threshold:
                if self._opened_at is None or reopen:
                    logger.warning(
                        "Circuit %s open after %s failures", self.name, self._failures
                    )
                self._opened_at = self._clock()

    def call(self, fn: Callable[[], T], *, is_failure: Callable[[BaseException], bool]) -> T:
        self.before_call()
        try:
            result = fn()
        except BaseException as exc:
            if is_failure(exc):
                self.record_failure()
            else:
                # The provider answered (4xx etc.), so it is reachable.
                self.record_success()
            raise
        self.record_success()
        return result


twilio_breaker = CircuitBreaker("Twilio")
mailgun_breaker = CircuitBreaker("Mailgun")
paystack_breaker = CircuitBreaker("Paystack")
