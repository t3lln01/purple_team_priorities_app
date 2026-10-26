import copy
import csv
import io
import json
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from django import forms
from django.contrib import messages
from django.core.paginator import Paginator
from django.http import HttpResponse, JsonResponse, Http404
from django.shortcuts import render, redirect
from django.views.decorators.http import require_POST, require_GET

from . import scoring, crowdstrike, assessments
from .auth import require_access, clerk_api, IdentityError, ADMIN_EMAIL
from .forms import (ActorForm, ConfirmForm, ImpactForm, LikelihoodForm, TacticForm, HVAForm,
                    ProcedureForm, UserForm, CredentialsForm, ImportForm, AssessmentForm, ScoringContextForm)
from .models import Document, ThreatSnapshot
from .store import (baseline, snapshot, save_snapshot, revision, user_settings, versioned, document, put_document,
                    current_quarter, quarter_choices, quarter_key, sync_state, EMPTY_STATE, ConflictError)
from .imports import read_upload, import_data


def selected_quarter(request):
    value = request.GET.get("quarter") or request.session.get("quarter") or current_quarter()
    quarter_key(value)
    request.session["quarter"] = value
    return value


def preferences(request):
    return user_settings(request.access["user_id"])


def save_preferences(request, data):
    put_document("preferences:" + request.access["user_id"], data)


def draft(request, quarter):
    entry = snapshot(quarter)
    state = {**copy.deepcopy(EMPTY_STATE), **entry.state}
    state["monitoringState"] = state.get("monitoringState") or {}
    if request.access["user_id"]:
        saved = document(draft_key(request, quarter))
        if saved:
            state = saved["state"]
            return state, saved["revision"], entry
    return state, revision(entry), entry


def draft_key(request, quarter):
    return "draft:" + request.access["user_id"] + ":" + quarter


def save_draft(request, quarter, state, rev):
    put_document(draft_key(request, quarter), {"state": state, "revision": rev})


def form_page(request, title, form, cancel_url, submit_label="Save", **extra):
    return render(request, "form.html", {"title": title, "form": form, "cancel_url": cancel_url, "submit_label": submit_label, **extra})


def display(value):
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float):
        return f"{value:,.2f}"
    if isinstance(value, (list, dict)):
        return ", ".join(map(str, value)) if isinstance(value, list) else json.dumps(value)
    return str(value)


def date_display(value):
    try:
        if not value:
            return "—"
        ms = value if value > 1e8 else (value - 25569) * 86400000
        return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%d %b %Y")
    except (ValueError, TypeError, OSError):
        return "—"


TABLES = {
    "risk-calculation": ("Risk Calculation", [("TID", "TID"), ("Technique Name", "Technique"), ("Tactic", "Tactic"),
                                              ("CIA Score", "CIA"), ("Impact Rate", "Impact"), ("Likelihood Rate", "Likelihood"),
                                              ("Risk Scores", "Risk score")], "Risk Scores"),
    "impact-table": ("Impact Table", [("id", "TID"), ("name", "Technique"), ("tactics", "Tactics"), ("confidentiality", "Confidentiality"),
                                      ("integrity", "Integrity"), ("availability", "Availability"), ("finalTTPExtent", "TTP extent")], "id"),
    "likelihood-table": ("Likelihood Table", [("TID", "TID"), ("Technique Name", "Technique"), ("Last Occurrence", "Last occurrence"),
                                              ("Confidence", "Confidence"), ("Likelihood Score", "Likelihood score"), ("Likelihood Rate", "Rate")], "TID"),
    "high-value-assets": ("High Value Assets", [("target", "Target"), ("tid", "TID"), ("tidName", "Technique"), ("risk", "Risk"),
                                               ("likelihood", "Likelihood"), ("impact", "Impact"), ("riskScore", "Risk score"), ("likelihoodScore", "Likelihood score")], "target"),
    "tactics-scores": ("Tactic Scores", [("tactic", "Tactic"), ("conf", "Confidentiality"), ("integrity", "Integrity"), ("avail", "Availability"), ("extent", "Extent")], "tactic"),
    "tid-priority": ("TID Priority", [("tid", "TID"), ("name", "Technique"), ("count", "Procedures"), ("lastSeen", "Last seen"), ("risk", "Risk score")], "risk"),
    "all-procedures": ("All Procedures", [("actor", "Actor"), ("mitreId", "TID"), ("procedure", "Procedure"), ("lastSeen", "Date"),
                                          ("externalRef", "Reference"), ("risk", "Risk")], "actor"),
    "dashboard": ("Actor Priority Rankings", [("name", "Actor"), ("intent", "Intent"), ("capability", "Capability"),
                                              ("tidCount", "Known TIDs"), ("averageRisk", "Average TID risk"), ("priority", "Priority"), ("lists", "Lists")], "priority"),
    "scoring-framework": ("Threat Model Scoring Framework", [("category", "Category"), ("intent", "Intent"), ("intentScore", "Score"),
                                                            ("capability", "Capability"), ("capabilityScore", "Score")], "category"),
    "risk-rate": ("Risk Rate & Scoring Methodology", [("factor", "Factor"), ("level", "Level"), ("score", "Score")], "factor"),
}


