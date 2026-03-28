#!/usr/bin/env python3
import os
import django


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    django.setup()

    from django.contrib.auth import get_user_model
    from apps.authentication.services import initiate_password_reset
    from apps.staff.services import send_invitation, create_staff_with_invitation
    from apps.hospitals.services import submit_registration_request, approve_registration_request
    from apps.hospitals.models import Hospital

    TARGET = "arpitadas59321@gmail.com"

    User = get_user_model()
    user, created = User.objects.get_or_create(email=TARGET, defaults={"is_active": True})
    if created:
        user.set_password("TestPass123!")
        user.save()

    print("Triggering password reset for:", TARGET)
    initiate_password_reset(TARGET)
    print("Password reset email queued/sent.")

    print("Creating or reusing hospital registration request...")
    from apps.hospitals.models import HospitalRegistrationRequest

    reg = HospitalRegistrationRequest.objects.filter(email=TARGET).first()
    if reg is None:
        reg = submit_registration_request(
            {
                "name": "Test Hospital (Email Test)",
                "registration_number": "EMAIL-TEST-001",
                "email": TARGET,
                "phone": "0000000000",
                "website": "",
                "address": "Test address",
                "city": "Test City",
                "state": "TS",
                "country": "Testland",
                "hospital_type": "general",
            }
        )
        print("Registration created:", reg.id)
    else:
        print("Found existing registration:", reg.id, "status:", reg.status)

    if reg.status != HospitalRegistrationRequest.Status.ACTIVE:
        print("Approving registration (will send approval email)...")
        approve_registration_request(reg, actor=None)
        print("Registration approved — approval email sent.")
    else:
        print("Registration already active — skipping approval email.")

    # Ensure Hospital exists to send staff invitation (try by registration number or fallback to email)
    hospital = Hospital.objects.filter(registration_number="EMAIL-TEST-001").first()
    if not hospital:
        hospital = Hospital.objects.filter(email=TARGET).first()
    if not hospital:
        hospital = Hospital.objects.create(name="Test Hospital (Email Test)", registration_number="EMAIL-H-001", email=TARGET)

    print("Sending invitation via send_invitation() if no pending invitation exists...")
    from apps.staff.models import Invitation

    if Invitation.objects.filter(hospital=hospital, email=TARGET, status=Invitation.Status.PENDING).exists():
        print("A pending invitation already exists for this email — skipping send_invitation().")
    else:
        send_invitation(hospital=hospital, email=TARGET, actor=None)
        print("Invitation email sent via send_invitation().")

    print("Creating staff + invitation via create_staff_with_invitation() if no active user exists...")
    existing_active = User.objects.filter(email=TARGET, is_active=True).first()
    if existing_active:
        print("Active user already exists for this email — skipping create_staff_with_invitation().")
    else:
        create_staff_with_invitation(hospital=hospital, data={"first_name": "Email", "last_name": "Tester"}, email=TARGET, actor=None)
        print("create_staff_with_invitation completed — invitation email sent.")


if __name__ == "__main__":
    main()
