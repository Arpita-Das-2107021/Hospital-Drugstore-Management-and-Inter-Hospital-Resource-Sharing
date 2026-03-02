-- =====================================================
-- HOSPITAL 5: ACADEMIC MEDICAL CENTER - Seed Data
-- Academic/Research terminology sample data
-- =====================================================

-- =====================================================
-- RESEARCH_FACULTY Data
-- =====================================================

INSERT INTO research_faculty (division_id, faculty_number, first_name, last_name, academic_title, employment_type, specialty_area, license_credentials, research_level, contact_phone, institutional_email, appointment_date) VALUES
(1, 'FAC001', 'Dr. Elizabeth', 'Chen', 'Professor of Clinical Research', 'Tenured', 'Cardiovascular Medicine', 'MD-PhD-001', 'Principal Investigator', '555-3001', 'elizabeth.chen@academicmed.edu', DATE '2015-08-15');

INSERT INTO research_faculty (division_id, faculty_number, first_name, last_name, academic_title, employment_type, specialty_area, license_credentials, research_level, contact_phone, institutional_email, appointment_date) VALUES
(2, 'FAC002', 'Dr. James', 'Rodriguez', 'Associate Professor of Laboratory Sciences', 'Non-Tenured', 'Molecular Biology', 'PhD-002', 'Co-Investigator', '555-3002', 'james.rodriguez@academicmed.edu', DATE '2018-01-20');

INSERT INTO research_faculty (division_id, faculty_number, first_name, last_name, academic_title, employment_type, specialty_area, license_credentials, research_level, contact_phone, institutional_email, appointment_date) VALUES
(3, 'FAC003', 'Dr. Sarah', 'Williams', 'Director of Medical Education', 'Tenured', 'Internal Medicine', 'MD-003', 'Senior Faculty', '555-3003', 'sarah.williams@academicmed.edu', DATE '2012-04-10');

INSERT INTO research_faculty (division_id, faculty_number, first_name, last_name, academic_title, employment_type, specialty_area, license_credentials, research_level, contact_phone, institutional_email, appointment_date) VALUES
(4, 'FAC004', 'Dr. Michael', 'Thompson', 'Professor of Radiology Research', 'Tenured', 'Medical Imaging', 'MD-PhD-004', 'Principal Investigator', '555-3004', 'michael.thompson@academicmed.edu', DATE '2010-09-05');

INSERT INTO research_faculty (division_id, faculty_number, first_name, last_name, academic_title, employment_type, specialty_area, license_credentials, research_level, contact_phone, institutional_email, appointment_date) VALUES
(5, 'FAC005', 'Dr. Lisa', 'Anderson', 'Research Pharmacy Director', 'Tenured', 'Clinical Pharmacology', 'PharmD-PhD-005', 'Principal Investigator', '555-3005', 'lisa.anderson@academicmed.edu', DATE '2014-02-18');

INSERT INTO research_faculty (division_id, faculty_number, first_name, last_name, academic_title, employment_type, specialty_area, license_credentials, research_level, contact_phone, institutional_email, appointment_date) VALUES
(6, 'FAC006', 'Dr. David', 'Johnson', 'Professor of Genetics', 'Tenured', 'Human Genetics', 'MD-PhD-006', 'Principal Investigator', '555-3006', 'david.johnson@academicmed.edu', DATE '2016-07-12');

INSERT INTO research_faculty (division_id, faculty_number, first_name, last_name, academic_title, employment_type, specialty_area, license_credentials, research_level, contact_phone, institutional_email, appointment_date) VALUES
(7, 'FAC007', 'Patricia', 'Martinez', 'Research Administrator', 'Non-Tenured', 'Research Compliance', 'MS-007', 'Staff', '555-3007', 'patricia.martinez@academicmed.edu', DATE '2017-11-30');

