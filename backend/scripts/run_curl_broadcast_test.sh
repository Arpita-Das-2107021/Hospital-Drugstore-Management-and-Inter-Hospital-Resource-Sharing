#!/usr/bin/env bash
set -e
HOST=http://127.0.0.1:8080

echo "Logging in as SUPER_ADMIN..."
SA_JSON=$(curl -s -X POST "$HOST/api/auth/login/" -H "Content-Type: application/json" -d '{"email":"admin@medibridge.com","password":"Admin@1234"}')
SA_TOKEN=$(echo "$SA_JSON" | python -c 'import sys,json; print(json.load(sys.stdin)["data"]["access"])')
echo "SA_TOKEN=${SA_TOKEN:0:12}..."

echo "Creating broadcast..."
CREATE=$(curl -s -X POST "$HOST/api/v1/broadcasts/" -H "Content-Type: application/json" -H "Authorization: Bearer $SA_TOKEN" -d '{"title":"Curl Test Alert","message":"This is a curl test","scope":"all","priority":"emergency","allow_response":true}')
echo "CREATE=$CREATE"
BID=$(echo "$CREATE" | python -c 'import sys,json; print(json.load(sys.stdin)["data"]["id"])')
echo "BID=$BID"

echo "Logging in as HOSPITAL_ADMIN..."
H_JSON=$(curl -s -X POST "$HOST/api/auth/login/" -H "Content-Type: application/json" -d '{"email":"hospital_admin@medibridge.com","password":"HospAdmin@123"}')
H_TOKEN=$(echo "$H_JSON" | python -c 'import sys,json; print(json.load(sys.stdin)["data"]["access"])')
echo "H_TOKEN=${H_TOKEN:0:12}..."

echo "Submitting response..."
RESP=$(curl -s -X POST "$HOST/api/v1/broadcasts/$BID/respond/" -H "Content-Type: application/json" -H "Authorization: Bearer $H_TOKEN" -d '{"response":"We can provide 2 ventilators","can_provide":true,"quantity_available":2}')
echo "RESP=$RESP"

echo "Listing responses as SUPER_ADMIN..."
LIST=$(curl -s -X GET "$HOST/api/v1/broadcasts/$BID/responses/" -H "Authorization: Bearer $SA_TOKEN")
echo "LIST=$LIST"

echo "Closing broadcast..."
CLOSE=$(curl -s -X POST "$HOST/api/v1/broadcasts/$BID/close/" -H "Authorization: Bearer $SA_TOKEN")
echo "CLOSE=$CLOSE"

echo "Attempting late response (should fail)..."
LATE_STATUS=$(curl -s -o /tmp/late_resp -w "%{http_code}" -X POST "$HOST/api/v1/broadcasts/$BID/respond/" -H "Content-Type: application/json" -H "Authorization: Bearer $H_TOKEN" -d '{"response":"Late","can_provide":false}')
echo "LATE_STATUS=$LATE_STATUS"
cat /tmp/late_resp
