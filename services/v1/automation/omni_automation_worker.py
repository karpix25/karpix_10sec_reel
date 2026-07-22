import json
import logging
import os
import socket
import time
import urllib.error
import urllib.request

from dotenv import load_dotenv

load_dotenv(override=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def _post_worker(worker_id: str) -> dict:
    base_url = os.getenv("INTERNAL_API_BASE_URL", "http://web:3000").rstrip("/")
    token = (os.getenv("AUTOMATION_INTERNAL_TOKEN") or "").strip()
    body = json.dumps({"workerId": worker_id}).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/api/omni/automation/worker",
        data=body,
        headers={
            "content-type": "application/json",
            "x-automation-token": token,
        },
        method="POST",
    )
    timeout = max(60, int(os.getenv("OMNI_AUTOMATION_HTTP_TIMEOUT_SECONDS", "1800")))
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read().decode("utf-8")
        return json.loads(payload or "{}")


def main() -> None:
    worker_id = os.getenv("OMNI_AUTOMATION_WORKER_ID") or f"omni-worker-{socket.gethostname()}"
    idle_seconds = max(1, int(os.getenv("OMNI_AUTOMATION_WORKER_IDLE_SECONDS", "10")))
    active_sleep_seconds = max(0, int(os.getenv("OMNI_AUTOMATION_WORKER_ACTIVE_SLEEP_SECONDS", "1")))
    logger.info("Omni automation worker started: %s", worker_id)

    while True:
        try:
            result = _post_worker(worker_id)
            logger.info("Omni automation worker result: %s", result)
            time.sleep(active_sleep_seconds if result.get("processed") else idle_seconds)
        except urllib.error.HTTPError as error:
            logger.error("Omni automation worker HTTP %s: %s", error.code, error.read().decode("utf-8"))
            time.sleep(idle_seconds)
        except Exception:
            logger.exception("Omni automation worker cycle failed")
            time.sleep(idle_seconds)


if __name__ == "__main__":
    main()