INSERT INTO research_faculty (division_id, faculty_number, first_name, last_name, academic_title, employment_type, specialty_area, license_credentials, research_level, contact_phone, institutional_email, appointment_date) VALUES
(1, 'FAC008', 'Dr. Robert', 'Garcia', 'Assistant Professor', 'Non-Tenured', 'Endocrinology', 'MD-008', 'Junior Faculty', '555-3008', 'robert.garcia@academicmed.edu', DATE '2020-03-25');

INSERT INTO research_faculty (division_id, faculty_number, first_name, last_name, academic_title, employment_type, specialty_area, license_credentials, research_level, contact_phone, institutional_email, appointment_date) VALUES
(2, 'FAC009', 'Dr. Jennifer', 'Wilson', 'Research Scientist', 'Non-Tenured', 'Biochemistry', 'PhD-009', 'Research Staff', '555-3009', 'jennifer.wilson@academicmed.edu', DATE '2019-06-08');

INSERT INTO research_faculty (division_id, faculty_number, first_name, last_name, academic_title, employment_type, specialty_area, license_credentials, research_level, contact_phone, institutional_email, appointment_date) VALUES
(3, 'FAC010', 'Dr. Christopher', 'Brown', 'Clinical Educator', 'Adjunct', 'Family Medicine', 'MD-010', 'Clinical Faculty', '555-3010', 'christopher.brown@academicmed.edu', DATE '2021-01-15');

-- Update research divisions with directors
UPDATE research_divisions SET director_id = 1 WHERE division_code = 'RES-001';
UPDATE research_divisions SET director_id = 2 WHERE division_code = 'LAB-001';
UPDATE research_divisions SET director_id = 3 WHERE division_code = 'EDU-001';
UPDATE research_divisions SET director_id = 4 WHERE division_code = 'IMG-001';
UPDATE research_divisions SET director_id = 5 WHERE division_code = 'PHM-001';
UPDATE research_divisions SET director_id = 6 WHERE division_code = 'GEN-001';
UPDATE research_divisions SET director_id = 7 WHERE division_code = 'ADM-001';

-- =====================================================
-- RESEARCH_SUBJECTS Data
-- =====================================================

INSERT INTO research_subjects (subject_number, full_name, date_of_birth, gender, blood_group, primary_phone, email_contact, residential_address, city, state_province, postal_code, emergency_contact, emergency_phone, insurance_carrier, policy_identifier, known_allergies, research_notes, consent_status, enrollment_date) VALUES
('SUB001', 'Alice Johnson', DATE '1985-06-12', 'Female', 'A+', '555-4001', 'alice.johnson@email.com', '123 University Avenue', 'Research City', 'CA', '90210', 'Bob Johnson', '555-4101', 'Academic Health Plan', 'AHP123456', 'Penicillin', 'Enrolled in cardiovascular study', 'Consented', DATE '2024-01-15');

INSERT INTO research_subjects (subject_number, full_name, date_of_birth, gender, blood_group, primary_phone, email_contact, residential_address, city, state_province, postal_code, emergency_contact, emergency_phone, insurance_carrier, policy_identifier, known_allergies, research_notes, consent_status, enrollment_date) VALUES
('SUB002', 'Mark Davis', DATE '1978-11-25', 'Male', 'O-', '555-4002', 'mark.davis@email.com', '456 Research Boulevard', 'Research City', 'CA', '90211', 'Linda Davis', '555-4102', 'University Insurance', 'UI987654', 'None known', 'Participating in diabetes research', 'Consented', DATE '2024-01-20');

INSERT INTO research_subjects (subject_number, full_name, date_of_birth, gender, blood_group, primary_phone, email_contact, residential_address, city, state_province, postal_code, emergency_contact, emergency_phone, insurance_carrier, policy_identifier, known_allergies, research_notes, consent_status, enrollment_date) VALUES
('SUB003', 'Sarah Wilson', DATE '1992-03-08', 'Female', 'B+', '555-4003', 'sarah.wilson@email.com', '789 Academic Lane', 'Research City', 'CA', '90212', 'Tom Wilson', '555-4103', 'Research Medical Group', 'RMG456789', 'Shellfish', 'Enrolled in genetics study', 'Consented', DATE '2024-02-01');

