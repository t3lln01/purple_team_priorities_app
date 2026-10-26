"""Python implementation of the existing scoring formulas; no browser calculations."""
import copy
import re
from collections import defaultdict
from datetime import datetime, timezone
from .store import baseline, versioned, sync_state

CONF = {"Low": 1, "Medium": 2, "High": 3}
INTEGRITY = {"Low": 1, "Medium": 2.25, "High": 3.5}
AVAIL = {"Low": 1, "Medium": 2.5, "High": 4}
LAST_OCC = {"< 3 months": 1.7, "between 3 months and 1 year": 1.3, "between 1 and 2 yrs": 1.1, "> 2 years": 0.8}
CONFIDENCE = {"high confidence": 1.25, "medium confidence": 1, "low confidence": 0.75}
EXTENT_FIELDS = ["initialTTPExtent", "adScore", "containerScore", "cloudScore", "supportRemoteScore",
                 "systemReqScore", "capecSeverityScore", "permRequiredScore", "effectivePermsScore"]


def first(*values):
    return next((v for v in values if v is not None), None)


def rate(value, limits):
    return next((label for limit, label in zip(limits, ["Very Low", "Low", "Medium", "High"]) if value <= limit), "Very High")


def active_version(preferences):
    return next((v for v in preferences.get("pt_mitre_versions_meta", [])
                 if v["id"] == preferences.get("pt_active_mitre_version")), {})


def impact_rows(preferences):
    rows = {r["id"]: copy.deepcopy(r) for r in baseline()["impactTable"]}
    rows.update({r["id"]: copy.deepcopy(r) for r in active_version(preferences).get("impactRows", [])})
    overrides = versioned(preferences, "pt_impact_overrides")
    tactics = versioned(preferences, "pt_tactic_overrides")
    for tid, row in rows.items():
        tactic = tactics.get(row.get("tactics", "").split(",")[0].strip(), {})
        row["confidentiality"] = tactic.get("conf", row.get("confidentiality", "Medium"))
        row["integrity"] = tactic.get("integrity", row.get("integrity", "Medium"))
        row["availability"] = tactic.get("avail", row.get("availability", "Low"))
        row.update(overrides.get(tid, {}))
        row["finalTTPExtent"] = sum(float(row.get(field, 0) or 0) for field in EXTENT_FIELDS)
    return list(rows.values())


def risk_rows(preferences):
    base = {r["TID"]: copy.deepcopy(r) for r in baseline()["riskCalc"]}
    base.update({r["TID"]: copy.deepcopy(r) for r in active_version(preferences).get("riskRows", [])})
    impacts = {r["id"]: r for r in impact_rows(preferences)}
    for tid, row in impacts.items():
        if tid not in base:
            cia = CONF.get(row["confidentiality"], 0) + INTEGRITY.get(row["integrity"], 0) + AVAIL.get(row["availability"], 0)
            base[tid] = {"TID": tid, "Technique Name": row["name"], "Platforms": row.get("platforms", ""),
                         "Tactic": row.get("tactics", ""), "Confidentiality": row["confidentiality"],
                         "Integrity": row["integrity"], "Availability": row["availability"],
                         "CIA Score": cia, "TTP Extent Score": row["finalTTPExtent"],
                         "TID  Priority": 1, "Last Occurrence": "between 1 and 2 yrs",
                         "Last occurrence Score": 1.1, "Confidence": "medium confidence",
                         "Confidence Score": 1, "Likelihood Score": 1.1}
    tactic_overrides = versioned(preferences, "pt_tactic_overrides")
    impact_overrides = versioned(preferences, "pt_impact_overrides")
    likelihood = versioned(preferences, "pt_likelihood_overrides")
    hva = {r["tid"]: r for r in versioned(preferences, "pt_hva_scores", [])}
    for tid, row in base.items():
        imp = impacts.get(tid)
        override = impact_overrides.get(tid)
        tactic = tactic_overrides.get(row.get("Tactic", "").split(",")[0].strip(), {})
        if imp:
            row.update({"Confidentiality": imp["confidentiality"], "Integrity": imp["integrity"], "Availability": imp["availability"]})
            if override or tactic:
                row["CIA Score"] = CONF.get(imp["confidentiality"], 0) + INTEGRITY.get(imp["integrity"], 0) + AVAIL.get(imp["availability"], 0)
            if override:
                row["TTP Extent Score"] = imp["finalTTPExtent"]
        hva_risk = hva.get(tid, {}).get("avgRisk", 1)
        impact = row["CIA Score"] * row["TTP Extent Score"] * hva_risk
        base_last, base_conf = row.get("Last occurrence Score", 1), row.get("Confidence Score", 1)
        priority = row.get("TID  Priority", 1)
        divisor = priority * base_last * base_conf
        factor = row.get("Likelihood Score", 1) / divisor if divisor > 0 else 1
        factor = hva.get(tid, {}).get("avgLikelihood", factor)
        last_label = likelihood.get(tid, {}).get("lastOccurrence", row.get("Last Occurrence", ""))
        conf_label = likelihood.get(tid, {}).get("confidence", row.get("Confidence", ""))
        last_score, conf_score = LAST_OCC.get(last_label, base_last), CONFIDENCE.get(conf_label, base_conf)
        lik = priority * last_score * conf_score * factor
        row.update({"HIGH VALUE ASSSET RISK": hva_risk, "Impact Score": impact, "Impact Rate": rate(impact, [10, 12, 14, 16]),
                    "Last Occurrence": last_label, "Last occurrence Score": last_score, "Confidence": conf_label,
                    "Confidence Score": conf_score, "Likelihood Score": lik, "Likelihood Rate": rate(lik, [1.5, 3.5, 5.5, 7.5]),
                    "Risk Scores": impact * lik})
    return list(base.values())


