import csv
import io
import json
import re
from functools import wraps

import httpx
from django.db import transaction
from django.http import JsonResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods

from . import crowdstrike, views
from .auth import clerk_api, ADMIN_EMAIL, IdentityError, require_access
from .forms import UserForm, CredentialsForm
from .models import Document, ThreatSnapshot
from .store import (snapshot, save_snapshot, revision, quarter_choices, current_quarter,
                    sync_state, user_settings, put_document, EMPTY_STATE)


def body(request):
    try:
        value = json.loads(request.body or "{}")
    except ValueError:
        raise ValueError("Invalid JSON request.")
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON object.")
    return value


def api_errors(view):
    @wraps(view)
    def inner(request, *args, **kwargs):
        try:
            return view(request, *args, **kwargs)
        except IdentityError as exc:
            return JsonResponse({"ok": False, "error": str(exc)}, status=exc.status if exc.status in (400, 409, 422, 429) else 503)
        except (ValueError, TypeError, KeyError) as exc:
            return JsonResponse({"ok": False, "error": str(exc)}, status=400)
        except httpx.HTTPError:
            return JsonResponse({"ok": False, "error": "The external service is unavailable. Please try again later."}, status=503)
    return inner


def health(request):
    return JsonResponse({"status": "ok", "runtime": "python", "framework": "django"})


def access_me(request):
    a = request.access
    return JsonResponse({"userId": a["user_id"], "email": a["email"], "isAdmin": a["is_admin"], "canWrite": a["can_write"]})


def serialize_user(user):
    emails = user.get("email_addresses", [])
    primary = next((e for e in emails if e.get("id") == user.get("primary_email_address_id")), emails[0] if emails else {})
    admin = any(e.get("email_address", "").lower() == ADMIN_EMAIL for e in emails)
    return {"id": user["id"], "email": primary.get("email_address", ""), "isAdmin": admin,
            "canWrite": admin or user.get("public_metadata", {}).get("role") == "writer",
            "createdAt": user.get("created_at"), "lastSignInAt": user.get("last_sign_in_at")}


@require_access(admin=True)
@require_http_methods(["GET", "POST"])
@api_errors
def users(request):
    if request.method == "GET":
        result = clerk_api("GET", "users", params={"limit": 100})
        return JsonResponse({"users": [serialize_user(u) for u in (result if isinstance(result, list) else result.get("data", []))]})
    form = UserForm(body(request))
    if not form.is_valid():
        return JsonResponse({"error": form.errors.as_text()}, status=400)
    email = form.cleaned_data["email"].lower()
    if email == ADMIN_EMAIL:
        return JsonResponse({"error": "The administrator account already exists."}, status=409)
    user = clerk_api("POST", "users", json={"email_address": [email], "password": form.cleaned_data["password"], "public_metadata": {"role": "writer"}})
    return JsonResponse({"user": serialize_user(user)}, status=201)


@require_access()
@require_http_methods(["GET", "POST", "DELETE"])
@api_errors
def cs(request, endpoint):
    if request.method != "GET" and not request.access["can_write"]:
        return JsonResponse({"error": "Write access required."}, status=403)
    if endpoint == "threat-model-state":
        if request.method == "POST":
            data = body(request)
            quarter = data.get("quarter") or current_quarter()
            state = {k: data.get(k, value) for k, value in EMPTY_STATE.items()}
            entry = save_snapshot(quarter, state, expected=data.get("revision"))
            return JsonResponse({"ok": True, "savedAt": revision(entry)})
        if request.method != "GET":
            return HttpResponse(status=405)
        quarter = request.GET.get("quarter") or current_quarter()
        entry = snapshot(quarter)
        return JsonResponse({"ok": True, "quarter": quarter, **entry.state, "savedAt": revision(entry) or None,
                             "seededFrom": entry.seeded_from, "hasSnapshot": bool(entry.saved_at)})
    if endpoint == "threat-model-versions" and request.method == "GET":
        return JsonResponse({"ok": True, "versions": [
            {"quarter": e.quarter, "savedAt": revision(e) or None, "seededFrom": e.seeded_from,
             "customActorCount": len(e.state.get("customActors", [])),
             "overrideCount": len(e.state.get("actorOverrides", {}))}
            for e in ThreatSnapshot.objects.all()]})
    if endpoint == "credentials":
        if request.method == "POST":
            form = CredentialsForm(body(request))
            if not form.is_valid():
                return JsonResponse({"ok": False, "error": form.errors.as_text()}, status=400)
            crowdstrike.save_credentials(form.cleaned_data)
        elif request.method == "DELETE":
            crowdstrike.disconnect()
        return JsonResponse({"ok": True, "configured": bool(crowdstrike.credentials())})
    if endpoint == "connect" and request.method == "POST":
        crowdstrike.token()
        return JsonResponse({"ok": True, "connected": True})
    if endpoint == "sync" and request.method == "POST":
        crowdstrike.start_sync()
        return JsonResponse({"ok": True, "status": "running"}, status=202)
    if request.method != "GET":
        return HttpResponse(status=405)
    if endpoint in ("status", "sync-result"):
        state = sync_state()
        result = state if endpoint == "sync-result" else {k: v for k, v in state.items() if k not in ("actors", "reports")}
        return JsonResponse({"ok": True, "configured": bool(crowdstrike.credentials()), **result})
    if endpoint in ("actor", "actors/last-active"):
        from django.core.cache import cache
        key = "cs-limit:" + request.access["user_id"]
        count = cache.get(key, 0)
        if count >= 20:
            return JsonResponse({"ok": False, "error": "Too many live CrowdStrike requests. Try again in a minute."}, status=429)
        cache.set(key, count + 1, 60)
        actors = crowdstrike.actor_search(request.GET.get("q", "")) if endpoint == "actor" else crowdstrike.directory()
        if endpoint == "actors/last-active":
            actors = [{"name": a["name"], "aliases": a["aliases"].split(","), "lastActive": a["lastSeen"]} for a in actors]
        return JsonResponse({"ok": True, "actors": actors})
    return JsonResponse({"error": "Unknown endpoint."}, status=404)


