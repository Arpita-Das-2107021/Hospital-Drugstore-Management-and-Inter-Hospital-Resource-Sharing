-- =====================================================
-- PSYCHIATRIC HOSPITAL DATABASE
-- Hospital 10 - Mental Health & Behavioral Medicine
-- =====================================================
-- Specialized mental health database with privacy-focused design

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- INSTITUTION PROFILE
-- =====================================================
CREATE TABLE institution_profile (
    institution_id BIGSERIAL PRIMARY KEY,
    institution_name VARCHAR(200) NOT NULL DEFAULT 'Psychiatric Hospital',
    license_number VARCHAR(50) DEFAULT 'MH-LIC-2026-010',
    jcaho_certified BOOLEAN DEFAULT TRUE,
    samhsa_registered BOOLEAN DEFAULT TRUE,
    crisis_hotline VARCHAR(20),
    total_capacity INTEGER DEFAULT 120
);

INSERT INTO institution_profile (institution_name, license_number) 
VALUES ('Psychiatric Hospital', 'MH-LIC-2026-010');

-- =====================================================
-- CLIENT MASTER FILE (Privacy-focused patient records)
-- =====================================================
CREATE TABLE client_master (
    client_id BIGSERIAL PRIMARY KEY,
    client_number VARCHAR(25) UNIQUE NOT NULL, -- Anonymized identifier
    surname VARCHAR(60) NOT NULL,
    first_name VARCHAR(60) NOT NULL,
    preferred_name VARCHAR(60),
    date_of_birth DATE NOT NULL,
    age_at_admission INTEGER,
    gender_assigned VARCHAR(20),
    gender_current VARCHAR(30),
    pronouns VARCHAR(30),
    race_ethnicity VARCHAR(50),
    primary_language VARCHAR(40) DEFAULT 'English',
    interpreter_needed BOOLEAN DEFAULT FALSE,
    marital_status VARCHAR(30),
    education_level VARCHAR(50),
    employment_status VARCHAR(50),
    living_situation VARCHAR(100),
    phone_number VARCHAR(18),
    alternate_phone VARCHAR(18),
    email_contact VARCHAR(100),
    street_address VARCHAR(150),
    city VARCHAR(70),
    state_code VARCHAR(2),
    zip_code VARCHAR(12),
    emergency_contact_person VARCHAR(120),
    emergency_contact_relation VARCHAR(50),
    emergency_contact_number VARCHAR(18),
    insurance_carrier VARCHAR(100),
    insurance_policy_number VARCHAR(80),
    insurance_group_number VARCHAR(50),
    medicare_number VARCHAR(20),
    medicaid_number VARCHAR(20),
    consent_to_treat_signed BOOLEAN DEFAULT FALSE,
    hipaa_authorization_signed BOOLEAN DEFAULT FALSE,
    client_status VARCHAR(20) DEFAULT 'ACTIVE',
    admitted_date DATE,
    discharged_date DATE,
    readmission_count INTEGER DEFAULT 0
);

-- =====================================================
-- PROGRAM UNITS
-- =====================================================
CREATE TABLE program_unit (
    program_id BIGSERIAL PRIMARY KEY,
    program_name VARCHAR(120) NOT NULL,
    program_code VARCHAR(20) UNIQUE NOT NULL,
    program_type VARCHAR(50), -- INPATIENT, OUTPATIENT, PARTIAL_HOSPITALIZATION, IOP
    specialization VARCHAR(100), -- ACUTE_PSYCH, GERIATRIC, ADOLESCENT, SUBSTANCE_USE, etc
    medical_director_id BIGINT,
    unit_location VARCHAR(100),
    max_census INTEGER,
    coed_unit BOOLEAN DEFAULT TRUE,
    secure_unit BOOLEAN DEFAULT FALSE,
    contact_phone VARCHAR(18)
);

-- =====================================================
-- CLINICAL STAFF ROSTER
-- =====================================================
CREATE TABLE clinical_staff (
    clinician_id BIGSERIAL PRIMARY KEY,
    staff_number VARCHAR(25) UNIQUE NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    first_name VARCHAR(60) NOT NULL,
    professional_designation VARCHAR(120), -- MD Psychiatrist, LCSW, LMFT, PhD Psychologist, etc
    staff_role VARCHAR(60),
    assigned_program_id BIGINT REFERENCES program_unit(program_id),
    clinical_specialties VARCHAR(200),
    license_type VARCHAR(50),
    license_id VARCHAR(40),
    license_expiration DATE,
    prescribing_authority BOOLEAN DEFAULT FALSE,
    crisis_certified BOOLEAN DEFAULT FALSE,
    trauma_informed_trained BOOLEAN DEFAULT FALSE,
    hire_date DATE,
    termination_date DATE,
    work_schedule VARCHAR(50),
    email_work VARCHAR(100),
    phone_direct VARCHAR(18),
    employee_status VARCHAR(20) DEFAULT 'ACTIVE'
);

ALTER TABLE program_unit ADD CONSTRAINT fk_medical_director
    FOREIGN KEY (medical_director_id) REFERENCES clinical_staff(clinician_id);

