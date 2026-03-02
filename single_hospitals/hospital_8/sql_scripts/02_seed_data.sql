-- =====================================================
-- SEED DATA FOR VETERANS MEDICAL CENTER (Hospital 8)
-- =====================================================

-- =====================================================
-- MEDICAL PERSONNEL
-- =====================================================
INSERT INTO med_personnel (emp_num, surname, given_name, credentials, job_title, specialization_cd, license_num, license_state, hire_date, work_schedule, email_addr, phone_ext, active_flag) VALUES
('VAH008-MD-001', 'Martinez', 'Robert', 'MD', 'Staff Psychiatrist', 'PSYCHIATRY', 'MD-78945-CA', 'CA', '2015-03-15', 'DAYS', 'r.martinez@vamcenter.va.gov', '3201', 'Y'),
('VAH008-MD-002', 'Thompson', 'Linda', 'MD', 'Primary Care Physician', 'INTERNAL_MED', 'MD-65432-CA', 'CA', '2012-06-20', 'DAYS', 'l.thompson@vamcenter.va.gov', '3102', 'Y'),
('VAH008-MD-003', 'Chen', 'David', 'MD', 'PTSD Specialist', 'PTSD_THERAPY', 'MD-87654-CA', 'CA', '2018-01-10', 'DAYS', 'd.chen@vamcenter.va.gov', '3203', 'Y'),
('VAH008-RN-001', 'Johnson', 'Sarah', 'RN', 'Registered Nurse', 'MENTAL_HEALTH', 'RN-45678-CA', 'CA', '2016-09-01', 'ROTATING', 's.johnson@vamcenter.va.gov', '3210', 'Y'),
('VAH008-RN-002', 'Williams', 'Michael', 'RN', 'Registered Nurse', 'PRIMARY_CARE', 'RN-34567-CA', 'CA', '2017-11-15', 'DAYS', 'm.williams@vamcenter.va.gov', '3110', 'Y'),
('VAH008-PHARM-001', 'Anderson', 'Emily', 'PharmD', 'Clinical Pharmacist', 'PHARMACY', 'PHARM-23456-CA', 'CA', '2019-02-01', 'DAYS', 'e.anderson@vamcenter.va.gov', '3401', 'Y'),
('VAH008-SW-001', 'Garcia', 'Maria', 'LCSW', 'Social Worker', 'SOCIAL_WORK', 'SW-34567-CA', 'CA', '2014-08-20', 'DAYS', 'm.garcia@vamcenter.va.gov', '3501', 'Y'),
('VAH008-MD-004', 'Brown', 'James', 'MD', 'Emergency Physician', 'EMERGENCY_MED', 'MD-98765-CA', 'CA', '2013-04-10', 'NIGHTS', 'j.brown@vamcenter.va.gov', '3001', 'Y');

-- =====================================================
-- UPDATE CLINICAL DIVISIONS WITH CHIEFS
-- =====================================================
UPDATE clinical_div SET chief_physician_id = (SELECT pers_id FROM med_personnel WHERE emp_num = 'VAH008-MD-002') WHERE div_code = 'PCC';
UPDATE clinical_div SET chief_physician_id = (SELECT pers_id FROM med_personnel WHERE emp_num = 'VAH008-MD-001') WHERE div_code = 'MHS';
UPDATE clinical_div SET chief_physician_id = (SELECT pers_id FROM med_personnel WHERE emp_num = 'VAH008-MD-003') WHERE div_code = 'PTSD';
UPDATE clinical_div SET chief_physician_id = (SELECT pers_id FROM med_personnel WHERE emp_num = 'VAH008-MD-004') WHERE div_code = 'ED';

