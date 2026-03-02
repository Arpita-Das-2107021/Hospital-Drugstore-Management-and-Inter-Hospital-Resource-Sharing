-- =====================================================
-- SINGLE HOSPITAL DATABASE SCHEMA - ST. MARY'S MEDICAL CENTER
-- =====================================================
-- This schema is for St. Mary's Medical Center specializing in Cardiothoracic Surgery

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- HOSPITAL INFORMATION (Static for this database)
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'hospital_info') THEN
        CREATE TABLE hospital_info (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(255) NOT NULL DEFAULT 'St. Mary''s Medical Center',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO hospital_info (name) VALUES ('St. Mary''s Medical Center');
    END IF;
END
$$;

-- Function to get hospital ID
CREATE OR REPLACE FUNCTION get_hospital_id() RETURNS UUID AS $$
BEGIN
    RETURN (SELECT id FROM hospital_info LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- DEPARTMENTS TABLE
-- =====================================================

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_id UUID NOT NULL DEFAULT get_hospital_id(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('clinical', 'support', 'administrative')),
    head_doctor_id UUID, -- Will reference staff(id)
    location VARCHAR(255),
    capacity INTEGER DEFAULT 0,
    is_emergency BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- STAFF TABLE
-- =====================================================

CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_id UUID NOT NULL DEFAULT get_hospital_id(),
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) CHECK (role IN ('doctor', 'nurse', 'pharmacist', 'technician', 'admin', 'support')),
    specialization VARCHAR(255),
    license_number VARCHAR(100),
    hire_date DATE,
    shift_pattern VARCHAR(20) CHECK (shift_pattern IN ('day', 'night', 'rotating', 'on_call')),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint after staff table is created
ALTER TABLE departments ADD CONSTRAINT fk_departments_head_doctor 
    FOREIGN KEY (head_doctor_id) REFERENCES staff(id) ON DELETE SET NULL;

-- =====================================================
-- PATIENTS TABLE
-- =====================================================

CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_id UUID NOT NULL DEFAULT get_hospital_id(),
    patient_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
    blood_type VARCHAR(5) CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    insurance_number VARCHAR(100),
    allergies TEXT,
    chronic_conditions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- MEDICATION TABLES
-- =====================================================

-- Medications master table
CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    brand_name VARCHAR(255),
    strength VARCHAR(100),
    dosage_form VARCHAR(100),
    route VARCHAR(100),
    therapeutic_class VARCHAR(255),
    manufacturer VARCHAR(255),
    ndc_number VARCHAR(50) UNIQUE,
    controlled_substance BOOLEAN DEFAULT FALSE,
    requires_prescription BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Medication inventory for this hospital
CREATE TABLE medication_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_id UUID NOT NULL DEFAULT get_hospital_id(),
    medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    batch_number VARCHAR(100),
    quantity_in_stock INTEGER NOT NULL DEFAULT 0,
    unit_cost DECIMAL(10,2),
    expiry_date DATE,
    manufacturer_date DATE,
    supplier VARCHAR(255),
    minimum_stock_level INTEGER DEFAULT 0,
    maximum_stock_level INTEGER,
    reorder_point INTEGER,
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hospital_id, medication_id, batch_number)
);

-- =====================================================
-- MEDICAL EQUIPMENT TABLE
-- =====================================================

CREATE TABLE medical_equipment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_id UUID NOT NULL DEFAULT get_hospital_id(),
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    model VARCHAR(255),
    manufacturer VARCHAR(255),
    serial_number VARCHAR(100) UNIQUE,
    category VARCHAR(20) CHECK (category IN ('diagnostic', 'surgical', 'monitoring', 'therapeutic', 'life_support')),
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'out_of_order', 'retired')),
    purchase_date DATE,
    warranty_expiry DATE,
    last_maintenance DATE,
    next_maintenance DATE,
    location VARCHAR(255),
    value DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- BLOOD BANK TABLE
-- =====================================================

CREATE TABLE blood_bank (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_id UUID NOT NULL DEFAULT get_hospital_id(),
    blood_type VARCHAR(5) NOT NULL CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component VARCHAR(20) NOT NULL CHECK (component IN ('whole_blood', 'packed_rbc', 'plasma', 'platelets', 'cryoprecipitate')),
    units_available INTEGER NOT NULL DEFAULT 0,
    collection_date DATE,
    expiry_date DATE,
    donor_id VARCHAR(100),
    screening_status VARCHAR(20) DEFAULT 'pending' CHECK (screening_status IN ('pending', 'cleared', 'rejected')),
    storage_location VARCHAR(100),
    reserved_units INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ORGAN REGISTRY TABLE
-- =====================================================

CREATE TABLE organ_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_id UUID NOT NULL DEFAULT get_hospital_id(),
    organ_type VARCHAR(20) NOT NULL CHECK (organ_type IN ('kidney', 'liver', 'heart', 'lung', 'pancreas', 'cornea', 'bone', 'tissue')),
    donor_id VARCHAR(100),
    recipient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    blood_type VARCHAR(5) CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    hla_typing TEXT,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'transplanted', 'expired')),
    viability_hours INTEGER,
    harvest_datetime TIMESTAMP,
    expiry_datetime TIMESTAMP,
    priority_score INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- APPOINTMENTS AND MEDICAL RECORDS
-- =====================================================

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_id UUID NOT NULL DEFAULT get_hospital_id(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    appointment_datetime TIMESTAMP NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    type VARCHAR(20) CHECK (type IN ('consultation', 'follow_up', 'procedure', 'surgery', 'emergency')),
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
    reason TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE medical_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    visit_date DATE NOT NULL,
    chief_complaint TEXT,
    diagnosis TEXT,
    treatment_plan TEXT,
    vital_signs JSONB,
    lab_results JSONB,
    imaging_results JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    prescription_date DATE NOT NULL,
    dosage VARCHAR(255),
    frequency VARCHAR(255),
    duration_days INTEGER,
    quantity_prescribed INTEGER,
    refills_allowed INTEGER DEFAULT 0,
    refills_used INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INSERT BASIC DEPARTMENTS FOR THIS HOSPITAL
-- =====================================================

INSERT INTO departments (name, code, type, location, capacity) VALUES
('Cardiothoracic Surgery', 'CTS', 'clinical', '5th Floor', 20),
('Cardiology', 'CARD', 'clinical', '4th Floor', 35),
('Cardiac Catheterization', 'CATH', 'clinical', '3rd Floor', 15),
('Cardiovascular ICU', 'CVICU', 'clinical', '6th Floor', 25),
('Emergency Department', 'ED', 'clinical', 'Ground Floor', 40),
('Anesthesiology', 'ANES', 'clinical', 'OR Level', 10),
('Pharmacy', 'PHARM', 'support', '2nd Floor', 8),
('Perfusion', 'PERF', 'support', 'OR Level', 5);