import os
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACE = BASE_DIR.parents[2]
SECRET_KEY = os.environ["SESSION_SECRET"]
DEBUG = os.environ.get("NODE_ENV") != "production" and os.environ.get("DJANGO_ENV") != "production"
ALLOWED_HOSTS = ["*"]  # Replit supplies preview/custom hosts; Clerk checks token origins.
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
INSTALLED_APPS = ["django.contrib.contenttypes", "django.contrib.messages", "django.contrib.staticfiles", "purple"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "purple.auth.ClerkProxyMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "purple.auth.ClerkSessionMiddleware",
    "purple.csrf.ClerkCsrfMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [BASE_DIR / "templates"],
              "APP_DIRS": True, "OPTIONS": {"context_processors": [
                  "django.template.context_processors.request", "django.contrib.messages.context_processors.messages",
                  "purple.context.common",
              ]}}]
db = urlparse(os.environ["DATABASE_URL"])
DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql", "NAME": db.path.lstrip("/"),
                         "USER": unquote(db.username or ""), "PASSWORD": unquote(db.password or ""), "HOST": db.hostname, "PORT": db.port or 5432,
                         "CONN_MAX_AGE": 60, "OPTIONS": {"sslmode": parse_qs(db.query).get("sslmode", ["prefer"])[0]}}}
SESSION_ENGINE = "django.contrib.sessions.backends.signed_cookies"
SESSION_COOKIE_HTTPONLY = True
# Both preview and production are HTTPS, including inside the cross-site Replit
# preview iframe. Lax cookies are not sent on its form submissions.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "None"
CSRF_COOKIE_SAMESITE = "None"
CSRF_FAILURE_VIEW = "purple.views.csrf_failure"
X_FRAME_OPTIONS = "SAMEORIGIN"
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
STORAGES = {"default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
            "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"}}
WHITENOISE_USE_FINDERS = DEBUG
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "UTC"
DATA_UPLOAD_MAX_MEMORY_SIZE = 40 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 40 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = 10000
LOGGING = {"version": 1, "disable_existing_loggers": False,
           "handlers": {"console": {"class": "logging.StreamHandler"}},
           "root": {"handlers": ["console"], "level": "INFO"}}