def dataset(request, slug):
    prefs = preferences(request)
    if slug in ("risk-calculation", "likelihood-table"):
        return scoring.risk_rows(prefs)
    if slug == "impact-table":
        return scoring.impact_rows(prefs)
    if slug == "high-value-assets":
        return scoring.hva_rows(prefs)
    if slug == "tactics-scores":
        overrides = versioned(prefs, "pt_tactic_overrides")
        return [{**r, **overrides.get(r["tactic"], {})} for r in baseline()["tactics"]]
    if slug in ("all-procedures", "tid-priority"):
        procs = scoring.procedures(prefs, include_intelligence=bool(request.access["user_id"]))
        if slug == "all-procedures":
            return [{**p, "lastSeen": date_display(p.get("date"))} for p in procs]
        by_tid = {}
        names = {r["TID"]: r["Technique Name"] for r in scoring.risk_rows(prefs)}
        for p in procs:
            tid = p.get("mitreId")
            row = by_tid.setdefault(tid, {"tid": tid, "name": names.get(tid, ""), "count": 0, "date": 0, "risk": p.get("risk")})
            row["count"] += 1
            row["date"] = max(row["date"], p.get("date") or 0)
        return [{**r, "lastSeen": date_display(r["date"])} for r in by_tid.values()]
    if slug == "dashboard":
        return scoring.actor_priorities(snapshot(selected_quarter(request)).state, snapshot(current_quarter()).state, prefs)
    if slug == "scoring-framework":
        return baseline("threatModelData")["scoringFramework"]
    if slug == "risk-rate":
        return [{"factor": name, "level": level, "score": value} for name, values in [
            ("Confidentiality", scoring.CONF), ("Integrity", scoring.INTEGRITY), ("Availability", scoring.AVAIL),
            ("Last occurrence", scoring.LAST_OCC), ("Confidence", scoring.CONFIDENCE)] for level, value in values.items()]
    raise Http404()


