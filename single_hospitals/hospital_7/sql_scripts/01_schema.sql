-- =====================================================
-- CHILDREN'S MEDICAL CENTER DATABASE
-- Hospital 7 - Comprehensive Pediatric Care System
-- =====================================================
-- Child-focused database with guardian tracking and age-appropriate care

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PEDIATRIC FACILITY INFO
-- =====================================================
CREATE TABLE pediatric_facility (
    facility_key SERIAL PRIMARY KEY,
    facility_full_name VARCHAR(200) NOT NULL DEFAULT 'Children''s Medical Center',
    facility_short_code VARCHAR(20) DEFAULT 'CMC-007',
    hospital_type VARCHAR(50) DEFAULT 'PEDIATRIC_SPECIALTY',
    accreditation_status VARCHAR(50) DEFAULT 'JCAHO_ACCREDITED',
    trauma_level VARCHAR(20) DEFAULT 'LEVEL_I_PEDIATRIC',
    nicu_level VARCHAR(20) DEFAULT 'LEVEL_IV'
);

INSERT INTO pediatric_facility (facility_full_name, facility_short_code) 
VALUES ('Children''s Medical Center', 'CMC-007');

-- =====================================================
-- PEDIATRIC PATIENTS (Child-specific)
-- =====================================================
CREATE TABLE child_patient (
    child_id SERIAL PRIMARY KEY,
    chart_number VARCHAR(30) UNIQUE NOT NULL,
    child_last_name VARCHAR(70) NOT NULL,
    child_first_name VARCHAR(70) NOT NULL,
    child_middle_name VARCHAR(70),
    nickname VARCHAR(50),
    date_of_birth DATE NOT NULL,
    birth_weight_grams INTEGER,
    gestational_age_weeks INTEGER,
    sex_at_birth VARCHAR(20) CHECK (sex_at_birth IN ('male', 'female', 'intersex', 'undetermined')),
    blood_group VARCHAR(5),
    multiple_birth_indicator BOOLEAN DEFAULT FALSE,
    birth_order INTEGER,
    newborn_screening_complete BOOLEAN DEFAULT FALSE,
    immunization_status VARCHAR(50), -- UP_TO_DATE, DELAYED, INCOMPLETE
    primary_language VARCHAR(50) DEFAULT 'English',
    school_grade VARCHAR(30),
    special_needs TEXT,
    allergies_list TEXT,
    chronic_diagnoses TEXT,
    growth_concerns TEXT,
    developmental_milestones TEXT,
    current_address TEXT,
    registration_dt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active_patient BOOLEAN DEFAULT TRUE
);

-- =====================================================
-- GUARDIANS / PARENTS
-- =====================================================
CREATE TABLE guardian (
    guardian_id SERIAL PRIMARY KEY,
    guardian_last_name VARCHAR(70) NOT NULL,
    guardian_first_name VARCHAR(70) NOT NULL,
    relationship_to_child VARCHAR(50), -- Mother, Father, Grandmother, Foster Parent, etc
    legal_guardian BOOLEAN DEFAULT TRUE,
    primary_contact BOOLEAN DEFAULT FALSE,
    home_phone VARCHAR(20),
    work_phone VARCHAR(20),
    mobile_phone VARCHAR(20),
    email_addr VARCHAR(120),
    employer VARCHAR(150),
    occupation VARCHAR(100),
    home_address TEXT,
    consent_to_treat BOOLEAN DEFAULT FALSE,
    photo_consent BOOLEAN DEFAULT FALSE,
    research_consent BOOLEAN DEFAULT FALSE
);

-- =====================================================
-- CHILD-GUARDIAN RELATIONSHIP
-- =====================================================
CREATE TABLE child_guardian_link (
    link_id SERIAL PRIMARY KEY,
    child_id INTEGER NOT NULL REFERENCES child_patient(child_id),
    guardian_id INTEGER NOT NULL REFERENCES guardian(guardian_id),
    relationship_type VARCHAR(50),
    custody_rights BOOLEAN DEFAULT TRUE,
    medical_decision_authority BOOLEAN DEFAULT TRUE,
    pickup_authorized BOOLEAN DEFAULT TRUE,
    contact_priority INTEGER,
    notes TEXT
);

