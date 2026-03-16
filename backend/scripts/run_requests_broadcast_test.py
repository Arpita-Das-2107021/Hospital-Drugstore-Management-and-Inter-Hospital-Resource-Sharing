import requests, sys, json
HOST = "http://127.0.0.1:8080"

def login(email, password):
    r = requests.post(f"{HOST}/api/auth/login/", json={"email": email, "password": password})
    try:
        return r.json()["data"]["access"]
    except Exception:
        print("Login failed:", r.status_code, r.text)
        sys.exit(1)

print("Logging in as SUPER_ADMIN...")
sa_token = login("admin@medibridge.com", "Admin@1234")
print("SA_TOKEN:", sa_token[:12] + "...")

print("Creating broadcast...")
create_payload = {
    "title": "Requests Test Alert",
    "message": "This is a requests-based test",
    "scope": "all",
    "priority": "emergency",
    "allow_response": True,
}
r = requests.post(f"{HOST}/api/v1/broadcasts/", json=create_payload, headers={"Authorization": f"Bearer {sa_token}"})
print("CREATE status", r.status_code, r.text)
if r.status_code >= 300:
    sys.exit(1)
BID = r.json()["data"]["id"]
print("BID=", BID)

print("Logging in as HOSPITAL_ADMIN...")
h_token = login("hospital_admin@medibridge.com", "HospAdmin@123")
print("H_TOKEN:", h_token[:12] + "...")

print("Submitting response...")
resp_payload = {"response": "We can provide 2 ventilators", "can_provide": True, "quantity_available": 2}
r2 = requests.post(f"{HOST}/api/v1/broadcasts/{BID}/respond/", json=resp_payload, headers={"Authorization": f"Bearer {h_token}"})
print("RESP status", r2.status_code, r2.text)

print("Listing responses as SUPER_ADMIN...")
r3 = requests.get(f"{HOST}/api/v1/broadcasts/{BID}/responses/", headers={"Authorization": f"Bearer {sa_token}"})
print("LIST status", r3.status_code, r3.text)

print("Closing broadcast...")
r4 = requests.post(f"{HOST}/api/v1/broadcasts/{BID}/close/", headers={"Authorization": f"Bearer {sa_token}"})
print("CLOSE status", r4.status_code, r4.text)

print("Attempting late response (should fail)...")
r5 = requests.post(f"{HOST}/api/v1/broadcasts/{BID}/respond/", json={"response": "Late", "can_provide": False}, headers={"Authorization": f"Bearer {h_token}"})
print("LATE status", r5.status_code, r5.text)

print("Done")
