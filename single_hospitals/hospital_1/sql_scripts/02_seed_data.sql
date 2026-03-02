-- =====================================================
-- SEED DATA FOR HOSPITAL 1 - CARECENTRAL
-- =====================================================

-- Insert Caregivers
INSERT INTO caregivers (employee_code, first_name, last_name, role, specialization, license_number, contact_phone, contact_email, years_experience, hire_date, consultation_fee, unit_id) VALUES
('CC-EMP-001', 'Sarah', 'Johnson', 'Doctor', 'Cardiology', 'MD-12345', '555-0101', 'sarah.j@carecentral.com', 15, '2015-03-15', 200.00, (SELECT unit_id FROM care_units WHERE unit_code = 'CARD')),
('CC-EMP-002', 'Michael', 'Chen', 'Doctor', 'Pediatrics', 'MD-12346', '555-0102', 'michael.c@carecentral.com', 10, '2018-06-20', 180.00, (SELECT unit_id FROM care_units WHERE unit_code = 'PED')),
('CC-EMP-003', 'Emily', 'Rodriguez', 'Nurse', 'General Care', 'RN-54321', '555-0103', 'emily.r@carecentral.com', 8, '2019-01-10', 75.00, (SELECT unit_id FROM care_units WHERE unit_code = 'GEN')),
('CC-EMP-004', 'David', 'Williams', 'Doctor', 'Orthopedics', 'MD-12347', '555-0104', 'david.w@carecentral.com', 20, '2010-09-01', 250.00, (SELECT unit_id FROM care_units WHERE unit_code = 'ORTHO')),
('CC-EMP-005', 'Lisa', 'Anderson', 'Nurse', 'Emergency Care', 'RN-54322', '555-0105', 'lisa.a@carecentral.com', 12, '2016-04-15', 85.00, (SELECT unit_id FROM care_units WHERE unit_code = 'EMERG')),
('CC-EMP-006', 'James', 'Martinez', 'Doctor', 'Neurology', 'MD-12348', '555-0106', 'james.m@carecentral.com', 18, '2012-11-30', 280.00, (SELECT unit_id FROM care_units WHERE unit_code = 'NEURO')),
('CC-EMP-007', 'Jennifer', 'Taylor', 'Specialist', 'Radiology', 'RAD-98765', '555-0107', 'jennifer.t@carecentral.com', 14, '2014-07-22', 220.00, (SELECT unit_id FROM care_units WHERE unit_code = 'RAD')),
('CC-EMP-008', 'Robert', 'Chang', 'Pharmacist', 'Clinical Pharmacy', 'RPH-11111', '555-0108', 'r.chang@carecentral.com', 9, '2017-05-12', 95.00, (SELECT unit_id FROM care_units WHERE unit_code = 'PHARM'));

-- Insert Patients
INSERT INTO patients (patient_number, first_name, last_name, date_of_birth, gender, blood_type, contact_phone, contact_email, address_line1, address_city, address_state, address_zip, emergency_contact_name, emergency_contact_phone, insurance_provider, insurance_policy_number, allergies, chronic_conditions) VALUES
('PAT-CC-1001', 'Robert', 'Smith', '1975-05-12', 'Male', 'O+', '555-1001', 'robert.smith@email.com', '123 Main St', 'Springfield', 'IL', '62701', 'Mary Smith', '555-1002', 'BlueCross', 'BC-123456', 'Penicillin', 'Hypertension'),
('PAT-CC-1002', 'Patricia', 'Brown', '1982-08-25', 'Female', 'A+', '555-1003', 'patricia.b@email.com', '456 Oak Ave', 'Springfield', 'IL', '62702', 'John Brown', '555-1004', 'Aetna', 'AET-789012', 'None', 'Diabetes Type 2'),
('PAT-CC-1003', 'William', 'Davis', '1990-11-30', 'Male', 'B+', '555-1005', 'william.d@email.com', '789 Elm St', 'Springfield', 'IL', '62703', 'Susan Davis', '555-1006', 'UnitedHealth', 'UH-345678', 'Shellfish', NULL),
('PAT-CC-1004', 'Maria', 'Garcia', '1968-03-18', 'Female', 'AB+', '555-1007', 'maria.g@email.com', '321 Pine Rd', 'Springfield', 'IL', '62704', 'Carlos Garcia', '555-1008', 'Cigna', 'CIG-901234', 'Latex', 'Asthma'),
('PAT-CC-1005', 'Charles', 'Wilson', '1955-09-07', 'Male', 'O-', '555-1009', 'charles.w@email.com', '654 Maple Dr', 'Springfield', 'IL', '62705', 'Linda Wilson', '555-1010', 'BlueCross', 'BC-567890', NULL, 'Arthritis'),
('PAT-CC-1006', 'Jennifer', 'Moore', '1995-12-22', 'Female', 'A-', '555-1011', 'jennifer.m@email.com', '987 Cedar Ln', 'Springfield', 'IL', '62706', 'Thomas Moore', '555-1012', 'Humana', 'HUM-234567', 'Peanuts', NULL),
('PAT-CC-1007', 'Thomas', 'Taylor', '1978-06-14', 'Male', 'B-', '555-1013', 'thomas.t@email.com', '147 Birch St', 'Springfield', 'IL', '62707', 'Nancy Taylor', '555-1014', 'Aetna', 'AET-890123', 'Sulfa drugs', 'High cholesterol'),
('PAT-CC-1008', 'Linda', 'Anderson', '1988-02-28', 'Female', 'AB-', '555-1015', 'linda.a@email.com', '258 Willow Way', 'Springfield', 'IL', '62708', 'Mark Anderson', '555-1016', 'BlueCross', 'BC-456789', NULL, NULL);

