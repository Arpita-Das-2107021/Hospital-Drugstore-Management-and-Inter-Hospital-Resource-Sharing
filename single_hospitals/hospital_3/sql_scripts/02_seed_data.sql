-- =====================================================
-- SEED DATA FOR HOSPITAL 3 - APPOINTCARE  
-- =====================================================

-- Insert Practitioners
INSERT INTO practitioners (practitioner_code, full_name, professional_title, specialty_area, qualification_details, license_certificate, phone_number, email_address, consultation_rate, rating_average, total_reviews, years_of_practice, accepts_new_clients, hired_date, facility_id) VALUES
('PRAC-001', 'Dr. Victoria Hayes', 'Primary Care Physician', 'General Medicine', 'MD from Johns Hopkins, Board Certified', 'MD-567890', '555-3101', 'v.hayes@appointcare.com', 180.00, 4.85, 120, 12, TRUE, '2014-05-10', 1),
('PRAC-002', 'Dr. Benjamin Stone', 'Cardiologist', 'Cardiology', 'MD, Cardiology Fellowship', 'MD-567891', '555-3102', 'b.stone@appointcare.com', 250.00, 4.92, 85, 15, TRUE, '2011-08-15', 2),
('PRAC-003', 'Dr. Isabella Cruz', 'Emergency Physician', 'Emergency Medicine', 'MD, Emergency Medicine Residency', 'MD-567892', '555-3103', 'i.cruz@appointcare.com', 200.00, 4.78, 95, 10, TRUE, '2016-01-20', 3),
('PRAC-004', 'Dr. Mason Parker', 'Pediatrician', 'Pediatrics', 'MD, Board Certified Pediatrics', 'MD-567893', '555-3104', 'm.parker@appointcare.com', 170.00, 4.95, 110, 14, TRUE, '2012-03-12', 4),
('PRAC-005', 'Dr. Charlotte Lee', 'Radiologist', 'Diagnostic Imaging', 'MD, Radiology Residency', 'MD-567894', '555-3105', 'c.lee@appointcare.com', 220.00, 4.88, 75, 11, TRUE, '2015-09-25', 5),
('PRAC-006', 'Dr. Lucas Turner', 'Physical Therapist', 'Rehabilitation', 'DPT, Licensed Physical Therapist', 'DPT-567895', '555-3106', 'l.turner@appointcare.com', 120.00, 4.80, 65, 8, TRUE, '2018-03-15', 6),
('PRAC-007', 'PharmD Sarah Mitchell', 'Clinical Pharmacist', 'Pharmacy Services', 'PharmD, Clinical Pharmacy Specialist', 'RPH-567896', '555-3107', 's.mitchell@appointcare.com', 95.00, 4.75, 45, 6, TRUE, '2020-07-01', 7);

-- Update facilities with heads
UPDATE facilities SET facility_head_id = 1 WHERE facility_code = 'FAC-101';
UPDATE facilities SET facility_head_id = 2 WHERE facility_code = 'FAC-102';
UPDATE facilities SET facility_head_id = 3 WHERE facility_code = 'FAC-103';
UPDATE facilities SET facility_head_id = 4 WHERE facility_code = 'FAC-104';
UPDATE facilities SET facility_head_id = 5 WHERE facility_code = 'FAC-105';
UPDATE facilities SET facility_head_id = 6 WHERE facility_code = 'FAC-106';
UPDATE facilities SET facility_head_id = 7 WHERE facility_code = 'FAC-107';

-- Insert Clients
INSERT INTO clients (client_code, full_name, mobile_number, email_contact, birth_date, gender_identity, blood_group, preferred_language, notification_preference, membership_level, home_address, emergency_contact_name, emergency_contact_phone, insurance_details, allergy_information, medical_conditions) VALUES
('CLT-3001', 'Alexander Morgan', '555-3001', 'alex.morgan@email.com', '1980-04-12', 'Male', 'O+', 'English', 'Email', 'Premium', '123 Appointment Ave, BookingCity', 'Rebecca Morgan', '555-3002', 'HealthFirst Insurance - Policy #HF123456', 'Penicillin', 'Hypertension'),
('CLT-3002', 'Sophia Bennett', '555-3002', 'sophia.b@email.com', '1992-07-25', 'Female', 'A+', 'English', 'SMS', 'Standard', '456 Scheduling Blvd, BookingCity', 'David Bennett', '555-3004', 'MediCare Plus - Policy #MP789012', 'None known', 'None'),
('CLT-3003', 'Ethan Rodriguez', '555-3003', 'ethan.r@email.com', '1975-11-08', 'Male', 'B+', 'Spanish', 'Phone', 'Standard', '789 Consultation St, BookingCity', 'Carmen Rodriguez', '555-3006', 'Universal Health - Policy #UH345678', 'Shellfish', 'None'),
('CLT-3004', 'Olivia Chen', '555-3004', 'olivia.chen@email.com', '1988-02-14', 'Female', 'AB+', 'English', 'Email', 'Premium', '321 Visit Way, BookingCity', 'Michael Chen', '555-3008', 'Premier Care - Policy #PC901234', 'Latex', 'Asthma'),
('CLT-3005', 'Noah Williams', '555-3005', 'noah.w@email.com', '1995-09-30', 'Male', 'O-', 'English', 'SMS', 'Standard', '654 Appointment Dr, BookingCity', 'Sarah Williams', '555-3010', 'Family Health - Policy #FH567890', 'None known', 'None'),
('CLT-3006', 'Emma Thompson', '555-3006', 'emma.t@email.com', '1983-06-18', 'Female', 'A-', 'English', 'Email', 'VIP', '987 Schedule Ln, BookingCity', 'James Thompson', '555-3012', 'Elite Medical - Policy #EM234567', 'Peanuts', 'Migraines');