INSERT INTO research_subjects (subject_number, full_name, date_of_birth, gender, blood_group, primary_phone, email_contact, residential_address, city, state_province, postal_code, emergency_contact, emergency_phone, insurance_carrier, policy_identifier, known_allergies, research_notes, consent_status, enrollment_date) VALUES
('SUB004', 'Thomas Garcia', DATE '1970-09-15', 'Male', 'AB+', '555-4004', 'thomas.garcia@email.com', '321 Laboratory Street', 'Research City', 'CA', '90213', 'Maria Garcia', '555-4104', 'Clinical Research Insurance', 'CRI789123', 'Latex, Aspirin', 'Oncology research participant', 'Consented', DATE '2024-02-10');

INSERT INTO research_subjects (subject_number, full_name, date_of_birth, gender, blood_group, primary_phone, email_contact, residential_address, city, state_province, postal_code, emergency_contact, emergency_phone, insurance_carrier, policy_identifier, known_allergies, research_notes, consent_status, enrollment_date) VALUES
('SUB005', 'Jennifer Brown', DATE '1988-07-30', 'Female', 'A-', '555-4005', 'jennifer.brown@email.com', '654 Clinical Drive', 'Research City', 'CA', '90214', 'David Brown', '555-4105', 'Academic Health Plan', 'AHP567890', 'Codeine', 'Neurology study participant', 'Consented', DATE '2024-02-15');

INSERT INTO research_subjects (subject_number, full_name, date_of_birth, gender, blood_group, primary_phone, email_contact, residential_address, city, state_province, postal_code, emergency_contact, emergency_phone, insurance_carrier, policy_identifier, known_allergies, research_notes, consent_status, enrollment_date) VALUES
('SUB006', 'Robert Martinez', DATE '1983-12-05', 'Male', 'O+', '555-4006', 'robert.martinez@email.com', '987 Innovation Way', 'Research City', 'CA', '90215', 'Anna Martinez', '555-4106', 'Research Health Services', 'RHS234567', 'None known', 'Imaging research study', 'Consented', DATE '2024-02-20');

INSERT INTO research_subjects (subject_number, full_name, date_of_birth, gender, blood_group, primary_phone, email_contact, residential_address, city, state_province, postal_code, emergency_contact, emergency_phone, insurance_carrier, policy_identifier, known_allergies, research_notes, consent_status, enrollment_date) VALUES
('SUB007', 'Lisa Thompson', DATE '1995-01-22', 'Female', 'B-', '555-4007', 'lisa.thompson@email.com', '147 Discovery Circle', 'Research City', 'CA', '90216', 'Paul Thompson', '555-4107', 'University Medical', 'UM345678', 'Peanuts, Tree nuts', 'Allergy research study', 'Consented', DATE '2024-02-25');

INSERT INTO research_subjects (subject_number, full_name, date_of_birth, gender, blood_group, primary_phone, email_contact, residential_address, city, state_province, postal_code, emergency_contact, emergency_phone, insurance_carrier, policy_identifier, known_allergies, research_notes, consent_status, enrollment_date) VALUES
('SUB008', 'Michael Lee', DATE '1987-04-18', 'Male', 'AB-', '555-4008', 'michael.lee@email.com', '258 Research Park Road', 'Research City', 'CA', '90217', 'Susan Lee', '555-4108', 'Clinical Trial Coverage', 'CTC456789', 'Iodine contrast', 'Radiology research protocol', 'Consented', DATE '2024-03-01');

