-- =====================================================
-- HOSPITAL 4: CENTRAL BILLING - Seed Data
-- Financial/Billing terminology sample data
-- =====================================================

-- =====================================================
-- STAFF_MEMBERS Data
-- =====================================================

INSERT INTO staff_members (center_id, employee_number, first_name, last_name, job_title, employment_status, certification, license_number, hourly_wage, work_schedule, phone_number, email_address, hire_date) VALUES
(1, 'EMP001', 'Susan', 'Martinez', 'Billing Manager', 'Active', 'Certified Revenue Cycle Professional', 'BM001', 32.50, 'Day', '555-1001', 'susan.martinez@centralbilling.com', '2015-03-01'),
(2, 'EMP002', 'Dr. Michael', 'Chen', 'Cardiologist', 'Active', 'Board Certified Cardiology', 'MD12345', 185.00, 'Day', '555-1002', 'michael.chen@centralbilling.com', '2018-07-15'),
(3, 'EMP003', 'Dr. Sarah', 'Johnson', 'Emergency Physician', 'Active', 'Board Certified Emergency Medicine', 'MD12346', 175.00, 'Rotating', '555-1003', 'sarah.johnson@centralbilling.com', '2016-01-10'),
(4, 'EMP004', 'Dr. Robert', 'Williams', 'Chief of Surgery', 'Active', 'Board Certified General Surgery', 'MD12347', 220.00, 'Day', '555-1004', 'robert.williams@centralbilling.com', '2012-05-20'),
(5, 'EMP005', 'Mark', 'Davis', 'Radiology Technician', 'Active', 'ARRT Registered', 'RT001', 28.75, 'Day', '555-1005', 'mark.davis@centralbilling.com', '2019-09-05'),
(6, 'EMP006', 'Lisa', 'Thompson', 'Pharmacy Director', 'Active', 'PharmD, RPh', 'RPH001', 65.00, 'Day', '555-1006', 'lisa.thompson@centralbilling.com', '2014-11-12'),
(7, 'EMP007', 'Dr. Jennifer', 'Garcia', 'Pediatrician', 'Active', 'Board Certified Pediatrics', 'MD12348', 165.00, 'Day', '555-1007', 'jennifer.garcia@centralbilling.com', '2017-02-28'),
(8, 'EMP008', 'James', 'Wilson', 'Revenue Cycle Analyst', 'Active', 'RHIA Certified', 'RC001', 29.50, 'Day', '555-1008', 'james.wilson@centralbilling.com', '2020-06-01'),
(9, 'EMP009', 'Amanda', 'Brown', 'Insurance Coordinator', 'Active', 'CPC Certified', 'IC001', 24.00, 'Day', '555-1009', 'amanda.brown@centralbilling.com', '2018-10-15'),
(10, 'EMP010', 'Dr. David', 'Lee', 'Anesthesiologist', 'Active', 'Board Certified Anesthesiology', 'MD12349', 195.00, 'Rotating', '555-1010', 'david.lee@centralbilling.com', '2015-08-03');
GO

-- Update service centers with managers
UPDATE service_centers SET manager_id = 1 WHERE center_code = 'BILL-001';
UPDATE service_centers SET manager_id = 2 WHERE center_code = 'CARD-001';
UPDATE service_centers SET manager_id = 3 WHERE center_code = 'EMER-001';
UPDATE service_centers SET manager_id = 4 WHERE center_code = 'SURG-001';
UPDATE service_centers SET manager_id = 5 WHERE center_code = 'DIAG-001';
UPDATE service_centers SET manager_id = 6 WHERE center_code = 'PHAR-001';
UPDATE service_centers SET manager_id = 7 WHERE center_code = 'PEDI-001';
GO

-- =====================================================
-- ACCOUNT_HOLDERS Data
-- =====================================================

