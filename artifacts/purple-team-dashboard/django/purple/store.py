import copy
import json
import re
from datetime import datetime, timezone
from functools import lru_cache

from django.conf import settings
from django.db import transaction
from django.utils import timezone as django_timezone
from .models import Document, ThreatSnapshot

DATA_DIR = settings.BASE_DIR.parent / "src"
LEGACY_API = settings.WORKSPACE / "artifacts" / "api-server"
EMPTY_STATE = {"customActors": [], "actorOverrides": {}, "ppTapList": [], "sirtList": [],
               "autoAssessments": {}, "monitoringState": {}}


@lru_cache(maxsize=4)
def baseline(name="data"):
    with (DATA_DIR / (name + ".json")).open() as file:
        return json.load(file)


def current_quarter():
    # Preserve the existing published-quarter selector (Jan shows prior Q4).
    now = datetime.now(timezone.utc)
    if now.month == 1:
        return f"Q4 {now.year - 1}"
    return f"Q{(now.month - 2) // 3 + 1} {now.year}"


def quarter_key(quarter):
    match = re.fullmatch(r"Q([1-4]) (\d{4})", quarter or "")
    if not match or not 2020 <= int(match[2]) <= 2100:
        raise ValueError("Choose a valid quarter, such as Q3 2026.")
    return int(match[2]) * 4 + int(match[1])


def quarter_choices():
    current = datetime.now(timezone.utc).year
    choices = {f"Q{q} {year}" for year in range(2025, current + 2) for q in range(1, 5)}
    choices.update(ThreatSnapshot.objects.values_list("quarter", flat=True))
    return sorted(choices, key=quarter_key, reverse=True)


def snapshot(quarter):
    quarter_key(quarter)
    existing = ThreatSnapshot.objects.filter(quarter=quarter).first()
    if existing:
        return existing
    previous = [s for s in ThreatSnapshot.objects.all() if quarter_key(s.quarter) < quarter_key(quarter)]
    previous.sort(key=lambda s: quarter_key(s.quarter), reverse=True)
    state = copy.deepcopy(previous[0].state if previous else EMPTY_STATE)
    state["autoAssessments"] = {}
    # Reading a nonexistent quarter produces a draft; it does not write history.
    return ThreatSnapshot(quarter=quarter, state=state, saved_at=None,
                          seeded_from=previous[0].quarter if previous else None,
                          updated_at=django_timezone.now())


def revision(entry):
    return entry.saved_at.isoformat() if entry.saved_at else ""


class ConflictError(ValueError):
    pass


def save_snapshot(quarter, state, expected=None):
    quarter_key(quarter)
    for key, default in EMPTY_STATE.items():
        if key not in state or not isinstance(state[key], type(default)):
            raise ValueError(f"Invalid quarter field: {key}")
    with transaction.atomic():
        # PostgreSQL advisory transaction lock also protects first saves.
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ["threat-model:" + quarter])
        current = ThreatSnapshot.objects.select_for_update().filter(quarter=quarter).first()
        if expected is not None and expected != (revision(current) if current else ""):
            raise ConflictError("This quarter changed in another session. Reload before saving; your changes were not applied.")
        now = django_timezone.now()
        return ThreatSnapshot.objects.update_or_create(
            quarter=quarter, defaults={"state": state, "saved_at": now, "updated_at": now,
                                       "seeded_from": current.seeded_from if current else snapshot(quarter).seeded_from},
        )[0]


def document(key, default=None):
    row = Document.objects.filter(key=key).first()
    return copy.deepcopy(row.value if row else ({} if default is None else default))


def put_document(key, value):
    Document.objects.update_or_create(key=key, defaults={"value": value})


def user_settings(user_id):
    return document("preferences:" + user_id) if user_id else {}


def versioned(preferences, key, default=None):
    version = preferences.get("pt_active_mitre_version") or "base"
    return preferences.get(key + ":" + version, preferences.get(key, {} if default is None else default))


def sync_state():
    row = Document.objects.filter(key="crowdstrike-sync").first()
    if row:
        return row.value
    path = LEGACY_API / "cs-sync-state.json"
    if path.exists():
        with path.open() as file:
            value = json.load(file)
        Document.objects.get_or_create(key="crowdstrike-sync", defaults={"value": value})
        return value
    return {"status": "never", "lastSync": None, "error": None, "actors": [], "reports": [],
            "meta": {"actorCount": 0, "reportCount": 0}}
