import logging
import os
import time
import urllib.error

from dotenv import load_dotenv

from services.v1.automation.internal_api_client import InternalApiUnavailableError, post_internal_json

load_dotenv(override=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def main() -> None:
    sleep_seconds = max(10, int(os.getenv("OMNI_AUTOMATION_SCHEDULER_INTERVAL_SECONDS", "60")))
    logger.info("Omni automation scheduler started")

    while True:
        try:
            result = post_internal_json("/api/omni/automation/scheduler")
            logger.info("Omni automation scheduler cycle completed: %s", result)
        except urllib.error.HTTPError as error:
            logger.error("Omni automation scheduler HTTP %s: %s", error.code, error.read().decode("utf-8"))
        except InternalApiUnavailableError as error:
            logger.warning("Omni automation scheduler waiting for internal API: %s", error)
        except Exception:
            logger.exception("Omni automation scheduler cycle failed")
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    main()