-- =====================================================
-- VETERAN PATIENT REGISTRY
-- =====================================================
INSERT INTO vet_patient_reg (va_file_num, ssn_last4, last_nm, first_nm, middle_init, dob, sex, blood_grp, ethnicity, service_branch, service_start_dt, service_end_dt, service_connected_disability, disability_rating, combat_veteran, addr_street, addr_city, addr_state, addr_zip, phone_home, phone_mobile, emergency_contact_nm, emergency_contact_phone, status_cd) VALUES
('VA-12345678', '4567', 'Anderson', 'John', 'R', '1975-05-20', 'M', 'A+', 'Caucasian', 'Army', '1993-06-15', '2015-08-30', TRUE, 70, TRUE, '1234 Oak Street', 'San Diego', 'CA', '92101', '619-555-0101', '619-555-0102', 'Mary Anderson', '619-555-0103', 'ACTIVE'),
('VA-23456789', '5678', 'Rodriguez', 'Carlos', 'M', '1980-11-12', 'M', 'O+', 'Hispanic', 'Marines', '1998-03-10', '2018-12-15', TRUE, 50, TRUE, '5678 Pine Avenue', 'Los Angeles', 'CA', '90001', '213-555-0201', '213-555-0202', 'Sofia Rodriguez', '213-555-0203', 'ACTIVE'),
('VA-34567890', '6789', 'Johnson', 'William', 'T', '1965-09-08', 'M', 'B+', 'African American', 'Navy', '1983-07-20', '2005-06-30', TRUE, 80, TRUE, '9012 Elm Street', 'Oakland', 'CA', '94601', '510-555-0301', '510-555-0302', 'Patricia Johnson', '510-555-0303', 'ACTIVE'),
('VA-45678901', '7890', 'Smith', 'Jennifer', 'L', '1985-03-25', 'F', 'AB+', 'Caucasian', 'Air Force', '2003-09-01', '2019-10-15', TRUE, 40, FALSE, '3456 Maple Drive', 'Sacramento', 'CA', '95814', '916-555-0401', '916-555-0402', 'Robert Smith', '916-555-0403', 'ACTIVE'),
('VA-56789012', '8901', 'Davis', 'Michael', 'P', '1970-07-14', 'M', 'O-', 'Caucasian', 'Army', '1988-04-12', '2010-05-20', TRUE, 90, TRUE, '7890 Cedar Lane', 'Fresno', 'CA', '93701', '559-555-0501', '559-555-0502', 'Lisa Davis', '559-555-0503', 'ACTIVE'),
('VA-67890123', '9012', 'Martinez', 'Thomas', 'A', '1978-12-30', 'M', 'A-', 'Hispanic', 'Coast Guard', '1996-08-15', '2016-09-30', FALSE, 0, FALSE, '2345 Birch Road', 'San Jose', 'CA', '95101', '408-555-0601', '408-555-0602', 'Anna Martinez', '408-555-0603', 'ACTIVE'),
('VA-78901234', '0123', 'Wilson', 'Robert', 'E', '1982-02-18', 'M', 'B-', 'Caucasian', 'Army', '2000-01-10', '2020-03-25', TRUE, 60, TRUE, '6789 Spruce Court', 'Bakersfield', 'CA', '93301', '661-555-0701', '661-555-0702', 'Susan Wilson', '661-555-0703', 'ACTIVE'),
('VA-89012345', '1234', 'Taylor', 'Elizabeth', 'M', '1990-06-22', 'F', 'A+', 'Asian', 'Navy', '2008-05-15', '2022-07-10', TRUE, 30, FALSE, '4567 Willow Street', 'Long Beach', 'CA', '90801', '562-555-0801', '562-555-0802', 'David Taylor', '562-555-0803', 'ACTIVE');

-- =====================================================
-- PHARMACY FORMULARY
-- =====================================================
INSERT INTO pharm_formulary (drug_name, generic_name, ndc_code, strength_val, dosage_form_desc, route_desc, therapeutic_class, va_class, controlled_subst_schedule, formulary_status, unit_price) VALUES
('Sertraline', 'Sertraline HCl', '0093-7214-01', '50mg', 'Tablet', 'Oral', 'Antidepressant', 'CN609', NULL, 'ACTIVE', 0.15),
('Prazosin', 'Prazosin HCl', '0378-0271-01', '1mg', 'Capsule', 'Oral', 'Alpha Blocker', 'CV150', NULL, 'ACTIVE', 0.25),
('Trazodone', 'Trazodone HCl', '0093-0739-01', '50mg', 'Tablet', 'Oral', 'Antidepressant', 'CN609', NULL, 'ACTIVE', 0.18),
('Metformin', 'Metformin HCl', '0093-7214-56', '500mg', 'Tablet', 'Oral', 'Antidiabetic', 'HS501', NULL, 'ACTIVE', 0.10),
('Lisinopril', 'Lisinopril', '0378-1710-93', '10mg', 'Tablet', 'Oral', 'ACE Inhibitor', 'CV800', NULL, 'ACTIVE', 0.08),
('Gabapentin', 'Gabapentin', '0093-2011-01', '300mg', 'Capsule', 'Oral', 'Anticonvulsant', 'CN400', NULL, 'ACTIVE', 0.20),
('Tramadol', 'Tramadol HCl', '0093-0058-01', '50mg', 'Tablet', 'Oral', 'Analgesic', 'CN101', 'IV', 'ACTIVE', 0.35),
('Fluoxetine', 'Fluoxetine HCl', '0093-7198-01', '20mg', 'Capsule', 'Oral', 'Antidepressant', 'CN609', NULL, 'ACTIVE', 0.12);