-- Insert Medication Catalog
INSERT INTO medication_catalog (medication_name, generic_name, brand_name, dose_strength, form_type, administration_method, therapeutic_category, manufacturer_name, product_code, controlled_status, prescription_required) VALUES
('Lisinopril', 'Lisinopril', 'Prinivil', '10mg', 'Tablet', 'Oral', 'ACE Inhibitor', 'Merck & Co', 'AC-LIS-10MG', FALSE, TRUE),
('Albuterol Sulfate', 'Albuterol Sulfate', 'Ventolin HFA', '90mcg', 'Inhaler', 'Inhalation', 'Bronchodilator', 'GSK', 'AC-ALB-90MCG', FALSE, TRUE),
('Ibuprofen', 'Ibuprofen', 'Advil', '400mg', 'Tablet', 'Oral', 'NSAID', 'Pfizer', 'AC-IBU-400MG', FALSE, FALSE),
('Sumatriptan', 'Sumatriptan', 'Imitrex', '50mg', 'Tablet', 'Oral', 'Migraine Treatment', 'GSK', 'AC-SUM-50MG', FALSE, TRUE),
('Amoxicillin', 'Amoxicillin', 'Amoxil', '500mg', 'Capsule', 'Oral', 'Antibiotic', 'Sandoz', 'AC-AMX-500MG', FALSE, TRUE),
('Acetaminophen', 'Acetaminophen', 'Tylenol', '325mg', 'Tablet', 'Oral', 'Analgesic', 'Johnson & Johnson', 'AC-ACE-325MG', FALSE, FALSE);

-- Insert Medication Stock
INSERT INTO medication_stock (medication_id, batch_identifier, current_quantity, price_per_unit, expiry_date, production_date, supplier_company, low_stock_alert, max_stock_limit, shelf_location) VALUES
(1, 'AC-LIS-BATCH-001', 600, 0.30, '2027-06-30', '2025-06-01', 'MedSupply Partners', 60, 1200, 'Shelf AC-A15'),
(2, 'AC-ALB-BATCH-001', 250, 42.00, '2027-03-20', '2025-03-01', 'Respiratory Solutions', 25, 500, 'Cold Storage AC-C02'),
(3, 'AC-IBU-BATCH-001', 1500, 0.12, '2028-12-31', '2025-12-01', 'Pain Relief Distributors', 150, 3000, 'Shelf AC-B08'),
(4, 'AC-SUM-BATCH-001', 400, 12.50, '2028-01-10', '2026-01-01', 'Migraine Specialists', 40, 800, 'Shelf AC-A20'),
(5, 'AC-AMX-BATCH-001', 800, 0.60, '2026-11-30', '2024-11-01', 'Antibiotic Central', 80, 1600, 'Shelf AC-B15'),
(6, 'AC-ACE-BATCH-001', 2000, 0.08, '2028-09-15', '2025-09-01', 'General Pharmaceuticals', 200, 4000, 'Shelf AC-C10');

-- Insert Medical Devices
INSERT INTO medical_devices (facility_id, device_name, device_category, model_info, manufacturer, device_serial, purchase_date, purchase_price, device_status, location_info) VALUES
(1, 'Digital Blood Pressure Monitor', 'Diagnostic', 'Omron HEM-780', 'Omron Healthcare', 'AC-BP-001', '2022-03-15', 150.00, 'Available', 'Consultation Room A - Cabinet'),
(2, 'ECG Machine', 'Diagnostic', 'Philips PageWriter TC70', 'Philips Healthcare', 'AC-ECG-001', '2021-05-20', 15000.00, 'Available', 'Cardiology Suite'),
(3, 'Defibrillator', 'Life Support', 'ZOLL AED Plus', 'ZOLL Medical', 'AC-DEF-001', '2020-08-10', 2500.00, 'Available', 'Emergency Room - Wall Mount'),
(4, 'Pediatric Scale', 'Diagnostic', 'Detecto 349', 'Detecto Scale', 'AC-SCALE-001', '2021-11-08', 800.00, 'Available', 'Pediatric Room'),
(5, 'X-Ray Machine', 'Imaging', 'GE AMX 4+', 'GE Healthcare', 'AC-XRAY-001', '2019-07-12', 85000.00, 'Available', 'Imaging Suite'),
(6, 'Exercise Bike', 'Therapeutic', 'NuStep T5XR', 'NuStep', 'AC-BIKE-001', '2021-09-25', 4500.00, 'Available', 'Physical Therapy Room'),
(7, 'Pill Counter', 'Diagnostic', 'Kirby Lester KL1', 'Kirby Lester', 'AC-PILL-001', '2022-01-30', 1200.00, 'Available', 'Pharmacy Area');

