"""Clerk sessions and roles, retaining the existing identity provider."""
import base64
import logging
import os
from functools import wraps
from urllib.parse import urlparse

import httpx
import jwt
from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render

ADMIN_EMAIL = "sfiliaggi@box.com"
GUEST = {"user_id": None, "email": None, "is_admin": False, "can_write": False}
log = logging.getLogger(__name__)


class IdentityError(Exception):
    def __init__(self, message, status=503):
        super().__init__(message)
        self.status = status


def clerk_api(method, path, **kwargs):
    response = httpx.request(
        method, "https://api.clerk.com/v1/" + path.lstrip("/"),
        headers={"Authorization": "Bearer " + os.environ["CLERK_SECRET_KEY"]},
        timeout=20, **kwargs,
    )
    if response.is_error:
        try:
            details = response.json().get("errors", [])
        except ValueError:
            details = []
        message = " ".join(dict.fromkeys(
            str(e.get("long_message") or e.get("message") or "") for e in details
        ))
        if response.status_code not in (400, 409, 422, 429):
            message = "The identity service is unavailable. Please try again later."
        raise IdentityError(message or "The identity service rejected the request.", response.status_code)
    return response.json() if response.content else {}


def host(request):
    return request.get_host().split(",")[0].strip().lower()


def clerk_config(request):
    configured = os.environ.get("CLERK_PUBLISHABLE_KEY", "")
    if not configured:
        return {"key": "", "script": "", "proxy": "", "signedIn": False}
    is_dev = configured.startswith("pk_test_")
    if is_dev:
        encoded = configured.split("_", 2)[2]
        frontend_host = base64.b64decode(encoded + "=" * (-len(encoded) % 4)).decode().rstrip("$")
        script = f"https://{frontend_host}/npm/@clerk/clerk-js@5/dist/clerk.browser.js"
        key, proxy = configured, ""
    else:
        frontend_host = "clerk." + host(request).split(":")[0]
        key = "pk_live_" + base64.b64encode((frontend_host + "$").encode()).decode().rstrip("=")
        proxy = request.build_absolute_uri("/api/__clerk")
        script = proxy + "/npm/@clerk/clerk-js@5/dist/clerk.browser.js"
    return {"key": key, "script": script, "proxy": proxy, "issuer": "https://" + frontend_host,
            "signedIn": bool(getattr(request, "access", GUEST)["user_id"])}


class ClerkSessionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.access = dict(GUEST)
        request.auth_error = ""
        token = request.COOKIES.get("__session")
        if token:
            try:
                keys = cache.get("clerk-jwks")
                if not keys:
                    keys = clerk_api("GET", "jwks")
                    cache.set("clerk-jwks", keys, 300)
                header = jwt.get_unverified_header(token)
                key = next((k for k in keys.get("keys", []) if k["kid"] == header.get("kid")), None)
                if key is None:
                    keys = clerk_api("GET", "jwks")
                    cache.set("clerk-jwks", keys, 300)
                    key = next((k for k in keys.get("keys", []) if k["kid"] == header.get("kid")), None)
                if key is None:
                    raise jwt.InvalidTokenError("Unknown signing key")
                claims = jwt.decode(token, jwt.PyJWK.from_dict(key).key, algorithms=["RS256"],
                                    issuer=clerk_config(request)["issuer"],
                                    options={"verify_aud": False, "require": ["exp", "iat", "sub", "iss"]},
                                    leeway=5)
                if claims.get("azp") and urlparse(claims["azp"]).netloc.lower() != host(request):
                    raise jwt.InvalidTokenError("Session origin mismatch")
                sid = claims.get("sid")
                if not sid:
                    raise jwt.InvalidTokenError("Missing session")
                # Authoritative session/user lookups retain revocation and role changes.
                session = cache.get("clerk-session:" + sid)
                if not session:
                    session = clerk_api("GET", "sessions/" + sid)
                    cache.set("clerk-session:" + sid, session, 15)
                if session.get("status") != "active" or session.get("user_id") != claims["sub"]:
                    raise jwt.InvalidTokenError("Inactive session")
                user = cache.get("clerk-user:" + claims["sub"])
                if not user:
                    user = clerk_api("GET", "users/" + claims["sub"])
                    cache.set("clerk-user:" + claims["sub"], user, 15)
                emails = user.get("email_addresses", [])
                primary = next((e for e in emails if e["id"] == user.get("primary_email_address_id")), {})
                admin = any(e.get("email_address", "").lower() == ADMIN_EMAIL
                            and e.get("verification", {}).get("status") == "verified" for e in emails)
                request.access = {"user_id": user["id"], "email": primary.get("email_address"),
                                  "is_admin": admin,
                                  "can_write": admin or user.get("public_metadata", {}).get("role") == "writer"}
            except jwt.InvalidTokenError:
                request.auth_error = "Your session expired. Sign in again to continue."
            except (IdentityError, httpx.HTTPError, ValueError, KeyError):
                request.auth_error = "Unable to verify your session. Please try again."
                log.warning("Clerk session verification unavailable")
        return self.get_response(request)


class ClerkProxyMiddleware:
    """Production FAPI proxy, before CSRF/body parsing, with explicit body lengths."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith("/api/__clerk/"):
            return self.get_response(request)
        if os.environ.get("CLERK_PUBLISHABLE_KEY", "").startswith("pk_test_"):
            return JsonResponse({"error": "Clerk proxy is production-only."}, status=404)
        path = request.get_full_path()[len("/api/__clerk"):]
        if path.startswith("//"):
            return HttpResponse(status=400)
        headers = {k: v for k, v in request.headers.items()
                   if k.lower() not in {"host", "connection", "content-length", "accept-encoding",
                                        "clerk-secret-key", "clerk-proxy-url"}}
        headers.update({"Clerk-Secret-Key": os.environ["CLERK_SECRET_KEY"],
                        "Clerk-Proxy-Url": request.build_absolute_uri("/api/__clerk")})
        try:
            upstream = httpx.request(request.method, "https://frontend-api.clerk.dev" + path,
                                     headers=headers, content=request.body, timeout=30, follow_redirects=False)
            response = HttpResponse(upstream.content, status=upstream.status_code)
            for key, value in upstream.headers.items():
                if key.lower() not in {"connection", "transfer-encoding", "content-length", "content-encoding", "set-cookie"}:
                    response[key] = value
            for cookie in upstream.headers.get_list("set-cookie"):
                response.cookies.load(cookie)
            response["Content-Length"] = str(len(upstream.content))
            return response
        except httpx.HTTPError:
            return JsonResponse({"error": "Identity service is temporarily unavailable."}, status=502)


def require_access(write=False, admin=False):
    def decorate(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            access = request.access
            status = 401 if not access["user_id"] else 403
            if not access["user_id"] or (write and not access["can_write"]) or (admin and not access["is_admin"]):
                message = ("Sign in to access this resource." if status == 401
                           else "Administrator access required." if admin else "This account has view-only access.")
                if request.path.startswith("/api/"):
                    return JsonResponse({"ok": False, "error": message}, status=status)
                return render(request, "error.html", {"title": "Access required", "error": message, "status": status}, status=status)
            return view(request, *args, **kwargs)
        return wrapped
    return decorate
