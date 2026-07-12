import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

DEFAULT_BASE_URL = "https://api.cometapi.com"
DEFAULT_MODEL = "omni-fast"
DEFAULT_SECONDS = "4"
DEFAULT_ASPECT_RATIO = "9:16"
DEFAULT_RESOLUTION = "720p"
TERMINAL_STATUSES = {"completed", "failed", "error"}
VALID_ASPECT_RATIOS = {"16:9", "9:16", "1:1"}
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504, 524}


class CometApiError(RuntimeError):
    def __init__(self, message: str, status_code: Optional[int] = None, error: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.status_code = status_code
        self.error = error or {}


def _api_key() -> str:
    key = os.getenv("COMETAPI_KEY") or ""
    if not key:
        raise RuntimeError("COMETAPI_KEY is not configured")
    return key


def _base_url() -> str:
    return (os.getenv("COMETAPI_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")


def _headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {_api_key()}"}


def _retry_attempts() -> int:
    return max(1, int(os.getenv("COMETAPI_RETRY_ATTEMPTS", "3")))


def _retry_delay_seconds() -> float:
    return max(0.1, float(os.getenv("COMETAPI_RETRY_DELAY_SECONDS", "1.5")))


def _parse_error_response(response: requests.Response) -> Dict[str, Any]:
    try:
        data = response.json()
    except ValueError:
        data = {"message": response.text}

    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict):
            data = error
    else:
        data = {"message": str(data)}

    request_id = response.headers.get("x-request-id") or response.headers.get("cf-ray")
    if request_id:
        data = {**data, "request_id": request_id}
    return data


def _is_invalid_request_error(error: Dict[str, Any]) -> bool:
    code = str(error.get("code") or "").lower()
    error_type = str(error.get("type") or "").lower()
    return code == "invalid_request" or error_type == "invalid_request_error"


def _raise_response_error(response: requests.Response, action: str) -> None:
    error = _parse_error_response(response)
    message = error.get("message") or response.text or "unknown error"
    raise CometApiError(
        f"CometAPI Omni {action} failed: {response.status_code} - {message}",
        status_code=response.status_code,
        error=error,
    )


def _request_with_retries(method: str, path: str, *, action: str, **kwargs: Any) -> requests.Response:
    last_error: Optional[BaseException] = None
    attempts = _retry_attempts()

    for attempt in range(1, attempts + 1):
        try:
            response = requests.request(method, f"{_base_url()}{path}", headers=_headers(), **kwargs)
            if response.status_code not in RETRYABLE_STATUS_CODES:
                return response

            parsed_error = _parse_error_response(response)
            if _is_invalid_request_error(parsed_error):
                return response

            last_error = CometApiError(
                f"CometAPI Omni {action} retryable status: {response.status_code}",
                status_code=response.status_code,
                error=parsed_error,
            )
            retry_after = response.headers.get("Retry-After")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else _retry_delay_seconds() * attempt
        except requests.RequestException as error:
            last_error = error
            delay = _retry_delay_seconds() * attempt

        if attempt < attempts:
            time.sleep(delay)

    if isinstance(last_error, CometApiError):
        raise last_error
    raise CometApiError(f"CometAPI Omni {action} failed after {attempts} attempts: {last_error}")


def _validate_create_controls(prompt: str, aspect_ratio: str, resolution: str) -> None:
    if not prompt.strip():
        raise ValueError("Omni prompt is required")
    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise ValueError(f"Unsupported Omni aspect_ratio={aspect_ratio!r}")
    if not str(resolution).strip():
        raise ValueError("Omni resolution is required")


def _normalize_task(data: Dict[str, Any]) -> Dict[str, Any]:
    task_id = data.get("id") or data.get("task_id")
    if not task_id:
        raise CometApiError(f"No Omni task id returned from CometAPI: {data}", error=data)

    return {
        "task_id": task_id,
        "id": task_id,
        "object": data.get("object"),
        "model": data.get("model"),
        "status": data.get("status"),
        "progress": data.get("progress"),
        "created_at": data.get("created_at"),
        "completed_at": data.get("completed_at"),
        "video_url": data.get("video_url"),
        "error": data.get("error"),
        "raw": data,
    }


def create_video_task(
    prompt: str,
    character_id: Optional[str] = None,
    audio_id: Optional[str] = None,
    seed: Optional[int] = None,
    reference_image_url: Optional[str] = None,
    product_image_url: Optional[str] = None,
    seconds: str = DEFAULT_SECONDS,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
    resolution: str = DEFAULT_RESOLUTION,
) -> Dict[str, Any]:
    """
    Creates a beta Omni text-to-video task through CometAPI.

    CometAPI Omni currently accepts text-to-video controls as multipart form
    fields. Legacy KIE-specific arguments are kept in the signature so older
    orchestration code can call this function without branching.
    """
    _validate_create_controls(prompt, aspect_ratio, resolution)
    _ = (character_id, audio_id, seed, reference_image_url, product_image_url)
    fields = [
        ("model", (None, DEFAULT_MODEL)),
        ("prompt", (None, prompt)),
        ("seconds", (None, str(seconds))),
        ("aspect_ratio", (None, aspect_ratio)),
        ("resolution", (None, resolution)),
    ]

    response = _request_with_retries(
        "POST",
        "/v1/videos",
        action="create",
        files=fields,
        timeout=120,
    )
    if response.status_code != 200:
        _raise_response_error(response, "create")

    return _normalize_task(response.json())


def retrieve_video_task(task_id: str) -> Dict[str, Any]:
    response = _request_with_retries(
        "GET",
        f"/v1/videos/{task_id}",
        action="retrieve",
        timeout=60,
    )
    if response.status_code != 200:
        _raise_response_error(response, "retrieve")
    return _normalize_task(response.json())


def poll_task_status(task_id: str, timeout: int = 300, interval: int = 10) -> Dict[str, Any]:
    start_time = time.time()
    while time.time() - start_time < timeout:
        task = retrieve_video_task(task_id)
        status = str(task.get("status") or "").lower()

        if status in TERMINAL_STATUSES:
            if status != "completed":
                raise RuntimeError(f"CometAPI Omni generation failed: {task.get('raw')}")
            return task

        time.sleep(interval)

    raise TimeoutError(f"Timed out waiting for CometAPI Omni task {task_id}")


def download_video(task_id_or_url: str, output_path: str) -> None:
    if task_id_or_url.startswith("http://") or task_id_or_url.startswith("https://"):
        response = requests.get(task_id_or_url, timeout=300)
    else:
        response = _request_with_retries(
            "GET",
            f"/v1/videos/{task_id_or_url}/content",
            action="download",
            timeout=300,
        )

    if response.status_code != 200:
        _raise_response_error(response, "download")

    content_type = response.headers.get("content-type") or ""
    if "video/mp4" not in content_type.lower():
        raise CometApiError(f"CometAPI Omni download returned non-MP4 content-type: {content_type}")

    Path(output_path).write_bytes(response.content)


def upload_image(image_path: str) -> str:
    raise NotImplementedError("CometAPI Omni text-to-video endpoint does not support image upload inputs yet")
