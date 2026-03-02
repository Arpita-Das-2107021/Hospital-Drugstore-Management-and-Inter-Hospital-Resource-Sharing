-- =====================================================
-- SEED DATA FOR CHILDREN'S MEDICAL CENTER (Hospital 7)
-- =====================================================

-- =====================================================
-- PEDIATRIC MEDICAL STAFF
-- =====================================================
INSERT INTO pediatric_staff (emp_code, last_name, first_name, credentials, staff_category, pediatric_subspecialty, board_certified_pediatrics, pals_certified, nrp_certified, license_number, state_licensed, hire_date, work_shift, contact_email, phone_extension, languages_spoken, staff_active) VALUES
('CMC-PED-001', 'Peterson', 'Sarah', 'MD FAAP', 'PHYSICIAN', 'General Pediatrics', TRUE, TRUE, TRUE, 'MD-78901-CA', 'CA', '2015-06-15', 'DAYS_WEEKDAYS', 's.peterson@childmedcenter.org', '4101', ARRAY['English', 'Spanish'], TRUE),
('CMC-NEO-001', 'Nguyen', 'Michael', 'MD', 'PHYSICIAN', 'Neonatology', TRUE, TRUE, TRUE, 'MD-78902-CA', 'CA', '2016-08-20', 'ROTATING_24_7', 'm.nguyen@childmedcenter.org', '4102', ARRAY['English', 'Vietnamese'], TRUE),
('CMC-CARD-001', 'Patel', 'Anjali', 'MD FAAP FACC', 'PHYSICIAN', 'Pediatric Cardiology', TRUE, TRUE, TRUE, 'MD-78903-CA', 'CA', '2014-03-10', 'DAYS_WEEKDAYS', 'a.patel@childmedcenter.org', '4103', ARRAY['English', 'Hindi'], TRUE),
('CMC-ONC-001', 'Williams', 'Jennifer', 'MD', 'PHYSICIAN', 'Pediatric Oncology', TRUE, TRUE, FALSE, 'MD-78904-CA', 'CA', '2017-01-15', 'DAYS_WEEKDAYS', 'j.williams@childmedcenter.org', '4104', ARRAY['English'], TRUE),
('CMC-SURG-001', 'Rodriguez', 'Carlos', 'MD FACS', 'PHYSICIAN', 'Pediatric Surgery', TRUE, TRUE, TRUE, 'MD-78905-CA', 'CA', '2013-09-01', 'ON_CALL', 'c.rodriguez@childmedcenter.org', '4105', ARRAY['English', 'Spanish'], TRUE),
('CMC-NP-001', 'Johnson', 'Emily', 'CPNP-PC', 'NURSE_PRACTITIONER', 'Primary Care NP', TRUE, TRUE, FALSE, 'NP-56701-CA', 'CA', '2018-05-20', 'DAYS_WEEKDAYS', 'e.johnson@childmedcenter.org', '4201', ARRAY['English'], TRUE),
('CMC-RN-001', 'Chen', 'Lisa', 'RN CPN', 'NURSE', 'Pediatric Nursing', TRUE, TRUE, TRUE, 'RN-45601-CA', 'CA', '2016-11-10', 'DAYS_12HR', 'l.chen@childmedcenter.org', '4301', ARRAY['English', 'Mandarin'], TRUE),
('CMC-RN-002', 'Martinez', 'Sofia', 'RN', 'NURSE', 'NICU Nursing', TRUE, FALSE, TRUE, 'RN-45602-CA', 'CA', '2019-02-15', 'NIGHTS_12HR', 's.martinez@childmedcenter.org', '4302', ARRAY['English', 'Spanish'], TRUE),
('CMC-PHARM-001', 'Anderson', 'David', 'PharmD', 'PHARMACIST', 'Pediatric Pharmacy', TRUE, FALSE, FALSE, 'PHARM-34501-CA', 'CA', '2017-07-01', 'DAYS_WEEKDAYS', 'd.anderson@childmedcenter.org', '4401', ARRAY['English'], TRUE),
('CMC-CLS-001', 'Taylor', 'Rachel', 'CCLS', 'CHILD_LIFE_SPECIALIST', 'Therapeutic Play', FALSE, FALSE, FALSE, 'CLS-23401-CA', 'CA', '2020-03-10', 'DAYS_WEEKDAYS', 'r.taylor@childmedcenter.org', '4501', ARRAY['English'], TRUE);

