from unittest.mock import patch
from django.test import TestCase, Client, RequestFactory
from django.utils import timezone
from .models import ThreatSnapshot
from . import scoring, api, views
from .store import EMPTY_STATE, save_snapshot, ConflictError, revision, current_quarter
import copy


class MigrationTests(TestCase):
    databases = {"default"}

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Unmanaged existing table isn't created by Django's test migrations.
        from django.db import connection
        with connection.schema_editor() as editor:
            editor.create_model(ThreatSnapshot)

    @classmethod
    def tearDownClass(cls):
        from django.db import connection
        with connection.schema_editor() as editor:
            editor.delete_model(ThreatSnapshot)
        super().tearDownClass()

    def test_public_pages_and_security(self):
        client = Client()
        for path in ["/risk-calculation", "/impact-table", "/likelihood-table", "/high-value-assets",
                     "/tid-priority", "/tactics-scores", "/risk-rate", "/all-procedures",
                     "/data-sources", "/users", "/sign-in", "/api-docs", "/dashboard"]:
            response = client.get(path)
            self.assertIn(response.status_code, (200, 401), path)
        for path in ["/api/cs/sync-result", "/api/access/users", "/api/export/threat-model", "/api/export/actor-prioritisation"]:
            self.assertEqual(client.get(path).status_code, 401, path)
        self.assertEqual(client.post("/api/browser-import", data="{}", content_type="application/json").status_code, 401)

    def test_risk_coverage_and_formula(self):
        rows = scoring.risk_rows({})
        self.assertEqual(len(rows), 656)
        for row in rows:
            self.assertAlmostEqual(row["Risk Scores"], row["Impact Score"] * row["Likelihood Score"])

    def test_snapshot_atomic_and_conflict(self):
        original = copy.deepcopy(EMPTY_STATE)
        original["customActors"] = [{"name": "TEST ACTOR", "intentFinalScore": 3, "capabilityFinalScore": 4}]
        original["monitoringState"] = {"TEST ACTOR": True}
        saved = save_snapshot("Q1 2028", original, expected="")
        self.assertEqual(ThreatSnapshot.objects.get(quarter="Q1 2028").state, original)
        with self.assertRaises(ConflictError):
            save_snapshot("Q1 2028", copy.deepcopy(EMPTY_STATE), expected="")
        updated = save_snapshot("Q1 2028", original, expected=revision(saved))
        self.assertEqual(updated.state["customActors"][0]["name"], "TEST ACTOR")

    def test_priority_distinct_all_time(self):
        state = copy.deepcopy(EMPTY_STATE)
        state["customActors"] = [{"name": "TEST", "intentFinalScore": 3, "capabilityFinalScore": 4}]
        state["monitoringState"] = {"TEST": True}
        procs = [{"actor": "TEST", "mitreId": tid, "procedure": "observed", "risk": risk}
                 for tid, risk in [("T1001", 10), ("T1001", 10), ("T1002", 30)]]
        with patch("purple.scoring.procedures", return_value=procs):
            result = scoring.actor_priorities(state, state, {})
        actor = next(r for r in result if r["name"] == "TEST")
        self.assertEqual(actor["tidCount"], 2)
        self.assertEqual(actor["priority"], 240)

    def test_user_password_minimum(self):
        from .forms import UserForm
        self.assertFalse(UserForm({"email": "test@example.com", "password": "short"}).is_valid())
        self.assertTrue(UserForm({"email": "test@example.com", "password": "long-test-passphrase-123"}).is_valid())

    def test_writer_draft_save_and_csrf(self):
        from .auth import ClerkSessionMiddleware
        def authenticate(middleware, request):
            request.access = {"user_id": "test-writer", "email": "writer@example.com", "is_admin": False, "can_write": True}
            return middleware.get_response(request)
        with patch.object(ClerkSessionMiddleware, "__call__", authenticate):
            client = Client(enforce_csrf_checks=True)
            self.assertEqual(client.get("/users").status_code, 403)
            target = "/threat-model/actor/new?quarter=Q1+2099"
            self.assertEqual(client.get(target).status_code, 200)
            values = {"name": "DRAFT TEST", "intentFinalScore": "3", "capabilityFinalScore": "4", "inMonitoringList": "on"}
            self.assertEqual(client.post(target, values).status_code, 403)
            token = client.cookies["csrftoken"].value
            values["csrfmiddlewaretoken"] = token
            self.assertEqual(client.post(target, values).status_code, 302)
            self.assertFalse(ThreatSnapshot.objects.filter(quarter="Q1 2099").exists())
            response = client.get("/threat-model?quarter=Q1+2099")
            self.assertContains(response, "DRAFT TEST")
            self.assertContains(response, '<option value="Q1 2099" selected>')
            response = client.post("/threat-model?quarter=Q1+2099", {
                "csrfmiddlewaretoken": token, "revision": "", "monitored": ["DRAFT TEST"], "ppTapList": "DRAFT TEST", "sirtList": ""})
            self.assertEqual(response.status_code, 302)
            saved = ThreatSnapshot.objects.get(quarter="Q1 2099")
            self.assertEqual(saved.state["customActors"][0]["intentFinalScore"], 3)
            self.assertTrue(saved.state["monitoringState"]["DRAFT TEST"])
            self.assertEqual(saved.state["ppTapList"], ["DRAFT TEST"])
            self.assertContains(client.get("/threat-model?quarter=Q1+2099"), "DRAFT TEST")

    def test_authenticated_templates(self):
        factory = RequestFactory()
        for slug in views.TABLES:
            request = factory.get("/" + slug)
            request.access = {"user_id": "test", "email": "test@example.com", "is_admin": True, "can_write": True}
            request.session = {}
            with patch("purple.scoring.sync_state", return_value={"actors": [], "reports": []}):
                response = views.table_page(request, slug)
            self.assertEqual(response.status_code, 200, slug)
        request = factory.get("/threat-model")
        request.access = {"user_id": "test", "email": "test@example.com", "is_admin": True, "can_write": True}
        request.session = {}
        self.assertEqual(views.threat_model(request).status_code, 200)
