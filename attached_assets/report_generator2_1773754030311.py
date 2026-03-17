import os
import json
import glob
import csv
import datetime
import pandas as pd
from typing import Dict, List, Optional

"""
CrowdStrike report generator (v2)
--------------------------------
(unchanged docstring)
"""

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------
json_folder = './actor_mitre_reports'
report_csv_path = 'crowstrike.csv'
output_csv_path = 'final_output.csv'

CSV_DATE_FMT = '%d/%m/%Y'

# ---------------------------------------------------------------------------
# STEP 1 ─ Read the report CSV into a lookup dictionary
# ---------------------------------------------------------------------------
report_lookup: Dict[str, Dict[str, str]] = {}

with open(report_csv_path, newline='', encoding='utf-8-sig') as csvfile:
    reader = csv.DictReader(csvfile, skipinitialspace=True)
    print('[INFO] CSV headers found:', reader.fieldnames)

    for row in reader:
        url_field  = 'url'        if 'url'        in row else 'Report url'
        id_field   = 'id'         if 'id'         in row else 'Report id'
        name_field = 'name'       if 'name'       in row else 'Report name'
        date_field = 'date'
        actor_field = 'actor' if 'actor' in row else None

        missing = [f for f in (url_field, id_field, name_field, date_field)
                   if f not in row or row[f] == '']
        if missing:
            print(f'[WARN] Row missing required columns {missing}; skipping')
            continue

        rep_id = row[id_field].strip().upper()
        report_lookup[rep_id] = {
            'url':   row[url_field].strip(),
            'name':  row[name_field].strip(),
            'date':  row[date_field].strip(),
        }
        if actor_field:
            report_lookup[rep_id]['actor'] = row[actor_field].strip()

print(f'[INFO] Loaded {len(report_lookup):,} reports from CSV')

# ---------------------------------------------------------------------------
# STEP 2 ─ Process JSON files and build output rows
# ---------------------------------------------------------------------------
output_rows: List[Dict[str, str]] = []
headers = [
    'Group or Malware', 'mitre_attack_id', 'external_references',
    'description', 'Procedure', 'date', 'source'
]

json_files = glob.glob(os.path.join(json_folder, '*.json'))
print(f'[INFO] Found {len(json_files)} JSON files')

for json_file in json_files:
    # threat_actor = os.path.splitext(os.path.basename(json_file))[0].replace('-', ' ').title() #enable it if JSON files are named like ABC-PANDA.json
    threat_actor = os.path.splitext(os.path.basename(json_file))[0].title() #enable it if JSON files are named like ABC PANDA.json
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        print(f'[ERROR] Failed to decode {json_file}: {exc}')
        continue

    if isinstance(data, list):
        api_objects = data
    elif isinstance(data, dict):
        api_objects = data.get('api_object', [])
    else:
        print(f'[WARN] Unrecognised JSON top-level type in {json_file}: {type(data).__name__}; skipping')
        continue

    for idx, obj in enumerate(api_objects, 1):

        if not isinstance(obj, dict):
            print(f'[WARN] {json_file} item #{idx} is not a dict (type {type(obj).__name__}); skipping')
            continue

        technique_id = str(obj.get('technique_id', '')).upper()
        if not technique_id:
            print(f'[WARN] {json_file} item #{idx} has no technique_id; skipping')
            continue

        observables = obj.get('observables', [])
        if isinstance(observables, list):
            observables_text = ' '.join(map(str, observables)).strip()
        else:
            observables_text = str(observables).strip()

        description = f'[{threat_actor}] - {observables_text}' if observables_text else f'[{threat_actor}] -'

        # ---------- FIXED TYPE HINTS HERE ----------
        best_report: Optional[Dict[str, str]] = None
        best_date: Optional[datetime.datetime] = None
        # -------------------------------------------

        reports_iterable = obj.get('reports', [])
        if not isinstance(reports_iterable, list):
            reports_iterable = [reports_iterable]

        for rep_id in reports_iterable:
            rep_id_norm = str(rep_id).strip().upper()
            rep_info = report_lookup.get(rep_id_norm)
            if not rep_info:
                continue

            try:
                rep_date = datetime.datetime.strptime(rep_info['date'], CSV_DATE_FMT)
            except ValueError as exc:
                print(f'[WARN] Bad date "{rep_info["date"]}" for report {rep_id_norm}: {exc}')
                continue

            if best_date is None or rep_date > best_date:
                best_date = rep_date
                best_report = rep_info

        if best_report is None:
            continue

        output_rows.append({
            'Group or Malware': threat_actor,
            'mitre_attack_id': technique_id,
            'external_references': f'{threat_actor.upper()} {best_report["name"]} - {best_report["url"]}',
            'description': description,
            'Procedure': '',
            'date': best_report['date'],
            'source': 'CROWDSTRIKE',
        })

print(f'[INFO] Generated {len(output_rows):,} rows')

# ---------------------------------------------------------------------------
# STEP 3 ─ Emit merged CSV
# ---------------------------------------------------------------------------
if output_rows:
    pd.DataFrame(output_rows, columns=headers).to_csv(output_csv_path,
                                                     index=False,
                                                     encoding='utf-8')
    print(f'[SUCCESS] Output CSV written to {output_csv_path}')
else:
    print('[WARN] No matching data found; output CSV has not been created')