INSERT INTO research_subjects (subject_number, full_name, date_of_birth, gender, blood_group, primary_phone, email_contact, residential_address, city, state_province, postal_code, emergency_contact, emergency_phone, insurance_carrier, policy_identifier, known_allergies, research_notes, consent_status, enrollment_date) VALUES
('SUB009', 'Amanda Anderson', DATE '1991-08-14', 'Female', 'A+', '555-4009', 'amanda.anderson@email.com', '369 Science Center', 'Research City', 'CA', '90218', 'Kevin Anderson', '555-4109', 'Academic Health Plan', 'AHP678901', 'Sulfa drugs', 'Pharmaceutical research', 'Consented', DATE '2024-03-05');

INSERT INTO research_subjects (subject_number, full_name, date_of_birth, gender, blood_group, primary_phone, email_contact, residential_address, city, state_province, postal_code, emergency_contact, emergency_phone, insurance_carrier, policy_identifier, known_allergies, research_notes, consent_status, enrollment_date) VALUES
('SUB010', 'Daniel White', DATE '1979-10-12', 'Male', 'O+', '555-4010', 'daniel.white@email.com', '741 Medical Plaza', 'Research City', 'CA', '90219', 'Rachel White', '555-4110', 'Research Partners Insurance', 'RPI789012', 'None known', 'Longitudinal health study', 'Consented', DATE '2024-03-10');

-- =====================================================
-- THERAPEUTIC_COMPOUNDS Data
-- =====================================================

INSERT INTO therapeutic_compounds (compound_name, generic_identifier, commercial_name, concentration, formulation, administration_route, pharmacological_class, manufacturer_name, regulatory_number, controlled_status, prescription_only, research_grade) VALUES
('Investigational Agent XR-401', 'XR-401', 'ResearchX', '10mg', 'Tablet', 'Oral', 'Novel Antidiabetic', 'Research Pharmaceuticals Inc', 'IND-67892', 0, 1, 1);

INSERT INTO therapeutic_compounds (compound_name, generic_identifier, commercial_name, concentration, formulation, administration_route, pharmacological_class, manufacturer_name, regulatory_number, controlled_status, prescription_only, research_grade) VALUES
('Experimental Compound BC-205', 'BC-205', 'BioCompound', '25mg', 'Injection', 'Intravenous', 'Immunomodulator', 'BioResearch Labs', 'IND-67893', 0, 1, 1);

INSERT INTO therapeutic_compounds (compound_name, generic_identifier, commercial_name, concentration, formulation, administration_route, pharmacological_class, manufacturer_name, regulatory_number, controlled_status, prescription_only, research_grade) VALUES
('Clinical Trial Metformin', 'Metformin HCl', 'MetResearch', '500mg', 'Tablet', 'Oral', 'Antidiabetic - Standard', 'Academic Pharma', 'NDC-12345-678', 0, 1, 0);

INSERT INTO therapeutic_compounds (compound_name, generic_identifier, commercial_name, concentration, formulation, administration_route, pharmacological_class, manufacturer_name, regulatory_number, controlled_status, prescription_only, research_grade) VALUES
('Research Grade Lisinopril', 'Lisinopril', 'ACE-Study', '10mg', 'Tablet', 'Oral', 'ACE Inhibitor', 'Clinical Supply Co', 'NDC-23456-789', 0, 1, 0);

INSERT INTO therapeutic_compounds (compound_name, generic_identifier, commercial_name, concentration, formulation, administration_route, pharmacological_class, manufacturer_name, regulatory_number, controlled_status, prescription_only, research_grade) VALUES
('Placebo Control Tablets', 'Microcellulose', 'PlaceboPro', 'N/A', 'Tablet', 'Oral', 'Placebo', 'Research Materials LLC', 'PLC-34567-890', 0, 0, 1);

INSERT INTO therapeutic_compounds (compound_name, generic_identifier, commercial_name, concentration, formulation, administration_route, pharmacological_class, manufacturer_name, regulatory_number, controlled_status, prescription_only, research_grade) VALUES
('Contrast Agent GA-300', 'Gadolinium Complex', 'ImageClear', '0.5mmol/mL', 'Injection', 'Intravenous', 'Contrast Agent', 'Imaging Research Corp', 'NDC-45678-901', 0, 1, 1);

