-- =====================================================
-- HOSPITAL 6: EMERGENCY TRAUMA CENTER - Seed Data
-- Emergency/Trauma terminology sample data
-- =====================================================

-- =====================================================
-- EMERGENCY_RESPONDERS Data
-- =====================================================

INSERT INTO emergency_responders (unit_id, responder_code, first_name, last_name, role_title, response_status, certification_level, license_number, shift_pattern, contact_number, emergency_contact, radio_call_sign, hire_date) VALUES
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-001'), 'ER001', 'Dr. Michael', 'Rodriguez', 'Emergency Medicine Attending', 'On Duty', 'Board Certified Emergency Medicine', 'EM001', '12-hour shifts', '555-5001', 'Ana Rodriguez 555-5101', 'ER-Alpha-1', '2015-03-01'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-002'), 'ER002', 'Dr. Sarah', 'Thompson', 'Trauma Surgery Chief', 'On Call', 'Board Certified Trauma Surgery', 'TS001', 'Call schedule', '555-5002', 'John Thompson 555-5102', 'Trauma-1', '2012-07-15'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-001'), 'ER003', 'Lisa', 'Johnson', 'Emergency Nurse Practitioner', 'On Duty', 'ACLS, PALS, TNCC', 'NP001', '12-hour shifts', '555-5003', 'Mark Johnson 555-5103', 'ER-Bravo-2', '2018-01-10'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-003'), 'ER004', 'Dr. Robert', 'Chen', 'Anesthesiologist', 'On Call', 'Board Certified Anesthesiology', 'AN001', 'Call schedule', '555-5004', 'Wei Chen 555-5104', 'Anesth-1', '2016-05-20'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-004'), 'ER005', 'Dr. Jennifer', 'Garcia', 'Pediatric Emergency Physician', 'On Duty', 'Board Certified Pediatric Emergency', 'PE001', '12-hour shifts', '555-5005', 'Carlos Garcia 555-5105', 'Peds-ER-1', '2017-09-05'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-005'), 'ER006', 'Captain James', 'Wilson', 'Flight Paramedic', 'On Call', 'Critical Care Paramedic', 'FP001', 'Flight rotation', '555-5006', 'Linda Wilson 555-5106', 'Flight-Med-1', '2019-11-12'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-006'), 'ER007', 'Amanda', 'Martinez', 'Emergency Pharmacist', 'On Duty', 'PharmD, Emergency Medicine', 'EP001', '12-hour shifts', '555-5007', 'Luis Martinez 555-5107', 'Pharm-1', '2020-02-28'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-007'), 'ER008', 'David', 'Brown', 'Emergency Radiology Tech', 'On Duty', 'ARRT, CT/MRI Certified', 'RT001', '12-hour shifts', '555-5008', 'Susan Brown 555-5108', 'Rad-Tech-1', '2018-06-01'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-001'), 'ER009', 'Patricia', 'Lee', 'Charge Nurse', 'On Duty', 'RN, CEN, TCRN', 'RN001', '12-hour shifts', '555-5009', 'Paul Lee 555-5109', 'Charge-1', '2014-10-15'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-002'), 'ER010', 'Dr. Christopher', 'Davis', 'Critical Care Physician', 'On Duty', 'Board Certified Critical Care', 'CC001', '12-hour shifts', '555-5010', 'Maria Davis 555-5110', 'ICU-Doc-1', '2013-08-03');

