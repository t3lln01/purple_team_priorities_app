#!/bin/bash
set -e
pnpm install --frozen-lockfile
uv sync --frozen
# Post-merge runs in development only. Never push the legacy Drizzle schema:
# it does not describe the new Django tables.
if [ "${DJANGO_ENV:-}" != "production" ] && [ "${NODE_ENV:-}" != "production" ]; then
  uv run python artifacts/purple-team-dashboard/django/manage.py migrate --noinput
fi
uv run python artifacts/purple-team-dashboard/django/manage.py collectstatic --noinput
