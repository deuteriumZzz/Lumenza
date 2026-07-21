import logging
import time
import uuid
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from core.logging import bind_request_id, reset_request_id

logger = logging.getLogger("lumenza.request")


def _request_id() -> str:
    return str(uuid.uuid4())


def _user_id(request: HttpRequest) -> int | None:
    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False):
        return getattr(user, "pk", None)
    return None


def _safe_path(request: HttpRequest) -> str:
    resolver_match = getattr(request, "resolver_match", None)
    route = getattr(resolver_match, "route", None)
    if route is None:
        return "<unresolved>"
    return f"/{route}" if route else "/"


class RequestLoggingMiddleware:
    def __init__(
        self, get_response: Callable[[HttpRequest], HttpResponse]
    ) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request_id = _request_id()
        token = bind_request_id(request_id)
        started_at = time.perf_counter()
        context = {
            "request_id": request_id,
            "method": request.method,
        }
        try:
            response = self.get_response(request)
        except Exception as exc:
            logger.error(
                "http.request_failed",
                extra={
                    **context,
                    "path": _safe_path(request),
                    "duration_ms": round(
                        (time.perf_counter() - started_at) * 1000, 3
                    ),
                    "user_id": _user_id(request),
                    "error_type": type(exc).__name__,
                },
            )
            raise
        else:
            response["X-Request-ID"] = request_id
            status_code = response.status_code
            log = (
                logger.error
                if status_code >= 500
                else logger.warning if status_code >= 400 else logger.info
            )
            log(
                "http.request_completed",
                extra={
                    **context,
                    "path": _safe_path(request),
                    "status_code": status_code,
                    "duration_ms": round(
                        (time.perf_counter() - started_at) * 1000, 3
                    ),
                    "user_id": _user_id(request),
                },
            )
            return response
        finally:
            reset_request_id(token)
