-- =====================================================
-- HOSPITAL 6: EMERGENCY TRAUMA CENTER - PostgreSQL Schema
-- Emergency/Trauma terminology
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TRAUMA_UNITS (Departments)
-- =====================================================

CREATE TABLE trauma_units (
    unit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_code VARCHAR(20) UNIQUE NOT NULL,
    unit_name VARCHAR(255) NOT NULL,
    trauma_level VARCHAR(20) CHECK (trauma_level IN ('Level I', 'Level II', 'Level III', 'Support')),
    response_area VARCHAR(100),
    floor_number INTEGER,
    emergency_capacity INTEGER DEFAULT 0,
    bed_count INTEGER DEFAULT 0,
    unit_chief_id UUID, -- References emergency_responders
    activation_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- EMERGENCY_RESPONDERS (Staff)
-- =====================================================

CREATE TABLE emergency_responders (
    responder_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID,
    responder_code VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role_title VARCHAR(255) NOT NULL,
    response_status VARCHAR(20) CHECK (response_status IN ('On Duty', 'Off Duty', 'On Call', 'Unavailable')) DEFAULT 'Off Duty',
    certification_level VARCHAR(255),
    license_number VARCHAR(100) UNIQUE,
    shift_pattern VARCHAR(50),
    contact_number VARCHAR(20),
    emergency_contact VARCHAR(255),
    radio_call_sign VARCHAR(20),
    hire_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_responder_unit FOREIGN KEY (unit_id) REFERENCES trauma_units(unit_id) ON DELETE SET NULL
);

-- Add foreign key for unit chief after emergency_responders table exists
ALTER TABLE trauma_units ADD CONSTRAINT fk_unit_chief 
    FOREIGN KEY (unit_chief_id) REFERENCES emergency_responders(responder_id) ON DELETE SET NULL;

-- =====================================================
-- TRAUMA_CASES (Patients)  
-- =====================================================

CREATE TABLE trauma_cases (
    case_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_number VARCHAR(50) UNIQUE NOT NULL,
    patient_name VARCHAR(255) NOT NULL,
    birth_date DATE,
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Unknown')),
    blood_type VARCHAR(5) CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown')),
    primary_phone VARCHAR(20),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    home_address TEXT,
    city VARCHAR(100),
    state_region VARCHAR(50),
    zip_postal VARCHAR(20),
    insurance_info JSONB,
    medical_alerts TEXT,
    trauma_history TEXT,
    arrival_method VARCHAR(50) CHECK (arrival_method IN ('Ambulance', 'Helicopter', 'Walk-in', 'Police', 'Fire Rescue')),
    arrival_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    triage_level INTEGER CHECK (triage_level BETWEEN 1 AND 5),
    case_status VARCHAR(20) DEFAULT 'Active' CHECK (case_status IN ('Active', 'Stable', 'Critical', 'Discharged', 'Transferred', 'Deceased')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- EMERGENCY_MEDICATIONS (Medications)
-- =====================================================

CREATE TABLE emergency_medications (
    medication_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medication_name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    brand_name VARCHAR(255),
    dosage_strength VARCHAR(100),
    medication_form VARCHAR(100),
    administration_route VARCHAR(100),
    drug_class VARCHAR(255),
    manufacturer VARCHAR(255),
    ndc_code VARCHAR(50) UNIQUE,
    emergency_use BOOLEAN DEFAULT false,
    controlled_substance BOOLEAN DEFAULT false,
    critical_care BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- MEDICATION_SUPPLY (Medication Inventory)
-- =====================================================

CREATE TABLE medication_supply (
    supply_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medication_id UUID NOT NULL,
    lot_batch VARCHAR(100),
    current_stock INTEGER NOT NULL DEFAULT 0,
    unit_cost DECIMAL(10,2),
    expiry_date DATE,
    received_date DATE,
    supplier VARCHAR(255),
    critical_level INTEGER DEFAULT 5,
    max_capacity INTEGER,
    storage_location VARCHAR(255),
    temperature_controlled BOOLEAN DEFAULT false,
    last_count_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uk_medication_lot UNIQUE (medication_id, lot_batch),
    CONSTRAINT fk_supply_medication FOREIGN KEY (medication_id) REFERENCES emergency_medications(medication_id) ON DELETE CASCADE
);

-- =====================================================
-- TRAUMA_EQUIPMENT (Medical Equipment)
-- =====================================================

CREATE TABLE trauma_equipment (
    equipment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID,
    equipment_name VARCHAR(255) NOT NULL,
    equipment_type VARCHAR(50) CHECK (equipment_type IN ('Life Support', 'Monitoring', 'Diagnostic', 'Surgical', 'Transport', 'Communication')),
    model VARCHAR(255),
    manufacturer VARCHAR(255),
    serial_number VARCHAR(100) UNIQUE,
    purchase_date DATE,
    purchase_cost DECIMAL(12,2),
    warranty_expires DATE,
    last_maintenance DATE,
    next_maintenance DATE,
    equipment_status VARCHAR(20) DEFAULT 'Available' CHECK (equipment_status IN ('Available', 'In Use', 'Maintenance', 'Out of Service', 'Emergency Reserve')),
    location VARCHAR(255),
    mobility VARCHAR(20) CHECK (mobility IN ('Portable', 'Mobile', 'Fixed', 'Mounted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_equipment_unit FOREIGN KEY (unit_id) REFERENCES trauma_units(unit_id) ON DELETE SET NULL
);

-- =====================================================
-- EMERGENCY_RESPONSES (Appointments)
-- =====================================================

CREATE TABLE emergency_responses (
    response_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL,
    responder_id UUID NOT NULL,
    unit_id UUID,
    response_time TIMESTAMP WITH TIME ZONE NOT NULL,
    estimated_duration INTEGER DEFAULT 60,
    response_type VARCHAR(50) CHECK (response_type IN ('Initial Assessment', 'Treatment', 'Surgery', 'Critical Care', 'Transport')),
    chief_complaint TEXT,
    response_priority VARCHAR(20) DEFAULT 'Routine' CHECK (response_priority IN ('Routine', 'Urgent', 'Emergent', 'Critical')),
    response_status VARCHAR(20) DEFAULT 'Scheduled' CHECK (response_status IN ('Scheduled', 'In Progress', 'Completed', 'Cancelled', 'Delayed')),
    outcome_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_response_case FOREIGN KEY (case_id) REFERENCES trauma_cases(case_id) ON DELETE CASCADE,
    CONSTRAINT fk_response_responder FOREIGN KEY (responder_id) REFERENCES emergency_responders(responder_id) ON DELETE CASCADE,
    CONSTRAINT fk_response_unit FOREIGN KEY (unit_id) REFERENCES trauma_units(unit_id) ON DELETE SET NULL
);

-- =====================================================
-- TRAUMA_RECORDS (Medical Records)
-- =====================================================

CREATE TABLE trauma_records (
    record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL,
    response_id UUID,
    responder_id UUID,
    record_type VARCHAR(50) CHECK (record_type IN ('Triage Assessment', 'Treatment Log', 'Surgery Report', 'Transfer Note', 'Discharge Summary')),
    record_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    record_title VARCHAR(255) NOT NULL,
    clinical_findings TEXT,
    treatment_administered TEXT,
    vital_signs JSONB,
    assessment_notes TEXT,
    disposition VARCHAR(100),
    recorded_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_record_case FOREIGN KEY (case_id) REFERENCES trauma_cases(case_id) ON DELETE CASCADE,
    CONSTRAINT fk_record_response FOREIGN KEY (response_id) REFERENCES emergency_responses(response_id) ON DELETE SET NULL,
    CONSTRAINT fk_record_responder FOREIGN KEY (responder_id) REFERENCES emergency_responders(responder_id) ON DELETE SET NULL,
    CONSTRAINT fk_record_recorder FOREIGN KEY (recorded_by) REFERENCES emergency_responders(responder_id)
);

-- =====================================================
-- EMERGENCY_PRESCRIPTIONS (Prescriptions)
-- =====================================================

CREATE TABLE emergency_prescriptions (
    prescription_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL,
    responder_id UUID NOT NULL,
    medication_id UUID NOT NULL,
    response_id UUID,
    prescribed_datetime TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    dosage VARCHAR(255),
    frequency VARCHAR(100),
    duration_hours INTEGER,
    quantity_given INTEGER,
    administration_method VARCHAR(100),
    prescription_status VARCHAR(20) DEFAULT 'Active' CHECK (prescription_status IN ('Active', 'Completed', 'Discontinued', 'Hold')),
    special_instructions TEXT,
    adverse_reactions TEXT,
    indication VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_prescription_case FOREIGN KEY (case_id) REFERENCES trauma_cases(case_id) ON DELETE CASCADE,
    CONSTRAINT fk_prescription_responder FOREIGN KEY (responder_id) REFERENCES emergency_responders(responder_id) ON DELETE CASCADE,
    CONSTRAINT fk_prescription_medication FOREIGN KEY (medication_id) REFERENCES emergency_medications(medication_id) ON DELETE CASCADE,
    CONSTRAINT fk_prescription_response FOREIGN KEY (response_id) REFERENCES emergency_responses(response_id) ON DELETE SET NULL
);

-- =====================================================
-- BLOOD_RESERVE (Blood Bank)
-- =====================================================

CREATE TABLE blood_reserve (
    reserve_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blood_type VARCHAR(5) NOT NULL CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component_type VARCHAR(50) CHECK (component_type IN ('Whole Blood', 'Packed RBC', 'Plasma', 'Platelets', 'Cryoprecipitate')),
    unit_id VARCHAR(50) UNIQUE NOT NULL,
    collection_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    donor_id VARCHAR(50),
    volume_ml INTEGER,
    reserve_status VARCHAR(20) DEFAULT 'Available' CHECK (reserve_status IN ('Available', 'Reserved', 'Used', 'Expired', 'Quarantine')),
    storage_temperature DECIMAL(4,1),
    cross_match_required BOOLEAN DEFAULT true,
    emergency_release BOOLEAN DEFAULT false,
    location VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- Create indexes for better performance
-- =====================================================

CREATE INDEX idx_responder_unit ON emergency_responders(unit_id);
CREATE INDEX idx_case_arrival ON trauma_cases(arrival_time);
CREATE INDEX idx_case_triage ON trauma_cases(triage_level);
CREATE INDEX idx_case_status ON trauma_cases(case_status);
CREATE INDEX idx_response_time ON emergency_responses(response_time);
CREATE INDEX idx_response_case ON emergency_responses(case_id);
CREATE INDEX idx_supply_medication ON medication_supply(medication_id);
CREATE INDEX idx_equipment_unit ON trauma_equipment(unit_id);
CREATE INDEX idx_record_case ON trauma_records(case_id);
CREATE INDEX idx_prescription_case ON emergency_prescriptions(case_id);
CREATE INDEX idx_blood_type ON blood_reserve(blood_type);
CREATE INDEX idx_blood_status ON blood_reserve(reserve_status);

-- =====================================================
-- INSERT INITIAL TRAUMA UNITS
-- =====================================================

INSERT INTO trauma_units (unit_code, unit_name, trauma_level, response_area, floor_number, emergency_capacity, bed_count, activation_date) VALUES
('TRU-001', 'Emergency Department - Level I Trauma', 'Level I', 'Main Emergency Bay', 1, 25, 40, '2005-01-01'),
('TRU-002', 'Critical Care Trauma Unit', 'Level I', 'Intensive Care', 2, 15, 20, '2006-03-15'),
('TRU-003', 'Surgical Trauma Response', 'Level I', 'Operating Suites', 3, 10, 0, '2005-06-01'),
('TRU-004', 'Pediatric Emergency Unit', 'Level II', 'Pediatric Wing', 2, 12, 18, '2008-09-20'),
('TRU-005', 'Flight Medicine Response', 'Level I', 'Helipad/Transport', 1, 8, 0, '2010-11-10'),
('TRU-006', 'Emergency Pharmacy Unit', 'Support', 'Central Pharmacy', 1, 0, 0, '2005-02-01'),
('TRU-007', 'Diagnostic Imaging Emergency', 'Support', 'Radiology Emergency', 0, 5, 0, '2007-04-15');