def table_page(request, slug):
    if slug not in TABLES:
        raise Http404()
    if slug == "dashboard" and not request.access["user_id"]:
        return render(request, "table.html", {"title": "Actor Priority Rankings", "requires_signin": True})
    title, columns, default_sort = TABLES[slug]
    rows = dataset(request, slug)
    stats = [{"label": "Records", "value": len(rows)}]
    if slug == "risk-calculation":
        values = [r["Risk Scores"] for r in rows]
        stats += [{"label": "Average risk", "value": display(sum(values) / max(1, len(values)))},
                  {"label": "Maximum risk", "value": display(max(values, default=0))}]
    filters = []
    if slug == "dashboard":
        quarter = selected_quarter(request)
        filters.append({"name": "quarter", "label": "Monitored actors in quarter", "value": quarter,
                        "options": [{"value": q, "label": q} for q in quarter_choices()]})
    tactic_key = next((k for k, _ in columns if k in ("Tactic", "tactics", "tactic")), None)
    if tactic_key:
        options = sorted({v.strip() for r in rows for v in r.get(tactic_key, "").split(",") if v.strip()})
        chosen = request.GET.get("tactic", "")
        filters.append({"name": "tactic", "label": "Tactic", "value": chosen,
                        "options": [{"value": "", "label": "All tactics"}] + [{"value": v, "label": v} for v in options]})
        if chosen:
            rows = [r for r in rows if chosen in r.get(tactic_key, "")]
    query = request.GET.get("q", "").strip()
    if query:
        rows = [r for r in rows if query.lower() in " ".join(display(r.get(k)) for k, _ in columns).lower()]
    if request.GET.get("mitre"):
        rows = [r for r in rows if r.get("mitreId", r.get("TID", r.get("tid"))) == request.GET["mitre"]]
    if request.GET.get("actor"):
        rows = [r for r in rows if r.get("actor", "").upper() == request.GET["actor"].upper()]
    sort = request.GET.get("sort", default_sort)
    if sort not in {k for k, _ in columns}:
        sort = default_sort
    direction = request.GET.get("direction", "desc" if sort in ("priority", "risk", "Risk Scores") else "asc")
    rows.sort(key=lambda r: (r.get(sort) is not None, r.get(sort) if isinstance(r.get(sort), (int, float)) else str(r.get(sort, ""))), reverse=direction == "desc")
    page_obj = Paginator(rows, 50).get_page(request.GET.get("page"))
    table_rows = []
    for row in page_obj:
        key = row.get("id", row.get("TID", row.get("_key", row.get("tactic"))))
        editable = slug in ("impact-table", "likelihood-table", "high-value-assets", "tactics-scores", "all-procedures") and request.access["can_write"]
        table_rows.append({"cells": [display(row.get(k)) for k, _ in columns],
                           "edit_url": f"/edit/{slug}?{urlencode({'key': key})}" if editable else "",
                           "delete_url": f"/delete/{slug}?{urlencode({'key': key})}" if editable and slug in ("high-value-assets", "all-procedures") else ""})
    actions = []
    if request.access["can_write"] and slug in ("all-procedures", "high-value-assets"):
        actions.append({"url": f"/edit/{slug}?key=new", "label": "Add procedure" if slug == "all-procedures" else "Add asset mapping"})
    if slug == "dashboard":
        actions.append({"url": "/threat-model", "label": "Edit Threat Model"})
    params = request.GET.copy()
    params.pop("page", None)
    return render(request, "table.html", {
        "title": title, "page_slug": slug, "columns": [label for _, label in columns], "rows": table_rows,
        "stats": stats, "filters": filters, "query": query, "sort": sort, "direction": direction,
        "sort_options": [{"value": k, "label": label} for k, label in columns],
        "page_obj": page_obj, "pagination_query": params.urlencode(), "actions": actions,
        "export_url": "/api/export/" + ("actor-prioritisation" if slug == "dashboard" else slug) + "?" + params.urlencode(),
        "subtitle": "All time · Risk = Impact × Likelihood" if slug == "risk-calculation" else "",
        "notice": f"Quarter filters monitoring only. Current ({current_quarter()}) intent × capability × average distinct all-time observed TID risk. No TIDs = 0; missing risk = unscored." if slug == "dashboard" else "",
    })


