-- =====================================================
-- SEED DATA FOR HOSPITAL 2 - HEALTHOPS
-- =====================================================

-- Insert Personnel (without division head references initially)
INSERT INTO personnel (employee_code, first_name, last_name, position_title, division_id, employment_type, certification_level, license_id, hourly_rate, shift_preference, contact_number, email_address, start_date) VALUES
('HO-EMP-1001', 'Dr. Richard', 'Thompson', 'Chief Cardiologist', 1, 'Full-time', 'Board Certified', 'MD-CARD-001', 150.00, 'Day', '555-2001', 'r.thompson@healthops.com', '2010-02-01'),
('HO-EMP-1002', 'Dr. Amanda', 'Lee', 'Emergency Physician', 2, 'Full-time', 'EM Board Certified', 'MD-EM-002', 140.00, 'Rotating', '555-2002', 'a.lee@healthops.com', '2011-05-15'),
('HO-EMP-1003', 'Dr. Marcus', 'Foster', 'Chief Surgeon', 3, 'Full-time', 'Board Certified', 'MD-SURG-003', 160.00, 'Day', '555-2003', 'm.foster@healthops.com', '2009-08-20'),
('HO-EMP-1004', 'Dr. Susan', 'Park', 'Pediatric Specialist', 4, 'Full-time', 'Pediatrics Board', 'MD-PED-004', 135.00, 'Day', '555-2004', 's.park@healthops.com', '2013-01-10'),
('HO-EMP-1005', 'Karen', 'White', 'Administrative Director', 5, 'Full-time', 'MBA Healthcare', 'ADM-005', 85.00, 'Day', '555-2005', 'k.white@healthops.com', '2006-03-01'),
('HO-EMP-1006', 'Dr. James', 'Cooper', 'Radiologist', 6, 'Full-time', 'Radiology Board', 'MD-RAD-006', 145.00, 'Day', '555-2006', 'j.cooper@healthops.com', '2008-06-12'),
('HO-EMP-1007', 'Dr. Helena', 'Gomez', 'Laboratory Director', 7, 'Full-time', 'Clinical Pathology', 'MD-PATH-007', 130.00, 'Day', '555-2007', 'h.gomez@healthops.com', '2007-09-05'),
('HO-EMP-1008', 'John', 'Adams', 'Senior Nurse', 1, 'Full-time', 'RN Critical Care', 'RN-001', 45.00, 'Day', '555-2008', 'j.adams@healthops.com', '2015-04-10'),
('HO-EMP-1009', 'Maria', 'Santos', 'Emergency Nurse', 2, 'Full-time', 'RN Emergency', 'RN-002', 48.00, 'Night', '555-2009', 'm.santos@healthops.com', '2016-11-20'),
('HO-EMP-1010', 'Robert', 'Kim', 'Surgical Technician', 3, 'Full-time', 'Surgical Tech', 'ST-001', 38.00, 'Day', '555-2010', 'r.kim@healthops.com', '2018-02-15');

-- Update divisions with head personnel
UPDATE divisions SET head_personnel_id = 1 WHERE division_code = 'CARD-01';
UPDATE divisions SET head_personnel_id = 2 WHERE division_code = 'EMER-01';
UPDATE divisions SET head_personnel_id = 3 WHERE division_code = 'SURG-01';
UPDATE divisions SET head_personnel_id = 4 WHERE division_code = 'PEDIA-01';
UPDATE divisions SET head_personnel_id = 5 WHERE division_code = 'ADMIN-01';
UPDATE divisions SET head_personnel_id = 6 WHERE division_code = 'RADIO-01';
UPDATE divisions SET head_personnel_id = 7 WHERE division_code = 'LAB-01';

-- Insert Clients
INSERT INTO clients (client_number, full_name, date_of_birth, gender, blood_group, phone_number, email_address, residential_address, city, state_province, postal_code, emergency_contact, emergency_phone, insurance_company, policy_number, known_allergies, medical_history) VALUES
('CLI-HO-2001', 'Alexander Morgan', '1980-04-12', 'Male', 'O+', '555-3001', 'alex.morgan@email.com', '789 Business Blvd', 'Metro City', 'TX', '75201', 'Rebecca Morgan', '555-3002', 'United Healthcare', 'UH-987654', 'Penicillin', 'Hypertension'),
('CLI-HO-2002', 'Sophia Bennett', '1992-07-25', 'Female', 'A+', '555-3003', 'sophia.b@email.com', '456 Corporate Ave', 'Metro City', 'TX', '75202', 'David Bennett', '555-3004', 'Aetna', 'AET-456789', 'None', 'Diabetes'),
('CLI-HO-2003', 'Ethan Rodriguez', '1975-11-08', 'Male', 'B+', '555-3005', 'ethan.r@email.com', '123 Enterprise St', 'Metro City', 'TX', '75203', 'Carmen Rodriguez', '555-3006', 'BlueCross', 'BC-321654', 'Shellfish', NULL),
('CLI-HO-2004', 'Olivia Chen', '1988-02-14', 'Female', 'AB+', '555-3007', 'olivia.chen@email.com', '987 Industry Rd', 'Metro City', 'TX', '75204', 'Michael Chen', '555-3008', 'Cigna', 'CIG-789123', 'Latex', 'Asthma'),
('CLI-HO-2005', 'Noah Williams', '1995-09-30', 'Male', 'O-', '555-3009', 'noah.w@email.com', '654 Commerce Dr', 'Metro City', 'TX', '75205', 'Sarah Williams', '555-3010', 'Humana', 'HUM-654321', NULL, 'None'),
('CLI-HO-2006', 'Emma Thompson', '1983-06-18', 'Female', 'A-', '555-3011', 'emma.t@email.com', '321 Trade Center', 'Metro City', 'TX', '75206', 'James Thompson', '555-3012', 'United Healthcare', 'UH-147258', 'Peanuts', 'Migraine');

