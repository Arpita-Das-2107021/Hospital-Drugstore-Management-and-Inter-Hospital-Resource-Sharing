#!/bin/sh
# Entrypoint script for Django backend with existing database

echo "Database is ready (via healthcheck). Starting Django..."

echo "Faking Django built-in migrations (database already has custom schema)..."
python manage.py migrate --fake-initial admin 2>/dev/null || true
python manage.py migrate --fake-initial auth 2>/dev/null || true
python manage.py migrate --fake-initial contenttypes 2>/dev/null || true
python manage.py migrate --fake-initial sessions 2>/dev/null || true
python manage.py migrate --fake-initial authtoken 2>/dev/null || true
python manage.py migrate --fake-initial token_blacklist 2>/dev/null || true

echo "Running resources app migrations..."
python manage.py migrate resources --fake-initial 2>/dev/null || true

echo "Collecting static files..."
python manage.py collectstatic --noinput || true

echo "Starting Gunicorn..."
exec gunicorn hospital_backend.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120
