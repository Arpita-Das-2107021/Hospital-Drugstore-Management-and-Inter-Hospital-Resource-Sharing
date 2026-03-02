-- =====================================================
-- VETERANS MEDICAL CENTER DATABASE
-- Hospital 8 - Government VA Healthcare System
-- =====================================================
-- Legacy system design with government-style naming conventions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- FACILITY MASTER
-- =====================================================
CREATE TABLE facility_master (
    fac_id SERIAL PRIMARY KEY,
    fac_name VARCHAR(200) NOT NULL DEFAULT 'Veterans Medical Center',
    fac_code VARCHAR(10) DEFAULT 'VAH008',
    fac_type VARCHAR(50) DEFAULT 'VA_HOSPITAL',
    established_dt DATE DEFAULT '1995-03-15',
    accreditation_no VARCHAR(50)
);

INSERT INTO facility_master (fac_name, fac_code) VALUES ('Veterans Medical Center', 'VAH008');

-- =====================================================
-- VETERAN PATIENT REGISTRY
-- =====================================================
CREATE TABLE vet_patient_reg (
    vpr_id SERIAL PRIMARY KEY,
    va_file_num VARCHAR(20) UNIQUE NOT NULL, -- VA File Number
    ssn_last4 VARCHAR(4),
    last_nm VARCHAR(50) NOT NULL,
    first_nm VARCHAR(50) NOT NULL,
    middle_init VARCHAR(1),
    dob DATE NOT NULL,
    sex CHAR(1) CHECK (sex IN ('M', 'F', 'X')),
    blood_grp VARCHAR(3),
    ethnicity VARCHAR(30),
    service_branch VARCHAR(30), -- Army, Navy, Air Force, Marines, Coast Guard
    service_start_dt DATE,
    service_end_dt DATE,
    service_connected_disability BOOLEAN DEFAULT FALSE,
    disability_rating INTEGER, -- 0-100%
    combat_veteran BOOLEAN DEFAULT FALSE,
    addr_street VARCHAR(200),
    addr_city VARCHAR(100),
    addr_state VARCHAR(2),
    addr_zip VARCHAR(10),
    phone_home VARCHAR(15),
    phone_mobile VARCHAR(15),
    emergency_contact_nm VARCHAR(100),
    emergency_contact_phone VARCHAR(15),
    reg_dt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_visit_dt TIMESTAMP,
    status_cd VARCHAR(10) DEFAULT 'ACTIVE'
);

-- =====================================================
-- CLINICAL DIVISIONS
-- =====================================================
CREATE TABLE clinical_div (
    div_id SERIAL PRIMARY KEY,
    div_name VARCHAR(100) NOT NULL,
    div_code VARCHAR(10) UNIQUE NOT NULL,
    div_type VARCHAR(30),
    chief_physician_id INTEGER,
    building_loc VARCHAR(50),
    floor_num VARCHAR(10),
    bed_capacity INTEGER DEFAULT 0,
    phone_ext VARCHAR(10)
);

-- =====================================================
-- MEDICAL PERSONNEL
-- =====================================================
CREATE TABLE med_personnel (
    pers_id SERIAL PRIMARY KEY,
    emp_num VARCHAR(20) UNIQUE NOT NULL,
    surname VARCHAR(50) NOT NULL,
    given_name VARCHAR(50) NOT NULL,
    credentials VARCHAR(100), -- MD, DO, RN, NP, PA, etc
    job_title VARCHAR(50),
    div_id INTEGER REFERENCES clinical_div(div_id),
    specialization_cd VARCHAR(50),
    license_num VARCHAR(50),
    license_state VARCHAR(2),
    hire_dt DATE,
    work_schedule VARCHAR(20), -- DAYS, NIGHTS, ROTATING
    email_addr VARCHAR(100),
    phone_ext VARCHAR(10),
    active_flag CHAR(1) DEFAULT 'Y',
    last_credentialing_dt DATE
);

ALTER TABLE clinical_div ADD CONSTRAINT fk_chief 
    FOREIGN KEY (chief_physician_id) REFERENCES med_personnel(pers_id);

-- =====================================================
-- CLINICAL ENCOUNTERS
-- =====================================================
CREATE TABLE clinical_encounter (
    enc_id SERIAL PRIMARY KEY,
    vpr_id INTEGER NOT NULL REFERENCES vet_patient_reg(vpr_id),
    pers_id INTEGER NOT NULL REFERENCES med_personnel(pers_id),
    div_id INTEGER REFERENCES clinical_div(div_id),
    enc_dt DATE NOT NULL,
    enc_time TIME,
    enc_type VARCHAR(20), -- OUTPATIENT, INPATIENT, EMERGENCY, CONSULT
    chief_complaint TEXT,
    visit_reason VARCHAR(200),
    enc_status VARCHAR(20) DEFAULT 'SCHEDULED', 
    check_in_time TIMESTAMP,
    check_out_time TIMESTAMP,
    no_show_flag CHAR(1) DEFAULT 'N'
);

-- =====================================================
-- CLINICAL NOTES
-- =====================================================
CREATE TABLE clinical_note (
    note_id SERIAL PRIMARY KEY,
    enc_id INTEGER REFERENCES clinical_encounter(enc_id),
    vpr_id INTEGER NOT NULL REFERENCES vet_patient_reg(vpr_id),
    pers_id INTEGER NOT NULL REFERENCES med_personnel(pers_id),
    note_dt DATE NOT NULL,
    note_type VARCHAR(30), -- PROGRESS, CONSULT, DISCHARGE, ADMIT
    subjective_txt TEXT,
    objective_txt TEXT,
    assessment_txt TEXT,
    plan_txt TEXT,
    vitals_json TEXT, -- Blood pressure, temp, pulse, etc
    signed_flag CHAR(1) DEFAULT 'N',
    signed_dt TIMESTAMP,
    addendum_flag CHAR(1) DEFAULT 'N'
);