INSERT INTO account_holders (account_number, full_name, birth_date, gender, blood_type, contact_phone, email_address, billing_address, city, state_code, zip_code, emergency_contact, emergency_phone, insurance_provider, policy_number, allergies, medical_notes) VALUES
('ACT001001', 'Margaret Thompson', '1985-04-15', 'Female', 'A+', '555-2001', 'margaret.thompson@email.com', '123 Main Street', 'Springfield', 'IL', '62701', 'John Thompson', '555-2101', 'BlueCross BlueShield', 'BC123456789', 'Penicillin', 'Regular checkups needed'),
('ACT001002', 'Robert Johnson', '1978-11-30', 'Male', 'O-', '555-2002', 'robert.johnson@email.com', '456 Oak Avenue', 'Springfield', 'IL', '62702', 'Mary Johnson', '555-2102', 'Aetna', 'AE987654321', 'None', 'Diabetic - Type 2'),
('ACT001003', 'Emily Davis', '1992-07-22', 'Female', 'B+', '555-2003', 'emily.davis@email.com', '789 Pine Street', 'Springfield', 'IL', '62703', 'Michael Davis', '555-2103', 'United Healthcare', 'UH456789123', 'Shellfish', 'Pregnant - due May 2024'),
('ACT001004', 'William Garcia', '1965-02-08', 'Male', 'AB+', '555-2004', 'william.garcia@email.com', '321 Elm Drive', 'Springfield', 'IL', '62704', 'Maria Garcia', '555-2104', 'Cigna', 'CG789123456', 'Latex', 'History of heart disease'),
('ACT001005', 'Linda Martinez', '1990-09-12', 'Female', 'A-', '555-2005', 'linda.martinez@email.com', '654 Birch Lane', 'Springfield', 'IL', '62705', 'Carlos Martinez', '555-2105', 'Humana', 'HU123789456', 'Aspirin', 'Hypertension managed'),
('ACT001006', 'James Wilson', '1983-06-03', 'Male', 'O+', '555-2006', 'james.wilson@email.com', '987 Cedar Court', 'Springfield', 'IL', '62706', 'Susan Wilson', '555-2106', 'Kaiser Permanente', 'KP654321987', 'Codeine', 'Asthma - well controlled'),
('ACT001007', 'Patricia Brown', '1995-12-18', 'Female', 'B-', '555-2007', 'patricia.brown@email.com', '147 Maple Road', 'Springfield', 'IL', '62707', 'Daniel Brown', '555-2107', 'BlueCross BlueShield', 'BC987321654', 'Peanuts', 'Recent surgery - recovering'),
('ACT001008', 'Christopher Lee', '1987-03-25', 'Male', 'AB-', '555-2008', 'christopher.lee@email.com', '258 Walnut Street', 'Springfield', 'IL', '62708', 'Michelle Lee', '555-2108', 'Medicaid', 'MC147258369', 'None', 'Chronic back pain'),
('ACT001009', 'Jessica Anderson', '1989-10-07', 'Female', 'A+', '555-2009', 'jessica.anderson@email.com', '369 Hickory Avenue', 'Springfield', 'IL', '62709', 'Mark Anderson', '555-2109', 'Medicare', 'MR258147963', 'Sulfa drugs', 'Diabetic - Type 1'),
('ACT001010', 'Michael Taylor', '1976-08-14', 'Male', 'O+', '555-2010', 'michael.taylor@email.com', '741 Chestnut Boulevard', 'Springfield', 'IL', '62710', 'Jennifer Taylor', '555-2110', 'Tricare', 'TC369852147', 'Iodine', 'Veteran - PTSD treatment');
GO

-- =====================================================
-- PHARMACEUTICAL_PRODUCTS Data
-- =====================================================