def to_ms(value):
    if isinstance(value, (float, int)):
        return value * 1000 if value < 10_000_000_000 else value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp() * 1000
    except (ValueError, TypeError):
        return 0


def generated_procedures(actors, reports):
    lookup = {}
    for r in reports:
        for key in [r.get("slug"), r.get("id"), r.get("reportId")]:
            if key:
                lookup[str(key).upper()] = r
    result, seen = [], set()
    for actor in actors:
        for entry in actor.get("entries", []):
            observables = entry.get("observables", [])
            if not observables:
                continue
            matching = [lookup[str(key).upper()] for key in entry.get("reports", []) if str(key).upper() in lookup]
            if not matching:
                continue
            report = max(matching, key=lambda r: to_ms(r.get("last_updated") or r.get("created_date")))
            date = to_ms(report.get("last_updated") or report.get("created_date"))
            if not date:
                continue
            name = actor.get("actor", "").upper()
            text = " ".join(str(o) for o in observables).strip()
            tid = entry.get("technique_id", "").upper()
            key = (name, tid, text)
            if key in seen:
                continue
            seen.add(key)
            result.append({"actor": name, "mitreId": tid, "tacticName": entry.get("tactic_name", ""),
                           "techniqueName": entry.get("technique_name", ""), "procedure": f"[{name}] - {text}",
                           "date": date, "externalRef": f"{name} {report.get('name', '')} - {report.get('url', '')}",
                           "risk": len(entry.get("reports", [])) * 100 + len(observables) * 50,
                           "reportRefs": entry.get("reports", [])})
    return result


def procedures(preferences, include_intelligence=True):
    rows = [copy.deepcopy(p) for p in baseline()["allProcedures"]
            if p.get("procedure", "").strip() and not re.match(r"^\[.+\]\s*-\s*$", p["procedure"])]
    if include_intelligence:
        rows += copy.deepcopy(preferences.get("pt_procedures_custom", []))
        live = preferences.get("pt_live_actor_data")
        if live:
            rows += copy.deepcopy(live.get("procedures", []))
        else:
            synced = sync_state()
            rows += generated_procedures(synced.get("actors", []), synced.get("reports", []))
    scores = {r["TID"]: r["Risk Scores"] for r in risk_rows(preferences)}
    deleted = set(preferences.get("python_deleted_procedures", []))
    for index, row in enumerate(rows):
        row["_key"] = row.get("_id") or f"baseline-{index}"
        row["actor"] = row.get("actor", "").upper()
        row["risk"] = scores.get(row.get("mitreId"), row.get("risk"))
    return [p for p in rows if p["_key"] not in deleted]