@require_access(write=True)
@require_http_methods(["POST"])
@api_errors
def browser_import(request):
    payload = body(request)
    permitted = {k: v for k, v in payload.items() if re.match(r"^(pt_|ds_)", k)
                 and not re.search(r"credential|secret|token|password", k, re.I)}
    key = "preferences:" + request.access["user_id"]
    with transaction.atomic():
        doc, _ = Document.objects.get_or_create(key=key, defaults={"value": {}})
        doc = Document.objects.select_for_update().get(key=key)
        imported = 0
        for name, value in permitted.items():
            if name not in doc.value:
                doc.value[name] = value
                imported += 1
        doc.save()
    return JsonResponse({"ok": True, "imported": imported})


EXPORTS = {
    "actor-prioritisation": "dashboard", "risk-calculation": "risk-calculation",
    "impact-table": "impact-table", "likelihood-table": "likelihood-table",
    "high-value-assets": "high-value-assets", "tid-priority": "tid-priority",
    "tactics-scores": "tactics-scores", "all-procedures": "all-procedures",
    "scoring-framework": "scoring-framework", "risk-rate": "risk-rate",
}
ENDPOINTS = [{"path": "/api/export/" + path, "description": views.TABLES[slug][0]} for path, slug in EXPORTS.items()] + [
    {"path": "/api/export/threat-model", "description": "Saved quarterly Threat Model snapshot (sign-in required)"},
    {"path": "/api/export/threat-model/versions", "description": "Quarter history (sign-in required)"},
    {"path": "/api/export/settings", "description": "Your imported settings and overrides (sign-in required)"},
]


@api_errors
def export(request, endpoint=""):
    if not endpoint:
        return JsonResponse({"endpoints": ENDPOINTS})
    protected = endpoint in ("actor-prioritisation", "threat-model", "threat-model/versions", "settings")
    if protected and not request.access["user_id"]:
        return JsonResponse({"error": "Sign in to access this export."}, status=401)
    if endpoint == "openapi.json":
        return JsonResponse({"openapi": "3.0.3", "info": {"title": "Purple Team Python API", "version": "2.0.0"},
                             "paths": {e["path"]: {"get": {"summary": e["description"], "responses": {"200": {"description": "Export"}}}} for e in ENDPOINTS}})
    if endpoint == "settings":
        data = user_settings(request.access["user_id"])
    elif endpoint == "threat-model":
        data = snapshot(request.GET.get("quarter") or current_quarter()).state
    elif endpoint == "threat-model/versions":
        data = [{"quarter": s.quarter, "savedAt": revision(s)} for s in ThreatSnapshot.objects.all()]
    elif endpoint in EXPORTS:
        data = views.dataset(request, EXPORTS[endpoint])
    else:
        return JsonResponse({"error": "Unknown export."}, status=404)
    if request.GET.get("format") == "csv":
        rows = data if isinstance(data, list) else [data]
        stream = io.StringIO()
        columns = list(dict.fromkeys(k for r in rows for k in r))
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            # Neutralize spreadsheet formulas in user-controlled values.
            clean = {}
            for k, v in row.items():
                text = json.dumps(v) if isinstance(v, (list, dict)) else str(v if v is not None else "")
                clean[k] = "'" + text if text.startswith(("=", "+", "-", "@", "\t", "\r")) else text
            writer.writerow(clean)
        response = HttpResponse(stream.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="purple-team-export.csv"'
        return response
    return JsonResponse(data, safe=isinstance(data, dict))


def api_docs(request):
    return render(request, "api_docs.html", {"title": "API & Exports", "endpoints": ENDPOINTS})