INSERT INTO pharmaceutical_products (product_name, generic_name, brand_name, strength, dosage_form, route, therapeutic_class, manufacturer, ndc_number, controlled_substance, prescription_required) VALUES
('Metformin Hydrochloride', 'Metformin', 'Glucophage', '500mg', 'Tablet', 'Oral', 'Antidiabetic', 'Bristol-Myers Squibb', '00056-0173-01', 0, 1),
('Lisinopril', 'Lisinopril', 'Prinivil', '10mg', 'Tablet', 'Oral', 'ACE Inhibitor', 'Merck', '00006-0207-31', 0, 1),
('Atorvastatin Calcium', 'Atorvastatin', 'Lipitor', '20mg', 'Tablet', 'Oral', 'HMG-CoA Reductase Inhibitor', 'Pfizer', '00071-0157-23', 0, 1),
('Amlodipine Besylate', 'Amlodipine', 'Norvasc', '5mg', 'Tablet', 'Oral', 'Calcium Channel Blocker', 'Pfizer', '00071-0222-23', 0, 1),
('Omeprazole', 'Omeprazole', 'Prilosec', '20mg', 'Capsule', 'Oral', 'Proton Pump Inhibitor', 'AstraZeneca', '00186-0281-03', 0, 1),
('Hydrocodone/Acetaminophen', 'Hydrocodone/Acetaminophen', 'Vicodin', '5/325mg', 'Tablet', 'Oral', 'Narcotic Analgesic', 'AbbVie', '00074-3771-13', 1, 1),
('Albuterol Sulfate', 'Albuterol', 'ProAir HFA', '90mcg', 'Inhaler', 'Inhalation', 'Beta-2 Agonist', 'Teva', '59310-579-18', 0, 1),
('Cephalexin', 'Cephalexin', 'Keflex', '500mg', 'Capsule', 'Oral', 'Antibiotic', 'Lupin', '68180-516-09', 0, 1),
('Ibuprofen', 'Ibuprofen', 'Advil', '200mg', 'Tablet', 'Oral', 'NSAID', 'Pfizer', '00573-0164-70', 0, 0),
('Acetaminophen', 'Acetaminophen', 'Tylenol', '325mg', 'Tablet', 'Oral', 'Analgesic', 'Johnson & Johnson', '50580-488-01', 0, 0);
GO

-- =====================================================
-- PHARMACY_INVENTORY Data
-- =====================================================

INSERT INTO pharmacy_inventory (product_id, batch_number, quantity_on_hand, unit_cost, expiration_date, manufacture_date, supplier, reorder_point, max_quantity, storage_location) VALUES
(1, 'MET2024001', 850, 0.15, '2025-08-15', '2023-08-15', 'Cardinal Health', 100, 1000, 'A1-01'),
(2, 'LIS2024001', 920, 0.08, '2025-09-20', '2023-09-20', 'McKesson', 150, 1200, 'A1-02'),
(3, 'ATO2024001', 650, 0.25, '2025-07-10', '2023-07-10', 'AmerisourceBergen', 80, 800, 'A1-03'),
(4, 'AML2024001', 770, 0.12, '2025-10-05', '2023-10-05', 'Cardinal Health', 120, 1000, 'A1-04'),
(5, 'OME2024001', 480, 0.18, '2025-06-25', '2023-06-25', 'McKesson', 60, 600, 'A1-05'),
(6, 'HYD2024001', 120, 1.50, '2025-12-01', '2023-12-01', 'AmerisourceBergen', 20, 200, 'B1-01'),
(7, 'ALB2024001', 300, 12.50, '2025-11-15', '2023-11-15', 'Cardinal Health', 30, 400, 'B1-02'),
(8, 'CEP2024001', 560, 0.45, '2025-08-30', '2023-08-30', 'McKesson', 75, 700, 'A1-06'),
(9, 'IBU2024001', 1200, 0.05, '2026-03-20', '2024-03-20', 'Generic Supplier', 200, 1500, 'C1-01'),
(10, 'ACE2024001', 1500, 0.03, '2026-02-28', '2024-02-28', 'Generic Supplier', 250, 2000, 'C1-02');
GO

-- =====================================================
-- MEDICAL_ASSETS Data
-- =====================================================