-- =====================================================
-- PHARMACY STOCK
-- =====================================================
INSERT INTO pharm_stock (form_id, lot_num, qty_on_hand, expiration_dt, acquisition_cost, vendor_name, storage_loc, reorder_level) VALUES
(1, 'LOT-2024-001', 5000, '2026-12-31', 750.00, 'VA National Formulary', 'SHELF-A12', 500),
(2, 'LOT-2024-002', 2000, '2026-10-15', 500.00, 'VA National Formulary', 'SHELF-A15', 200),
(3, 'LOT-2024-003', 3000, '2026-11-30', 540.00, 'VA National Formulary', 'SHELF-A18', 300),
(4, 'LOT-2024-004', 8000, '2027-03-20', 800.00, 'VA National Formulary', 'SHELF-B05', 800),
(5, 'LOT-2024-005', 6000, '2027-02-28', 480.00, 'VA National Formulary', 'SHELF-B10', 600),
(6, 'LOT-2024-006', 4000, '2026-09-30', 800.00, 'VA National Formulary', 'SHELF-C02', 400),
(7, 'LOT-2024-007', 1500, '2026-08-15', 525.00, 'VA National Formulary', 'SECURE-S1', 150),
(8, 'LOT-2024-008', 3500, '2026-12-10', 420.00, 'VA National Formulary', 'SHELF-A20', 350);

-- =====================================================
-- CLINICAL ENCOUNTERS
-- =====================================================
INSERT INTO clinical_encounter (vpr_id, pers_id, div_id, enc_dt, enc_time, enc_type, chief_complaint, visit_reason, enc_status, check_in_time, check_out_time) VALUES
(1, 1, 2, '2026-02-15', '09:00', 'OUTPATIENT', 'Depression and PTSD symptoms', 'Mental health follow-up', 'COMPLETED', '2026-02-15 08:45:00', '2026-02-15 09:45:00'),
(2, 2, 1, '2026-02-16', '10:30', 'OUTPATIENT', 'Hypertension management', 'Primary care checkup', 'COMPLETED', '2026-02-16 10:15:00', '2026-02-16 11:00:00'),
(3, 3, 3, '2026-02-17', '14:00', 'OUTPATIENT', 'Nightmares and anxiety', 'PTSD treatment session', 'COMPLETED', '2026-02-17 13:45:00', '2026-02-17 15:00:00'),
(4, 4, 1, '2026-02-18', '11:00', 'OUTPATIENT', 'Diabetes check', 'Routine diabetes management', 'COMPLETED', '2026-02-18 10:50:00', '2026-02-18 11:30:00'),
(5, 8, 5, '2026-02-19', '22:30', 'EMERGENCY', 'Chest pain', 'Emergency evaluation', 'COMPLETED', '2026-02-19 22:25:00', '2026-02-20 01:15:00'),
(6, 1, 2, '2026-02-20', '13:00', 'OUTPATIENT', 'Medication adjustment', 'Mental health follow-up', 'COMPLETED', '2026-02-20 12:55:00', '2026-02-20 13:40:00'),
(7, 3, 3, '2026-02-21', '09:30', 'OUTPATIENT', 'PTSD therapy', 'Cognitive Processing Therapy', 'COMPLETED', '2026-02-21 09:25:00', '2026-02-21 10:30:00'),
(8, 2, 1, '2026-02-22', '15:00', 'OUTPATIENT', 'Annual physical', 'Yearly wellness visit', 'COMPLETED', '2026-02-22 14:50:00', '2026-02-22 15:45:00');

-- =====================================================
-- RX ORDERS
-- =====================================================
INSERT INTO rx_order (vpr_id, prescriber_id, form_id, rx_num, order_dt, sig_text, qty_ordered, refills_auth, refills_remain, days_supply, rx_status) VALUES
(1, 1, 1, 'RX-2024-001', '2026-02-15', 'Take 1 tablet by mouth once daily', 90, 3, 3, 90, 'ACTIVE'),
(1, 1, 2, 'RX-2024-002', '2026-02-15', 'Take 1 capsule at bedtime for nightmares', 30, 2, 2, 30, 'ACTIVE'),
(2, 2, 5, 'RX-2024-003', '2026-02-16', 'Take 1 tablet by mouth once daily', 90, 3, 3, 90, 'ACTIVE'),
(3, 3, 3, 'RX-2024-004', '2026-02-17', 'Take 1 tablet at bedtime as needed for sleep', 30, 1, 1, 30, 'ACTIVE'),
(4, 2, 4, 'RX-2024-005', '2026-02-18', 'Take 1 tablet twice daily with meals', 180, 3, 3, 90, 'ACTIVE'),
(5, 8, 7, 'RX-2024-006', '2026-02-19', 'Take 1 tablet every 6 hours as needed for pain', 20, 0, 0, 5, 'ACTIVE'),
(6, 1, 6, 'RX-2024-007', '2026-02-20', 'Take 1 capsule three times daily', 270, 3, 3, 90, 'ACTIVE'),
(7, 3, 1, 'RX-2024-008', '2026-02-21', 'Take 1 tablet by mouth once daily', 90, 3, 3, 90, 'ACTIVE');