-- Insert Pharmaceuticals
INSERT INTO pharmaceuticals (drug_name, generic_name, brand_name, strength, dosage_form, administration_route, therapeutic_class, manufacturer, ndc_code, is_controlled, requires_prescription) VALUES
('Lisinopril', 'Lisinopril', 'Prinivil', '10mg', 'Tablet', 'Oral', 'ACE Inhibitor', 'Merck', 'NDC-0006-0019-54', FALSE, TRUE),
('Metformin', 'Metformin HCl', 'Glucophage', '500mg', 'Tablet', 'Oral', 'Antidiabetic', 'Bristol-Myers Squibb', 'NDC-0087-6060-05', FALSE, TRUE),
('Albuterol Inhaler', 'Albuterol Sulfate', 'ProAir HFA', '90mcg', 'Inhaler', 'Inhalation', 'Bronchodilator', 'Teva', 'NDC-59310-579-18', FALSE, TRUE),
('Sumatriptan', 'Sumatriptan', 'Imitrex', '50mg', 'Tablet', 'Oral', 'Antimigraine', 'GSK', 'NDC-0173-0715-00', FALSE, TRUE),
('Ibuprofen', 'Ibuprofen', 'Advil', '200mg', 'Tablet', 'Oral', 'NSAID', 'Pfizer', 'NDC-0573-0164-40', FALSE, FALSE),
('Amoxicillin', 'Amoxicillin', 'Amoxil', '500mg', 'Capsule', 'Oral', 'Antibiotic', 'Sandoz', 'NDC-0781-2082-10', FALSE, TRUE);

-- Insert Pharmacy Stock
INSERT INTO pharmacy_stock (pharmaceutical_id, batch_number, quantity_available, unit_price, expiry_date, manufactured_date, supplier_name, reorder_level, max_stock_level, storage_location) VALUES
((SELECT pharmaceutical_id FROM pharmaceuticals WHERE drug_name = 'Lisinopril'), 'BATCH-LIS-001', 500, 0.25, '2027-06-30', '2025-06-01', 'Cardinal Health', 50, 1000, 'Shelf A-12'),
((SELECT pharmaceutical_id FROM pharmaceuticals WHERE drug_name = 'Metformin'), 'BATCH-MET-001', 750, 0.15, '2027-08-15', '2025-08-01', 'McKesson', 100, 1500, 'Shelf B-08'),
((SELECT pharmaceutical_id FROM pharmaceuticals WHERE drug_name = 'Albuterol Inhaler'), 'BATCH-ALB-001', 200, 35.50, '2027-03-20', '2025-03-01', 'AmerisourceBergen', 20, 400, 'Refrigerator R-02'),
((SELECT pharmaceutical_id FROM pharmaceuticals WHERE drug_name = 'Sumatriptan'), 'BATCH-SUM-001', 300, 8.75, '2028-01-10', '2026-01-01', 'Cardinal Health', 30, 600, 'Shelf C-15'),
((SELECT pharmaceutical_id FROM pharmaceuticals WHERE drug_name = 'Ibuprofen'), 'BATCH-IBU-001', 1000, 0.08, '2028-12-31', '2025-12-01', 'McKesson', 100, 2000, 'Shelf D-05'),
((SELECT pharmaceutical_id FROM pharmaceuticals WHERE drug_name = 'Amoxicillin'), 'BATCH-AMX-001', 600, 0.45, '2026-11-30', '2024-11-01', 'AmerisourceBergen', 50, 1000, 'Shelf A-20');

