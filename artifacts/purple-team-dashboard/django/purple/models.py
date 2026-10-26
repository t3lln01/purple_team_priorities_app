from django.db import models


class ThreatSnapshot(models.Model):
    quarter = models.TextField(primary_key=True)
    state = models.JSONField()
    saved_at = models.DateTimeField(null=True)
    seeded_from = models.TextField(null=True)
    updated_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = "threat_model_snapshots"


class Document(models.Model):
    """Durable JSON documents for imports/settings; never plaintext credentials."""
    key = models.CharField(max_length=255, primary_key=True)
    value = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "python_workspace_documents"