-- =====================================================
-- PSYCHIATRIC ASSESSMENTS
-- =====================================================
CREATE TABLE psychiatric_assessment (
    assessment_id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES client_master(client_id),
    clinician_id BIGINT NOT NULL REFERENCES clinical_staff(clinician_id),
    assessment_date DATE NOT NULL,
    assessment_time TIME,
    assessment_type VARCHAR(50), -- INTAKE, DIAGNOSTIC, CRISIS, ROUTINE, DISCHARGE
    presenting_problem TEXT,
    history_of_present_illness TEXT,
    psychiatric_history TEXT,
    substance_use_history TEXT,
    trauma_history TEXT,
    medical_history TEXT,
    family_psychiatric_history TEXT,
    current_medications TEXT,
    allergies_intolerances TEXT,
    mental_status_exam TEXT,
    mood_description VARCHAR(100),
    affect_description VARCHAR(100),
    thought_process VARCHAR(100),
    thought_content TEXT,
    perceptual_disturbances TEXT,
    suicidal_ideation VARCHAR(50), -- NONE, PASSIVE, ACTIVE_NO_PLAN, ACTIVE_WITH_PLAN
    homicidal_ideation VARCHAR(50),
    insight_level VARCHAR(50),
    judgment_level VARCHAR(50),
    risk_level VARCHAR(30), -- LOW, MODERATE, HIGH, IMMINENT
    dsm5_diagnosis_primary VARCHAR(200),
    dsm5_code_primary VARCHAR(20),
    dsm5_diagnosis_secondary VARCHAR(200),
    dsm5_code_secondary VARCHAR(20),
    gaf_score INTEGER, -- Global Assessment of Functioning (deprecated but some use)
    severity_rating VARCHAR(50),
    assessment_summary TEXT,
    recommendations TEXT
);

-- =====================================================
-- TREATMENT PLANS
-- =====================================================
CREATE TABLE treatment_plan (
    plan_id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES client_master(client_id),
    primary_clinician_id BIGINT REFERENCES clinical_staff(clinician_id),
    plan_start_date DATE NOT NULL,
    plan_review_date DATE,
    plan_end_date DATE,
    treatment_goals TEXT,
    objectives_interventions TEXT,
    therapeutic_modality VARCHAR(100), -- CBT, DBT, Psychodynamic, Family Therapy, etc
    frequency_of_sessions VARCHAR(100),
    estimated_duration VARCHAR(50),
    discharge_criteria TEXT,
    plan_status VARCHAR(30) DEFAULT 'ACTIVE',
    client_agreement_signed BOOLEAN DEFAULT FALSE,
    last_updated_date DATE
);

-- =====================================================
-- THERAPY SESSION NOTES
-- =====================================================
CREATE TABLE therapy_session (
    session_id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES client_master(client_id),
    clinician_id BIGINT NOT NULL REFERENCES clinical_staff(clinician_id),
    session_date DATE NOT NULL,
    session_start_time TIME,
    session_end_time TIME,
    session_duration_minutes INTEGER,
    session_modality VARCHAR(50), -- INDIVIDUAL, GROUP, FAMILY, COUPLES
    session_type VARCHAR(50), -- IN_PERSON, TELEHEALTH, PHONE
    attendance_status VARCHAR(30), -- ATTENDED, NO_SHOW, CANCELLED, RESCHEDULED
    client_presentation TEXT,
    topics_addressed TEXT,
    interventions_used TEXT,
    client_response TEXT,
    homework_assigned TEXT,
    clinical_observations TEXT,
    risk_assessment_summary VARCHAR(200),
    progress_toward_goals VARCHAR(200),
    plan_for_next_session TEXT,
    session_note_signed BOOLEAN DEFAULT FALSE,
    signature_timestamp TIMESTAMP
);

-- =====================================================
-- PSYCHIATRIC MEDICATIONS
-- =====================================================
CREATE TABLE psych_medication_formulary (
    medication_id BIGSERIAL PRIMARY KEY,
    medication_name VARCHAR(200) NOT NULL,
    generic_equivalent VARCHAR(200),
    drug_category VARCHAR(100), -- Antidepressant, Antipsychotic, Mood Stabilizer, etc
    controlled_class VARCHAR(10), -- C-II, C-III, C-IV, C-V
    black_box_warning_text TEXT,
    typical_starting_dose VARCHAR(100),
    therapeutic_range VARCHAR(100),
    monitoring_requirements TEXT
);

-- =====================================================
-- MEDICATION ORDERS
-- =====================================================
CREATE TABLE medication_order (
    order_id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES client_master(client_id),
    prescriber_id BIGINT NOT NULL REFERENCES clinical_staff(clinician_id),
    medication_id BIGINT REFERENCES psych_medication_formulary(medication_id),
    medication_name_text VARCHAR(200), -- In case not in formulary
    order_date DATE NOT NULL,
    start_date DATE,
    discontinue_date DATE,
    dosage_amount VARCHAR(100),
    dosage_unit VARCHAR(50),
    route_of_admin VARCHAR(50), -- PO, IM, SL, etc
    frequency VARCHAR(100), -- Daily, BID, TID, QHS, PRN, etc
    special_instructions TEXT,
    indication_for_use VARCHAR(200),
    order_status VARCHAR(30) DEFAULT 'ACTIVE',
    discontinue_reason TEXT
);