-- =====================================================
-- UPDATE CARE UNITS WITH DIRECTORS
-- =====================================================
UPDATE care_unit SET medical_director_id = (SELECT provider_id FROM pediatric_staff WHERE emp_code = 'CMC-NEO-001') WHERE unit_code = 'NICU';
UPDATE care_unit SET medical_director_id = (SELECT provider_id FROM pediatric_staff WHERE emp_code = 'CMC-PED-001') WHERE unit_code = 'PICU';
UPDATE care_unit SET medical_director_id = (SELECT provider_id FROM pediatric_staff WHERE emp_code = 'CMC-SURG-001') WHERE unit_code = 'PSURG';
UPDATE care_unit SET medical_director_id = (SELECT provider_id FROM pediatric_staff WHERE emp_code = 'CMC-CARD-001') WHERE unit_code = 'PCARDIO';
UPDATE care_unit SET medical_director_id = (SELECT provider_id FROM pediatric_staff WHERE emp_code = 'CMC-ONC-001') WHERE unit_code = 'POH';

-- =====================================================
-- CHILD PATIENTS
-- =====================================================
INSERT INTO child_patient (chart_number, child_last_name, child_first_name, child_middle_name, nickname, date_of_birth, birth_weight_grams, gestational_age_weeks, sex_at_birth, blood_group, multiple_birth_indicator, newborn_screening_complete, immunization_status, primary_language, school_grade, allergies_list, chronic_diagnoses, current_address, active_patient) VALUES
('CMC-2024-001', 'Thompson', 'Emma', 'Rose', 'Emmy', '2024-12-15', 2850, 38, 'female', 'O+', FALSE, TRUE, 'UP_TO_DATE', 'English', 'N/A (Infant)', 'None known', 'None', '123 Oak Street, Los Angeles, CA 90001', TRUE),
('CMC-2023-045', 'Garcia', 'Miguel', 'Angel', 'Miguelito', '2023-08-20', 3200, 39, 'male', 'A+', FALSE, TRUE, 'UP_TO_DATE', 'Spanish', 'N/A (Toddler)', 'Penicillin - Rash', 'None', '456 Pine Avenue, Los Angeles, CA 90002', TRUE),
('CMC-2020-128', 'Lee', 'Sophia', 'Jin', 'Sophie', '2020-03-10', 3100, 40, 'female', 'B+', FALSE, TRUE, 'UP_TO_DATE', 'English', 'Kindergarten', 'None known', 'Asthma (mild intermittent)', '789 Elm Road, Pasadena, CA 91101', TRUE),
('CMC-2015-289', 'Johnson', 'Ethan', 'Michael', 'Ethan', '2015-06-22', 3350, 39, 'male', 'AB+', FALSE, TRUE, 'UP_TO_DATE', 'English', '3rd Grade', 'Peanuts - Anaphylaxis', 'Type 1 Diabetes Mellitus', '234 Maple Drive, Glendale, CA 91201', TRUE),
('CMC-2018-176', 'Martinez', 'Isabella', 'Maria', 'Bella', '2018-11-05', 3000, 38, 'female', 'O+', FALSE, TRUE, 'DELAYED', 'Spanish', '1st Grade', 'Eggs - Hives', 'None', '567 Cedar Lane, Burbank, CA 91502', TRUE),
('CMC-2025-003', 'Wilson', 'Noah', 'James', NULL, '2025-01-20', 1200, 26, 'male', 'A-', FALSE, TRUE, 'INCOMPLETE', 'English', 'N/A (Preterm)', 'None known', 'Prematurity, ROP, BPD', '890 Birch Court, Santa Monica, CA 90401', TRUE),
('CMC-2017-234', 'Chen', 'Olivia', 'Mei', 'Liv', '2017-04-15', 3250, 40, 'female', 'B-', FALSE, TRUE, 'UP_TO_DATE', 'English', '2nd Grade', 'None known', 'ALL (in remission)', '345 Spruce Street, Beverly Hills, CA 90210', TRUE),
('CMC-2019-156', 'Brown', 'Aiden', 'Christopher', 'AJ', '2019-09-30', 3400, 41, 'male', 'O-', FALSE, TRUE, 'UP_TO_DATE', 'English', 'Pre-K', 'Amoxicillin - Rash', 'VSD (surgically repaired)', '678 Willow Avenue, Long Beach, CA 90801', TRUE),
('CMC-2024-089', 'Patel', 'Ava', 'Priya', 'Ava', '2024-07-10', 3150, 39, 'female', 'A+', FALSE, TRUE, 'UP_TO_DATE', 'English', 'N/A (Infant)', 'None known', 'None', '901 Palm Road, Pasadena, CA 91103', TRUE),
('CMC-2016-201', 'Davis', 'Liam', 'Alexander', NULL, '2016-02-28', 2900, 37, 'male', 'AB-', FALSE, TRUE, 'UP_TO_DATE', 'English', '3rd Grade', 'Shellfish - Anaphylaxis, Latex', 'Cerebral Palsy (mild)', '432 Sycamore Lane, Glendale, CA 91203', TRUE);

