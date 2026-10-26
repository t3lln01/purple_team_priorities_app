import json
from datetime import datetime
from django.core.management.base import BaseCommand
from django.utils import timezone
from purple.models import ThreatSnapshot
from purple.store import LEGACY_API, sync_state


class Command(BaseCommand):
    help = "Import bundled legacy data only if absent. Never overwrite an existing quarter."

    def handle(self, *args, **options):
        path = LEGACY_API / "cs-threat-model-versions.json"
        imported = 0
        if path.exists():
            with path.open() as file:
                entries = json.load(file)
            for quarter, value in entries.items():
                saved = value.pop("savedAt", None)
                seeded = value.pop("seededFrom", None)
                _, created = ThreatSnapshot.objects.get_or_create(quarter=quarter, defaults={
                    "state": value, "saved_at": datetime.fromisoformat(saved.replace("Z", "+00:00")) if saved else None,
                    "seeded_from": seeded, "updated_at": timezone.now(),
                })
                imported += int(created)
        sync_state()
        self.stdout.write(f"Imported {imported} missing legacy snapshots; existing records preserved.")