-- =====================================================
-- MEDICATION ADMINISTRATION RECORD
-- =====================================================
CREATE TABLE med_administration_record (
    admin_id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES medication_order(order_id),
    client_id BIGINT NOT NULL REFERENCES client_master(client_id),
    administering_staff_id BIGINT REFERENCES clinical_staff(clinician_id),
    scheduled_datetime TIMESTAMP NOT NULL,
    actual_datetime TIMESTAMP,
    dose_given VARCHAR(100),
    administration_status VARCHAR(30), -- GIVEN, REFUSED, HELD, NOT_AVAILABLE
    refusal_reason TEXT,
    held_reason TEXT,
    client_response TEXT,
    adverse_reaction_flag BOOLEAN DEFAULT FALSE,
    adverse_reaction_details TEXT,
    documentation_notes TEXT
);

-- =====================================================
-- CRISIS INCIDENTS
-- =====================================================
CREATE TABLE crisis_incident (
    incident_id BIGSERIAL PRIMARY KEY,
    client_id BIGINT REFERENCES client_master(client_id),
    incident_datetime TIMESTAMP NOT NULL,
    reporting_staff_id BIGINT REFERENCES clinical_staff(clinician_id),
    incident_type VARCHAR(80), -- AGGRESSION, SELF_HARM, ELOPEMENT, ALTERCATION, etc
    severity_level VARCHAR(30), -- MINOR, MODERATE, MAJOR
    incident_location VARCHAR(100),
    detailed_description TEXT,
    antecedents TEXT,
    interventions_applied TEXT,
    restraint_used BOOLEAN DEFAULT FALSE,
    restraint_type VARCHAR(100),
    restraint_duration_minutes INTEGER,
    seclusion_used BOOLEAN DEFAULT FALSE,
    seclusion_duration_minutes INTEGER,
    prn_medication_given BOOLEAN DEFAULT FALSE,
    injuries_sustained TEXT,
    medical_attention_required BOOLEAN DEFAULT FALSE,
    police_notified BOOLEAN DEFAULT FALSE,
    outcome_resolution TEXT,
    followup_plan TEXT,
    incident_reviewed_by BIGINT,
    review_date DATE
);

-- =====================================================
-- GROUP THERAPY SESSIONS
-- =====================================================
CREATE TABLE group_therapy (
    group_session_id BIGSERIAL PRIMARY KEY,
    group_name VARCHAR(150),
    facilitator_id BIGINT REFERENCES clinical_staff(clinician_id),
    co_facilitator_id BIGINT REFERENCES clinical_staff(clinician_id),
    session_date DATE NOT NULL,
    session_time TIME,
    duration_minutes INTEGER DEFAULT 60,
    group_type VARCHAR(80), -- PSYCHOEDUCATION, PROCESS, SKILLS, SUPPORT
    topic_focus VARCHAR(200),
    session_notes TEXT,
    attendance_count INTEGER
);

-- =====================================================
-- GROUP ATTENDANCE
-- =====================================================
CREATE TABLE group_attendance (
    attendance_id BIGSERIAL PRIMARY KEY,
    group_session_id BIGINT NOT NULL REFERENCES group_therapy(group_session_id),
    client_id BIGINT NOT NULL REFERENCES client_master(client_id),
    attendance_status VARCHAR(30), -- PRESENT, ABSENT, TARDY, LEFT_EARLY
    participation_level VARCHAR(50), -- MINIMAL, MODERATE, ACTIVE, DISRUPTIVE
    clinical_notes TEXT
);

-- =====================================================
-- INSERT PROGRAM UNITS
-- =====================================================
INSERT INTO program_unit (program_name, program_code, program_type, specialization, unit_location, max_census, secure_unit) VALUES
('Adult Acute Inpatient', 'ACUTE-IP', 'INPATIENT', 'ACUTE_PSYCH', 'Building 1 - Floor 2-3', 45, TRUE),
('Adolescent Inpatient', 'ADOL-IP', 'INPATIENT', 'ADOLESCENT', 'Building 2 - Floor 2', 24, TRUE),
('Geriatric Psychiatry', 'GERI-IP', 'INPATIENT', 'GERIATRIC', 'Building 1 - Floor 4', 30, FALSE),
('Dual Diagnosis Unit', 'DUAL-DX', 'INPATIENT', 'SUBSTANCE_USE', 'Building 3 - All Floors', 36, TRUE),
('Partial Hospitalization Program', 'PHP', 'PARTIAL_HOSPITALIZATION', 'ADULT', 'Building 4', 40, FALSE),
('Intensive Outpatient Program', 'IOP', 'OUTPATIENT', 'ADULT', 'Building 4', 30, FALSE),
('Crisis Stabilization', 'CRISIS', 'INPATIENT', 'CRISIS', 'Building 1 - Floor 1', 20, TRUE),
('Outpatient Therapy Services', 'OPT', 'OUTPATIENT', 'GENERAL', 'Building 5', 0, FALSE);