@require_access()
def threat_model(request):
    quarter = selected_quarter(request)
    state, rev, entry = draft(request, quarter)
    if request.method == "POST":
        if not request.access["can_write"]:
            return JsonResponse({"error": "Write access required."}, status=403)
        try:
            monitored = set(request.POST.getlist("monitored"))
            state["monitoringState"] = {a["name"]: a["name"] in monitored for a in scoring.actors_for_state(state)}
            for key in ("ppTapList", "sirtList"):
                state[key] = list(dict.fromkeys(v.strip() for v in request.POST.get(key, "").replace(",", "\n").splitlines() if v.strip()))
            save_snapshot(quarter, state, expected=request.POST.get("revision", ""))
            Document.objects.filter(key=draft_key(request, quarter)).delete()
            messages.success(request, "The complete quarter snapshot was saved.")
            return redirect("/threat-model?" + urlencode({"quarter": quarter}))
        except (ValueError, ConflictError) as exc:
            save_draft(request, quarter, state, rev)
            messages.error(request, str(exc))
    actors = scoring.actors_for_state(state)
    for index, actor in enumerate(actors):
        params = urlencode({"quarter": quarter, "actor": actor["name"]})
        actor.update(index=index, edit_url="/threat-model/actor/edit?" + params,
                     delete_url="/threat-model/actor/delete?" + params if actor["is_custom"] else "")
        assessment = state.get("autoAssessments", {}).get(actor["name"], {})
        actor["assessment_intent"] = assessment.get("intentFinalScore")
        actor["assessment_capability"] = assessment.get("capabilityFinalScore")
    return render(request, "threat_model.html", {"title": "Threat Model", "actors": actors, "quarter": quarter,
                  "quarters": sorted(set(quarter_choices() + [quarter]), key=quarter_key, reverse=True), "revision": rev, "saved_at": entry.saved_at, "seeded_from": entry.seeded_from,
                  "pp_tap_text": "\n".join(state.get("ppTapList", [])), "sirt_text": "\n".join(state.get("sirtList", []))})


@require_access(write=True)
def actor_edit(request, action):
    quarter = selected_quarter(request)
    state, rev, _ = draft(request, quarter)
    name = request.GET.get("actor", "")
    actor = next((a for a in scoring.actors_for_state(state) if a["name"] == name), {})
    if action != "new" and not actor:
        raise Http404()
    cancel = "/threat-model?" + urlencode({"quarter": quarter})
    if action == "delete":
        if not actor.get("is_custom"):
            raise Http404()
        form = ConfirmForm(request.POST or None, initial={"revision": rev})
        if request.method == "POST" and form.is_valid():
            state["customActors"] = [a for a in state["customActors"] if a["name"] != name]
            for key in ("actorOverrides", "monitoringState", "autoAssessments"):
                state[key].pop(name, None)
            save_draft(request, quarter, state, rev)
            messages.success(request, "Actor removed from draft. Save the quarter to commit this change.")
            return redirect(cancel)
        return form_page(request, "Remove " + name, form, cancel, "Remove from draft", danger=True)
    initial = {**actor, "revision": rev, "inMonitoringList": actor.get("monitored", False)}
    for key in ("countries", "industries"):
        initial[key] = ", ".join(actor.get(key, []))
    form = ActorForm(request.POST or None, initial=initial)
    if action != "new":
        form.fields["name"].disabled = True
    if request.method == "POST" and form.is_valid():
        values = dict(form.cleaned_data)
        values.pop("revision", None)
        new_name = values["name"]
        if action == "new" and any(a["name"].upper() == new_name for a in scoring.actors_for_state(state)):
            form.add_error("name", "This actor already exists in the quarter.")
        else:
            for key in ("countries", "industries"):
                values[key] = [v.strip() for v in values[key].split(",") if v.strip()]
            if action == "new":
                state["customActors"].append({**values, "isCustom": True})
            elif actor.get("is_custom"):
                state["customActors"] = [{**a, **values} if a["name"] == name else a for a in state["customActors"]]
            else:
                override = state["actorOverrides"].setdefault(name, {})
                override.update({k: v for k, v in values.items() if k not in ("name", "countries", "industries", "malware", "origins", "aliases", "actorType", "description")})
                override.setdefault("csData", {}).update({k: values[k] for k in ("countries", "industries", "malware", "origins", "aliases", "actorType", "description")})
            state["monitoringState"][new_name] = values["inMonitoringList"]
            save_draft(request, quarter, state, rev)
            messages.success(request, "Actor changes applied to draft. Save the quarter to commit them.")
            return redirect(cancel)
    return form_page(request, "Add actor" if action == "new" else "Edit " + name, form, cancel, "Apply to quarter draft",
                     description="Rubric fields derive the final base scores when supplied. PP-TAP/SIRT bonuses are applied separately.")


