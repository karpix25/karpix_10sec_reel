"""Retired producer: existing final_video_jobs are drained by the legacy workers."""

import logging
import time

logger = logging.getLogger(__name__)


def run_scheduler_cycle() -> int:
    """All new generation jobs now belong to omni_automation_jobs."""
    return 0


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    logger.info("Legacy scheduling is retired; new jobs use Omni automation.")
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()