-- =====================================================
-- GUARDIANS
-- =====================================================
INSERT INTO guardian (guardian_last_name, guardian_first_name, relationship_to_child, legal_guardian, primary_contact, home_phone, mobile_phone, email_addr, occupation, home_address, consent_to_treat, photo_consent, research_consent) VALUES
('Thompson', 'Jennifer', 'Mother', TRUE, TRUE, '323-555-1001', '323-555-1002', 'j.thompson@email.com', 'Marketing Manager', '123 Oak Street, Los Angeles, CA 90001', TRUE, TRUE, FALSE),
('Thompson', 'Robert', 'Father', TRUE, FALSE, '323-555-1001', '323-555-1003', 'r.thompson@email.com', 'Software Engineer', '123 Oak Street, Los Angeles, CA 90001', TRUE, TRUE, FALSE),
('Garcia', 'Rosa', 'Mother', TRUE, TRUE, '213-555-2001', '213-555-2002', 'r.garcia@email.com', 'Homemaker', '456 Pine Avenue, Los Angeles, CA 90002', TRUE, FALSE, FALSE),
('Garcia', 'Juan', 'Father', TRUE, FALSE, '213-555-2001', '213-555-2003', 'j.garcia@email.com', 'Construction Worker', '456 Pine Avenue, Los Angeles, CA 90002', TRUE, FALSE, FALSE),
('Lee', 'Michelle', 'Mother', TRUE, TRUE, '626-555-3001', '626-555-3002', 'm.lee@email.com', 'Teacher', '789 Elm Road, Pasadena, CA 91101', TRUE, TRUE, TRUE),
('Lee', 'David', 'Father', TRUE, FALSE, '626-555-3001', '626-555-3003', 'd.lee@email.com', 'Accountant', '789 Elm Road, Pasadena, CA 91101', TRUE, TRUE, TRUE),
('Johnson', 'Patricia', 'Mother', TRUE, TRUE, '818-555-4001', '818-555-4002', 'p.johnson@email.com', 'Nurse', '234 Maple Drive, Glendale, CA 91201', TRUE, TRUE, TRUE),
('Johnson', 'Michael', 'Father', TRUE, FALSE, '818-555-4001', '818-555-4003', 'm.johnson@email.com', 'Police Officer', '234 Maple Drive, Glendale, CA 91201', TRUE, TRUE, TRUE),
('Martinez', 'Carmen', 'Mother', TRUE, TRUE, '818-555-5001', '818-555-5002', 'c.martinez@email.com', 'Retail Manager', '567 Cedar Lane, Burbank, CA 91502', TRUE, FALSE, FALSE),
('Wilson', 'Amanda', 'Mother', TRUE, TRUE, '310-555-6001', '310-555-6002', 'a.wilson@email.com', 'Attorney', '890 Birch Court, Santa Monica, CA 90401', TRUE, TRUE, TRUE);

