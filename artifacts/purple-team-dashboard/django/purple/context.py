from .auth import clerk_config, GUEST

NAVIGATION = [
    ("/dashboard", "Actor Prioritisation"), ("/threat-model", "Threat Model"),
    ("/risk-calculation", "Risk Calculation"), ("/impact-table", "Impact Table"),
    ("/likelihood-table", "Likelihood Table"), ("/high-value-assets", "High Value Assets"),
    ("/tid-priority", "TID Priority"), ("/tactics-scores", "Tactic Scores"),
    ("/risk-rate", "Risk Rate"), ("/all-procedures", "All Procedures"),
    ("/data-sources", "Data Sources"), ("/api-docs", "API"), ("/users", "Users"),
]


def common(request):
    config = clerk_config(request)
    access = getattr(request, "access", GUEST)
    return {"access": access, "auth_error": getattr(request, "auth_error", ""),
            "navigation": [{"path": path, "label": label} for path, label in NAVIGATION
                           if path != "/users" or access["is_admin"]],
            "clerk_config": config, "clerk_key": config["key"],
            "clerk_script_url": config["script"], "clerk_proxy_url": config["proxy"]}