def actors_for_state(state):
    actors = {r["name"]: copy.deepcopy(r) for r in baseline("threatModelData")["threatModelActors"]}
    actors.update({r["name"]: copy.deepcopy(r) for r in state.get("customActors", [])})
    result = []
    for name, actor in actors.items():
        override = state.get("actorOverrides", {}).get(name, {})
        cs = override.get("csData", {})
        approved = state.get("autoAssessments", {}).get(name, {})
        if approved.get("status") != "approved":
            approved = {}
        intent = first(override.get("intentFinalScore"), cs.get("intentFinalScore"), approved.get("intentFinalScore"), actor.get("intentFinalScore"), 0)
        capability = first(override.get("capabilityFinalScore"), cs.get("capabilityFinalScore"), approved.get("capabilityFinalScore"), actor.get("capabilityFinalScore"), 0)
        actor.update({k: v for k, v in cs.items() if v is not None})
        actor.update({k: v for k, v in override.items() if k != "csData" and v is not None})
        pp, sirt = [any(item.strip().upper() == name.upper() or item.strip().upper() in actor.get("malware", "").upper()
                       for item in state.get(key, []) if item.strip()) for key in ("ppTapList", "sirtList")]
        actor.update({"intent": min(7, intent + int(pp) + 2 * int(sirt)), "capability": capability,
                      "monitored": state.get("monitoringState", {}).get(name, override.get("inMonitoringList", actor.get("inMonitoringList", False))),
                      "inPpTap": pp, "inSirt": sirt,
                      "is_custom": any(a["name"] == name for a in state.get("customActors", [])),
                      "description": actor.get("description") or f"{name} is tracked for {actor.get('actorType', 'observed activity')}.",
                      "assessment_status": state.get("autoAssessments", {}).get(name, {}).get("status", "")})
        result.append(actor)
    return result


def actor_priorities(membership_state, current_state, preferences):
    current = {a["name"].upper(): a for a in actors_for_state(current_state)}
    by_actor = defaultdict(dict)
    for p in procedures(preferences):
        tid = p.get("mitreId", "").upper()
        if re.fullmatch(r"T\d{4}(?:\.\d{3})?", tid) and p.get("procedure", "").strip():
            risk = p.get("risk")
            old = by_actor[p["actor"]].get(tid)
            by_actor[p["actor"]][tid] = max(old or 0, risk) if isinstance(risk, (int, float)) else old
    result = []
    for member in actors_for_state(membership_state):
        if not member["monitored"]:
            continue
        actor = copy.deepcopy(current.get(member["name"].upper(), {"name": member["name"], "intent": 0, "capability": 0}))
        risks = by_actor[member["name"].upper()]
        missing = any(r is None for r in risks.values())
        average = None if missing else sum(risks.values()) / len(risks) if risks else 0
        priority = None if average is None else actor["intent"] * actor["capability"] * average
        actor.update({"tidCount": len(risks), "averageRisk": average, "priority": priority,
                      "lists": ", ".join(k for k, flag in [("PP-TAP +1", actor.get("inPpTap")), ("SIRT +2", actor.get("inSirt"))] if flag)})
        result.append(actor)
    return sorted(result, key=lambda a: a["priority"] if a["priority"] is not None else -1, reverse=True)


def hva_rows(preferences):
    rows = []
    overrides = versioned(preferences, "pt_hva_overrides")
    for index, row in enumerate(baseline()["highvalue"]):
        row = {**row, **overrides.get(str(index), {})}
        if not row.get("deleted"):
            rows.append({**row, "_key": str(index)})
    rows.extend({**r, "_key": r.get("_id", str(i))} for i, r in enumerate(versioned(preferences, "pt_hva_custom", [])))
    return rows


def update_hva_scores(preferences):
    buckets = defaultdict(list)
    for row in hva_rows(preferences):
        if row.get("tid"):
            buckets[row["tid"]].append(row)
    version = preferences.get("pt_active_mitre_version") or "base"
    preferences["pt_hva_scores:" + version] = [
        {"tid": tid, "avgRisk": sum(float(r.get("riskScore") or 1) for r in rows) / len(rows),
         "avgLikelihood": sum(float(r.get("likelihoodScore") or 1) for r in rows) / len(rows)}
        for tid, rows in buckets.items()]
