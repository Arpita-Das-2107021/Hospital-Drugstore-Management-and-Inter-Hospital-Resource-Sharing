-- Clean all data except for cred.txt users and their roles
SET session_replication_role = 'replica';

-- Truncate all non-auth tables (CASCADE for FKs)
TRUNCATE analytics_creditled, audit_auditlog, axes_accessattempt, axes_accessfailurelog, axes_accesslog, communications_conversation, communications_message, communications_participant, communications_template, django_admin_log, django_celery_beat_clockedschedule, django_celery_beat_crontabschedule, django_celery_beat_intervalschedule, django_celery_beat_periodictask, django_celery_beat_periodictasks, django_celery_beat_solarschedule, django_content_type, django_migrations, django_session, hospital, hospital_api_config, hospital_capacity, hospital_partnership, hospital_registration_request, notifications_broadcast, notifications_broadcast_target_hospitals, notifications_emergencyresponse, notifications_notification, requests_approval, requests_deliveryevent, requests_deliverytoken, requests_dispatchevent, requests_resourcerequest, resources_resourcecatalog, resources_resourceinventory, resources_resourceshare, resources_resourcetransaction, resources_resourcetype, shipments_shipment, shipments_tracking RESTART IDENTITY CASCADE;

-- Clean up auth_user_account, keep only cred.txt users
DELETE FROM auth_user_account WHERE id NOT IN ('c87438ad-2bf8-4000-a242-4e490561d467', '9b9b91bd-53ee-4dfc-b2c4-20f96ccc5fa5', 'b66f44d2-1beb-4ba3-9884-19c3e9ce67d0');

-- Clean up staff_staff, keep only cred.txt staff
DELETE FROM staff_staff WHERE id NOT IN ('00000000-0000-0000-0000-000000000001', '91f7bf40-fe5c-4f9b-a963-25009aaf2b89', '443c158e-c550-472c-b045-a590c6ee3a73');

-- Clean up staff_userrole, keep only cred.txt userroles
DELETE FROM staff_userrole WHERE id NOT IN ('9fd9f0ef-c8cb-4f1b-9f5e-21c0c81dfcde', 'aca2b693-eecd-42d9-80aa-5de508ac2ed3', '52f72933-ae70-49a1-8728-2e21dcc5f691', 'a3741a24-d743-4e96-85b1-079f8cb20838');

-- Optionally, clean up staff_invitation if needed (keep none)
DELETE FROM staff_invitation;

SET session_replication_role = 'origin';