-- =====================================================
-- CHILD-GUARDIAN LINKS
-- =====================================================
INSERT INTO child_guardian_link (child_id, guardian_id, relationship_type, custody_rights, medical_decision_authority, pickup_authorized, contact_priority) VALUES
(1, 1, 'Mother', TRUE, TRUE, TRUE, 1),
(1, 2, 'Father', TRUE, TRUE, TRUE, 2),
(2, 3, 'Mother', TRUE, TRUE, TRUE, 1),
(2, 4, 'Father', TRUE, TRUE, TRUE, 2),
(3, 5, 'Mother', TRUE, TRUE, TRUE, 1),
(3, 6, 'Father', TRUE, TRUE, TRUE, 2),
(4, 7, 'Mother', TRUE, TRUE, TRUE, 1),
(4, 8, 'Father', TRUE, TRUE, TRUE, 2),
(5, 9, 'Mother', TRUE, TRUE, TRUE, 1),
(6, 10, 'Mother', TRUE, TRUE, TRUE, 1);

-- =====================================================
-- PEDIATRIC VISITS
-- =====================================================
INSERT INTO pediatric_visit (child_id, accompanying_guardian_id, attending_provider_id, unit_id, visit_date, visit_time, visit_type, chief_complaint, reason_for_visit, visit_status, check_in_timestamp, check_out_timestamp, consent_obtained_from) VALUES
(1, 1, 1, 8, '2025-01-15', '10:00', 'WELL_CHILD', 'One-month well-child visit', 'Well-baby check, assess growth and development', 'COMPLETED', '2025-01-15 09:45:00', '2025-01-15 10:30:00', 1),
(2, 3, 6, 8, '2025-02-10', '14:00', 'SICK_VISIT', 'Fever and cough', 'Upper respiratory infection symptoms x 3 days', 'COMPLETED', '2025-02-10 13:50:00', '2025-02-10 14:35:00', 3),
(3, 5, 1, 8, '2025-02-15', '11:00', 'FOLLOWUP', 'Asthma follow-up', 'Routine asthma management check', 'COMPLETED', '2025-02-15 10:55:00', '2025-02-15 11:25:00', 5),
(4, 7, 1, 8, '2025-02-20', '09:00', 'FOLLOWUP', 'Diabetes check', 'Type 1 Diabetes quarterly follow-up', 'COMPLETED', '2025-02-20 08:50:00', '2025-02-20 09:45:00', 7),
(5, 9, 6, 8, '2025-02-22', '15:30', 'SICK_VISIT', 'Ear pain', 'Right ear pain x 2 days, fever', 'COMPLETED', '2025-02-22 15:20:00', '2025-02-22 16:00:00', 9),
(7, 5, 4, 5, '2025-02-25', '10:00', 'SPECIALTY', 'Oncology follow-up', 'ALL surveillance visit, check CBC', 'COMPLETED', '2025-02-25 09:55:00', '2025-02-25 10:50:00', 5),
(8, 7, 3, 4, '2025-02-28', '13:00', 'SPECIALTY', 'Cardiology follow-up', 'Post-operative VSD repair check, echo', 'COMPLETED', '2025-02-28 12:50:00', '2025-02-28 14:00:00', 7),
(9, 1, 1, 8, '2025-03-01', '11:30', 'WELL_CHILD', 'Six-month well-child visit', 'Well-baby check, vaccinations due', 'COMPLETED', '2025-03-01 11:20:00', '2025-03-01 12:00:00', 1);

-- =====================================================
-- GROWTH MEASUREMENTS
-- =====================================================
INSERT INTO growth_measurement (child_id, visit_id, measurement_date, age_at_measurement_months, weight_kg, height_cm, head_circumference_cm, bmi, weight_percentile, height_percentile, bmi_percentile, growth_chart_used, measured_by) VALUES
(1, 1, '2025-01-15', 1, 4.200, 53.5, 37.2, NULL, 45, 50, NULL, 'WHO', 7),
(2, 2, '2025-02-10', 18, 11.500, 81.0, 47.5, 17.5, 60, 55, 65, 'WHO', 7),
(3, 3, '2025-02-15', 59, 18.200, 108.0, 50.0, 15.6, 50, 48, 52, 'CDC', 7),
(4, 4, '2025-02-20', 104, 28.500, 130.5, NULL, 16.7, 42, 35, 48, 'CDC', 7),
(5, 5, '2025-02-22', 75, 22.100, 115.0, NULL, 16.7, 55, 52, 58, 'CDC', 7),
(7, 6, '2025-02-25', 94, 24.800, 122.0, NULL, 16.7, 48, 45, 50, 'CDC', 7),
(8, 7, '2025-02-28', 65, 19.500, 110.5, NULL, 16.0, 52, 50, 54, 'CDC', 7),
(9, 8, '2025-03-01', 8, 7.800, 68.0, 43.5, 16.9, 55, 52, 60, 'WHO', 7);

