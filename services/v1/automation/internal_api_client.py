import json
import os
import socket
import urllib.error
import urllib.request
from typing import Any, Dict, Optional


DEFAULT_INTERNAL_API_BASE_URL = "http://web:3000"


class InternalApiUnavailableError(RuntimeError):
    pass


def _base_url() -> str:
    return os.getenv("INTERNAL_API_BASE_URL", DEFAULT_INTERNAL_API_BASE_URL).rstrip("/")


def _headers() -> Dict[str, str]:
    headers = {"content-type": "application/json"}
    token = (os.getenv("AUTOMATION_INTERNAL_TOKEN") or "").strip()
    if token:
        headers["x-automation-token"] = token
    return headers


def _timeout_seconds(env_name: str, default_seconds: int, minimum_seconds: int) -> int:
    return max(minimum_seconds, int(os.getenv(env_name, str(default_seconds))))


def post_internal_json(
    path: str,
    body: Optional[Dict[str, Any]] = None,
    *,
    timeout_env: str = "OMNI_AUTOMATION_HTTP_TIMEOUT_SECONDS",
    default_timeout_seconds: int = 300,
    minimum_timeout_seconds: int = 30,
) -> Dict[str, Any]:
    request = urllib.request.Request(
        f"{_base_url()}{path}",
        data=json.dumps(body or {}).encode("utf-8"),
        headers=_headers(),
        method="POST",
    )
    timeout = _timeout_seconds(timeout_env, default_timeout_seconds, minimum_timeout_seconds)

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload or "{}")
    except urllib.error.HTTPError:
        raise
    except (TimeoutError, socket.timeout, urllib.error.URLError) as error:
        reason = getattr(error, "reason", error)
        raise InternalApiUnavailableError(f"Internal API is unavailable at {_base_url()}: {reason}") from error