INSERT INTO therapeutic_compounds (compound_name, generic_identifier, commercial_name, concentration, formulation, administration_route, pharmacological_class, manufacturer_name, regulatory_number, controlled_status, prescription_only, research_grade) VALUES
('Analgesic Study Drug AS-150', 'AS-150', 'PainStudy', '75mg', 'Capsule', 'Oral', 'Analgesic', 'Pain Research Institute', 'IND-67894', 1, 1, 1);

INSERT INTO therapeutic_compounds (compound_name, generic_identifier, commercial_name, concentration, formulation, administration_route, pharmacological_class, manufacturer_name, regulatory_number, controlled_status, prescription_only, research_grade) VALUES
('Research Albuterol', 'Albuterol Sulfate', 'RespiStudy', '90mcg', 'Inhaler', 'Inhalation', 'Bronchodilator', 'Respiratory Research', 'NDC-56789-012', 0, 1, 0);

INSERT INTO therapeutic_compounds (compound_name, generic_identifier, commercial_name, concentration, formulation, administration_route, pharmacological_class, manufacturer_name, regulatory_number, controlled_status, prescription_only, research_grade) VALUES
('Clinical Antibiotic CB-500', 'Cephalexin', 'AntiStudy', '500mg', 'Capsule', 'Oral', 'Antibiotic', 'Antimicrobial Research', 'NDC-67890-123', 0, 1, 0);

INSERT INTO therapeutic_compounds (compound_name, generic_identifier, commercial_name, concentration, formulation, administration_route, pharmacological_class, manufacturer_name, regulatory_number, controlled_status, prescription_only, research_grade) VALUES
('Study Supplement VS-100', 'Vitamin Complex', 'VitaResearch', 'Multi', 'Tablet', 'Oral', 'Nutritional Supplement', 'Nutrition Research Lab', 'DS-78901-234', 0, 0, 0);

-- =====================================================
-- COMPOUND_INVENTORY Data
-- =====================================================

INSERT INTO compound_inventory (compound_id, lot_number, available_quantity, cost_per_unit, expiry_date, production_date, supplier_name, minimum_stock, maximum_stock, storage_conditions) VALUES
(1, 'XR401-2024-001', 250, 45.50, DATE '2025-12-31', DATE '2024-01-15', 'Research Pharmaceuticals Inc', 50, 300, 'Room temperature, dry');

INSERT INTO compound_inventory (compound_id, lot_number, available_quantity, cost_per_unit, expiry_date, production_date, supplier_name, minimum_stock, maximum_stock, storage_conditions) VALUES
(2, 'BC205-2024-001', 100, 125.75, DATE '2025-06-30', DATE '2024-01-20', 'BioResearch Labs', 20, 150, 'Refrigerated 2-8°C');

INSERT INTO compound_inventory (compound_id, lot_number, available_quantity, cost_per_unit, expiry_date, production_date, supplier_name, minimum_stock, maximum_stock, storage_conditions) VALUES
(3, 'MET-STD-2024', 1000, 0.25, DATE '2026-01-31', DATE '2024-02-01', 'Academic Pharma', 200, 1200, 'Room temperature');

INSERT INTO compound_inventory (compound_id, lot_number, available_quantity, cost_per_unit, expiry_date, production_date, supplier_name, minimum_stock, maximum_stock, storage_conditions) VALUES
(4, 'LIS-STD-2024', 800, 0.15, DATE '2025-11-30', DATE '2024-02-05', 'Clinical Supply Co', 150, 1000, 'Room temperature');

INSERT INTO compound_inventory (compound_id, lot_number, available_quantity, cost_per_unit, expiry_date, production_date, supplier_name, minimum_stock, maximum_stock, storage_conditions) VALUES
(5, 'PLC-2024-001', 2000, 0.05, DATE '2027-01-15', DATE '2024-02-10', 'Research Materials LLC', 500, 2500, 'Room temperature, dry');

