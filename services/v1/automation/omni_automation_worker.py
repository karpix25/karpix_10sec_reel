import logging
import os
import socket
import time
import urllib.error

from dotenv import load_dotenv

from services.v1.automation.internal_api_client import InternalApiUnavailableError, post_internal_json

load_dotenv(override=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def _post_worker(worker_id: str) -> dict:
    return post_internal_json(
        "/api/omni/automation/worker",
        {"workerId": worker_id},
        default_timeout_seconds=1800,
        minimum_timeout_seconds=60,
    )


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
        except InternalApiUnavailableError as error:
            logger.warning("Omni automation worker waiting for internal API: %s", error)
            time.sleep(idle_seconds)
        except Exception:
            logger.exception("Omni automation worker cycle failed")
            time.sleep(idle_seconds)


if __name__ == "__main__":
    main()