-- Update trauma units with chiefs
UPDATE trauma_units SET unit_chief_id = (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER001') WHERE unit_code = 'TRU-001';
UPDATE trauma_units SET unit_chief_id = (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER002') WHERE unit_code = 'TRU-002';
UPDATE trauma_units SET unit_chief_id = (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER004') WHERE unit_code = 'TRU-003';
UPDATE trauma_units SET unit_chief_id = (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER005') WHERE unit_code = 'TRU-004';
UPDATE trauma_units SET unit_chief_id = (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER006') WHERE unit_code = 'TRU-005';
UPDATE trauma_units SET unit_chief_id = (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER007') WHERE unit_code = 'TRU-006';
UPDATE trauma_units SET unit_chief_id = (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER008') WHERE unit_code = 'TRU-007';

-- =====================================================
-- TRAUMA_CASES Data
-- =====================================================

INSERT INTO trauma_cases (case_number, patient_name, birth_date, gender, blood_type, primary_phone, emergency_contact_name, emergency_contact_phone, home_address, city, state_region, zip_postal, insurance_info, medical_alerts, trauma_history, arrival_method, arrival_time, triage_level, case_status) VALUES
('TC240001', 'John Anderson', '1985-04-15', 'Male', 'O+', '555-6001', 'Mary Anderson', '555-6101', '123 Emergency Lane', 'Trauma City', 'TX', '75001', '{"provider": "BlueCross Emergency", "policy": "BC123456", "group": "EMS001"}', 'No known allergies', 'Motor vehicle accident - chest trauma', 'Ambulance', '2024-03-15 14:30:00+00', 2, 'Stable'),
('TC240002', 'Susan Williams', '1978-11-30', 'Female', 'A-', '555-6002', 'Robert Williams', '555-6102', '456 Rescue Blvd', 'Trauma City', 'TX', '75002', '{"provider": "Emergency Health", "policy": "EH987654", "group": "TRAUMA"}', 'Penicillin allergy', 'Fall from height - multiple fractures', 'Helicopter', '2024-03-15 16:45:00+00', 1, 'Critical'),
('TC240003', 'Michael Johnson', '1992-07-22', 'Male', 'B+', '555-6003', 'Lisa Johnson', '555-6103', '789 Urgent Street', 'Trauma City', 'TX', '75003', '{"provider": "Trauma Care Insurance", "policy": "TC456789", "group": "EMRG"}', 'Diabetes Type 1', 'Workplace injury - laceration', 'Ambulance', '2024-03-15 18:20:00+00', 3, 'Stable'),
('TC240004', 'Emily Davis', '1965-02-08', 'Female', 'AB+', '555-6004', 'Thomas Davis', '555-6104', '321 Crisis Avenue', 'Trauma City', 'TX', '75004', '{"provider": "Critical Care Plus", "policy": "CP789123", "group": "CRIT"}', 'Heart condition', 'Cardiac event - chest pain', 'Walk-in', '2024-03-16 09:15:00+00', 2, 'Stable'),
('TC240005', 'David Martinez', '1990-09-12', 'Male', 'O-', '555-6005', 'Carmen Martinez', '555-6105', '654 Response Drive', 'Trauma City', 'TX', '75005', '{"provider": "Emergency Medical", "policy": "EM123789", "group": "RESP"}', 'Latex allergy', 'Motorcycle accident - head injury', 'Helicopter', '2024-03-16 11:30:00+00', 1, 'Critical'),
('TC240006', 'Jennifer Brown', '1983-06-03', 'Female', 'A+', '555-6006', 'Kevin Brown', '555-6106', '987 Incident Court', 'Trauma City', 'TX', '75006', '{"provider": "Trauma Plus", "policy": "TP654321", "group": "TRMA"}', 'None known', 'Burn injury - house fire', 'Fire Rescue', '2024-03-16 13:45:00+00', 2, 'Stable'),
('TC240007', 'Robert Garcia', '1995-12-18', 'Male', 'B-', '555-6007', 'Ana Garcia', '555-6107', '147 Emergency Road', 'Trauma City', 'TX', '75007', '{"provider": "Emergency Coverage", "policy": "EC987321", "group": "EMR"}', 'Asthma', 'Sports injury - knee trauma', 'Walk-in', '2024-03-17 15:20:00+00', 4, 'Discharged'),
('TC240008', 'Patricia Wilson', '1987-03-25', 'Female', 'AB-', '555-6008', 'Carlos Wilson', '555-6108', '258 Crisis Lane', 'Trauma City', 'TX', '75008', '{"provider": "Injury Insurance", "policy": "II147258", "group": "INJR"}', 'Drug allergies', 'Overdose - toxicology case', 'Police', '2024-03-17 20:10:00+00', 1, 'Critical'),
('TC240009', 'Christopher Lee', '1989-10-07', 'Male', 'A+', '555-6009', 'Michelle Lee', '555-6109', '369 Urgent Circle', 'Trauma City', 'TX', '75009', '{"provider": "Critical Emergency", "policy": "CE258147", "group": "CREM"}', 'None known', 'Assault - facial lacerations', 'Police', '2024-03-18 22:30:00+00', 3, 'Stable'),
('TC240010', 'Amanda Taylor', '1976-08-14', 'Female', 'O+', '555-6010', 'Jason Taylor', '555-6110', '741 Trauma Blvd', 'Trauma City', 'TX', '75010', '{"provider": "Emergency Response", "policy": "ER369852", "group": "EMRP"}', 'Penicillin, Morphine', 'Gunshot wound - abdomen', 'Ambulance', '2024-03-18 23:45:00+00', 1, 'Critical');

-- =====================================================
-- EMERGENCY_MEDICATIONS Data
-- =====================================================

INSERT INTO emergency_medications (medication_name, generic_name, brand_name, dosage_strength, medication_form, administration_route, drug_class, manufacturer, ndc_code, emergency_use, controlled_substance, critical_care) VALUES
('Epinephrine Auto-Injector', 'Epinephrine', 'EpiPen', '0.3mg', 'Auto-Injector', 'Intramuscular', 'Adrenergic Agonist', 'Mylan', '49502-500-01', true, false, true),
('Morphine Sulfate', 'Morphine', 'MS Contin', '10mg/mL', 'Injection', 'Intravenous', 'Opioid Analgesic', 'Pfizer', '00409-1234-01', true, true, true),
('Atropine Sulfate', 'Atropine', 'AtroPen', '2mg', 'Auto-Injector', 'Intramuscular', 'Anticholinergic', 'Meridian Medical', '60842-030-01', true, false, true),
('Naloxone Hydrochloride', 'Naloxone', 'Narcan', '4mg', 'Nasal Spray', 'Intranasal', 'Opioid Antagonist', 'Emergent BioSolutions', '69547-353-02', true, false, true),
('Adenosine', 'Adenosine', 'Adenocard', '6mg/2mL', 'Injection', 'Intravenous', 'Antiarrhythmic', 'Pfizer', '00409-1367-01', true, false, true),
('Ketamine Hydrochloride', 'Ketamine', 'Ketalar', '100mg/mL', 'Injection', 'Intravenous', 'Anesthetic', 'JHP Pharmaceuticals', '42023-115-01', true, true, true),
('Propofol', 'Propofol', 'Diprivan', '10mg/mL', 'Injection', 'Intravenous', 'Anesthetic', 'AstraZeneca', '00186-1150-01', false, false, true),
('Succinylcholine', 'Succinylcholine', 'Anectine', '20mg/mL', 'Injection', 'Intravenous', 'Neuromuscular Blocker', 'Sandoz', '00781-3012-01', false, false, true),
('Normal Saline', 'Sodium Chloride 0.9%', 'Normal Saline', '0.9%', 'IV Fluid', 'Intravenous', 'Crystalloid', 'Baxter', '00338-0017-01', false, false, false),
('Lactated Ringers', 'Lactated Ringers', 'LR', '1000mL', 'IV Fluid', 'Intravenous', 'Crystalloid', 'B. Braun', '00264-7800-01', false, false, false),
('Rocuronium', 'Rocuronium', 'Zemuron', '10mg/mL', 'Injection', 'Intravenous', 'Neuromuscular Blocker', 'Merck', '00006-7837-01', false, false, true),
('Fentanyl Citrate', 'Fentanyl', 'Sublimaze', '50mcg/mL', 'Injection', 'Intravenous', 'Opioid Analgesic', 'West-Ward', '00641-6045-01', true, true, true);

-- =====================================================
-- MEDICATION_SUPPLY Data
-- =====================================================

INSERT INTO medication_supply (medication_id, lot_batch, current_stock, unit_cost, expiry_date, received_date, supplier, critical_level, max_capacity, storage_location, temperature_controlled) VALUES
((SELECT medication_id FROM emergency_medications WHERE medication_name = 'Epinephrine Auto-Injector'), 'EPI2024001', 50, 125.00, '2025-12-31', '2024-01-15', 'Cardinal Health Emergency', 10, 100, 'Emergency Cart A', false),
((SELECT medication_id FROM emergency_medications WHERE medication_name = 'Morphine Sulfate'), 'MOR2024001', 25, 15.50, '2025-08-15', '2024-02-01', 'McKesson Controlled', 5, 50, 'Controlled Substance Vault', false),
((SELECT medication_id FROM emergency_medications WHERE medication_name = 'Atropine Sulfate'), 'ATR2024001', 30, 85.00, '2025-10-30', '2024-01-20', 'AmerisourceBergen Emergency', 8, 60, 'Emergency Cart B', false),
((SELECT medication_id FROM emergency_medications WHERE medication_name = 'Naloxone Hydrochloride'), 'NAL2024001', 75, 45.00, '2025-11-15', '2024-01-25', 'Emergency Medical Supplies', 15, 100, 'Overdose Response Kit', false),
((SELECT medication_id FROM emergency_medications WHERE medication_name = 'Adenosine'), 'ADE2024001', 20, 95.00, '2025-09-20', '2024-02-05', 'Cardinal Health Emergency', 5, 40, 'Cardiac Emergency Cart', false),
((SELECT medication_id FROM emergency_medications WHERE medication_name = 'Ketamine Hydrochloride'), 'KET2024001', 15, 25.00, '2025-07-25', '2024-02-10', 'McKesson Controlled', 3, 30, 'Controlled Substance Vault', false),
((SELECT medication_id FROM emergency_medications WHERE medication_name = 'Propofol'), 'PRO2024001', 40, 18.50, '2025-06-30', '2024-02-15', 'AstraZeneca Direct', 8, 60, 'Anesthesia Supply', true),
((SELECT medication_id FROM emergency_medications WHERE medication_name = 'Succinylcholine'), 'SUC2024001', 25, 12.00, '2025-05-15', '2024-02-20', 'Emergency Anesthesia Supply', 5, 40, 'Anesthesia Supply', true),
((SELECT medication_id FROM emergency_medications WHERE medication_name = 'Normal Saline'), 'NS2024001', 200, 2.50, '2026-01-31', '2024-03-01', 'Baxter IV Solutions', 50, 300, 'IV Fluid Storage', false),
((SELECT medication_id FROM emergency_medications WHERE medication_name = 'Lactated Ringers'), 'LR2024001', 150, 3.00, '2026-02-28', '2024-03-05', 'B. Braun IV Solutions', 40, 250, 'IV Fluid Storage', false);

-- =====================================================
-- TRAUMA_EQUIPMENT Data
-- =====================================================

INSERT INTO trauma_equipment (unit_id, equipment_name, equipment_type, model, manufacturer, serial_number, purchase_date, purchase_cost, warranty_expires, last_maintenance, next_maintenance, equipment_status, location, mobility) VALUES
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-001'), 'Emergency Defibrillator Monitor', 'Life Support', 'DM-5000', 'Zoll Medical', 'ZM2024001', '2023-01-15', 25000.00, '2028-01-15', '2024-02-01', '2024-08-01', 'Available', 'Trauma Bay 1', 'Mobile'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-001'), 'Emergency Ventilator', 'Life Support', 'EV-Pro', 'Hamilton Medical', 'HM2024002', '2022-06-20', 45000.00, '2027-06-20', '2024-01-15', '2024-07-15', 'Available', 'Trauma Bay 2', 'Mobile'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-003'), 'Surgical C-Arm', 'Diagnostic', 'CA-Elite', 'GE Healthcare', 'GE2024003', '2021-03-10', 185000.00, '2026-03-10', '2024-02-10', '2024-05-10', 'Available', 'OR Trauma Suite', 'Mobile'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-002'), 'Critical Care Monitor Array', 'Monitoring', 'CCM-8000', 'Philips Healthcare', 'PH2024004', '2023-08-22', 35000.00, '2028-08-22', '2024-01-20', '2024-07-20', 'Available', 'Trauma ICU', 'Fixed'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-005'), 'Portable Ultrasound', 'Diagnostic', 'US-Flight', 'SonoSite', 'SS2024005', '2022-11-12', 28000.00, '2027-11-12', '2024-02-05', '2024-08-05', 'Available', 'Flight Medicine Unit', 'Portable'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-001'), 'Emergency Crash Cart', 'Life Support', 'EC-2500', 'Waterloo Healthcare', 'WH2024006', '2023-04-18', 8500.00, '2028-04-18', '2024-01-25', '2024-07-25', 'Available', 'Emergency Central', 'Mobile'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-007'), 'Portable X-Ray Unit', 'Diagnostic', 'PXR-Mobile', 'Carestream', 'CS2024007', '2022-12-05', 65000.00, '2027-12-05', '2024-02-15', '2024-08-15', 'Available', 'Emergency Radiology', 'Mobile'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-004'), 'Pediatric Transport Monitor', 'Monitoring', 'PTM-Kids', 'Masimo', 'MS2024008', '2023-07-14', 15000.00, '2028-07-14', '2024-01-30', '2024-07-30', 'Available', 'Pediatric Emergency', 'Portable'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-003'), 'Emergency Anesthesia Machine', 'Life Support', 'EAM-Trauma', 'Draeger', 'DR2024009', '2021-09-30', 75000.00, '2026-09-30', '2024-02-20', '2024-08-20', 'Available', 'Trauma OR', 'Fixed'),
((SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-005'), 'Flight Communication System', 'Communication', 'FCS-Pro', 'Motorola', 'MT2024010', '2023-01-30', 12000.00, '2028-01-30', '2024-01-10', '2024-07-10', 'Available', 'Flight Operations', 'Fixed');

-- =====================================================
-- EMERGENCY_RESPONSES Data
-- =====================================================

INSERT INTO emergency_responses (case_id, responder_id, unit_id, response_time, estimated_duration, response_type, chief_complaint, response_priority, response_status, outcome_notes) VALUES
((SELECT case_id FROM trauma_cases WHERE case_number = 'TC240001'), (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER001'), (SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-001'), '2024-03-15 14:30:00+00', 90, 'Initial Assessment', 'Chest trauma from MVA', 'Urgent', 'Completed', 'Stable chest contusion, no pneumothorax'),
((SELECT case_id FROM trauma_cases WHERE case_number = 'TC240002'), (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER002'), (SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-003'), '2024-03-15 17:00:00+00', 180, 'Surgery', 'Multiple fractures from fall', 'Critical', 'Completed', 'Orthopedic repair completed successfully'),
((SELECT case_id FROM trauma_cases WHERE case_number = 'TC240003'), (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER003'), (SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-001'), '2024-03-15 18:20:00+00', 60, 'Treatment', 'Laceration repair needed', 'Routine', 'Completed', 'Sutures placed, tetanus updated'),
((SELECT case_id FROM trauma_cases WHERE case_number = 'TC240004'), (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER001'), (SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-001'), '2024-03-16 09:15:00+00', 120, 'Initial Assessment', 'Chest pain evaluation', 'Urgent', 'Completed', 'Rule out MI, observation period'),
((SELECT case_id FROM trauma_cases WHERE case_number = 'TC240005'), (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER002'), (SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-002'), '2024-03-16 11:45:00+00', 240, 'Critical Care', 'Head injury monitoring', 'Critical', 'In Progress', 'Neurological monitoring ongoing'),
((SELECT case_id FROM trauma_cases WHERE case_number = 'TC240006'), (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER001'), (SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-001'), '2024-03-16 13:45:00+00', 150, 'Treatment', 'Burn assessment and care', 'Urgent', 'Completed', 'Second-degree burns treated'),
((SELECT case_id FROM trauma_cases WHERE case_number = 'TC240007'), (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER005'), (SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-004'), '2024-03-17 15:30:00+00', 45, 'Initial Assessment', 'Sports knee injury', 'Routine', 'Completed', 'Sprain, discharged with instructions'),
((SELECT case_id FROM trauma_cases WHERE case_number = 'TC240008'), (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER010'), (SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-002'), '2024-03-17 20:30:00+00', 300, 'Critical Care', 'Overdose management', 'Critical', 'Completed', 'Stabilized, transferred to rehab'),
((SELECT case_id FROM trauma_cases WHERE case_number = 'TC240009'), (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER003'), (SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-001'), '2024-03-18 22:45:00+00', 75, 'Treatment', 'Facial laceration repair', 'Urgent', 'Completed', 'Sutures placed, social services consulted'),
((SELECT case_id FROM trauma_cases WHERE case_number = 'TC240010'), (SELECT responder_id FROM emergency_responders WHERE responder_code = 'ER002'), (SELECT unit_id FROM trauma_units WHERE unit_code = 'TRU-003'), '2024-03-19 00:15:00+00', 360, 'Surgery', 'Gunshot wound surgery', 'Critical', 'In Progress', 'Exploratory laparotomy in progress');

-- =====================================================
-- BLOOD_RESERVE Data
-- =====================================================

INSERT INTO blood_reserve (blood_type, component_type, unit_id, collection_date, expiry_date, donor_id, volume_ml, reserve_status, storage_temperature, cross_match_required, emergency_release, location) VALUES
('O-', 'Packed RBC', 'RBC-O-NEG-001', '2024-03-01', '2024-04-15', 'D001', 250, 'Available', 4.0, true, true, 'Blood Bank Fridge A1'),
('O-', 'Packed RBC', 'RBC-O-NEG-002', '2024-03-02', '2024-04-16', 'D002', 250, 'Available', 4.0, true, true, 'Blood Bank Fridge A1'),
('O+', 'Packed RBC', 'RBC-O-POS-001', '2024-03-01', '2024-04-15', 'D003', 250, 'Available', 4.0, true, false, 'Blood Bank Fridge A2'),
('A+', 'Packed RBC', 'RBC-A-POS-001', '2024-02-28', '2024-04-14', 'D004', 250, 'Available', 4.0, true, false, 'Blood Bank Fridge B1'),
('B-', 'Packed RBC', 'RBC-B-NEG-001', '2024-03-03', '2024-04-17', 'D005', 250, 'Available', 4.0, true, false, 'Blood Bank Fridge B2'),
('AB+', 'Plasma', 'PLASMA-AB-001', '2024-02-25', '2025-02-25', 'D006', 200, 'Available', -18.0, false, false, 'Plasma Freezer C1'),
('O-', 'Platelets', 'PLT-O-NEG-001', '2024-03-18', '2024-03-23', 'D007', 50, 'Available', 22.0, true, true, 'Platelet Agitator D1'),
('A-', 'Whole Blood', 'WB-A-NEG-001', '2024-03-10', '2024-04-24', 'D008', 450, 'Available', 4.0, true, false, 'Blood Bank Fridge A3'),
('B+', 'Packed RBC', 'RBC-B-POS-001', '2024-03-05', '2024-04-19', 'D009', 250, 'Reserved', 4.0, true, false, 'Blood Bank Fridge B1'),
('AB-', 'Cryoprecipitate', 'CRYO-AB-001', '2024-02-20', '2025-02-20', 'D010', 15, 'Available', -18.0, false, false, 'Plasma Freezer C2');

-- Commit all the data
COMMIT;