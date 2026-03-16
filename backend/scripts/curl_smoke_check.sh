#!/bin/sh
set -eu

BASE_URL="${1:-http://127.0.0.1:8080}"
LOGIN_FILE="${2:-/app/login.json}"

RESP=$(curl -sS -m 20 -H "Content-Type: application/json" --data-binary "@${LOGIN_FILE}" "${BASE_URL}/api/auth/login/")
TOKEN=$(echo "$RESP" | sed -n 's/.*"access":"\([^"]*\)".*/\1/p')
REFRESH=$(echo "$RESP" | sed -n 's/.*"refresh":"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
  echo "Login failed or token missing"
  echo "$RESP"
  exit 1
fi

echo "LOGIN_TOKEN_LENGTH=${#TOKEN}"
echo "REFRESH_TOKEN_LENGTH=${#REFRESH}"

echo "AUTH_CHECKS"
curl -sS -o /dev/null -m 20 -w "/api/auth/login/ code:%{http_code} time:%{time_total}s\n" \
  -H "Content-Type: application/json" \
  --data-binary "@${LOGIN_FILE}" \
  "${BASE_URL}/api/auth/login/"

curl -sS -o /dev/null -m 20 -w "/api/auth/refresh/ code:%{http_code} time:%{time_total}s\n" \
  -H "Content-Type: application/json" \
  --data "{\"refresh\":\"${REFRESH}\"}" \
  "${BASE_URL}/api/auth/refresh/"

curl -sS -o /dev/null -m 20 -w "/api/auth/logout/ code:%{http_code} time:%{time_total}s\n" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  --data "{\"refresh\":\"${REFRESH}\"}" \
  "${BASE_URL}/api/auth/logout/"

for ep in \
  /api/auth/me/ \
  /api/schema/ \
  /api/v1/docs/ \
  /api/health/ \
  /api/v1/hospitals/ \
  /api/v1/hospital-registration/ \
  /api/v1/admin/hospital-registrations/ \
  /api/v1/admin/hospital-update-requests/ \
  /api/v1/admin/hospital-offboarding-requests/ \
  /api/v1/resources/ \
  /api/v1/inventory/ \
  /api/v1/requests/ \
  /api/v1/shipments/ \
  /api/v1/staff/ \
  /api/v1/invitations/ \
  /api/v1/roles/ \
  /api/v1/catalog/ \
  /api/v1/resource-shares/ \
  /api/v1/broadcasts/ \
  /api/v1/emergency-broadcasts/ \
  /api/v1/notifications/ \
  /api/v1/conversations/ \
  /api/v1/templates/ \
  /api/v1/analytics/ \
  /api/v1/credits/ \
  /api/v1/audit-logs/ \
  /api/v1/integrations/ \
  /api/v1/public/ \
  /api/v1/chat/direct-conversations/
do
  curl -sS -o /dev/null -m 20 -w "${ep} code:%{http_code} time:%{time_total}s\n" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${BASE_URL}${ep}"
done
