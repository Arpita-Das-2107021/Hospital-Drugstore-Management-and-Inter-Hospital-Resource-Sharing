-- =====================================================
-- HOSPITAL 1: CARECENTRAL - PostgreSQL Schema
-- Medical-focused terminology
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CARE UNITS (Departments)
-- =====================================================

CREATE TABLE care_units (
    unit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_name VARCHAR(255) NOT NULL,
    unit_code VARCHAR(10) UNIQUE NOT NULL,
    unit_type VARCHAR(20) CHECK (unit_type IN ('clinical', 'support', 'administrative')),
    floor_location VARCHAR(100),
    bed_capacity INTEGER DEFAULT 0,
    unit_head_id UUID, -- References caregivers
    is_emergency_unit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CAREGIVERS (Staff)
-- =====================================================

CREATE TABLE caregivers (
    caregiver_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID REFERENCES care_units(unit_id) ON DELETE SET NULL,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('Doctor', 'Nurse', 'Specialist', 'Technician', 'Pharmacist', 'Administrator')),
    specialization VARCHAR(255),
    license_number VARCHAR(100) UNIQUE,
    contact_phone VARCHAR(20),
    contact_email VARCHAR(255) UNIQUE NOT NULL,
    years_experience INTEGER,
    hire_date DATE,
    consultation_fee DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key after caregivers table exists
ALTER TABLE care_units ADD CONSTRAINT fk_unit_head 
    FOREIGN KEY (unit_head_id) REFERENCES caregivers(caregiver_id) ON DELETE SET NULL;

-- =====================================================
-- PATIENTS
-- =====================================================

CREATE TABLE patients (
    patient_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_number VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
    blood_type VARCHAR(5) CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(255),
    address_line1 TEXT,
    address_city VARCHAR(100),
    address_state VARCHAR(50),
    address_zip VARCHAR(20),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    insurance_provider VARCHAR(255),
    insurance_policy_number VARCHAR(100),
    allergies TEXT,
    chronic_conditions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PHARMACEUTICALS (Medications)
-- =====================================================

CREATE TABLE pharmaceuticals (
    pharmaceutical_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drug_name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    brand_name VARCHAR(255),
    strength VARCHAR(100),
    dosage_form VARCHAR(100),
    administration_route VARCHAR(100),
    therapeutic_class VARCHAR(255),
    manufacturer VARCHAR(255),
    ndc_code VARCHAR(50) UNIQUE,
    is_controlled BOOLEAN DEFAULT FALSE,
    requires_prescription BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PHARMACY STOCK (Medication Inventory)
-- =====================================================

CREATE TABLE pharmacy_stock (
    stock_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pharmaceutical_id UUID NOT NULL REFERENCES pharmaceuticals(pharmaceutical_id) ON DELETE CASCADE,
    batch_number VARCHAR(100),
    quantity_available INTEGER NOT NULL DEFAULT 0,
    unit_price DECIMAL(10,2),
    expiry_date DATE,
    manufactured_date DATE,
    supplier_name VARCHAR(255),
    reorder_level INTEGER DEFAULT 10,
    max_stock_level INTEGER,
    storage_location VARCHAR(255),
    last_restocked TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pharmaceutical_id, batch_number)
);

-- =====================================================
-- CLINICAL EQUIPMENT (Medical Equipment)
-- =====================================================

CREATE TABLE clinical_equipment (
    equipment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID REFERENCES care_units(unit_id) ON DELETE SET NULL,
    equipment_name VARCHAR(255) NOT NULL,
    equipment_type VARCHAR(50) CHECK (equipment_type IN ('diagnostic', 'surgical', 'monitoring', 'therapeutic', 'life_support', 'imaging')),
    model_name VARCHAR(255),
    manufacturer VARCHAR(255),
    serial_number VARCHAR(100) UNIQUE,
    purchase_date DATE,
    purchase_cost DECIMAL(12,2),
    warranty_expires DATE,
    last_service_date DATE,
    next_service_date DATE,
    current_status VARCHAR(20) DEFAULT 'available' CHECK (current_status IN ('available', 'in_use', 'maintenance', 'repair', 'retired')),
    location_details VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- VISITS (Appointments)
-- =====================================================

CREATE TABLE visits (
    visit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    caregiver_id UUID NOT NULL REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
    unit_id UUID REFERENCES care_units(unit_id) ON DELETE SET NULL,
    visit_date TIMESTAMP NOT NULL,
    visit_type VARCHAR(50) CHECK (visit_type IN ('Checkup', 'Follow-up', 'Emergency', 'Consultation', 'Procedure')),
    chief_complaint TEXT,
    vital_signs JSONB,
    notes TEXT,
    duration_minutes INTEGER DEFAULT 30,
    status VARCHAR(20) DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'In Progress', 'Completed', 'Cancelled', 'No Show')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- DIAGNOSES
-- =====================================================

CREATE TABLE diagnoses (
    diagnosis_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID NOT NULL REFERENCES visits(visit_id) ON DELETE CASCADE,
    diagnosis_code VARCHAR(20),
    diagnosis_name VARCHAR(255) NOT NULL,
    diagnosis_description TEXT,
    severity VARCHAR(20) CHECK (severity IN ('Mild', 'Moderate', 'Severe', 'Critical')),
    diagnosed_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- MEDICAL RECORDS
-- =====================================================

CREATE TABLE medical_records (
    record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    visit_id UUID REFERENCES visits(visit_id) ON DELETE SET NULL,
    caregiver_id UUID REFERENCES caregivers(caregiver_id) ON DELETE SET NULL,
    record_type VARCHAR(50) CHECK (record_type IN ('Lab Result', 'Imaging', 'Consultation Note', 'Procedure Note', 'Discharge Summary')),
    record_date DATE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    test_results JSONB,
    uploaded_by UUID REFERENCES caregivers(caregiver_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TREATMENTS (Prescriptions)
-- =====================================================

CREATE TABLE treatments (
    treatment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID NOT NULL REFERENCES visits(visit_id) ON DELETE CASCADE,
    diagnosis_id UUID REFERENCES diagnoses(diagnosis_id) ON DELETE SET NULL,
    pharmaceutical_id UUID REFERENCES pharmaceuticals(pharmaceutical_id) ON DELETE SET NULL,
    treatment_type VARCHAR(50) CHECK (treatment_type IN ('Medication', 'Therapy', 'Surgery', 'Procedure', 'Lifestyle')),
    treatment_name VARCHAR(255) NOT NULL,
    instructions TEXT,
    dosage VARCHAR(100),
    frequency VARCHAR(100),
    duration_days INTEGER,
    start_date DATE,
    end_date DATE,
    cost DECIMAL(10,2),
    prescribed_by UUID NOT NULL REFERENCES caregivers(caregiver_id),
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Completed', 'Discontinued')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INSERT INITIAL CARE UNITS
-- =====================================================

INSERT INTO care_units (unit_name, unit_code, unit_type, floor_location, bed_capacity) VALUES
('Cardiology Unit', 'CARD', 'clinical', 'Floor 2', 30),
('Emergency Care', 'EMERG', 'clinical', 'Ground Floor', 20),
('Pediatrics Unit', 'PED', 'clinical', 'Floor 3', 25),
('Orthopedics Unit', 'ORTHO', 'clinical', 'Floor 4', 28),
('Neurology Unit', 'NEURO', 'clinical', 'Floor 5', 22),
('Radiology Services', 'RAD', 'support', 'Basement', 0),
('Pharmacy Services', 'PHARM', 'support', 'Ground Floor', 0),
('General Care', 'GEN', 'clinical', 'Floor 1', 35);
