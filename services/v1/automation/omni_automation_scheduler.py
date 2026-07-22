import json
import logging
import os
import time
import urllib.error
import urllib.request

from dotenv import load_dotenv

load_dotenv(override=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def _post_internal(path: str) -> dict:
    base_url = os.getenv("INTERNAL_API_BASE_URL", "http://web:3000").rstrip("/")
    token = (os.getenv("AUTOMATION_INTERNAL_TOKEN") or "").strip()
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=b"{}",
        headers={
            "content-type": "application/json",
            "x-automation-token": token,
        },
        method="POST",
    )
    timeout = max(30, int(os.getenv("OMNI_AUTOMATION_HTTP_TIMEOUT_SECONDS", "300")))
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read().decode("utf-8")
        return json.loads(payload or "{}")


def main() -> None:
    sleep_seconds = max(10, int(os.getenv("OMNI_AUTOMATION_SCHEDULER_INTERVAL_SECONDS", "60")))
    logger.info("Omni automation scheduler started")

    while True:
        try:
            result = _post_internal("/api/omni/automation/scheduler")
            logger.info("Omni automation scheduler cycle completed: %s", result)
        except urllib.error.HTTPError as error:
            logger.error("Omni automation scheduler HTTP %s: %s", error.code, error.read().decode("utf-8"))
        except Exception:
            logger.exception("Omni automation scheduler cycle failed")
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    main()