-- Insert Clinical Equipment
INSERT INTO clinical_equipment (unit_id, equipment_name, equipment_type, model_name, manufacturer, serial_number, purchase_date, purchase_cost, warranty_expires, current_status, location_details) VALUES
((SELECT unit_id FROM care_units WHERE unit_code = 'CARD'), 'ECG Machine', 'diagnostic', 'MAC 5500', 'GE Healthcare', 'SN-ECG-001', '2020-05-15', 12000.00, '2025-05-15', 'available', 'Cardiology Room 201'),
((SELECT unit_id FROM care_units WHERE unit_code = 'EMERG'), 'Defibrillator', 'life_support', 'Lifepak 15', 'Physio-Control', 'SN-DEF-001', '2021-03-10', 25000.00, '2026-03-10', 'available', 'Emergency Bay 1'),
((SELECT unit_id FROM care_units WHERE unit_code = 'RAD'), 'X-Ray Machine', 'imaging', 'Optima XR240', 'GE Healthcare', 'SN-XRAY-001', '2019-08-22', 150000.00, '2024-08-22', 'available', 'Radiology Suite'),
((SELECT unit_id FROM care_units WHERE unit_code = 'ORTHO'), 'Bone Drill', 'surgical', 'System 8', 'Stryker', 'SN-DRILL-001', '2022-01-05', 8000.00, '2027-01-05', 'available', 'OR 3'),
((SELECT unit_id FROM care_units WHERE unit_code = 'NEURO'), 'EEG Machine', 'diagnostic', 'Nihon Kohden', 'Nihon Kohden', 'SN-EEG-001', '2020-11-18', 45000.00, '2025-11-18', 'available', 'Neuro Lab');

-- Insert Visits
INSERT INTO visits (patient_id, caregiver_id, unit_id, visit_date, visit_type, chief_complaint, vital_signs, notes, duration_minutes, status) VALUES
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1001'), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Johnson'), (SELECT unit_id FROM care_units WHERE unit_code = 'CARD'), '2026-02-15 09:00:00', 'Follow-up', 'Blood pressure check', '{"temperature": 98.6, "bp": "145/90", "pulse": 78}', 'Patient responding well to medication', 30, 'Completed'),
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1002'), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Chen'), (SELECT unit_id FROM care_units WHERE unit_code = 'PED'), '2026-02-18 10:30:00', 'Checkup', 'Diabetes management', '{"temperature": 98.2, "bp": "130/85", "pulse": 72, "glucose": 145}', 'Blood sugar levels stable', 45, 'Completed'),
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1003'), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Williams'), (SELECT unit_id FROM care_units WHERE unit_code = 'ORTHO'), '2026-02-20 14:00:00', 'Emergency', 'Knee pain after sports injury', '{"temperature": 98.9, "bp": "120/80", "pulse": 88}', 'Possible ligament strain', 60, 'Completed'),
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1004'), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Chen'), (SELECT unit_id FROM care_units WHERE unit_code = 'PED'), '2026-02-22 11:00:00', 'Follow-up', 'Asthma symptoms', '{"temperature": 97.8, "bp": "125/82", "pulse": 75, "spo2": 95}', 'Prescribed new inhaler', 35, 'Completed'),
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1005'), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Williams'), (SELECT unit_id FROM care_units WHERE unit_code = 'ORTHO'), '2026-02-25 15:30:00', 'Checkup', 'Joint pain management', '{"temperature": 98.4, "bp": "138/88", "pulse": 70}', 'Arthritis management plan updated', 40, 'Completed'),
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1006'), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Martinez'), (SELECT unit_id FROM care_units WHERE unit_code = 'NEURO'), '2026-02-28 09:30:00', 'Consultation', 'Headaches and migraines', '{"temperature": 98.5, "bp": "118/75", "pulse": 68}', 'Neurological examination completed', 50, 'Completed'),
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1007'), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Johnson'), (SELECT unit_id FROM care_units WHERE unit_code = 'CARD'), '2026-03-01 13:00:00', 'Follow-up', 'Cholesterol monitoring', '{"temperature": 98.7, "bp": "135/85", "pulse": 74}', 'Lipid panel ordered', 25, 'Completed');