-- Insert Drug Catalog
INSERT INTO drug_catalog (drug_name, generic_name, brand_name, strength, formulation, route_of_admin, category, manufacturer, ndc_code, is_controlled_substance, requires_prescription) VALUES
('Lisinopril', 'Lisinopril', 'Prinivil', '10mg', 'Tablet', 'Oral', 'ACE Inhibitor', 'Merck', 'NDC-HO-0019-54', FALSE, TRUE),
('Metformin HCl', 'Metformin Hydrochloride', 'Glucophage', '500mg', 'Tablet', 'Oral', 'Antidiabetic', 'Bristol-Myers Squibb', 'NDC-HO-6060-05', FALSE, TRUE),
('Albuterol Sulfate', 'Albuterol Sulfate', 'ProAir HFA', '90mcg', 'Inhaler', 'Inhalation', 'Bronchodilator', 'Teva Pharmaceuticals', 'NDC-HO-579-18', FALSE, TRUE),
('Sumatriptan', 'Sumatriptan Succinate', 'Imitrex', '50mg', 'Tablet', 'Oral', 'Antimigraine', 'GSK', 'NDC-HO-715-00', FALSE, TRUE),
('Ibuprofen', 'Ibuprofen', 'Advil', '200mg', 'Tablet', 'Oral', 'NSAID', 'Pfizer Consumer', 'NDC-HO-164-40', FALSE, FALSE),
('Amoxicillin', 'Amoxicillin', 'Amoxil', '500mg', 'Capsule', 'Oral', 'Antibiotic', 'Sandoz', 'NDC-HO-082-10', FALSE, TRUE);

-- Insert Drug Inventory
INSERT INTO drug_inventory (drug_id, batch_code, units_in_stock, cost_per_unit, expiration_date, manufacture_date, supplier, minimum_threshold, maximum_capacity, storage_area) VALUES
(1, 'HO-LIS-001', 800, 0.28, '2027-06-30', '2025-06-01', 'Cardinal Health', 80, 1600, 'Pharmacy Zone A'),
(2, 'HO-MET-001', 1200, 0.18, '2027-08-15', '2025-08-01', 'McKesson Corporation', 150, 2400, 'Pharmacy Zone B'),
(3, 'HO-ALB-001', 350, 38.50, '2027-03-20', '2025-03-01', 'AmerisourceBergen', 35, 700, 'Refrigerated Unit'),
(4, 'HO-SUM-001', 500, 9.25, '2028-01-10', '2026-01-01', 'Cardinal Health', 50, 1000, 'Pharmacy Zone C'),
(5, 'HO-IBU-001', 2000, 0.05, '2028-12-31', '2025-12-01', 'McKesson Corporation', 200, 4000, 'OTC Section'),
(6, 'HO-AMX-001', 900, 0.52, '2026-11-30', '2024-11-01', 'AmerisourceBergen', 90, 1800, 'Antibiotic Storage');

-- Insert Equipment Assets
INSERT INTO equipment_assets (division_id, asset_name, asset_category, model_number, manufacturer, serial_number, acquisition_date, acquisition_cost, operational_status, location_details) VALUES
(1, 'Echocardiography System', 'Diagnostic', 'EPIQ CVx', 'Philips Healthcare', 'SN-HO-ECHO-001', '2021-03-15', 95000.00, 'Operational', 'Cardio Suite 301'),
(2, 'Emergency Defibrillator', 'Life Support', 'Lifepak 15', 'Physio-Control', 'SN-HO-DEFIB-001', '2022-01-10', 28000.00, 'Operational', 'Emergency Bay 1'),
(6, 'CT Scanner', 'Imaging', 'Revolution CT', 'GE Healthcare', 'SN-HO-CT-001', '2020-08-22', 1200000.00, 'Operational', 'Radiology Suite'),
(3, 'Surgical Robot', 'Surgical', 'da Vinci Xi', 'Intuitive Surgical', 'SN-HO-ROBOT-001', '2019-11-05', 2100000.00, 'Operational', 'OR 4'),
(7, 'Blood Analyzer', 'Diagnostic', 'XN-3000', 'Sysmex', 'SN-HO-BLOOD-001', '2021-06-18', 120000.00, 'Operational', 'Lab Station 3');

