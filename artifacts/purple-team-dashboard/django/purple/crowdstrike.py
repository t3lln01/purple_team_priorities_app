"""CrowdStrike integration with PostgreSQL state and encrypted credentials."""
import base64
import hashlib
import json
import os
import threading
import time
from datetime import datetime, timezone

import httpx
from cryptography.fernet import Fernet
from django.conf import settings
from django.core.cache import cache
from django.db import connection, close_old_connections
from .store import document, put_document, sync_state, LEGACY_API
from .scoring import to_ms

BASE_URL = "https://api.us-2.crowdstrike.com"


def cipher():
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest()))


def credentials():
    if os.environ.get("CS_CLIENT_ID") and os.environ.get("CS_CLIENT_SECRET"):
        return {"clientId": os.environ["CS_CLIENT_ID"], "clientSecret": os.environ["CS_CLIENT_SECRET"]}
    stored = document("crowdstrike-credentials")
    if stored.get("encrypted"):
        return json.loads(cipher().decrypt(stored["encrypted"].encode()))
    if stored.get("disconnected"):
        return {}
    path = LEGACY_API / "cs-credentials.json"
    if path.exists():
        with path.open() as file:
            value = json.load(file)
        if value.get("clientId") and value.get("clientSecret"):
            save_credentials(value)
            return value
    return {}


def save_credentials(value):
    put_document("crowdstrike-credentials", {"encrypted": cipher().encrypt(json.dumps(value).encode()).decode()})
    cache.delete("crowdstrike-token")


def disconnect():
    if os.environ.get("CS_CLIENT_ID"):
        raise ValueError("Credentials are configured in environment secrets. Remove them there before disconnecting.")
    put_document("crowdstrike-credentials", {"disconnected": True})
    cache.delete("crowdstrike-token")


def token():
    cached = cache.get("crowdstrike-token")
    if cached:
        return cached
    creds = credentials()
    if not creds:
        raise ValueError("Configure CrowdStrike credentials first.")
    response = httpx.post(BASE_URL + "/oauth2/token",
                          data={"client_id": creds["clientId"], "client_secret": creds["clientSecret"]}, timeout=30)
    if response.is_error:
        raise ValueError(f"CrowdStrike authentication failed ({response.status_code}). Check the integration credentials.")
    data = response.json()
    if not data.get("access_token"):
        raise ValueError("CrowdStrike did not return an access token.")
    cache.set("crowdstrike-token", data["access_token"], max(30, data.get("expires_in", 300) - 30))
    return data["access_token"]


def get(path, params=None):
    for attempt in range(3):
        response = httpx.get(BASE_URL + path, params=params,
                             headers={"Authorization": "Bearer " + token()}, timeout=60)
        if response.status_code == 401 and attempt == 0:
            cache.delete("crowdstrike-token")
            continue
        if response.status_code == 429 and attempt < 2:
            time.sleep(min(10, int(response.headers.get("Retry-After", "2"))))
            continue
        if response.is_error:
            raise ValueError(f"CrowdStrike request failed ({response.status_code}) at {path}.")
        return response.json()
    raise ValueError("CrowdStrike rate limit reached. Try again later.")


def ids(kind, since=None):
    offset, result, seen = 0, [], set()
    for _ in range(100):
        params = {"limit": 1000, "offset": offset}
        if since and kind == "reports":
            params["filter"] = f"created_date:>={int(to_ms(since) / 1000) - 172800}"
        data = get(f"/intel/queries/{kind}/v1", params)
        page = data.get("resources", [])
        new = [str(i) for i in page if str(i) not in seen]
        result += new
        seen.update(new)
        total = data.get("meta", {}).get("pagination", {}).get("total", 0)
        if not new or total and len(result) >= total:
            break
        next_offset = data.get("meta", {}).get("pagination", {}).get("offset")
        offset = next_offset if kind == "actors" and next_offset else len(result)
        if not total and len(page) < 1000:
            break
    return result


def entities(kind, identifiers):
    rows = []
    for start in range(0, len(identifiers), 100):
        data = get(f"/intel/entities/{kind}/v1", [("ids", i) for i in identifiers[start:start+100]])
        rows.extend(data.get("resources", []))
    return rows