-- =====================================================
-- PEDIATRIC CARE UNITS
-- =====================================================
CREATE TABLE care_unit (
    unit_id SERIAL PRIMARY KEY,
    unit_full_name VARCHAR(120) NOT NULL,
    unit_code VARCHAR(15) UNIQUE NOT NULL,
    unit_type VARCHAR(50), -- INPATIENT, OUTPATIENT, ICU, NICU, etc
    age_range_min INTEGER DEFAULT 0, -- Age in months
    age_range_max INTEGER, -- Age in months (NULL for no upper limit)
    medical_director_id INTEGER,
    nurse_manager_id INTEGER,
    building_name VARCHAR(50),
    floor_number VARCHAR(10),
    total_beds INTEGER DEFAULT 0,
    isolation_rooms INTEGER DEFAULT 0,
    child_friendly_decor BOOLEAN DEFAULT TRUE,
    play_area_available BOOLEAN DEFAULT FALSE
);

-- =====================================================
-- PEDIATRIC MEDICAL STAFF
-- =====================================================
CREATE TABLE pediatric_staff (
    provider_id SERIAL PRIMARY KEY,
    emp_code VARCHAR(25) UNIQUE NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    first_name VARCHAR(60) NOT NULL,
    credentials VARCHAR(120), -- MD FAAP, DO, RN CPNP-PC, etc
    staff_category VARCHAR(50), -- PHYSICIAN, NURSE, NP, PA, THERAPIST, etc
    primary_unit_id INTEGER REFERENCES care_unit(unit_id),
    pediatric_subspecialty VARCHAR(100),
    board_certified_pediatrics BOOLEAN DEFAULT FALSE,
    pals_certified BOOLEAN DEFAULT FALSE, -- Pediatric Advanced Life Support
    nrp_certified BOOLEAN DEFAULT FALSE, -- Neonatal Resuscitation Program
    license_number VARCHAR(50),
    state_licensed VARCHAR(2),
    hire_date DATE,
    work_shift VARCHAR(30),
    contact_email VARCHAR(120),
    phone_extension VARCHAR(15),
    languages_spoken TEXT[],
    staff_active BOOLEAN DEFAULT TRUE
);

ALTER TABLE care_unit ADD CONSTRAINT fk_medical_director
    FOREIGN KEY (medical_director_id) REFERENCES pediatric_staff(provider_id);

ALTER TABLE care_unit ADD CONSTRAINT fk_nurse_manager
    FOREIGN KEY (nurse_manager_id) REFERENCES pediatric_staff(provider_id);

-- =====================================================
-- PEDIATRIC VISITS
-- =====================================================
CREATE TABLE pediatric_visit (
    visit_id SERIAL PRIMARY KEY,
    child_id INTEGER NOT NULL REFERENCES child_patient(child_id),
    accompanying_guardian_id INTEGER REFERENCES guardian(guardian_id),
    attending_provider_id INTEGER REFERENCES pediatric_staff(provider_id),
    unit_id INTEGER REFERENCES care_unit(unit_id),
    visit_date DATE NOT NULL,
    visit_time TIME,
    visit_type VARCHAR(40), -- WELL_CHILD, SICK_VISIT, FOLLOWUP, EMERGENCY, SPECIALTY
    chief_complaint TEXT,
    reason_for_visit TEXT,
    visit_status VARCHAR(30) DEFAULT 'SCHEDULED',
    check_in_timestamp TIMESTAMP,
    check_out_timestamp TIMESTAMP,
    consent_obtained_from INTEGER REFERENCES guardian(guardian_id),
    no_show BOOLEAN DEFAULT FALSE
);

-- =====================================================
-- GROWTH MEASUREMENTS
-- =====================================================
CREATE TABLE growth_measurement (
    measurement_id SERIAL PRIMARY KEY,
    child_id INTEGER NOT NULL REFERENCES child_patient(child_id),
    visit_id INTEGER REFERENCES pediatric_visit(visit_id),
    measurement_date DATE NOT NULL,
    age_at_measurement_months INTEGER,
    weight_kg DECIMAL(6,3),
    height_cm DECIMAL(6,2),
    head_circumference_cm DECIMAL(5,2),
    bmi DECIMAL(5,2),
    weight_percentile INTEGER,
    height_percentile INTEGER,
    bmi_percentile INTEGER,
    growth_chart_used VARCHAR(50) DEFAULT 'WHO', -- WHO or CDC
    measured_by INTEGER REFERENCES pediatric_staff(provider_id),
    notes TEXT
);

