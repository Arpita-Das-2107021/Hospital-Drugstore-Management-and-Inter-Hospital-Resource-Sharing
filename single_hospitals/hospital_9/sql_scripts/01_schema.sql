-- =====================================================
-- CANCER TREATMENT CENTER DATABASE
-- Hospital 9 - Specialized Oncology Care System
-- =====================================================
-- Modern oncology-focused database with comprehensive cancer care tracking

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- CENTER INFORMATION
-- =====================================================
CREATE TABLE center_info (
    center_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_name VARCHAR(255) NOT NULL DEFAULT 'Cancer Treatment Center',
    facility_identifier VARCHAR(50) DEFAULT 'CTC-009',
    accreditation_body VARCHAR(100) DEFAULT 'American College of Surgeons',
    coc_accredited BOOLEAN DEFAULT TRUE, -- Commission on Cancer
    established_year INTEGER DEFAULT 2010
);

INSERT INTO center_info (center_name, facility_identifier) 
VALUES ('Cancer Treatment Center', 'CTC-009');

-- =====================================================
-- ONCOLOGY PATIENT RECORDS
-- =====================================================
CREATE TABLE oncology_patient_record (
    patient_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_record_number VARCHAR(30) UNIQUE NOT NULL,
    family_name VARCHAR(80) NOT NULL,
    given_names VARCHAR(80) NOT NULL,
    birth_date DATE NOT NULL,
    biological_sex VARCHAR(20) CHECK (biological_sex IN ('male', 'female', 'intersex')),
    gender_identity VARCHAR(30),
    ethnicity_code VARCHAR(30),
    primary_language VARCHAR(50) DEFAULT 'English',
    abo_blood_group VARCHAR(5),
    rh_factor VARCHAR(10),
    residential_address_line1 VARCHAR(150),
    residential_address_line2 VARCHAR(150),
    city_name VARCHAR(80),
    state_province VARCHAR(50),
    postal_code VARCHAR(20),
    country_code VARCHAR(3) DEFAULT 'USA',
    primary_phone VARCHAR(20),
    secondary_phone VARCHAR(20),
    email_address VARCHAR(120),
    next_of_kin_name VARCHAR(150),
    next_of_kin_relationship VARCHAR(50),
    next_of_kin_phone VARCHAR(20),
    advance_directive_on_file BOOLEAN DEFAULT FALSE,
    dnr_status BOOLEAN DEFAULT FALSE,
    patient_status VARCHAR(30) DEFAULT 'ACTIVE',
    registration_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_contact_date DATE
);

-- =====================================================
-- ONCOLOGY UNITS
-- =====================================================
CREATE TABLE oncology_unit (
    unit_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_designation VARCHAR(100) NOT NULL,
    unit_abbreviation VARCHAR(15) UNIQUE NOT NULL,
    unit_category VARCHAR(40), -- MEDICAL_ONC, RADIATION_ONC, SURGICAL_ONC, etc
    director_staff_uuid UUID,
    wing_location VARCHAR(80),
    floor_level VARCHAR(20),
    bed_count INTEGER DEFAULT 0,
    isolation_rooms_count INTEGER DEFAULT 0,
    contact_extension VARCHAR(15)
);

-- =====================================================
-- HEALTHCARE PROFESSIONALS
-- =====================================================
CREATE TABLE healthcare_professional (
    staff_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    professional_id VARCHAR(30) UNIQUE NOT NULL,
    family_name VARCHAR(80) NOT NULL,
    given_names VARCHAR(80) NOT NULL,
    professional_title VARCHAR(100), -- MD PhD, DO, RN OCN, PharmD BCOP, etc
    position_role VARCHAR(80),
    primary_unit_uuid UUID REFERENCES oncology_unit(unit_uuid),
    board_certifications TEXT[],
    npi_number VARCHAR(15), -- National Provider Identifier
    dea_number VARCHAR(15), -- Drug Enforcement Administration
    state_license VARCHAR(30),
    subspecialty_focus VARCHAR(100),
    employment_start_date DATE,
    work_shift_type VARCHAR(30),
    contact_email VARCHAR(120),
    contact_extension VARCHAR(15),
    active_status BOOLEAN DEFAULT TRUE,
    last_credentialing_review DATE
);

ALTER TABLE oncology_unit ADD CONSTRAINT fk_unit_director 
    FOREIGN KEY (director_staff_uuid) REFERENCES healthcare_professional(staff_uuid);

