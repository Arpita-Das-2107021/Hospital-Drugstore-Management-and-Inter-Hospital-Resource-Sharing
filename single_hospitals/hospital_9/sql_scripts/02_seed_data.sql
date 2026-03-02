-- =====================================================
-- SEED DATA FOR CANCER TREATMENT CENTER (Hospital 9)
-- =====================================================

-- =====================================================
-- HEALTHCARE PROFESSIONALS
-- =====================================================
INSERT INTO healthcare_professional (professional_id, family_name, given_names, professional_title, position_role, board_certifications, npi_number, dea_number, state_license, subspecialty_focus, employment_start_date, work_shift_type, contact_email, contact_extension, languages_spoken, active_status) VALUES
('CTC-ONC-001', 'Harrison', 'Elizabeth', 'MD FASCO', 'Medical Oncologist', ARRAY['Medical Oncology', 'Internal Medicine'], '1234567890', 'AH1234567', 'MD-98765-NY', 'Breast Cancer', '2015-04-10', 'DAYS', 'e.harrison@ctcenter.org', '5101', ARRAY['English', 'Spanish'], TRUE),
('CTC-ONC-002', 'Patel', 'Rajesh', 'MD PhD', 'Radiation Oncologist', ARRAY['Radiation Oncology'], '2345678901', 'BP2345678', 'MD-87654-NY', 'CNS Tumors', '2016-08-15', 'DAYS', 'r.patel@ctcenter.org', '5201', ARRAY['English', 'Hindi'], TRUE),
('CTC-ONC-003', 'Kim', 'Jennifer', 'MD FACS', 'Surgical Oncologist', ARRAY['Surgical Oncology', 'General Surgery'], '3456789012', 'CK3456789', 'MD-76543-NY', 'GI Malignancies', '2014-01-20', 'DAYS', 'j.kim@ctcenter.org', '5301', ARRAY['English', 'Korean'], TRUE),
('CTC-HEM-001', 'Robinson', 'Michael', 'MD', 'Hematologist', ARRAY['Hematology', 'Medical Oncology'], '4567890123', 'DR4567890', 'MD-65432-NY', 'Leukemia', '2017-05-12', 'DAYS', 'm.robinson@ctcenter.org', '5401', ARRAY['English'], TRUE),
('CTC-BMT-001', 'Chen', 'Wei', 'MD PhD', 'BMT Specialist', ARRAY['Hematology', 'Transplant Medicine'], '5678901234', 'EC5678901', 'MD-54321-NY', 'Stem Cell Transplant', '2018-09-01', 'DAYS', 'w.chen@ctcenter.org', '5501', ARRAY['English', 'Mandarin'], TRUE),
('CTC-PHARM-001', 'Williams', 'Amanda', 'PharmD BCOP', 'Oncology Pharmacist', ARRAY['Board Certified Oncology Pharmacy'], NULL, NULL, 'PHARM-43210-NY', 'Chemotherapy', '2019-03-15', 'DAYS', 'a.williams@ctcenter.org', '5801', ARRAY['English'], TRUE),
('CTC-RN-001', 'Martinez', 'Sofia', 'RN OCN', 'Oncology Nurse', ARRAY['Oncology Certified Nurse'], NULL, NULL, 'RN-32109-NY', 'Infusion Therapy', '2016-11-20', 'DAYS', 's.martinez@ctcenter.org', '5102', ARRAY['English', 'Spanish'], TRUE),
('CTC-RAD-001', 'Thompson', 'David', 'MD', 'Diagnostic Radiologist', ARRAY['Diagnostic Radiology'], '6789012345', NULL, 'MD-21098-NY', 'Oncologic Imaging', '2015-07-10', 'DAYS', 'd.thompson@ctcenter.org', '5601', ARRAY['English'], TRUE);

