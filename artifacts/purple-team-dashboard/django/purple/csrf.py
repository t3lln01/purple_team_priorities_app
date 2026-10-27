"""Session-bound CSRF protection for authenticated embedded pages."""
from django.middleware.csrf import CsrfViewMiddleware
from django.utils.cache import patch_cache_control, patch_vary_headers
from django.utils.crypto import salted_hmac


class ClerkCsrfMiddleware(CsrfViewMiddleware):
    """Use the verified Clerk session instead of an extra third-party cookie.

    Keep Django's masked form tokens and Origin/Referer checks unchanged.
    The HMAC is server-keyed and session-specific, so a token issued to another
    session cannot authorize a request. Anonymous requests retain Django's
    ordinary cookie-based CSRF protection.
    """

    def _session_id(self, request):
        access = getattr(request, "access", {})
        return access.get("session_id") if access.get("user_id") else None

    def _get_secret(self, request):
        sid = self._session_id(request)
        if sid:
            return salted_hmac("purple.clerk.csrf.v1", sid, algorithm="sha256").hexdigest()[:32]
        return super()._get_secret(request)

    def _set_csrf_cookie(self, request, response):
        if not self._session_id(request):
            super()._set_csrf_cookie(request, response)

    def process_response(self, request, response):
        response = super().process_response(request, response)
        if self._session_id(request):
            patch_cache_control(response, private=True, no_store=True)
            patch_vary_headers(response, ("Cookie",))
        return response