-- =====================================================
-- DIAGNOSTIC EQUIPMENT INVENTORY
-- =====================================================
INSERT INTO diag_equip_inv (equip_name, equip_type, manufacturer, model_num, serial_num, asset_tag, div_id, purchase_dt, purchase_cost, last_pm_dt, next_pm_dt, equip_status, location_desc) VALUES
('ECG Machine', 'diagnostic', 'GE Healthcare', 'MAC 2000', 'SN-2024-001', 'VA-EQ-001', 1, '2023-05-15', 8500.00, '2026-01-10', '2026-07-10', 'OPERATIONAL', 'Primary Care Exam Room 1'),
('Portable X-Ray Unit', 'diagnostic', 'Siemens', 'Mobilett XP', 'SN-2024-002', 'VA-EQ-002', 5, '2022-11-20', 45000.00, '2026-02-01', '2026-08-01', 'OPERATIONAL', 'Emergency Department'),
('Blood Pressure Monitor', 'monitoring', 'Welch Allyn', 'Connex VSM 6000', 'SN-2024-003', 'VA-EQ-003', 1, '2024-01-10', 1200.00, '2026-01-15', '2026-07-15', 'OPERATIONAL', 'Primary Care Clinic'),
('Mental Health Assessment Computer', 'diagnostic', 'Dell', 'OptiPlex 7090', 'SN-2024-004', 'VA-EQ-004', 2, '2024-03-05', 1500.00, '2026-02-10', '2026-08-10', 'OPERATIONAL', 'Mental Health Office 3'),
('Pulse Oximeter', 'monitoring', 'Masimo', 'Radical-7', 'SN-2024-005', 'VA-EQ-005', 5, '2023-08-20', 3200.00, '2026-01-20', '2026-07-20', 'OPERATIONAL', 'Emergency Triage');

-- =====================================================
-- BLOOD PRODUCT INVENTORY
-- =====================================================
INSERT INTO blood_prod_inv (blood_type, product_type, unit_count, collection_dt, expiration_dt, donor_code, testing_status, storage_temp, reserved_count) VALUES
('O+', 'PACKED_RBC', 25, '2026-02-01', '2026-03-03', 'DONOR-001', 'CLEARED', '-4C', 0),
('O-', 'PACKED_RBC', 15, '2026-02-05', '2026-03-07', 'DONOR-002', 'CLEARED', '-4C', 2),
('A+', 'PACKED_RBC', 20, '2026-02-10', '2026-03-12', 'DONOR-003', 'CLEARED', '-4C', 0),
('B+', 'PACKED_RBC', 12, '2026-02-12', '2026-03-14', 'DONOR-004', 'CLEARED', '-4C', 0),
('AB+', 'PLASMA', 18, '2026-02-15', '2027-02-15', 'DONOR-005', 'CLEARED', '-18C', 0),
('O+', 'PLATELETS', 8, '2026-02-25', '2026-03-02', 'DONOR-006', 'CLEARED', '22C', 1);

-- =====================================================
-- PTSD SESSION TRACKING
-- =====================================================
INSERT INTO ptsd_session (vpr_id, therapist_id, session_dt, session_num, therapy_type, duration_min, pcl5_score, session_notes, homework_assigned, next_session_dt) VALUES
(1, 1, '2026-02-15', 4, 'CPT', 60, 58, 'Patient showing good progress with cognitive restructuring. Working on challenging stuck points related to combat experiences.', 'Complete ABC worksheet for 3 challenging thoughts', '2026-02-22'),
(3, 3, '2026-02-17', 8, 'PE', 90, 45, 'Continued imaginal exposure. Patient tolerance improving. SUDS ratings decreasing during recounting.', 'Listen to session recording daily', '2026-02-24'),
(7, 3, '2026-02-21', 6, 'CPT', 60, 52, 'Working on safety stuck point. Patient engaging well with therapy process.', 'Challenging questions worksheet on safety beliefs', '2026-02-28'),
(1, 1, '2026-02-22', 5, 'CPT', 60, 55, 'Progress on safety and trust stuck points. Patient reporting reduced nightmares.', 'Continue practicing challenging stuck points', '2026-03-01');