-- =====================================================
-- PEDIATRIC CLINICAL NOTES
-- =====================================================
CREATE TABLE pediatric_clinical_note (
    note_id SERIAL PRIMARY KEY,
    child_id INTEGER NOT NULL REFERENCES child_patient(child_id),
    visit_id INTEGER REFERENCES pediatric_visit(visit_id),
    provider_id INTEGER NOT NULL REFERENCES pediatric_staff(provider_id),
    note_date DATE NOT NULL,
    note_type VARCHAR(40), -- PROGRESS, HPI, ASSESSMENT, PROCEDURE, DISCHARGE
    subjective_findings TEXT,
    objective_findings TEXT,
    assessment_diagnosis TEXT,
    treatment_plan TEXT,
    vital_signs_json TEXT,
    developmental_assessment TEXT,
    behavioral_observations TEXT,
    parent_education_provided TEXT,
    follow_up_instructions TEXT,
    signed_by INTEGER REFERENCES pediatric_staff(provider_id),
    co_signed_by INTEGER REFERENCES pediatric_staff(provider_id),
    note_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- IMMUNIZATION RECORDS
-- =====================================================
CREATE TABLE immunization_record (
    immunization_id SERIAL PRIMARY KEY,
    child_id INTEGER NOT NULL REFERENCES child_patient(child_id),
    visit_id INTEGER REFERENCES pediatric_visit(visit_id),
    vaccine_name VARCHAR(150) NOT NULL,
    vaccine_code VARCHAR(20), -- CVX code
    dose_number INTEGER,
    administration_date DATE NOT NULL,
    administering_provider_id INTEGER REFERENCES pediatric_staff(provider_id),
    route_of_admin VARCHAR(30), -- IM, SQ, Oral, Intranasal
    anatomic_site VARCHAR(50), -- Right/Left deltoid, thigh, etc
    lot_number VARCHAR(50),
    expiration_date DATE,
    manufacturer VARCHAR(100),
    vis_date DATE, -- Vaccine Information Statement date given
    guardian_consent_id INTEGER REFERENCES guardian(guardian_id),
    adverse_reaction BOOLEAN DEFAULT FALSE,
    adverse_reaction_details TEXT,
    next_dose_due_date DATE
);

-- =====================================================
-- PEDIATRIC MEDICATIONS
-- =====================================================
CREATE TABLE pediatric_drug_catalog (
    drug_id SERIAL PRIMARY KEY,
    drug_generic_name VARCHAR(200) NOT NULL,
    drug_brand_names TEXT[],
    formulation VARCHAR(100), -- Liquid, Chewable, Tablet, Injectable, etc
    concentration VARCHAR(100), -- For pediatric dosing
    pediatric_approved BOOLEAN DEFAULT TRUE,
    age_restriction_months INTEGER,
    weight_based_dosing BOOLEAN DEFAULT TRUE,
    special_considerations TEXT -- Taste-masking, refrigeration, etc
);

-- =====================================================
-- MEDICATION ORDERS
-- =====================================================
CREATE TABLE pediatric_rx (
    rx_id SERIAL PRIMARY KEY,
    child_id INTEGER NOT NULL REFERENCES child_patient(child_id),
    prescriber_id INTEGER NOT NULL REFERENCES pediatric_staff(provider_id),
    drug_id INTEGER REFERENCES pediatric_drug_catalog(drug_id),
    order_date DATE NOT NULL,
    medication_name VARCHAR(200),
    dose_amount VARCHAR(100),
    dose_unit VARCHAR(30),
    weight_based_calc TEXT, -- e.g., "10 mg/kg"
    child_weight_kg DECIMAL(6,3),
    route VARCHAR(50),
    frequency VARCHAR(100),
    duration_days INTEGER,
    quantity_dispensed VARCHAR(50),
    refills_authorized INTEGER DEFAULT 0,
    administration_instructions TEXT,
    guardian_education TEXT,
    rx_status VARCHAR(30) DEFAULT 'ACTIVE'
);

-- =====================================================
-- PEDIATRIC EQUIPMENT
-- =====================================================
CREATE TABLE pediatric_equipment (
    equipment_id SERIAL PRIMARY KEY,
    equipment_name VARCHAR(200) NOT NULL,
    equipment_category VARCHAR(50), -- NICU, MONITORING, RESPIRATORY, etc
    size_type VARCHAR(50), -- INFANT, TODDLER, CHILD, ADOLESCENT, or size ranges
    manufacturer VARCHAR(100),
    model_number VARCHAR(100),
    serial_number VARCHAR(100),
    unit_location INTEGER REFERENCES care_unit(unit_id),
    equipment_status VARCHAR(30) DEFAULT 'AVAILABLE',
    last_sanitization_date DATE,
    safety_inspection_date DATE,
    age_appropriate_for VARCHAR(100),
    notes TEXT
);

-- =====================================================
-- CHILD LIFE SERVICES ACTIVITIES
-- =====================================================
CREATE TABLE child_life_activity (
    activity_id SERIAL PRIMARY KEY,
    child_id INTEGER NOT NULL REFERENCES child_patient(child_id),
    child_life_specialist_id INTEGER REFERENCES pediatric_staff(provider_id),
    activity_date DATE NOT NULL,
    activity_type VARCHAR(80), -- PLAY_THERAPY, PROCEDURAL_PREP, COPING_SUPPORT, etc
    age_appropriateness VARCHAR(50),
    activity_description TEXT,
    child_engagement_level VARCHAR(50),
    therapeutic_goals TEXT,
    materials_used TEXT,
    parent_involvement BOOLEAN DEFAULT FALSE,
    outcome_notes TEXT
);

-- =====================================================
-- NEONATAL INTENSIVE CARE DATA
-- =====================================================
CREATE TABLE nicu_admission (
    nicu_admission_id SERIAL PRIMARY KEY,
    child_id INTEGER NOT NULL REFERENCES child_patient(child_id),
    admission_date TIMESTAMP NOT NULL,
    discharge_date TIMESTAMP,
    gestational_age_at_birth VARCHAR(20),
    birth_weight_grams INTEGER,
    apgar_score_1min INTEGER,
    apgar_score_5min INTEGER,
    delivery_type VARCHAR(50), -- Vaginal, C-Section, etc
    complications_at_birth TEXT,
    respiratory_support VARCHAR(50), -- Room Air, CPAP, Ventilator, etc
    feeding_type VARCHAR(50), -- TPN, Tube Feeding, Breastmilk, Formula
    phototherapy_required BOOLEAN DEFAULT FALSE,
    blood_transfusion_given BOOLEAN DEFAULT FALSE,
    length_of_stay_days INTEGER,
    discharge_weight_grams INTEGER,
    discharge_disposition VARCHAR(100)
);

-- =====================================================
-- INSERT PEDIATRIC CARE UNITS
-- =====================================================
INSERT INTO care_unit (unit_full_name, unit_code, unit_type, age_range_min, age_range_max, total_beds) VALUES
('Neonatal Intensive Care Unit', 'NICU', 'ICU', 0, 1, 30),
('Pediatric Intensive Care Unit', 'PICU', 'ICU', 1, 216, 24),
('Pediatric Surgery Ward', 'PSURG', 'INPATIENT', 0, 216, 20),
('Pediatric Cardiology Unit', 'PCARDIO', 'INPATIENT', 0, 216, 18),
('Pediatric Oncology Hematology', 'POH', 'INPATIENT', 0, 216, 22),
('Adolescent Medicine Unit', 'ADOL', 'INPATIENT', 120, 216, 16),
('Pediatric Emergency Department', 'PED', 'EMERGENCY', 0, 216, 28),
('Outpatient Pediatric Clinic', 'OPC', 'OUTPATIENT', 0, 216, 0),
('Child Life and Family Services', 'CLFS', 'SUPPORT', 0, 216, 0);