-- =====================================================
-- PEDIATRIC CLINICAL NOTES
-- =====================================================
INSERT INTO pediatric_clinical_note (child_id, visit_id, provider_id, note_date, note_type, subjective_findings, objective_findings, assessment_diagnosis, treatment_plan, vital_signs_json, developmental_assessment, parent_education_provided, follow_up_instructions, signed_by) VALUES
(1, 1, 1, '2025-01-15', 'PROGRESS', 'Mother reports baby feeding well, 8-10 wet diapers per day, good sleep.', 'Well-appearing infant. Active, alert. Fontanelle soft and flat. Heart RRR, lungs clear. Abdomen soft. Umbilicus healed.', 'Healthy newborn, one month old', 'Continue breastfeeding on demand. Vitamin D supplementation. Next visit at 2 months.', '{"temp_c": 36.8, "hr_bpm": 145, "rr_bpm": 42, "weight_kg": 4.2}', 'Appropriate for age. Good head control improving. Social smile emerging.', 'Discussed safe sleep practices, tummy time importance, signs of illness to watch for.', 'Return for 2-month well-child visit with vaccinations. Call for fever >38C, decreased feeding, lethargy.', 1),
(2, 2, 6, '2025-02-10', 'HPI', 'Fever to 39C x 3 days, cough, runny nose, decreased appetite. No difficulty breathing.', 'Alert toddler, mildly fussy. TMs: Right TM bulging, erythematous. Left TM normal. Throat erythematous. Lungs clear bilaterally.', 'Acute otitis media, right ear. Viral upper respiratory infection.', 'Amoxicillin 250mg PO BID x 10 days. Acetaminophen for fever/pain. Encourage fluids.', '{"temp_c": 38.5, "hr_bpm": 120, "rr_bpm": 28, "spo2": 98}', 'Language development appropriate - speaking 20+ words, beginning to combine words.', 'Discussed antibiotic dosing and completion, fever management, signs requiring re-evaluation.', 'Follow-up if not improving in 48-72 hours or worsening symptoms. Ear recheck in 2-3 weeks.', 6),
(4, 4, 1, '2025-02-20', 'ASSESSMENT', 'Mother reports good blood glucose control. Average readings 120-180. One mild hypoglycemic episode this month, treated appropriately.', 'Well-appearing school-age child. Injection sites without lipohypertrophy. Growth appropriate.', 'Type 1 Diabetes Mellitus, well-controlled', 'Continue current insulin regimen: Lantus 12 units QHS, Humalog per sliding scale with meals. CGM monitoring. HbA1c ordered.', '{"temp_c": 36.7, "hr_bpm": 88, "rr_bpm": 20, "bp": "102/65"}', 'School performance good. Active in sports (soccer).', 'Reviewed sick day management, hypoglycemia treatment, importance of consistent carb counting.', 'Return in 3 months. Continue endocrinology co-management. Annual ophthalmology exam due.', 1),
(7, 6, 4, '2025-02-25', 'ASSESSMENT', 'Patient feeling well. No fevers, night sweats, bruising, or bone pain. Tolerating oral chemotherapy well.', 'Well-appearing child. No hepatosplenomegaly. No lymphadenopathy. No petechiae or bruising.', 'Acute Lymphoblastic Leukemia (ALL), in first remission, maintenance phase', 'Continue oral chemotherapy: 6-MP 50mg PO daily, Methotrexate 20mg PO weekly. CBC monitoring. Next LP and IT chemo in 2 months.', '{"temp_c": 36.6, "hr_bpm": 82, "rr_bpm": 18, "weight_kg": 24.8}', 'Returned to school successfully. Keeping up with academics with some tutoring support.', 'Discussed infection precautions, medication adherence, when to call for fever or other concerns.', 'Return in 4 weeks for CBC check. Next lumbar puncture scheduled 2 months. Continue q3 month surveillance.', 4);