-- =====================================================
-- UPDATE ONCOLOGY UNITS WITH DIRECTORS
-- =====================================================
UPDATE oncology_unit SET director_staff_uuid = (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-001') WHERE unit_abbreviation = 'MOIC';
UPDATE oncology_unit SET director_staff_uuid = (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-002') WHERE unit_abbreviation = 'RAD_ONC';
UPDATE oncology_unit SET director_staff_uuid = (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-003') WHERE unit_abbreviation = 'SURG_ONC';
UPDATE oncology_unit SET director_staff_uuid = (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-HEM-001') WHERE unit_abbreviation = 'HEMA_MAL';
UPDATE oncology_unit SET director_staff_uuid = (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-BMT-001') WHERE unit_abbreviation = 'BMT';

-- =====================================================
-- ONCOLOGY PATIENT RECORDS
-- =====================================================
INSERT INTO oncology_patient_record (medical_record_number, family_name, given_names, birth_date, biological_sex, gender_identity, ethnicity_code, abo_blood_group, rh_factor, residential_address_line1, city_name, state_province, postal_code, primary_phone, email_address, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone, advance_directive_on_file, dnr_status, patient_status) VALUES
('CTC-2024-001', 'Anderson', 'Margaret Rose', '1965-03-15', 'female', 'Female', 'Caucasian', 'A', 'Positive', '123 Maple Street Apt 4B', 'New York', 'NY', '10001', '212-555-0101', 'm.anderson@email.com', 'Robert Anderson', 'Spouse', '212-555-0102', TRUE, FALSE, 'ACTIVE'),
('CTC-2024-002', 'Johnson', 'Robert Michael', '1958-07-22', 'male', 'Male', 'African American', 'O', 'Positive', '456 Oak Avenue', 'Brooklyn', 'NY', '11201', '718-555-0201', 'r.johnson@email.com', 'Linda Johnson', 'Spouse', '718-555-0202', TRUE, FALSE, 'ACTIVE'),
('CTC-2024-003', 'Garcia', 'Maria Elena', '1972-11-08', 'female', 'Female', 'Hispanic', 'B', 'Positive', '789 Pine Road', 'Queens', 'NY', '11354', '917-555-0301', 'm.garcia@email.com', 'Carlos Garcia', 'Spouse', '917-555-0302', FALSE, FALSE, 'ACTIVE'),
('CTC-2024-004', 'Chen', 'Li', '1980-05-30', 'female', 'Female', 'Asian', 'AB', 'Positive', '234 Elm Street', 'Manhattan', 'NY', '10016', '646-555-0401', 'l.chen@email.com', 'Michael Chen', 'Spouse', '646-555-0402', FALSE, FALSE, 'ACTIVE'),
('CTC-2024-005', 'Wilson', 'James Edward', '1955-12-12', 'male', 'Male', 'Caucasian', 'A', 'Negative', '567 Cedar Lane', 'Bronx', 'NY', '10451', '347-555-0501', 'j.wilson@email.com', 'Patricia Wilson', 'Spouse', '347-555-0502', TRUE, TRUE, 'ACTIVE'),
('CTC-2024-006', 'Taylor', 'Susan Marie', '1968-09-18', 'female', 'Female', 'Caucasian', 'O', 'Positive', '890 Birch Court', 'Staten Island', 'NY', '10301', '718-555-0601', 's.taylor@email.com', 'David Taylor', 'Sibling', '718-555-0602', FALSE, FALSE, 'ACTIVE');

-- =====================================================
-- CANCER DIAGNOSIS REGISTRY
-- =====================================================
INSERT INTO cancer_diagnosis (patient_uuid, oncologist_uuid, diagnosis_date, primary_site_icd_o3, primary_site_description, histology_icd_o3, histology_description, behavior_code, grade_differentiation, laterality, tnm_clinical_t, tnm_clinical_n, tnm_clinical_m, tnm_pathological_t, tnm_pathological_n, tnm_pathological_m, ajcc_stage_group, biomarker_status, genetic_mutations, diagnosis_method, primary_cancer, metastatic_flag) VALUES
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-001'), (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-001'), '2024-11-15', 'C50.4', 'Breast, upper outer quadrant', '8500/3', 'Invasive Ductal Carcinoma', '/3', 'G2', 'Right', 'T2', 'N1', 'M0', 'T2', 'N1a', 'M0', 'IIB', 'ER+80%, PR+60%, HER2-', ARRAY['PIK3CA mutation'], 'Core Needle Biopsy', TRUE, FALSE),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-002'), (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-003'), '2024-10-22', 'C18.7', 'Sigmoid colon', '8140/3', 'Adenocarcinoma', '/3', 'G2', NULL, 'T3', 'N2', 'M0', 'T3', 'N2a', 'M0', 'IIIB', 'MSI-High', ARRAY['BRAF V600E'], 'Colonoscopy Biopsy', TRUE, FALSE),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-003'), (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-001'), '2024-12-05', 'C50.2', 'Breast, upper inner quadrant', '8520/3', 'Invasive Lobular Carcinoma', '/3', 'G2', 'Left', 'T1c', 'N0', 'M0', 'T1c', 'N0', 'M0', 'IA', 'ER+95%, PR+85%, HER2-', NULL, 'Lumpectomy', TRUE, FALSE),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-004'), (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-HEM-001'), '2025-01-10', 'C91.0', 'Acute lymphoblastic leukemia', '9835/3', 'Precursor B-cell lymphoblastic leukemia', '/3', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'BCR-ABL1 negative, Normal karyotype', ARRAY['IKZF1 deletion'], 'Bone Marrow Biopsy', TRUE, FALSE),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-005'), (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-002'), '2024-09-30', 'C34.1', 'Upper lobe, lung', '8070/3', 'Squamous Cell Carcinoma', '/3', 'G3', 'Right', 'T2a', 'N2', 'M1a', 'T2a', 'N2', 'M1a', 'IVA', 'PD-L1 60%', ARRAY['TP53 mutation'], 'CT-guided Biopsy', TRUE, TRUE),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-006'), (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-003'), '2024-11-28', 'C16.9', 'Stomach, unspecified', '8140/3', 'Adenocarcinoma', '/3', 'G3', NULL, 'T3', 'N1', 'M0', 'T3', 'N1', 'M0', 'IIB', 'HER2+', ARRAY['HER2 amplification'], 'Endoscopic Biopsy', TRUE, FALSE);