-- =====================================================
-- PHARMACY FORMULARY
-- =====================================================
CREATE TABLE pharm_formulary (
    form_id SERIAL PRIMARY KEY,
    drug_name VARCHAR(200) NOT NULL,
    generic_name VARCHAR(200),
    ndc_code VARCHAR(20),
    strength_val VARCHAR(50),
    dosage_form_desc VARCHAR(100),
    route_desc VARCHAR(50),
    therapeutic_class VARCHAR(100),
    va_class VARCHAR(50), -- VA drug classification
    controlled_subst_schedule VARCHAR(5), -- I, II, III, IV, V
    formulary_status VARCHAR(20) DEFAULT 'ACTIVE',
    unit_price DECIMAL(10,4)
);

-- =====================================================
-- PHARMACY STOCK
-- =====================================================
CREATE TABLE pharm_stock (
    stock_id SERIAL PRIMARY KEY,
    form_id INTEGER NOT NULL REFERENCES pharm_formulary(form_id),
    lot_num VARCHAR(50),
    qty_on_hand INTEGER NOT NULL DEFAULT 0,
    expiration_dt DATE,
    acquisition_cost DECIMAL(10,2),
    vendor_name VARCHAR(100),
    storage_loc VARCHAR(50),
    reorder_level INTEGER DEFAULT 50,
    last_inventory_dt DATE
);

-- =====================================================
-- RX ORDERS
-- =====================================================
CREATE TABLE rx_order (
    rx_id SERIAL PRIMARY KEY,
    vpr_id INTEGER NOT NULL REFERENCES vet_patient_reg(vpr_id),
    prescriber_id INTEGER NOT NULL REFERENCES med_personnel(pers_id),
    form_id INTEGER NOT NULL REFERENCES pharm_formulary(form_id),
    rx_num VARCHAR(30) UNIQUE,
    order_dt DATE NOT NULL,
    sig_text VARCHAR(500), -- Directions for use
    qty_ordered INTEGER,
    refills_auth INTEGER DEFAULT 0,
    refills_remain INTEGER DEFAULT 0,
    days_supply INTEGER,
    rx_status VARCHAR(20) DEFAULT 'ACTIVE',
    discontinue_dt DATE,
    discontinue_reason VARCHAR(200)
);

-- =====================================================
-- DIAGNOSTIC EQUIPMENT INVENTORY
-- =====================================================
CREATE TABLE diag_equip_inv (
    equip_id SERIAL PRIMARY KEY,
    equip_name VARCHAR(200) NOT NULL,
    equip_type VARCHAR(50),
    manufacturer VARCHAR(100),
    model_num VARCHAR(100),
    serial_num VARCHAR(100),
    asset_tag VARCHAR(50) UNIQUE,
    div_id INTEGER REFERENCES clinical_div(div_id),
    purchase_dt DATE,
    purchase_cost DECIMAL(12,2),
    warranty_exp_dt DATE,
    last_pm_dt DATE, -- Preventive Maintenance
    next_pm_dt DATE,
    equip_status VARCHAR(20) DEFAULT 'OPERATIONAL',
    location_desc VARCHAR(200)
);

-- =====================================================
-- BLOOD PRODUCT INVENTORY
-- =====================================================
CREATE TABLE blood_prod_inv (
    prod_id SERIAL PRIMARY KEY,
    blood_type VARCHAR(3) CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    product_type VARCHAR(30), -- WHOLE, RBC, PLASMA, PLATELETS, CRYO
    unit_count INTEGER NOT NULL DEFAULT 0,
    collection_dt DATE,
    expiration_dt DATE,
    donor_code VARCHAR(50),
    testing_status VARCHAR(20) DEFAULT 'PENDING',
    storage_temp VARCHAR(20),
    reserved_count INTEGER DEFAULT 0
);

-- =====================================================
-- PTSD SESSION TRACKING (VA-specific)
-- =====================================================
CREATE TABLE ptsd_session (
    session_id SERIAL PRIMARY KEY,
    vpr_id INTEGER NOT NULL REFERENCES vet_patient_reg(vpr_id),
    therapist_id INTEGER NOT NULL REFERENCES med_personnel(pers_id),
    session_dt DATE NOT NULL,
    session_num INTEGER,
    therapy_type VARCHAR(50), -- CPT, PE, EMDR, GROUP
    duration_min INTEGER,
    pcl5_score INTEGER, -- PTSD Checklist score
    session_notes TEXT,
    homework_assigned TEXT,
    next_session_dt DATE
);

-- =====================================================
-- INSERT DIVISIONS
-- =====================================================
INSERT INTO clinical_div (div_name, div_code, div_type, building_loc, floor_num, bed_capacity) VALUES
('Primary Care Clinic', 'PCC', 'OUTPATIENT', 'Building A', '1', 0),
('Mental Health Service', 'MHS', 'OUTPATIENT', 'Building B', '3', 25),
('PTSD Clinic', 'PTSD', 'OUTPATIENT', 'Building B', '2', 20),
('Substance Abuse Treatment', 'SATP', 'RESIDENTIAL', 'Building C', 'ALL', 30),
('Emergency Department', 'ED', 'EMERGENCY', 'Building A', '1', 15),
('Internal Medicine', 'IM', 'INPATIENT', 'Building A', '4-5', 40),
('Pharmacy Service', 'PHARM', 'SUPPORT', 'Building A', '1', 0),
('Social Work Service', 'SWS', 'SUPPORT', 'Building B', '1', 0);