-- =====================================================
-- IMMUNIZATION RECORDS
-- =====================================================
INSERT INTO immunization_record (child_id, visit_id, vaccine_name, vaccine_code, dose_number, administration_date, administering_provider_id, route_of_admin, anatomic_site, lot_number, expiration_date, manufacturer, vis_date, guardian_consent_id, adverse_reaction, next_dose_due_date) VALUES
(9, 8, 'DTaP', 'CVX-20', 3, '2025-03-01', 7, 'IM', 'Right vastus lateralis', 'LOT-DTaP-2024-001', '2026-03-01', 'Sanofi Pasteur', '2024-08-01', 1, FALSE, '2025-09-01'),
(9, 8, 'IPV', 'CVX-10', 3, '2025-03-01', 7, 'IM', 'Left vastus lateralis', 'LOT-IPV-2024-002', '2026-02-15', 'Sanofi Pasteur', '2024-07-15', 1, FALSE, '2025-09-01'),
(9, 8, 'Hib', 'CVX-49', 3, '2025-03-01', 7, 'IM', 'Right vastus lateralis', 'LOT-HIB-2024-003', '2026-04-20', 'Merck', '2024-06-01', 1, FALSE, '2025-09-01'),
(9, 8, 'PCV13', 'CVX-133', 3, '2025-03-01', 7, 'IM', 'Left vastus lateralis', 'LOT-PCV-2024-004', '2026-05-10', 'Pfizer', '2024-05-20', 1, FALSE, '2025-09-01'),
(9, 8, 'Hepatitis B', 'CVX-08', 3, '2025-03-01', 7, 'IM', 'Right vastus lateralis', 'LOT-HEPB-2024-005', '2026-06-30', 'Merck', '2024-04-15', 1, FALSE, '2026-03-01'),
(1, 1, 'Hepatitis B', 'CVX-08', 2, '2025-01-15', 1, 'IM', 'Right vastus lateralis', 'LOT-HEPB-2024-006', '2026-01-15', 'Merck', '2024-04-15', 1, FALSE, '2025-07-15'),
(2, NULL, 'MMR', 'CVX-03', 1, '2024-08-20', 6, 'SQ', 'Right upper arm', 'LOT-MMR-2024-007', '2026-08-20', 'Merck', '2024-03-10', 3, FALSE, '2027-08-20'),
(3, NULL, 'Varicella', 'CVX-21', 1, '2021-03-10', 1, 'SQ', 'Left upper arm', 'LOT-VAR-2021-001', '2023-03-10', 'Merck', '2021-01-05', 5, FALSE, '2024-03-10');

-- =====================================================
-- PEDIATRIC DRUG CATALOG
-- =====================================================
INSERT INTO pediatric_drug_catalog (drug_generic_name, drug_brand_names, formulation, concentration, pediatric_approved, weight_based_dosing, special_considerations) VALUES
('Amoxicillin', ARRAY['Amoxil'], 'Oral Suspension', '250mg/5mL', TRUE, TRUE, 'Shake well before use. Refrigerate. Bubble gum flavor available.'),
('Acetaminophen', ARRAY['Tylenol'], 'Oral Suspension', '160mg/5mL', TRUE, TRUE, 'Dye-free formulation available. Do not exceed max daily dose.'),
('Ibuprofen', ARRAY['Motrin', 'Advil'], 'Oral Suspension', '100mg/5mL', TRUE, TRUE, 'Give with food. Berry flavor. Not for infants <6 months.'),
('Albuterol', ARRAY['ProAir', 'Ventolin'], 'Inhalation Solution', '2.5mg/3mL', TRUE, FALSE, 'For nebulizer use. Single-dose vials.'),
('Insulin Glargine', ARRAY['Lantus'], 'Injectable', '100 units/mL', TRUE, TRUE, 'Refrigerate unopened. Room temp after opening. Do not shake.'),
('Ondansetron', ARRAY['Zofran'], 'Oral Disintegrating Tablet', '4mg', TRUE, TRUE, 'Dissolves on tongue. No water needed. Strawberry flavor.'),
('Prednisolone', ARRAY['Prelone'], 'Oral Solution', '15mg/5mL', TRUE, TRUE, 'Grape flavor. Give with food. Do not stop abruptly.'),
('Azithromycin', ARRAY['Zithromax'], 'Oral Suspension', '200mg/5mL', TRUE, TRUE, 'Cherry-banana flavor. Shake well. Do not refrigerate.');