@require_access(write=True)
def edit_record(request, slug, delete=False):
    prefs = preferences(request)
    key = request.GET.get("key", "")
    mappings = {"impact-table": (ImpactForm, "pt_impact_overrides", "id"),
                "likelihood-table": (LikelihoodForm, "pt_likelihood_overrides", "TID"),
                "tactics-scores": (TacticForm, "pt_tactic_overrides", "tactic"),
                "high-value-assets": (HVAForm, "pt_hva_overrides", "_key"),
                "all-procedures": (ProcedureForm, "pt_procedures_custom", "_key")}
    if slug not in mappings:
        raise Http404()
    form_class, storage, id_field = mappings[slug]
    rows = dataset(request, slug)
    row = next((r for r in rows if str(r.get(id_field)) == key), {})
    if key != "new" and not row:
        raise Http404()
    initial = dict(row)
    if slug == "likelihood-table":
        initial = {"lastOccurrence": row["Last Occurrence"], "confidence": row["Confidence"]}
    if slug == "all-procedures" and row.get("date"):
        initial["date"] = datetime.fromtimestamp(row["date"] / 1000, timezone.utc).date()
    if key == "new" and slug not in ("high-value-assets", "all-procedures"):
        raise Http404()
    if delete and slug not in ("high-value-assets", "all-procedures"):
        raise Http404()
    form = ConfirmForm(request.POST or None) if delete else form_class(request.POST or None, initial=initial)
    version = prefs.get("pt_active_mitre_version") or "base"
    if request.method == "POST" and form.is_valid():
        values = form.cleaned_data
        if slug == "all-procedures":
            custom = prefs.setdefault(storage, [])
            if row and key.startswith("baseline-"):
                prefs.setdefault("python_deleted_procedures", []).append(key)
            else:
                prefs[storage] = [p for p in custom if p.get("_id") != key]
            if not delete:
                date = values["date"]
                values["date"] = datetime.combine(date, datetime.min.time(), timezone.utc).timestamp() * 1000 if date else None
                prefs[storage].append({**values, "_id": uuid.uuid4().hex, "reportRefs": [], "risk": row.get("risk")})
        elif slug == "high-value-assets":
            custom_key = "pt_hva_custom:" + version
            custom = prefs.setdefault(custom_key, copy.deepcopy(versioned(prefs, "pt_hva_custom", [])))
            if key == "new":
                custom.append({**values, "_id": uuid.uuid4().hex})
            elif any(r.get("_id") == key for r in custom):
                prefs[custom_key] = [({**r, **values} if r.get("_id") == key else r) for r in custom if not (delete and r.get("_id") == key)]
            else:
                prefs.setdefault(storage + ":" + version, copy.deepcopy(versioned(prefs, storage)))[key] = {"deleted": True} if delete else values
            scoring.update_hva_scores(prefs)
        else:
            prefs.setdefault(storage + ":" + version, copy.deepcopy(versioned(prefs, storage)))[key] = values
        save_preferences(request, prefs)
        messages.success(request, "Record deleted." if delete else "Changes saved.")
        return redirect("/" + slug)
    return form_page(request, ("Delete " if delete else "Edit " if key != "new" else "Add ") + TABLES[slug][0],
                     form, "/" + slug, "Delete" if delete else "Save", danger=delete)


