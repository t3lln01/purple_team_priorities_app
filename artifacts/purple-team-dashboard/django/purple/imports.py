import csv
import io
import json
import uuid
from .scoring import generated_procedures, update_hva_scores


def read_upload(upload):
    text = upload.read().decode("utf-8-sig")
    if upload.name.lower().endswith(".csv"):
        return list(csv.DictReader(io.StringIO(text)))
    return json.loads(text)


def import_data(preferences, kind, data, label=""):
    if kind == "settings":
        if not isinstance(data, dict):
            raise ValueError("Settings must be a JSON object.")
        for key, value in data.items():
            if key.startswith(("pt_", "ds_", "python_")) and not any(s in key.lower() for s in ["secret", "password", "token", "credential"]):
                preferences.setdefault(key, value)
        return
    if kind == "mitre":
        if not isinstance(data, dict) or not isinstance(data.get("objects"), list):
            raise ValueError("Upload a MITRE ATT&CK STIX bundle with an objects array.")
        impacts = []
        for obj in data["objects"]:
            if obj.get("type") != "attack-pattern" or obj.get("revoked") or obj.get("x_mitre_deprecated"):
                continue
            tid = next((ref.get("external_id") for ref in obj.get("external_references", [])
                        if ref.get("source_name") == "mitre-attack"), None)
            if not tid:
                continue
            tactics = ", ".join(p["phase_name"].replace("-", " ").title() for p in obj.get("kill_chain_phases", []))
            impacts.append({"id": tid, "name": obj.get("name", ""), "platforms": ", ".join(obj.get("x_mitre_platforms", [])),
                            "tactics": tactics, "confidentiality": "Medium", "integrity": "Medium", "availability": "Low",
                            "initialTTPExtent": 1, "finalTTPExtent": 1,
                            **{k: 0 for k in ["adScore", "containerScore", "cloudScore", "supportRemoteScore", "systemReqScore",
                                             "capecSeverityScore", "permRequiredScore", "effectivePermsScore"]}})
        if not impacts:
            raise ValueError("No active ATT&CK techniques were found in the bundle.")
        version = {"id": uuid.uuid4().hex, "label": label or "Imported ATT&CK", "impactRows": impacts, "riskRows": []}
        preferences.setdefault("pt_mitre_versions_meta", []).append(version)
        preferences["pt_active_mitre_version"] = version["id"]
    elif kind in ("actors", "reports"):
        if isinstance(data, dict) and "resources" in data:
            data = data["resources"]
        if kind == "actors":
            entries = data if isinstance(data, list) else data.get("entries", [])
            if entries and isinstance(entries[0], dict) and "entries" in entries[0]:
                preferences.setdefault("ds_actormap_files", []).extend(entries)
            else:
                if not label:
                    raise ValueError("Enter the actor name as the import label.")
                preferences.setdefault("ds_actormap_files", []).append({"actor": label.upper(), "filename": label + ".json", "entries": entries})
        else:
            if not isinstance(data, list):
                raise ValueError("Reports must be a JSON array or resources array.")
            lookup = preferences.setdefault("ds_reports_lookup", {})
            for row in data:
                key = str(row.get("slug") or row.get("reportId") or row.get("id") or "").upper()
                if key:
                    lookup[key] = row
        procs = generated_procedures(preferences.get("ds_actormap_files", []), list(preferences.get("ds_reports_lookup", {}).values()))
        preferences["pt_live_actor_data"] = {"procedures": procs, "label": label or "Imported intelligence"}
    elif kind in ("procedures", "hva"):
        if not isinstance(data, list):
            raise ValueError("Upload an array of records or a CSV file with headers.")
        if kind == "procedures":
            from .forms import ProcedureForm
            from datetime import datetime, timezone
            validated = []
            for row in data:
                values = dict(row)
                if isinstance(values.get("date"), (int, float)):
                    values["date"] = datetime.fromtimestamp(values["date"] / 1000, timezone.utc).date()
                form = ProcedureForm(values)
                if not form.is_valid():
                    raise ValueError("Invalid procedure: " + form.errors.as_text())
                clean = form.cleaned_data
                clean["date"] = datetime.combine(clean["date"], datetime.min.time(), timezone.utc).timestamp() * 1000 if clean["date"] else None
                clean.update(_id=uuid.uuid4().hex, risk=row.get("risk"), reportRefs=[])
                validated.append(clean)
            preferences.setdefault("pt_procedures_custom", []).extend(validated)
        else:
            from .forms import HVAForm
            validated = []
            for row in data:
                form = HVAForm(row)
                if not form.is_valid():
                    raise ValueError("Invalid high-value asset: " + form.errors.as_text())
                validated.append({**form.cleaned_data, "_id": uuid.uuid4().hex})
            version = preferences.get("pt_active_mitre_version") or "base"
            preferences.setdefault("pt_hva_custom:" + version, []).extend(validated)
            update_hva_scores(preferences)
    else:
        raise ValueError("Unknown import type.")