INSERT INTO compound_inventory (compound_id, lot_number, available_quantity, cost_per_unit, expiry_date, production_date, supplier_name, minimum_stock, maximum_stock, storage_conditions) VALUES
(6, 'GA300-2024-A', 50, 85.00, DATE '2025-08-15', DATE '2024-02-15', 'Imaging Research Corp', 10, 100, 'Room temperature, protected from light');

INSERT INTO compound_inventory (compound_id, lot_number, available_quantity, cost_per_unit, expiry_date, production_date, supplier_name, minimum_stock, maximum_stock, storage_conditions) VALUES
(7, 'AS150-2024-001', 200, 15.25, DATE '2025-10-31', DATE '2024-02-20', 'Pain Research Institute', 30, 250, 'Controlled substance storage');

INSERT INTO compound_inventory (compound_id, lot_number, available_quantity, cost_per_unit, expiry_date, production_date, supplier_name, minimum_stock, maximum_stock, storage_conditions) VALUES
(8, 'ALB-STD-2024', 300, 18.50, DATE '2025-12-15', DATE '2024-02-25', 'Respiratory Research', 50, 400, 'Room temperature');

INSERT INTO compound_inventory (compound_id, lot_number, available_quantity, cost_per_unit, expiry_date, production_date, supplier_name, minimum_stock, maximum_stock, storage_conditions) VALUES
(9, 'CB500-2024', 500, 1.85, DATE '2025-09-30', DATE '2024-03-01', 'Antimicrobial Research', 100, 600, 'Room temperature, dry');

INSERT INTO compound_inventory (compound_id, lot_number, available_quantity, cost_per_unit, expiry_date, production_date, supplier_name, minimum_stock, maximum_stock, storage_conditions) VALUES
(10, 'VS100-2024', 1000, 0.75, DATE '2026-03-31', DATE '2024-03-05', 'Nutrition Research Lab', 200, 1200, 'Cool, dry place');

-- =====================================================
-- RESEARCH_EQUIPMENT Data
-- =====================================================

INSERT INTO research_equipment (division_id, equipment_name, equipment_category, model_number, manufacturer_name, serial_identifier, acquisition_date, acquisition_cost, warranty_end_date, last_calibration, next_calibration, operational_status, physical_location) VALUES
(1, 'Clinical Research Monitor Array', 'Monitoring', 'CRM-5000', 'MedTech Research', 'MTR2024001', DATE '2023-01-15', 125000.00, DATE '2028-01-15', DATE '2024-02-01', DATE '2024-08-01', 'Operational', 'Clinical Research Suite A');

INSERT INTO research_equipment (division_id, equipment_name, equipment_category, model_number, manufacturer_name, serial_identifier, acquisition_date, acquisition_cost, warranty_end_date, last_calibration, next_calibration, operational_status, physical_location) VALUES
(2, 'Automated Laboratory Analyzer', 'Laboratory', 'ALA-3000Pro', 'LabSystems Inc', 'LSI2024002', DATE '2022-06-20', 285000.00, DATE '2027-06-20', DATE '2024-01-15', DATE '2024-07-15', 'Operational', 'Main Laboratory B2');

INSERT INTO research_equipment (division_id, equipment_name, equipment_category, model_number, manufacturer_name, serial_identifier, acquisition_date, acquisition_cost, warranty_end_date, last_calibration, next_calibration, operational_status, physical_location) VALUES
(4, 'Research MRI Scanner 3T', 'Imaging', 'MRI-R3000', 'Advanced Imaging Co', 'AIC2024003', DATE '2021-03-10', 2500000.00, DATE '2026-03-10', DATE '2024-02-20', DATE '2024-05-20', 'Operational', 'Imaging Research Center');

