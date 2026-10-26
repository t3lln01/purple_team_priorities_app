"""Portable launcher: resolve all Gunicorn paths before it changes directory."""
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
os.execv(sys.executable, [sys.executable, "-m", "gunicorn", "--chdir", str(root),
                         "-c", str(root / "gunicorn.conf.py"), "config.wsgi:application"])