INSERT INTO medical_assets (center_id, asset_name, asset_type, model, manufacturer, serial_number, purchase_date, purchase_cost, warranty_expiry, last_maintenance, next_maintenance, status, location) VALUES
(2, 'Cardiac Monitor Pro', 'Monitoring', 'CM-3000', 'Philips', 'PH2024001', '2022-01-15', 15000.00, '2027-01-15', '2024-01-15', '2024-07-15', 'Available', 'Cardiology Room 201'),
(3, 'Emergency Defibrillator', 'Life Support', 'ED-500', 'Zoll', 'ZL2024002', '2021-06-20', 8500.00, '2026-06-20', '2024-02-10', '2024-08-10', 'Available', 'Emergency Bay 1'),
(4, 'Surgical Light System', 'Surgical', 'SL-2500', 'Stryker', 'ST2024003', '2023-03-10', 25000.00, '2028-03-10', '2024-01-20', '2024-07-20', 'Available', 'OR Suite 1'),
(5, 'MRI Scanner', 'Imaging', 'MRI-1500T', 'GE Healthcare', 'GE2024004', '2020-09-05', 1200000.00, '2025-09-05', '2024-02-01', '2024-05-01', 'Available', 'MRI Room B1'),
(5, 'X-Ray Machine', 'Imaging', 'XR-200', 'Siemens', 'SI2024005', '2021-11-12', 85000.00, '2026-11-12', '2024-01-25', '2024-07-25', 'Available', 'X-Ray Suite 1'),
(6, 'Automated Dispensing System', 'Support', 'ADS-3000', 'Omnicell', 'OM2024006', '2022-04-18', 45000.00, '2027-04-18', '2024-02-15', '2024-08-15', 'Available', 'Main Pharmacy'),
(7, 'Pediatric Ventilator', 'Life Support', 'PV-150', 'Draeger', 'DR2024007', '2023-08-22', 35000.00, '2028-08-22', '2024-02-20', '2024-08-20', 'Available', 'Pediatric ICU'),
(3, 'Crash Cart', 'Emergency', 'CC-Pro', 'Waterloo Healthcare', 'WH2024008', '2022-12-05', 3500.00, '2027-12-05', '2024-01-30', '2024-07-30', 'Available', 'Emergency Station 2'),
(4, 'Anesthesia Machine', 'Surgical', 'AM-400', 'Draeger', 'DR2024009', '2021-07-14', 55000.00, '2026-07-14', '2024-02-05', '2024-08-05', 'Available', 'OR Suite 2'),
(5, 'Ultrasound System', 'Diagnostic', 'US-Pro200', 'Philips', 'PH2024010', '2023-01-30', 32000.00, '2028-01-30', '2024-01-10', '2024-07-10', 'Available', 'Diagnostic Room D1');
GO

-- =====================================================
-- SERVICE_APPOINTMENTS Data
-- =====================================================

INSERT INTO service_appointments (account_id, staff_id, center_id, appointment_datetime, duration_minutes, service_type, reason, status, billable_amount) VALUES
(1, 2, 2, '2024-03-15 09:00:00', 60, 'Consultation', 'Chest pain evaluation', 'Completed', 350.00),
(2, 9, 1, 2, '2024-03-15 10:30:00', 45, 'Follow-up', 'Insurance verification', 'Completed', 125.00),
(3, 7, 7, '2024-03-15 14:00:00', 30, 'Examination', 'Prenatal checkup', 'Completed', 275.00),
(4, 3, 3, '2024-03-15 16:45:00', 90, 'Emergency', 'Cardiac episode', 'Completed', 850.00),
(5, 2, 2, '2024-03-16 11:15:00', 45, 'Follow-up', 'Hypertension management', 'Completed', 225.00),
(6, 8, 1, '2024-03-16 13:30:00', 30, 'Consultation', 'Billing inquiry', 'Completed', 75.00),
(7, 4, 4, '2024-03-17 08:00:00', 120, 'Procedure', 'Post-surgical follow-up', 'Completed', 1250.00),
(8, 3, 3, '2024-03-17 15:20:00', 60, 'Emergency', 'Back pain assessment', 'Completed', 425.00),
(9, 7, 7, '2024-03-18 10:45:00', 40, 'Follow-up', 'Diabetes monitoring', 'Completed', 185.00),
(10, 1, 1, '2024-03-18 14:15:00', 25, 'Consultation', 'Payment plan setup', 'Completed', 50.00),
(1, 2, 2, '2024-03-20 09:30:00', 45, 'Follow-up', 'Cardiology follow-up', 'Scheduled', 275.00),
(3, 7, 7, '2024-03-22 11:00:00', 30, 'Examination', 'Routine prenatal', 'Scheduled', 225.00);
GO