@require_access(admin=True)
def users(request):
    if request.path.endswith("/new"):
        form = UserForm(request.POST or None)
        if request.method == "POST" and form.is_valid():
            try:
                email = form.cleaned_data["email"].lower()
                if email == ADMIN_EMAIL:
                    raise ValueError("The administrator account already exists.")
                clerk_api("POST", "users", json={"email_address": [email], "password": form.cleaned_data["password"], "public_metadata": {"role": "writer"}})
                messages.success(request, "Write-enabled user created. Share their password securely.")
                return redirect("/users")
            except (IdentityError, ValueError) as exc:
                form.add_error(None, str(exc))
        return form_page(request, "Add write-enabled user", form, "/users", "Create user")
    try:
        raw = clerk_api("GET", "users", params={"limit": 100})
        data = raw if isinstance(raw, list) else raw.get("data", [])
        rows = []
        for user in data:
            emails = [e["email_address"] for e in user.get("email_addresses", [])]
            role = "Administrator" if ADMIN_EMAIL in emails else "Writer" if user.get("public_metadata", {}).get("role") == "writer" else "View only"
            rows.append({"cells": [", ".join(emails), role, date_display(user.get("created_at")), date_display(user.get("last_sign_in_at"))]})
        return render(request, "table.html", {"title": "User management", "columns": ["Username", "Access", "Created", "Last sign-in"], "rows": rows,
                                            "actions": [{"url": "/users/new", "label": "Add user"}]})
    except IdentityError as exc:
        return render(request, "error.html", {"title": "Users unavailable", "error": str(exc)}, status=503)


@require_access()
def sources(request):
    prefs = preferences(request)
    return render(request, "sources.html", {"title": "Data Sources", "sync": sync_state(), "credentials_present": bool(crowdstrike.credentials()),
                   "versions": [{**v, "active": v["id"] == prefs.get("pt_active_mitre_version")} for v in prefs.get("pt_mitre_versions_meta", [])],
                   "actions": [{"url": "/data-sources/import", "label": "Import data"}, {"url": "/data-sources/browser-import", "label": "Import browser settings"},
                               {"url": "/threat-model/enrich", "label": "Find actor in CrowdStrike"}, {"url": "/threat-model/context", "label": "Assessment scoring context"}]})


@require_access(write=True)
def source_action(request, action):
    prefs = preferences(request)
    if action == "browser-import":
        return render(request, "browser_import.html", {"title": "Import browser data"})
    if action == "sync":
        if request.method != "POST":
            return HttpResponse(status=405)
        try:
            crowdstrike.start_sync()
            messages.success(request, "CrowdStrike sync started.")
        except (ValueError, httpx.HTTPError) as exc:
            messages.error(request, str(exc))
        return redirect("/data-sources")
    if action == "disconnect":
        if request.method != "POST":
            return HttpResponse(status=405)
        try:
            crowdstrike.disconnect()
            messages.success(request, "CrowdStrike credentials disconnected.")
        except ValueError as exc:
            messages.error(request, str(exc))
        return redirect("/data-sources")
    if action == "credentials":
        form = CredentialsForm(request.POST or None)
        if request.method == "POST" and form.is_valid():
            crowdstrike.save_credentials(form.cleaned_data)
            messages.success(request, "Credentials saved encrypted. Use Sync to connect.")
            return redirect("/data-sources")
        return form_page(request, "CrowdStrike credentials", form, "/data-sources")
    if action == "import":
        form = ImportForm(request.POST or None, request.FILES or None)
        if request.method == "POST" and form.is_valid():
            try:
                import_data(prefs, form.cleaned_data["kind"], read_upload(form.cleaned_data["file"]), form.cleaned_data["label"])
                save_preferences(request, prefs)
                messages.success(request, "Data imported successfully.")
                return redirect("/data-sources")
            except (ValueError, TypeError, KeyError, UnicodeDecodeError) as exc:
                form.add_error(None, str(exc))
        return form_page(request, "Import data", form, "/data-sources", "Import")
    if action == "version":
        form = forms.Form(request.POST or None)
        form.fields["version"] = forms.ChoiceField(choices=[("base", "Original baseline")] +
                                                  [(v["id"], v.get("label", v["id"])) for v in prefs.get("pt_mitre_versions_meta", [])],
                                                  initial=prefs.get("pt_active_mitre_version", "base"))
        if request.method == "POST" and form.is_valid():
            prefs["pt_active_mitre_version"] = None if form.cleaned_data["version"] == "base" else form.cleaned_data["version"]
            save_preferences(request, prefs)
            messages.success(request, "Active MITRE version changed.")
            return redirect("/data-sources")
        return form_page(request, "Active MITRE version", form, "/data-sources")
    raise Http404()