INSERT INTO research_equipment (division_id, equipment_name, equipment_category, model_number, manufacturer_name, serial_identifier, acquisition_date, acquisition_cost, warranty_end_date, last_calibration, next_calibration, operational_status, physical_location) VALUES
(6, 'Gene Sequencing Platform', 'Laboratory', 'GSP-NextGen', 'Genomics Research Corp', 'GRC2024004', DATE '2023-08-22', 450000.00, DATE '2028-08-22', DATE '2024-01-30', DATE '2024-07-30', 'Operational', 'Genetics Laboratory D5');

INSERT INTO research_equipment (division_id, equipment_name, equipment_category, model_number, manufacturer_name, serial_identifier, acquisition_date, acquisition_cost, warranty_end_date, last_calibration, next_calibration, operational_status, physical_location) VALUES
(5, 'Pharmaceutical Formulation System', 'Laboratory', 'PFS-2500', 'PharmaTech Solutions', 'PTS2024005', DATE '2022-11-12', 175000.00, DATE '2027-11-12', DATE '2024-02-10', DATE '2024-08-10', 'Operational', 'Pharmacy Research Lab C3');

INSERT INTO research_equipment (division_id, equipment_name, equipment_category, model_number, manufacturer_name, serial_identifier, acquisition_date, acquisition_cost, warranty_end_date, last_calibration, next_calibration, operational_status, physical_location) VALUES
(1, 'Clinical Data Collection Tablets', 'Monitoring', 'CDC-TabletPro', 'Digital Health Systems', 'DHS2024006', DATE '2023-04-18', 25000.00, DATE '2028-04-18', DATE '2024-02-05', DATE '2024-08-05', 'Operational', 'Mobile Research Units');

INSERT INTO research_equipment (division_id, equipment_name, equipment_category, model_number, manufacturer_name, serial_identifier, acquisition_date, acquisition_cost, warranty_end_date, last_calibration, next_calibration, operational_status, physical_location) VALUES
(4, 'Research Ultrasound System', 'Imaging', 'RUS-Pro400', 'UltraSound Research', 'USR2024007', DATE '2023-12-05', 95000.00, DATE '2028-12-05', DATE '2024-01-25', DATE '2024-07-25', 'Operational', 'Diagnostic Imaging Suite');

INSERT INTO research_equipment (division_id, equipment_name, equipment_category, model_number, manufacturer_name, serial_identifier, acquisition_date, acquisition_cost, warranty_end_date, last_calibration, next_calibration, operational_status, physical_location) VALUES
(2, 'Microscopy Analysis Station', 'Analytical', 'MAS-Elite', 'Precision Optics Ltd', 'POL2024008', DATE '2022-07-14', 65000.00, DATE '2027-07-14', DATE '2024-02-15', DATE '2024-08-15', 'Operational', 'Microscopy Laboratory B2');

INSERT INTO research_equipment (division_id, equipment_name, equipment_category, model_number, manufacturer_name, serial_identifier, acquisition_date, acquisition_cost, warranty_end_date, last_calibration, next_calibration, operational_status, physical_location) VALUES
(6, 'Cell Culture Incubation System', 'Laboratory', 'CCIS-Pro', 'BioGrowth Tech', 'BGT2024009', DATE '2023-01-30', 35000.00, DATE '2028-01-30', DATE '2024-01-10', DATE '2024-07-10', 'Operational', 'Cell Biology Lab D5');

INSERT INTO research_equipment (division_id, equipment_name, equipment_category, model_number, manufacturer_name, serial_identifier, acquisition_date, acquisition_cost, warranty_end_date, last_calibration, next_calibration, operational_status, physical_location) VALUES
(3, 'Medical Simulation Mannequin', 'Educational', 'MSM-Advanced', 'SimuMed Systems', 'SMS2024010', DATE '2023-09-15', 55000.00, DATE '2028-09-15', DATE '2024-02-01', DATE '2024-08-01', 'Operational', 'Medical Education Center');

-- Commit all data
COMMIT;