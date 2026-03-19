import requests
import json
import os
import time
import re

CLIENT_ID = "30f4085805aa41a2bae438556979ef33"
CLIENT_SECRET = "6pczJARmQE5es7HT8Xy2W0rG1iuo93IZvj4CdaUP"

BASE_URL = "https://api.us-2.crowdstrike.com"

OUTPUT_DIR = "actor_mitre_reports"
os.makedirs(OUTPUT_DIR, exist_ok=True)


def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "_", name)


def get_token():
    r = requests.post(
        f"{BASE_URL}/oauth2/token",
        data={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET},
    )
    r.raise_for_status()
    return r.json()["access_token"]


def get_actor_ids(headers):

    actor_ids = []
    offset = None

    while True:

        params = {"limit": 1000}

        if offset:
            params["offset"] = offset

        r = requests.get(
            f"{BASE_URL}/intel/queries/actors/v1",
            headers=headers,
            params=params,
        )

        r.raise_for_status()
        data = r.json()

        actor_ids.extend(data["resources"])

        offset = data["meta"]["pagination"].get("offset")

        if not offset:
            break

    return actor_ids


def get_actor_details(headers, ids):

    r = requests.get(
        f"{BASE_URL}/intel/entities/actors/v1",
        headers=headers,
        params=[("ids", i) for i in ids]
    )

    r.raise_for_status()

    data = r.json()

    return data.get("resources", [])


def get_mitre_reports(headers, actor_id):

    r = requests.get(
        f"{BASE_URL}/intel/entities/mitre-reports/v1",
        headers=headers,
        params={"actor_id": actor_id, "format": "JSON"},
    )

    if r.status_code != 200:
        print(f"MITRE query failed for {actor_id}: {r.text}")
        return {}

    return r.json()


def main():

    token = get_token()

    headers = {"Authorization": f"Bearer {token}"}

    actor_ids = get_actor_ids(headers)

    print(f"Total actors found: {len(actor_ids)}")

    actors = get_actor_details(headers, actor_ids)

    print(f"Actor details retrieved: {len(actors)}")

    if not actors:
        print("No actor details returned from API")
        return

    for actor in actors:

        actor_id = actor["id"]
        actor_name = sanitize_filename(actor["name"])

        print(f"Processing actor: {actor_name}")

        reports = get_mitre_reports(headers, actor_id)

        filepath = os.path.join(
            OUTPUT_DIR,
            f"{actor_name}.json"
        )

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(reports, f, indent=2)

        time.sleep(0.2)

    print("Done")


if __name__ == "__main__":
    main()