-- =====================================================
-- CANCER DIAGNOSIS REGISTRY
-- =====================================================
CREATE TABLE cancer_diagnosis (
    diagnosis_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_uuid UUID NOT NULL REFERENCES oncology_patient_record(patient_uuid),
    oncologist_uuid UUID REFERENCES healthcare_professional(staff_uuid),
    diagnosis_date DATE NOT NULL,
    primary_site_icd_o3 VARCHAR(10), -- ICD-O-3 topography code
    primary_site_description VARCHAR(200),
    histology_icd_o3 VARCHAR(10), -- ICD-O-3 morphology code
    histology_description VARCHAR(200),
    behavior_code VARCHAR(2), -- /0 benign, /1 uncertain, /2 in situ, /3 malignant
    grade_differentiation VARCHAR(5), -- Well, Moderate, Poor, Undifferentiated
    laterality VARCHAR(20), -- Right, Left, Bilateral, Midline
    tnm_clinical_t VARCHAR(10),
    tnm_clinical_n VARCHAR(10),
    tnm_clinical_m VARCHAR(10),
    tnm_pathological_t VARCHAR(10),
    tnm_pathological_n VARCHAR(10),
    tnm_pathological_m VARCHAR(10),
    ajcc_stage_group VARCHAR(10), -- Stage 0, I, II, III, IV
    biomarker_status TEXT, -- ER/PR/HER2, PD-L1, etc
    genetic_mutations TEXT[], -- BRCA1, BRCA2, EGFR, KRAS, etc
    diagnosis_method VARCHAR(50), -- Biopsy, Imaging, Surgery, etc
    diagnosis_basis VARCHAR(50),
    date_of_first_contact DATE,
    primary_cancer BOOLEAN DEFAULT TRUE,
    recurrence_flag BOOLEAN DEFAULT FALSE,
    metastatic_flag BOOLEAN DEFAULT FALSE
);

-- =====================================================
-- TREATMENT REGIMENS
-- =====================================================
CREATE TABLE treatment_protocol (
    protocol_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_uuid UUID NOT NULL REFERENCES oncology_patient_record(patient_uuid),
    diagnosis_uuid UUID REFERENCES cancer_diagnosis(diagnosis_uuid),
    attending_physician_uuid UUID REFERENCES healthcare_professional(staff_uuid),
    treatment_intent VARCHAR(40), -- CURATIVE, PALLIATIVE, ADJUVANT, NEOADJUVANT
    protocol_name VARCHAR(200),
    protocol_code VARCHAR(50),
    modality_type VARCHAR(40), -- CHEMOTHERAPY, RADIATION, SURGERY, IMMUNOTHERAPY, etc
    start_date DATE NOT NULL,
    planned_end_date DATE,
    actual_end_date DATE,
    total_cycles_planned INTEGER,
    cycles_completed INTEGER DEFAULT 0,
    treatment_response VARCHAR(40), -- COMPLETE, PARTIAL, STABLE, PROGRESSIVE
    toxicity_grade VARCHAR(10), -- CTCAE grades 1-5
    protocol_status VARCHAR(30) DEFAULT 'ACTIVE',
    discontinuation_reason TEXT,
    clinical_trial_flag BOOLEAN DEFAULT FALSE,
    trial_identifier VARCHAR(50)
);

-- =====================================================
-- CHEMOTHERAPY ADMINISTRATION LOG
-- =====================================================
CREATE TABLE chemo_administration (
    admin_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol_uuid UUID NOT NULL REFERENCES treatment_protocol(protocol_uuid),
    patient_uuid UUID NOT NULL REFERENCES oncology_patient_record(patient_uuid),
    administering_nurse_uuid UUID REFERENCES healthcare_professional(staff_uuid),
    cycle_number INTEGER,
    day_of_cycle INTEGER,
    administration_datetime TIMESTAMP NOT NULL,
    drug_generic_name VARCHAR(200) NOT NULL,
    drug_brand_name VARCHAR(200),
    calculated_dose DECIMAL(10,2),
    dose_units VARCHAR(30), -- mg, g, units, etc
    bsa_used DECIMAL(5,2), -- Body Surface Area in m²
    route_of_admin VARCHAR(50), -- IV, PO, SC, IM, etc
    infusion_duration_minutes INTEGER,
    premedications_given TEXT[],
    vital_signs_json JSONB,
    adverse_reactions TEXT,
    completed_flag BOOLEAN DEFAULT FALSE,
    administration_notes TEXT
);