-- =====================================================
-- PEDIATRIC MEDICATION ORDERS
-- =====================================================
INSERT INTO pediatric_rx (child_id, prescriber_id, drug_id, order_date, medication_name, dose_amount, dose_unit, weight_based_calc, child_weight_kg, route, frequency, duration_days, quantity_dispensed, administration_instructions, guardian_education, rx_status) VALUES
(2, 6, 1, '2025-02-10', 'Amoxicillin Suspension 250mg/5mL', '7', 'mL', '40 mg/kg/day divided BID', 11.5, 'PO', 'Twice daily (every 12 hours)', 10, '140 mL bottle', 'Give 7 mL by mouth twice daily for 10 days. Complete full course even if feeling better.', 'Explained importance of completing antibiotics. Watch for rash, diarrhea. Store in refrigerator. Shake before each use.', 'ACTIVE'),
(3, 1, 4, '2025-02-15', 'Albuterol Nebulizer Solution 2.5mg/3mL', '2.5', 'mg', 'Standard pediatric dose', 18.2, 'Nebulized', 'Every 4-6 hours as needed', 30, '30 vials', 'Use one vial in nebulizer every 4-6 hours as needed for wheezing or shortness of breath.', 'Demonstrated nebulizer use. Discussed asthma triggers to avoid. Use before exercise if needed.', 'ACTIVE'),
(4, 1, 5, '2020-06-01', 'Insulin Glargine (Lantus) 100 units/mL', '12', 'units', 'Per endocrinology protocol', 28.5, 'SubQ', 'Once daily at bedtime', 90, '1 vial (10 mL)', 'Inject 12 units subcutaneously at bedtime. Rotate injection sites.', 'Reviewed injection technique. Discussed blood glucose monitoring. Reinforced hypoglycemia symptoms and treatment.', 'ACTIVE'),
(5, 6, 2, '2025-02-22', 'Acetaminophen Suspension 160mg/5mL', '10', 'mL', '15 mg/kg/dose', 22.1, 'PO', 'Every 6 hours as needed', 7, '120 mL bottle', 'Give 10 mL by mouth every 6 hours as needed for pain or fever over 38.5C.', 'Discussed proper dosing and timing. Maximum 4 doses in 24 hours. Use dosing syringe provided.', 'ACTIVE'),
(5, 6, 1, '2025-02-22', 'Amoxicillin Suspension 250mg/5mL', '10', 'mL', '45 mg/kg/day divided BID', 22.1, 'PO', 'Twice daily (every 12 hours)', 10, '200 mL bottle', 'Give 10 mL by mouth twice daily for 10 days for ear infection.', 'Store in refrigerator. Shake well before each dose. Complete full 10-day course.', 'ACTIVE');

-- =====================================================
-- PEDIATRIC EQUIPMENT
-- =====================================================
INSERT INTO pediatric_equipment (equipment_name, equipment_category, size_type, manufacturer, model_number, serial_number, unit_location, equipment_status, last_sanitization_date, safety_inspection_date, age_appropriate_for, notes) VALUES
('Infant Warmer', 'NICU', 'NEWBORN', 'GE Healthcare', 'Giraffe Warmer', 'SN-2024-NW-001', 1, 'AVAILABLE', '2025-03-01', '2025-02-15', 'Newborns 0-3 months', 'Servo-controlled temperature management'),
('Pediatric Ventilator', 'RESPIRATORY', 'INFANT/CHILD', 'Drager', 'Babylog VN500', 'SN-2024-VT-002', 2, 'IN_USE', '2025-02-28', '2025-02-01', 'Neonates to adolescents', 'Volume and pressure modes available'),
('Pediatric Crash Cart', 'EMERGENCY', 'ALL_AGES', 'Armstrong', 'Code Cart Ped', 'SN-2024-CC-003', 7, 'AVAILABLE', '2025-03-02', '2025-03-01', 'Neonates to adolescents', 'Broselow tape included. Monthly checks current.'),
('Infant Scale', 'MONITORING', 'INFANT', 'Seca', '374', 'SN-2024-SC-004', 8, 'AVAILABLE', '2025-03-02', '2025-01-15', 'Infants 0-20kg', 'Digital scale, accurate to 2g'),
('Pediatric Wheelchair', 'MOBILITY', 'CHILD_SMALL', 'Invacare', 'Pediatric Manual', 'SN-2024-WC-005', 3, 'AVAILABLE', '2025-03-01', '2025-02-20', 'Ages 2-8 years', 'Adjustable footrests'),
('Nebulizer Machine', 'RESPIRATORY', 'PORTABLE', 'Pari', 'Vios', 'SN-2024-NB-006', 8, 'AVAILABLE', '2025-03-02', '2025-02-10', 'All pediatric ages', 'Compact design for bedside use');

