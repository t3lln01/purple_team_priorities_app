from django.urls import path
from django.shortcuts import redirect
from purple import views, api

urlpatterns = [
    path("", lambda request: redirect("/dashboard")),
    path("sign-in", views.sign_in),
    path("sign-in/<path:rest>", lambda request, rest: views.sign_in(request)),
    path("threat-model", views.threat_model),
    path("threat-model/actor/<str:action>", views.actor_edit),
    path("threat-model/enrich", views.enrich),
    path("threat-model/<str:action>", views.assessment_action),
    path("edit/<str:slug>", views.edit_record),
    path("delete/<str:slug>", lambda request, slug: views.edit_record(request, slug, delete=True)),
    path("users", views.users),
    path("users/new", views.users),
    path("data-sources", views.sources),
    path("data-sources/<str:action>", views.source_action),
    path("api-docs", api.api_docs),
    path("api", api.health),
    path("api/healthz", api.health),
    path("api/health", api.health),
    path("api/access/me", api.access_me),
    path("api/access/users", api.users),
    path("api/browser-import", api.browser_import),
    path("api/cs/<path:endpoint>", api.cs),
    path("api/export", api.export),
    path("api/export/<path:endpoint>", api.export),
    path("<slug:slug>", views.table_page),
]