@require_access(write=True)
def assessment_action(request, action):
    quarter = selected_quarter(request)
    state, rev, _ = draft(request, quarter)
    cancel = "/threat-model?" + urlencode({"quarter": quarter})
    if action == "context":
        prefs = preferences(request)
        current = prefs.get("python_scoring_context", {})
        form = ScoringContextForm(request.POST or None, initial={k: "\n".join(v) for k, v in current.items()})
        if request.method == "POST" and form.is_valid():
            prefs["python_scoring_context"] = {k: [v.strip() for v in raw.splitlines() if v.strip()] for k, raw in form.cleaned_data.items()}
            save_preferences(request, prefs)
            messages.success(request, "Assessment context saved.")
            return redirect(cancel)
        return form_page(request, "Assessment scoring context", form, cancel)
    if action == "discard":
        form = ConfirmForm(request.POST or None)
        if request.method == "POST" and form.is_valid():
            Document.objects.filter(key=draft_key(request, quarter)).delete()
            return redirect(cancel)
        return form_page(request, "Discard quarter draft", form, cancel, "Discard", danger=True)
    if action == "assess":
        if request.method != "POST":
            return HttpResponse(status=405)
        prefs = preferences(request)
        suggestions = assessments.generate(quarter, state, scoring.procedures(prefs), prefs.get("python_scoring_context"))
        for name, value in suggestions.items():
            if state["autoAssessments"].get(name, {}).get("status") != "approved":
                state["autoAssessments"][name] = value
        save_draft(request, quarter, state, rev)
        messages.success(request, f"{len(suggestions)} procedure-based suggestions generated. Review and save the quarter.")
        return redirect(cancel)
    name = request.GET.get("actor", "")
    assessment = state["autoAssessments"].get(name)
    if not assessment:
        raise Http404()
    form = AssessmentForm(request.POST or None, initial={"revision": rev})
    if request.method == "POST" and form.is_valid():
        assessment["status"] = form.cleaned_data["decision"]
        save_draft(request, quarter, state, rev)
        messages.success(request, "Review applied to draft. Manual overrides still take precedence. Save the quarter to commit.")
        return redirect(cancel)
    return form_page(request, "Review assessment: " + name, form, cancel, "Apply review",
                     description=json.dumps(assessment, indent=2))


@require_access(write=True)
def enrich(request):
    quarter = selected_quarter(request)
    state, rev, _ = draft(request, quarter)
    form = forms.Form(request.POST or None)
    form.fields["actor"] = forms.CharField(max_length=200, label="CrowdStrike actor name")
    if request.method == "POST" and form.is_valid():
        try:
            matches = crowdstrike.actor_search(form.cleaned_data["actor"])
            exact = next((a for a in matches if a["name"].upper() == form.cleaned_data["actor"].strip().upper()), None)
            if not exact:
                raise ValueError("No exact match. Matches: " + ", ".join(a["name"] for a in matches))
            existing = next((a for a in scoring.actors_for_state(state) if a["name"] == exact["name"]), None)
            if existing:
                state["actorOverrides"].setdefault(exact["name"], {})["csData"] = exact
            else:
                state["customActors"].append(exact)
            save_draft(request, quarter, state, rev)
            messages.success(request, "CrowdStrike actor added to draft. Review it and save the quarter.")
            return redirect("/threat-model?" + urlencode({"quarter": quarter}))
        except (ValueError, httpx.HTTPError) as exc:
            form.add_error(None, str(exc))
    return form_page(request, "Look up CrowdStrike actor", form, "/threat-model", "Find and apply to draft")


def sign_in(request):
    return render(request, "sign_in.html", {"title": "Sign in"})


def csrf_failure(request, reason=""):
    if request.path.startswith("/api/"):
        return JsonResponse({"error": "Security check failed. Refresh the page and try again."}, status=403)
    return render(request, "error.html", {"title": "Refresh required", "status": 403, "error": "Security check failed. Refresh the page and try again."}, status=403)
