from django.core.management.base import BaseCommand
from purple.crowdstrike import run_sync


class Command(BaseCommand):
    help = "Run a CrowdStrike sync (safe to schedule; PostgreSQL lock prevents duplicates)."

    def handle(self, *args, **options):
        run_sync()
        self.stdout.write("CrowdStrike sync finished. Check Data Sources for result.")