-- Insert Bookings
INSERT INTO bookings (booking_reference, client_id, practitioner_id, facility_id, appointment_datetime, duration_minutes, booking_type, appointment_reason, booking_status, payment_amount, attended, notes) VALUES
('BOOK-AC-001', 1, 1, 1, '2026-02-25 09:00:00', 45, 'Follow-up', 'Blood pressure monitoring', 'Completed', 180.00, TRUE, 'Patient stable on current medication'),
('BOOK-AC-002', 2, 4, 4, '2026-02-26 14:30:00', 30, 'Consultation', 'Routine health checkup', 'Completed', 170.00, TRUE, 'Healthy young adult, no concerns'),
('BOOK-AC-003', 3, 3, 3, '2026-02-27 10:00:00', 60, 'Emergency', 'Chest pain evaluation', 'Completed', 200.00, TRUE, 'Stress-related, no cardiac issues'),
('BOOK-AC-004', 4, 2, 2, '2026-02-28 11:15:00', 45, 'Consultation', 'Asthma management review', 'Completed', 250.00, TRUE, 'Inhaler technique corrected'),
('BOOK-AC-005', 5, 5, 5, '2026-03-01 08:30:00', 20, 'Treatment', 'Chest X-ray', 'Completed', 220.00, TRUE, 'Clear chest X-ray results'),
('BOOK-AC-006', 6, 1, 1, '2026-03-01 13:00:00', 50, 'Consultation', 'Headache evaluation', 'Completed', 180.00, TRUE, 'Migraine diagnosis confirmed');

-- Insert Client Records  
INSERT INTO client_records (client_id, booking_id, practitioner_id, record_category, record_date, record_title, record_content, created_by) VALUES
(1, 1, 1, 'Consultation Notes', '2026-02-25', 'Hypertension Follow-up', 'Patient reports good compliance with medication. BP well controlled.', 1),
(2, 2, 4, 'Consultation Notes', '2026-02-26', 'Annual Physical Exam', 'Complete physical examination performed. All systems normal.', 4),
(3, 3, 3, 'Lab Results', '2026-02-27', 'EKG Results', 'Normal sinus rhythm, no acute ST changes detected.', 3),
(4, 4, 2, 'Consultation Notes', '2026-02-28', 'Asthma Assessment', 'Peak flow improved with proper inhaler technique.', 2),
(5, 5, 5, 'Imaging', '2026-03-01', 'Chest Radiograph', 'PA and lateral chest X-rays show clear lung fields.', 5),
(6, 6, 1, 'Consultation Notes', '2026-03-01', 'Migraine Evaluation', 'Classic migraine symptoms. Started preventive therapy.', 1);

-- Insert Medication Orders
INSERT INTO medication_orders (client_id, practitioner_id, medication_id, booking_id, order_date, dosage_amount, frequency_schedule, treatment_days, quantity_ordered, refills_authorized, order_status, special_notes) VALUES
(1, 1, 1, 1, '2026-02-25', '10mg', 'Once daily in morning', 90, 90, 2, 'Active', 'Take with food, monitor BP weekly'),
(4, 2, 2, 4, '2026-02-28', '2 puffs', 'As needed for breathlessness', 180, 1, 1, 'Active', 'Shake well before use, rinse mouth after'),
(3, 3, 3, 3, '2026-02-27', '400mg', 'Every 6 hours as needed for pain', 7, 20, 0, 'Active', 'Take with food to avoid stomach upset'),
(6, 1, 4, 6, '2026-03-01', '50mg', 'At onset of migraine', 30, 6, 1, 'Active', 'Maximum 2 doses per 24 hours'),
(5, 5, 6, 5, '2026-03-01', '650mg', 'Every 8 hours as needed', 5, 15, 0, 'Active', 'For post-procedure discomfort');

-- Insert Blood Storage
INSERT INTO blood_storage (blood_type, blood_component, units_in_storage, collection_date, expiry_date, donor_code, testing_status, storage_compartment, reserved_units) VALUES
('O+', 'Red Cells', 18, '2026-02-20', '2026-04-05', 'DON-AC-001', 'Approved', 'Fridge A1', 0),
('A+', 'Whole Blood', 12, '2026-02-22', '2026-04-07', 'DON-AC-002', 'Approved', 'Fridge A1', 1),
('B+', 'Plasma', 25, '2026-02-18', '2027-02-18', 'DON-AC-003', 'Approved', 'Freezer B1', 0),
('AB+', 'Platelets', 6, '2026-02-28', '2026-03-05', 'DON-AC-004', 'Approved', 'Agitator C1', 0),
('O-', 'Red Cells', 8, '2026-02-25', '2026-04-10', 'DON-AC-005', 'Approved', 'Fridge A2', 0),
('A-', 'Whole Blood', 7, '2026-02-27', '2026-04-12', 'DON-AC-006', 'Approved', 'Fridge A2', 0);