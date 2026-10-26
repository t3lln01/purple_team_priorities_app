import os
import threading
import time
import logging

bind = "0.0.0.0:" + os.environ.get("PORT", "19199")
workers = 2
threads = 4
timeout = 120
accesslog = "-"


def post_worker_init(worker):
    # Existing weekly automatic sync remains Python-only. All workers share a
    # PostgreSQL advisory lock in run_sync, so duplicate jobs cannot write.
    def scheduler():
        from purple.crowdstrike import credentials, run_sync
        from purple.store import sync_state
        from purple.scoring import to_ms
        from django.db import close_old_connections
        while True:
            time.sleep(60)
            try:
                close_old_connections()
                state = sync_state()
                if credentials() and time.time() * 1000 - to_ms(state.get("lastSync")) > 7 * 86400000:
                    run_sync()
            except Exception:
                logging.getLogger(__name__).warning("Scheduled sync unavailable; check Data Sources.")
            time.sleep(3540)
    threading.Thread(target=scheduler, daemon=True).start()
