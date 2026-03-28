import requests, sys, json
HOST = "http://127.0.0.1:8080"

def login(email, password):
    r = requests.post(f"{HOST}/api/auth/login/", json={"email": email, "password": password})
    try:
        return r.json()["data"]
    except Exception:
        print("Login failed:", r.status_code, r.text)
        sys.exit(1)

print("Logging in as HOSPITAL_ADMIN...")
hdata = login("hospital_admin@medibridge.com", "HospAdmin@123")
h_token = hdata["access"]
hid = hdata["user"].get("hospital_id")
print("H_TOKEN:", h_token[:12] + "...", "hospital_id=", hid)

if not hid:
    print("Could not determine hospital id for hospital admin.")
    sys.exit(1)

print("Submitting offboarding request (1) - will be rejected")
payload = {"reason": "We are migrating to another platform (test reject)"}
r = requests.post(f"{HOST}/api/v1/hospitals/{hid}/offboarding-request/", json=payload, headers={"Authorization": f"Bearer {h_token}"})
print("CREATE1 status", r.status_code, r.text)
if r.status_code >= 300:
    sys.exit(1)
OR1 = r.json()["data"]["id"]
print("OR1 id=", OR1)

print("Logging in as SUPER_ADMIN...")
sa = login("admin@medibridge.com", "Admin@1234")
sa_token = sa["access"]
print("SA_TOKEN:", sa_token[:12] + "...")

print("Rejecting offboarding request 1...")
r2 = requests.post(f"{HOST}/api/v1/admin/hospital-offboarding-requests/{OR1}/reject/", json={"admin_notes": "Not approved at this time."}, headers={"Authorization": f"Bearer {sa_token}"})
print("REJECT status", r2.status_code, r2.text)
print("Refreshing hospital admin login and submitting offboarding request (2) - will be approved")
# Re-login hospital admin to refresh token in case it was invalidated
hdata2 = login("hospital_admin@medibridge.com", "HospAdmin@123")
h_token = hdata2["access"]
payload2 = {"reason": "We are migrating to another platform (test approve)"}
r3 = requests.post(f"{HOST}/api/v1/hospitals/{hid}/offboarding-request/", json=payload2, headers={"Authorization": f"Bearer {h_token}"})
print("CREATE2 status", r3.status_code, r3.text)
if r3.status_code >= 300:
    sys.exit(1)
OR2 = r3.json()["data"]["id"]
print("OR2 id=", OR2)

print("Approving offboarding request 2...")
r4 = requests.post(f"{HOST}/api/v1/admin/hospital-offboarding-requests/{OR2}/approve/", json={"admin_notes": "Approved for offboarding."}, headers={"Authorization": f"Bearer {sa_token}"})
print("APPROVE status", r4.status_code, r4.text)

print("Listing admin offboarding requests (super-admin)...")
r5 = requests.get(f"{HOST}/api/v1/admin/hospital-offboarding-requests/", headers={"Authorization": f"Bearer {sa_token}"})
print("LIST status", r5.status_code, r5.text)

print("Done")