-- =====================================================
-- RADIATION THERAPY SESSIONS
-- =====================================================
CREATE TABLE radiation_therapy_session (
    session_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol_uuid UUID NOT NULL REFERENCES treatment_protocol(protocol_uuid),
    patient_uuid UUID NOT NULL REFERENCES oncology_patient_record(patient_uuid),
    radiation_oncologist_uuid UUID REFERENCES healthcare_professional(staff_uuid),
    session_date DATE NOT NULL,
    fraction_number INTEGER,
    treatment_site VARCHAR(100),
    technique_used VARCHAR(100), -- IMRT, VMAT, Proton, Brachytherapy, etc
    dose_delivered_cgy INTEGER, -- dose in centiGray
    cumulative_dose_cgy INTEGER,
    machine_identifier VARCHAR(50),
    physicist_approval_uuid UUID,
    treatment_verified BOOLEAN DEFAULT FALSE,
    patient_positioning_notes TEXT,
    complications_noted TEXT
);

-- =====================================================
-- PHARMACY ONCOLOGY DRUGS
-- =====================================================
CREATE TABLE oncology_drug_catalog (
    drug_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_drug_name VARCHAR(200) NOT NULL,
    brand_names TEXT[],
    drug_class VARCHAR(100), -- Alkylating agent, Antimetabolite, etc
    hazardous_drug_category VARCHAR(5), -- USP 800 categories
    requires_special_handling BOOLEAN DEFAULT FALSE,
    black_box_warning BOOLEAN DEFAULT FALSE,
    ndc_primary VARCHAR(20),
    typical_indication TEXT,
    standard_dosing_info TEXT
);

-- =====================================================
-- IMAGING STUDIES
-- =====================================================
CREATE TABLE imaging_study (
    study_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_uuid UUID NOT NULL REFERENCES oncology_patient_record(patient_uuid),
    ordering_physician_uuid UUID REFERENCES healthcare_professional(staff_uuid),
    study_datetime TIMESTAMP NOT NULL,
    modality_type VARCHAR(30), -- CT, MRI, PET, PET-CT, Ultrasound, X-Ray
    body_region VARCHAR(100),
    study_indication TEXT,
    contrast_used BOOLEAN DEFAULT FALSE,
    contrast_agent VARCHAR(100),
    radiologist_uuid UUID REFERENCES healthcare_professional(staff_uuid),
    findings_summary TEXT,
    impression TEXT,
    recist_measurements JSONB, -- Response Evaluation Criteria in Solid Tumors
    study_accession_number VARCHAR(50) UNIQUE,
    pacs_link VARCHAR(500) -- Picture Archiving System
);

-- =====================================================
-- TUMOR BOARD REVIEWS
-- =====================================================
CREATE TABLE tumor_board_case (
    case_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_uuid UUID NOT NULL REFERENCES oncology_patient_record(patient_uuid),
    diagnosis_uuid UUID REFERENCES cancer_diagnosis(diagnosis_uuid),
    presentation_date DATE NOT NULL,
    presenting_physician_uuid UUID REFERENCES healthcare_professional(staff_uuid),
    case_complexity VARCHAR(30), -- ROUTINE, COMPLEX, RARE
    discussion_summary TEXT,
    recommendations TEXT,
    consensus_reached BOOLEAN DEFAULT TRUE,
    followup_required BOOLEAN DEFAULT FALSE,
    attendees_uuids UUID[]
);

-- =====================================================
-- INSERT ONCOLOGY UNITS
-- =====================================================
INSERT INTO oncology_unit (unit_designation, unit_abbreviation, unit_category, wing_location, floor_level, bed_count) VALUES
('Medical Oncology Infusion Center', 'MOIC', 'MEDICAL_ONC', 'East Wing', '2', 30),
('Radiation Oncology Department', 'RAD_ONC', 'RADIATION_ONC', 'Basement Level', 'B1', 0),
('Surgical Oncology Ward', 'SURG_ONC', 'SURGICAL_ONC', 'West Wing', '3', 24),
('Hematology Malignancies Unit', 'HEMA_MAL', 'HEMATOLOGY', 'North Wing', '4', 28),
('Bone Marrow Transplant Unit', 'BMT', 'TRANSPLANT', 'South Wing', '5', 16),
('Clinical Trials Research Center', 'CTRC', 'RESEARCH', 'East Wing', '6', 20),
('Palliative and Supportive Care', 'PALLCARE', 'SUPPORTIVE', 'South Wing', '7', 18),
('Oncology Pharmacy Services', 'ONC_PHARM', 'PHARMACY', 'Main Building', '1', 0);