-- Insert Diagnoses
INSERT INTO diagnoses (visit_id, diagnosis_code, diagnosis_name, diagnosis_description, severity) VALUES
((SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1001' LIMIT 1), 'I10', 'Hypertension', 'Essential (primary) hypertension', 'Moderate'),
((SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1002' LIMIT 1), 'E11', 'Type 2 Diabetes', 'Type 2 diabetes mellitus', 'Moderate'),
((SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1003' LIMIT 1), 'S83.4', 'Knee Ligament Sprain', 'Sprain of collateral ligament of knee', 'Mild'),
((SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1004' LIMIT 1), 'J45.0', 'Allergic Asthma', 'Predominantly allergic asthma', 'Moderate'),
((SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1005' LIMIT 1), 'M19.90', 'Osteoarthritis', 'Unspecified osteoarthritis', 'Moderate'),
((SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1006' LIMIT 1), 'G43.9', 'Migraine', 'Migraine, unspecified', 'Moderate');

-- Insert Treatments
INSERT INTO treatments (visit_id, diagnosis_id, pharmaceutical_id, treatment_type, treatment_name, instructions, dosage, frequency, duration_days, start_date, cost, prescribed_by, status) VALUES
((SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1001' LIMIT 1), (SELECT diagnosis_id FROM diagnoses WHERE diagnosis_code = 'I10' LIMIT 1), (SELECT pharmaceutical_id FROM pharmaceuticals WHERE drug_name = 'Lisinopril'), 'Medication', 'Lisinopril', 'Take with water, avoid potassium supplements', '10mg', 'Once daily', 90, '2026-02-15', 45.00, (SELECT caregiver_id FROM caregivers WHERE last_name = 'Johnson'), 'Active'),
((SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1002' LIMIT 1), (SELECT diagnosis_id FROM diagnoses WHERE diagnosis_code = 'E11' LIMIT 1), (SELECT pharmaceutical_id FROM pharmaceuticals WHERE drug_name = 'Metformin'), 'Medication', 'Metformin', 'Take with meals', '500mg', 'Twice daily', 90, '2026-02-18', 35.00, (SELECT caregiver_id FROM caregivers WHERE last_name = 'Chen'), 'Active'),
((SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1003' LIMIT 1), (SELECT diagnosis_id FROM diagnoses WHERE diagnosis_code = 'S83.4' LIMIT 1), NULL, 'Therapy', 'Physical Therapy', 'Knee strengthening exercises, ice application', 'N/A', '3 times per week', 30, '2026-02-20', 450.00, (SELECT caregiver_id FROM caregivers WHERE last_name = 'Williams'), 'Active'),
((SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1004' LIMIT 1), (SELECT diagnosis_id FROM diagnoses WHERE diagnosis_code = 'J45.0' LIMIT 1), (SELECT pharmaceutical_id FROM pharmaceuticals WHERE drug_name = 'Albuterol Inhaler'), 'Medication', 'Albuterol Inhaler', 'Use as needed for breathing difficulty', '90mcg', 'As needed', 180, '2026-02-22', 55.00, (SELECT caregiver_id FROM caregivers WHERE last_name = 'Chen'), 'Active'),
((SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1006' LIMIT 1), (SELECT diagnosis_id FROM diagnoses WHERE diagnosis_code = 'G43.9' LIMIT 1), (SELECT pharmaceutical_id FROM pharmaceuticals WHERE drug_name = 'Sumatriptan'), 'Medication', 'Sumatriptan', 'Take at onset of migraine symptoms', '50mg', 'As needed', 90, '2026-02-28', 75.00, (SELECT caregiver_id FROM caregivers WHERE last_name = 'Martinez'), 'Active');

-- Insert Medical Records
INSERT INTO medical_records (patient_id, visit_id, caregiver_id, record_type, record_date, title, description, uploaded_by) VALUES
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1001'), (SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1001' LIMIT 1), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Johnson'), 'Lab Result', '2026-02-15', 'Blood Pressure Panel', 'Blood pressure readings over 24 hours', (SELECT caregiver_id FROM caregivers WHERE last_name = 'Johnson')),
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1002'), (SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1002' LIMIT 1), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Chen'), 'Lab Result', '2026-02-18', 'HbA1c Test', 'Hemoglobin A1c: 7.2%', (SELECT caregiver_id FROM caregivers WHERE last_name = 'Chen')),
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1003'), (SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1003' LIMIT 1), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Taylor'), 'Imaging', '2026-02-20', 'Knee X-Ray', 'Radiographic examination of right knee', (SELECT caregiver_id FROM caregivers WHERE last_name = 'Taylor')),
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1004'), (SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1004' LIMIT 1), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Chen'), 'Lab Result', '2026-02-22', 'Pulmonary Function Test', 'Spirometry results show moderate obstruction', (SELECT caregiver_id FROM caregivers WHERE last_name = 'Chen')),
((SELECT patient_id FROM patients WHERE patient_number = 'PAT-CC-1006'), (SELECT visit_id FROM visits v JOIN patients p ON v.patient_id = p.patient_id WHERE p.patient_number = 'PAT-CC-1006' LIMIT 1), (SELECT caregiver_id FROM caregivers WHERE last_name = 'Martinez'), 'Imaging', '2026-02-28', 'Brain MRI', 'MRI scan to rule out neurological causes', (SELECT caregiver_id FROM caregivers WHERE last_name = 'Martinez'));