-- =====================================================
-- CHILD LIFE ACTIVITIES
-- =====================================================
INSERT INTO child_life_activity (child_id, child_life_specialist_id, activity_date, activity_type, age_appropriateness, activity_description, child_engagement_level, therapeutic_goals, materials_used, parent_involvement, outcome_notes) VALUES
(7, 10, '2025-02-25', 'PROCEDURAL_PREP', 'School-age', 'Pre-procedure preparation for upcoming lumbar puncture. Used medical play with doll to explain procedure in age-appropriate terms.', 'High - asked many questions', 'Reduce procedure-related anxiety. Increase sense of control and understanding.', 'Medical doll, pretend lumbar puncture kit, picture book about hospital procedures', TRUE, 'Patient demonstrated understanding. Anxiety visibly reduced. Felt more prepared.'),
(4, 10, '2025-02-20', 'COPING_SUPPORT', 'School-age', 'Discussion about managing diabetes at school. Problem-solving around peer interactions and feeling different.', 'Moderate - initially hesitant', 'Normalize experience. Develop coping strategies for social challenges.', 'Feelings chart, role-play scenarios, coping skills cards', FALSE, 'Patient identified helpful strategies. Agreed to try talking to friend about diabetes.'),
(8, 10, '2025-02-28', 'PLAY_THERAPY', 'Preschool', 'Therapeutic play session post-cardiac surgery. Non-directive play to process hospital experience.', 'High - initiated play themes', 'Process medical experience. Provide emotional outlet.', 'Hospital-themed toys, doctor kit, stuffed animals, art supplies', TRUE, 'Patient engaged in medical play, demonstrating understanding. Parent noted improved mood.'),
(6, 10, '2025-02-05', 'PROCEDURAL_PREP', 'Premature infant', 'Positioning and comfort care education for parents of NICU baby. Taught containment holds and nonnutritive sucking support.', 'N/A - infant', 'Support parent-infant bonding. Reduce infant stress during care.', 'Swaddle blankets, pacifiers, positioning aids', TRUE, 'Parents demonstrated proper techniques. Infant showed reduced stress cues during care.'),
(3, 10, '2025-02-15', 'PLAY_THERAPY', 'Preschool', 'Play session incorporating breathing exercises and relaxation for asthma management. Made it fun with bubble play.', 'High - enjoyed activities', 'Teach deep breathing in engaging way. Reduce anxiety about breathing difficulties.', 'Bubbles, pinwheels, breathing ball, visual charts', TRUE, 'Patient learned pursed-lip breathing technique. Mother able to coach at home.');

-- =====================================================
-- NICU ADMISSION DATA
-- =====================================================
INSERT INTO nicu_admission (child_id, admission_date, discharge_date, gestational_age_at_birth, birth_weight_grams, apgar_score_1min, apgar_score_5min, delivery_type, complications_at_birth, respiratory_support, feeding_type, phototherapy_required, blood_transfusion_given, length_of_stay_days, discharge_weight_grams, discharge_disposition) VALUES
(6, '2025-01-20 14:30:00', NULL, '26 weeks 3 days', 1200, 4, 6, 'C-Section - preterm labor', 'Respiratory distress syndrome, Patent ductus arteriosus, Intraventricular hemorrhage Grade I', 'Mechanical ventilation -> CPAP -> High-flow nasal cannula (current)', 'TPN + Minimal enteral feeds', TRUE, TRUE, 41, 2150, 'Still admitted - progressing toward discharge'),
(1, '2024-12-15 08:20:00', '2024-12-17 14:00:00', '38 weeks 2 days', 2850, 8, 9, 'Vaginal - uncomplicated', 'Transient tachypnea of newborn', 'Room air -> resolved in 24 hours', 'Breastfeeding', FALSE, FALSE, 2, 2750, 'Home with mother - doing well');