-- Insert Scheduled Appointments
INSERT INTO scheduled_appointments (client_id, personnel_id, division_id, appointment_datetime, estimated_duration, appointment_type, reason_for_visit, appointment_status, notes) VALUES
(1, 1, 1, '2026-02-25 09:00:00', 45, 'Follow-up', 'Cardiac evaluation post-medication', 'Completed', 'Blood pressure stable, continue current medication'),
(2, 4, 4, '2026-02-26 14:30:00', 30, 'Check-up', 'Diabetes management review', 'Completed', 'HbA1c improved, adjust diet plan'),
(3, 2, 2, '2026-02-27 10:00:00', 60, 'Emergency', 'Chest pain evaluation', 'Completed', 'EKG normal, anxiety-related symptoms'),
(4, 4, 4, '2026-02-28 11:15:00', 30, 'Consultation', 'Asthma symptoms worsening', 'Completed', 'Prescribed new inhaler, follow-up in 2 weeks'),
(5, 6, 6, '2026-03-01 08:30:00', 20, 'Procedure', 'Chest X-ray', 'Completed', 'Clear lungs, no abnormalities detected'),
(6, 1, 1, '2026-03-01 13:00:00', 50, 'Consultation', 'Migraine evaluation', 'Completed', 'MRI scheduled, started preventive medication');

-- Insert Patient Files
INSERT INTO patient_files (client_id, personnel_id, appointment_id, file_type, file_date, file_title, file_description, created_by) VALUES
(1, 1, 1, 'Consultation Notes', '2026-02-25', 'Cardiac Follow-up', 'Patient shows good response to ACE inhibitor therapy', 1),
(2, 4, 2, 'Lab Report', '2026-02-26', 'HbA1c Results', 'Hemoglobin A1c: 6.8%, showing improvement', 4),
(3, 2, 3, 'Imaging', '2026-02-27', 'EKG Results', 'Normal sinus rhythm, no acute changes', 2),
(4, 4, 4, 'Consultation Notes', '2026-02-28', 'Asthma Assessment', 'Peak flow reduced, medication adjustment needed', 4),
(5, 6, 5, 'Imaging', '2026-03-01', 'Chest X-Ray', 'PA and lateral views, no acute findings', 6);

-- Insert Prescriptions
INSERT INTO prescriptions (client_id, personnel_id, drug_id, appointment_id, prescription_date, dosage_instructions, frequency, treatment_duration, quantity_prescribed, refills_permitted, prescription_status, special_instructions) VALUES
(1, 1, 1, 1, '2026-02-25', '10mg once daily with food', 'Daily', 90, 90, 2, 'Active', 'Monitor blood pressure weekly'),
(2, 4, 2, 2, '2026-02-26', '500mg twice daily with meals', 'Twice Daily', 90, 180, 2, 'Active', 'Take with food to reduce stomach upset'),
(4, 4, 3, 4, '2026-02-28', '2 puffs as needed', 'As Needed', 180, 1, 1, 'Active', 'Use before physical activity'),
(6, 1, 4, 6, '2026-03-01', '50mg at onset of migraine', 'As Needed', 30, 6, 1, 'Active', 'Do not exceed 2 doses in 24 hours'),
(3, 2, 5, 3, '2026-02-27', '400mg every 6 hours as needed', 'As Needed', 7, 20, 0, 'Active', 'Take with food');

-- Insert Blood Inventory
INSERT INTO blood_inventory (blood_type, blood_component, units_available, collection_date, expiration_date, donor_reference, screening_status, storage_location, units_reserved) VALUES
('O+', 'Packed RBC', 25, '2026-02-20', '2026-04-05', 'DON-HO-001', 'Cleared', 'Blood Bank Fridge 1', 0),
('A+', 'Whole Blood', 15, '2026-02-22', '2026-04-07', 'DON-HO-002', 'Cleared', 'Blood Bank Fridge 1', 2),
('B+', 'Plasma', 30, '2026-02-18', '2027-02-18', 'DON-HO-003', 'Cleared', 'Plasma Freezer', 0),
('AB+', 'Platelets', 8, '2026-02-28', '2026-03-05', 'DON-HO-004', 'Cleared', 'Platelet Agitator', 1),
('O-', 'Packed RBC', 12, '2026-02-25', '2026-04-10', 'DON-HO-005', 'Cleared', 'Blood Bank Fridge 2', 0),
('A-', 'Whole Blood', 10, '2026-02-27', '2026-04-12', 'DON-HO-006', 'Cleared', 'Blood Bank Fridge 2', 0);