def normalize_entries(raw):
    if isinstance(raw, list):
        return raw
    if isinstance(raw.get("resources"), list):
        return raw["resources"]
    return [{**tech, "tactic_name": tactic.get("name", tactic.get("tactic_name", "")),
             "technique_id": tech.get("technique_id", tech.get("id", "")),
             "technique_name": tech.get("technique_name", tech.get("name", ""))}
            for tactic in raw.get("tactics", []) for tech in tactic.get("techniques", [])]


def normalize_actor(raw):
    def names(*fields):
        result = []
        for field in fields:
            values = raw.get(field, [])
            for item in values if isinstance(values, list) else [values]:
                value = item if isinstance(item, str) else next((item.get(k) for k in ["country", "name", "value", "title"] if item.get(k)), "")
                if value and value not in result:
                    result.append(value)
        return result
    last = next((raw.get(k) for k in ["last_active", "last_active_date", "last_activity_date", "lastActivityDate"] if raw.get(k)), None)
    if isinstance(last, dict):
        last = next((last.get(k) for k in ["value", "date", "timestamp"] if last.get(k)), None)
    date = to_ms(last)
    cap = raw.get("capability", {}).get("name", "").lower()
    score = 5 if re_match("high|advanced", cap) else 3 if re_match("medium|moderate", cap) else 2 if re_match("low|limited", cap) else None
    aliases = raw.get("known_as", [])
    return {"name": raw.get("name", "").upper(), "origins": ", ".join(names("origins")),
            "aliases": aliases if isinstance(aliases, str) else ", ".join(aliases),
            "malware": ", ".join(names("malware_used", "malwareUsed", "tools_used", "toolsUsed", "malware_families", "malware_developed", "tools_developed")),
            "countries": names("target_countries"), "industries": names("target_industries"),
            "description": raw.get("short_description") or raw.get("description", ""),
            "lastSeen": datetime.fromtimestamp(date / 1000, timezone.utc).date().isoformat() if date else None,
            "intentFinalScore": None, "capabilityFinalScore": score, "actorType": raw.get("adversary_type", ""),
            "isCustom": True, "csEnriched": True, "csLastRefreshed": datetime.now(timezone.utc).isoformat(),
            "csRawData": raw, "inMonitoringList": False}


def re_match(pattern, text):
    import re
    return re.search(pattern, text)


def actor_search(query):
    if not query.strip() or len(query) > 200:
        raise ValueError("Enter an actor name of at most 200 characters.")
    return [normalize_actor(r) for r in get("/intel/combined/actors/v1", {"q": query, "limit": 5}).get("resources", [])]


def directory():
    cached = cache.get("crowdstrike-directory")
    if cached is None:
        cached = [normalize_actor(r) for r in entities("actors", ids("actors"))]
        cache.set("crowdstrike-directory", cached, 3600)
    return cached


def run_sync():
    close_old_connections()
    # Cross-process lock: the web and API workers share one sync at a time.
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(7853461)")
        if not cursor.fetchone()[0]:
            return
    state = sync_state()
    try:
        # A second worker may have waited behind a sync that just completed.
        if state.get("status") == "done" and time.time() * 1000 - to_ms(state.get("lastSync")) < 60_000:
            return
        state.update(status="running", syncStarted=datetime.now(timezone.utc).isoformat(), error=None)
        put_document("crowdstrike-sync", state)
        reports = entities("reports", ids("reports", state.get("lastSync")))
        resources = entities("actors", ids("actors"))
        actors = []
        for resource in resources:
            raw = get("/intel/entities/mitre-reports/v1", {"actor_id": resource["id"], "format": "JSON"})
            entries = normalize_entries(raw)
            if entries:
                name = resource.get("name", str(resource["id"])).upper()
                actors.append({"filename": name + ".json", "actor": name, "entries": entries})
            time.sleep(.2)
        merged = {str(r.get("slug") or r.get("id")): r for r in state.get("reports", []) + reports}
        state.update(status="done", lastSync=datetime.now(timezone.utc).isoformat(), reports=list(merged.values()), actors=actors,
                     meta={"reportCount": len(merged), "actorCount": len(actors)})
        put_document("crowdstrike-sync", state)
    except (ValueError, httpx.HTTPError, KeyError, TypeError) as exc:
        state.update(status="error", error=str(exc))
        put_document("crowdstrike-sync", state)
    finally:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_unlock(7853461)")
        close_old_connections()


def start_sync():
    token()  # Fail before accepting the request if credentials are invalid.
    threading.Thread(target=run_sync, daemon=True, name="crowdstrike-sync").start()