-- =====================================================
-- CLINICAL_DOCUMENTATION Data
-- =====================================================

INSERT INTO clinical_documentation (account_id, appointment_id, staff_id, document_type, document_date, document_title, document_content, clinical_findings, created_by) VALUES
(1, 1, 2, 'Progress Note', '2024-03-15', 'Cardiology Consultation Report', 'Patient presented with chest pain. EKG normal, stress test scheduled.', 'No acute cardiac issues identified', 2),
(2, 2, 9, 'Progress Note', '2024-03-15', 'Insurance Verification Report', 'Insurance benefits verified. Coverage confirmed for ongoing diabetes management.', 'Insurance active and valid', 9),
(3, 3, 7, 'Progress Note', '2024-03-15', 'Prenatal Examination', 'Routine prenatal visit. Fetal heart rate normal, blood pressure stable.', 'Normal pregnancy progression', 7),
(4, 4, 3, 'Procedure Note', '2024-03-15', 'Emergency Cardiac Assessment', 'Patient admitted with cardiac symptoms. Cardiac enzymes elevated, cardiology consulted.', 'Possible MI, requires monitoring', 3),
(5, 5, 2, 'Progress Note', '2024-03-16', 'Hypertension Follow-up', 'Blood pressure well controlled on current medications. Continue current regimen.', 'HT well managed', 2),
(7, 7, 4, 'Procedure Note', '2024-03-17', 'Post-Surgical Follow-up', 'Surgical site healing well. No signs of infection. Sutures to be removed in one week.', 'Normal post-op recovery', 4),
(8, 8, 3, 'Progress Note', '2024-03-17', 'Back Pain Assessment', 'Chronic lower back pain evaluation. MRI ordered to rule out disc herniation.', 'Chronic pain, imaging needed', 3),
(9, 9, 7, 'Lab Report', '2024-03-18', 'Diabetes Management Lab Results', 'HbA1c: 7.2%. Blood glucose levels improving with current insulin regimen.', 'Diabetes control improving', 7);
GO

-- =====================================================
-- MEDICATION_PRESCRIPTIONS Data
-- =====================================================

INSERT INTO medication_prescriptions (account_id, staff_id, product_id, appointment_id, prescription_date, dosage, frequency, duration_days, quantity_prescribed, refills_allowed, status, instructions) VALUES
(1, 2, 3, 1, '2024-03-15', '20mg', 'Once daily', 30, 30, 2, 'Active', 'Take with food to reduce stomach upset'),
(2, 9, 1, 2, '2024-03-15', '500mg', 'Twice daily', 90, 180, 3, 'Active', 'Take with meals'),
(3, 7, 10, 3, '2024-03-15', '325mg', 'As needed', 30, 60, 0, 'Active', 'For headache, maximum 8 tablets per day'),
(4, 3, 6, 4, '2024-03-15', '5/325mg', 'Every 6 hours as needed', 7, 28, 0, 'Active', 'For severe pain only, may cause drowsiness'),
(5, 2, 2, 5, '2024-03-16', '10mg', 'Once daily', 30, 30, 2, 'Active', 'Take in morning, monitor blood pressure'),
(7, 4, 8, 7, '2024-03-17', '500mg', 'Every 8 hours', 10, 30, 0, 'Active', 'Complete entire course even if feeling better'),
(8, 3, 9, 8, '2024-03-17', '200mg', 'Every 8 hours as needed', 14, 42, 1, 'Active', 'Take with food, for pain and inflammation'),
(9, 7, 1, 9, '2024-03-18', '500mg', 'Twice daily', 90, 180, 3, 'Active', 'Monitor blood sugar levels regularly'),
(1, 2, 4, 11, '2024-03-20', '5mg', 'Once daily', 30, 30, 2, 'Active', 'For blood pressure control'),
(3, 7, 10, 12, '2024-03-22', '325mg', 'As needed', 30, 100, 1, 'Active', 'Safe during pregnancy for minor aches');
GO