-- =====================================================
-- TREATMENT PROTOCOLS
-- =====================================================
INSERT INTO treatment_protocol (patient_uuid, diagnosis_uuid, attending_physician_uuid, treatment_intent, protocol_name, protocol_code, modality_type, start_date, planned_end_date, total_cycles_planned, cycles_completed, treatment_response, protocol_status, clinical_trial_flag) VALUES
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-001'), 
 (SELECT diagnosis_uuid FROM cancer_diagnosis WHERE patient_uuid = (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-001')), 
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-001'), 
 'ADJUVANT', 'AC-T Sequential', 'AC-T-2024', 'CHEMOTHERAPY', '2025-01-10', '2025-06-30', 8, 4, 'STABLE', 'ACTIVE', FALSE),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-002'), 
 (SELECT diagnosis_uuid FROM cancer_diagnosis WHERE patient_uuid = (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-002')), 
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-003'), 
 'ADJUVANT', 'FOLFOX', 'FOLFOX-2024', 'CHEMOTHERAPY', '2024-12-01', '2025-05-31', 12, 6, 'STABLE', 'ACTIVE', FALSE),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-003'), 
 (SELECT diagnosis_uuid FROM cancer_diagnosis WHERE patient_uuid = (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-003')), 
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-002'), 
 'ADJUVANT', 'Whole Breast Radiation', 'WBI-2025', 'RADIATION', '2025-02-01', '2025-03-15', 25, 10, 'STABLE', 'ACTIVE', FALSE),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-004'), 
 (SELECT diagnosis_uuid FROM cancer_diagnosis WHERE patient_uuid = (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-004')), 
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-HEM-001'), 
 'CURATIVE', 'Hyper-CVAD', 'HCVAD-2025', 'CHEMOTHERAPY', '2025-01-20', '2025-07-20', 8, 2, 'PARTIAL', 'ACTIVE', FALSE),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-005'), 
 (SELECT diagnosis_uuid FROM cancer_diagnosis WHERE patient_uuid = (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-005')), 
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-002'), 
 'PALLIATIVE', 'Carboplatin + Pembrolizumab', 'CARBO-PEMBRO', 'IMMUNOTHERAPY', '2024-11-15', '2025-05-15', 6, 3, 'PARTIAL', 'ACTIVE', FALSE);

-- =====================================================
-- CHEMOTHERAPY ADMINISTRATION LOG
-- =====================================================
INSERT INTO chemo_administration (protocol_uuid, patient_uuid, administering_nurse_uuid, cycle_number, day_of_cycle, administration_datetime, drug_generic_name, drug_brand_name, calculated_dose, dose_units, bsa_used, route_of_admin, infusion_duration_minutes, premedications_given, completed_flag) VALUES
((SELECT protocol_uuid FROM treatment_protocol WHERE protocol_code = 'AC-T-2024'), 
 (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-001'),
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-RN-001'),
 1, 1, '2025-01-10 09:00:00', 'Doxorubicin', 'Adriamycin', 96.00, 'mg', 1.70, 'IV', 15, ARRAY['Ondansetron 16mg IV', 'Dexamethasone 20mg IV'], TRUE),
((SELECT protocol_uuid FROM treatment_protocol WHERE protocol_code = 'AC-T-2024'), 
 (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-001'),
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-RN-001'),
 1, 1, '2025-01-10 09:30:00', 'Cyclophosphamide', 'Cytoxan', 1020.00, 'mg', 1.70, 'IV', 30, ARRAY['Pre-hydration NS 500mL'], TRUE),
((SELECT protocol_uuid FROM treatment_protocol WHERE protocol_code = 'FOLFOX-2024'), 
 (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-002'),
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-RN-001'),
 3, 1, '2025-02-01 10:00:00', 'Oxaliplatin', 'Eloxatin', 170.00, 'mg', 1.85, 'IV', 120, ARRAY['Ondansetron 8mg IV', 'Dexamethasone 8mg IV'], TRUE),
((SELECT protocol_uuid FROM treatment_protocol WHERE protocol_code = 'HCVAD-2025'), 
 (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-004'),
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-RN-001'),
 1, 1, '2025-01-20 08:00:00', 'Cyclophosphamide', 'Cytoxan', 450.00, 'mg', 1.65, 'IV', 180, ARRAY['Mesna', 'Ondansetron 16mg IV'], TRUE);

-- =====================================================
-- RADIATION THERAPY SESSIONS
-- =====================================================
INSERT INTO radiation_therapy_session (protocol_uuid, patient_uuid, radiation_oncologist_uuid, session_date, fraction_number, treatment_site, technique_used, dose_delivered_cgy, cumulative_dose_cgy, machine_identifier, treatment_verified) VALUES
((SELECT protocol_uuid FROM treatment_protocol WHERE protocol_code = 'WBI-2025'),
 (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-003'),
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-002'),
 '2025-02-01', 1, 'Whole Left Breast', 'VMAT', 200, 200, 'LINAC-1', TRUE),
((SELECT protocol_uuid FROM treatment_protocol WHERE protocol_code = 'WBI-2025'),
 (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-003'),
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-002'),
 '2025-02-02', 2, 'Whole Left Breast', 'VMAT', 200, 400, 'LINAC-1', TRUE),
((SELECT protocol_uuid FROM treatment_protocol WHERE protocol_code = 'WBI-2025'),
 (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-003'),
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-002'),
 '2025-02-03', 3, 'Whole Left Breast', 'VMAT', 200, 600, 'LINAC-1', TRUE);

-- =====================================================
-- ONCOLOGY DRUG CATALOG
-- =====================================================
INSERT INTO oncology_drug_catalog (generic_drug_name, brand_names, drug_class, hazardous_drug_category, requires_special_handling, black_box_warning, ndc_primary, typical_indication) VALUES
('Doxorubicin', ARRAY['Adriamycin', 'Rubex'], 'Anthracycline', 'HD-1', TRUE, TRUE, '0069-3032-20', 'Breast cancer, lymphoma, sarcoma'),
('Cyclophosphamide', ARRAY['Cytoxan'], 'Alkylating Agent', 'HD-1', TRUE, TRUE, '0015-0506-41', 'Various cancers, leukemia'),
('Paclitaxel', ARRAY['Taxol'], 'Taxane', 'HD-1', TRUE, TRUE, '63323-0136-10', 'Breast, ovarian, lung cancer'),
('Oxaliplatin', ARRAY['Eloxatin'], 'Platinum Agent', 'HD-1', TRUE, FALSE, '0024-0592-20', 'Colorectal cancer'),
('Pembrolizumab', ARRAY['Keytruda'], 'PD-1 Inhibitor', 'HD-2', TRUE, TRUE, '0006-3026-01', 'Various cancers, immunotherapy'),
('Carboplatin', ARRAY['Paraplatin'], 'Platinum Agent', 'HD-1', TRUE, FALSE, '63323-0117-10', 'Ovarian, lung cancer'),
('Trastuzumab', ARRAY['Herceptin'], 'HER2 Inhibitor', 'HD-2', FALSE, TRUE, '50242-0134-01', 'HER2+ breast cancer'),
('Vincristine', ARRAY['Oncovin'], 'Vinca Alkaloid', 'HD-1', TRUE, TRUE, '0069-0103-01', 'Leukemia, lymphoma');

-- =====================================================
-- IMAGING STUDIES
-- =====================================================
INSERT INTO imaging_study (patient_uuid, ordering_physician_uuid, study_datetime, modality_type, body_region, study_indication, contrast_used, radiologist_uuid, findings_summary, impression, study_accession_number) VALUES
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-001'),
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-001'),
 '2025-01-05 14:00:00', 'PET-CT', 'Whole Body', 'Restaging breast cancer', TRUE,
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-RAD-001'),
 'No evidence of distant metastatic disease. Mild uptake in axillary nodes consistent with post-operative changes.',
 'No metastatic disease identified. Continued adjuvant treatment appropriate.', 'ACC-2025-001'),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-002'),
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-003'),
 '2025-01-15 10:30:00', 'CT', 'Chest/Abdomen/Pelvis', 'Surveillance imaging for colon cancer', TRUE,
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-RAD-001'),
 'No new lesions. Stable post-surgical changes. No lymphadenopathy.',
 'No evidence of recurrence. Stable post-operative changes.', 'ACC-2025-002'),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-005'),
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-002'),
 '2025-02-10 11:00:00', 'CT', 'Chest', 'Response assessment lung cancer', TRUE,
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-RAD-001'),
 'Decrease in size of primary lung mass from 4.5cm to 3.2cm. Improvement in mediastinal adenopathy.',
 'Partial response to immunotherapy. Continue current treatment.', 'ACC-2025-003');

-- =====================================================
-- TUMOR BOARD REVIEWS
-- =====================================================
INSERT INTO tumor_board_case (patient_uuid, diagnosis_uuid, presentation_date, presenting_physician_uuid, case_complexity, discussion_summary, recommendations, consensus_reached) VALUES
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-002'),
 (SELECT diagnosis_uuid FROM cancer_diagnosis WHERE patient_uuid = (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-002')),
 '2024-11-01',
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-003'),
 'COMPLEX',
 'Stage IIIB colon cancer with MSI-High status. Discussion on optimal adjuvant therapy given biomarker profile.',
 'Recommend FOLFOX chemotherapy for 6 months. Consider immunotherapy trial enrollment if available. Close surveillance.',
 TRUE),
((SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-005'),
 (SELECT diagnosis_uuid FROM cancer_diagnosis WHERE patient_uuid = (SELECT patient_uuid FROM oncology_patient_record WHERE medical_record_number = 'CTC-2024-005')),
 '2024-10-15',
 (SELECT staff_uuid FROM healthcare_professional WHERE professional_id = 'CTC-ONC-002'),
 'COMPLEX',
 'Metastatic NSCLC with high PD-L1 expression. Discussion on first-line therapy options.',
 'Recommend carboplatin + pembrolizumab combination. Palliative radiation to primary if symptomatic. Re-evaluate after 3 cycles.',
 TRUE);
