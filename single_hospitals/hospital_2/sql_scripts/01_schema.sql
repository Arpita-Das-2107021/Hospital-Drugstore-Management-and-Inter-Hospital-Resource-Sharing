-- =====================================================
-- HOSPITAL 2: HEALTHOPS - MySQL Schema
-- Operational/Business terminology
-- =====================================================

-- =====================================================
-- DIVISIONS (Departments)
-- =====================================================

CREATE TABLE divisions (
    division_id INT PRIMARY KEY AUTO_INCREMENT,
    division_code VARCHAR(20) UNIQUE NOT NULL,
    division_name VARCHAR(255) NOT NULL,
    division_type ENUM('Clinical', 'Emergency', 'Support', 'Administrative'),
    floor_number INT,
    wing VARCHAR(50),
    operating_budget DECIMAL(15,2),
    capacity_beds INT DEFAULT 0,
    head_personnel_id INT, -- References personnel
    established_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- PERSONNEL (Staff)
-- =====================================================

CREATE TABLE personnel (
    personnel_id INT PRIMARY KEY AUTO_INCREMENT,
    division_id INT,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    position_title VARCHAR(255) NOT NULL,
    employment_type ENUM('Full-time', 'Part-time', 'Contract', 'Temporary'),
    certification_level VARCHAR(255),
    license_id VARCHAR(100) UNIQUE,
    hourly_rate DECIMAL(10,2),
    shift_preference ENUM('Day', 'Night', 'Rotating', 'On-call'),
    contact_number VARCHAR(20),
    email_address VARCHAR(255) UNIQUE NOT NULL,
    start_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (division_id) REFERENCES divisions(division_id) ON DELETE SET NULL
);

-- Add foreign key after personnel table exists
ALTER TABLE divisions ADD CONSTRAINT fk_division_head 
    FOREIGN KEY (head_personnel_id) REFERENCES personnel(personnel_id) ON DELETE SET NULL;

-- =====================================================
-- CLIENTS (Patients)
-- =====================================================

CREATE TABLE clients (
    client_id INT PRIMARY KEY AUTO_INCREMENT,
    client_number VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    gender ENUM('Male', 'Female', 'Other'),
    blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
    phone_number VARCHAR(20),
    email_address VARCHAR(255),
    residential_address TEXT,
    city VARCHAR(100),
    state_province VARCHAR(50),
    postal_code VARCHAR(20),
    emergency_contact VARCHAR(255),
    emergency_phone VARCHAR(20),
    insurance_company VARCHAR(255),
    policy_number VARCHAR(100),
    known_allergies TEXT,
    medical_history TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- DRUG_CATALOG (Medications)
-- =====================================================

CREATE TABLE drug_catalog (
    drug_id INT PRIMARY KEY AUTO_INCREMENT,
    drug_name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    brand_name VARCHAR(255),
    strength VARCHAR(100),
    formulation VARCHAR(100),
    route_of_admin VARCHAR(100),
    category VARCHAR(255),
    manufacturer VARCHAR(255),
    ndc_code VARCHAR(50) UNIQUE,
    is_controlled_substance BOOLEAN DEFAULT FALSE,
    requires_prescription BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- DRUG_INVENTORY (Medication Inventory)
-- =====================================================

CREATE TABLE drug_inventory (
    inventory_id INT PRIMARY KEY AUTO_INCREMENT,
    drug_id INT NOT NULL,
    batch_code VARCHAR(100),
    units_in_stock INT NOT NULL DEFAULT 0,
    cost_per_unit DECIMAL(10,2),
    expiration_date DATE,
    manufacture_date DATE,
    supplier VARCHAR(255),
    minimum_threshold INT DEFAULT 10,
    maximum_capacity INT,
    storage_area VARCHAR(255),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_drug_batch (drug_id, batch_code),
    FOREIGN KEY (drug_id) REFERENCES drug_catalog(drug_id) ON DELETE CASCADE
);

-- =====================================================
-- EQUIPMENT_ASSETS (Medical Equipment)
-- =====================================================

CREATE TABLE equipment_assets (
    asset_id INT PRIMARY KEY AUTO_INCREMENT,
    division_id INT,
    asset_name VARCHAR(255) NOT NULL,
    asset_category ENUM('Diagnostic', 'Surgical', 'Monitoring', 'Therapeutic', 'Life Support', 'Imaging'),
    model_number VARCHAR(255),
    manufacturer VARCHAR(255),
    serial_number VARCHAR(100) UNIQUE,
    acquisition_date DATE,
    acquisition_cost DECIMAL(12,2),
    warranty_period DATE,
    last_serviced DATE,
    next_service_date DATE,
    operational_status ENUM('Operational', 'In Use', 'Under Maintenance', 'Out of Order', 'Decommissioned') DEFAULT 'Operational',
    location_details VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (division_id) REFERENCES divisions(division_id) ON DELETE SET NULL
);

-- =====================================================
-- SCHEDULED_APPOINTMENTS (Appointments)
-- =====================================================

CREATE TABLE scheduled_appointments (
    appointment_id INT PRIMARY KEY AUTO_INCREMENT,
    client_id INT NOT NULL,
    personnel_id INT NOT NULL,
    division_id INT,
    appointment_datetime TIMESTAMP NOT NULL,
    estimated_duration INT DEFAULT 30,
    appointment_type ENUM('Consultation', 'Follow-up', 'Emergency', 'Procedure', 'Check-up'),
    reason_for_visit TEXT,
    appointment_status ENUM('Scheduled', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'No Show') DEFAULT 'Scheduled',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id) ON DELETE CASCADE,
    FOREIGN KEY (division_id) REFERENCES divisions(division_id) ON DELETE SET NULL
);

-- =====================================================
-- PATIENT_FILES (Medical Records)
-- =====================================================

CREATE TABLE patient_files (
    file_id INT PRIMARY KEY AUTO_INCREMENT,
    client_id INT NOT NULL,
    personnel_id INT,
    appointment_id INT,
    file_type ENUM('Lab Report', 'Imaging', 'Consultation Notes', 'Procedure Report', 'Discharge Summary'),
    file_date DATE NOT NULL,
    file_title VARCHAR(255) NOT NULL,
    file_description TEXT,
    clinical_findings JSON,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id) ON DELETE SET NULL,
    FOREIGN KEY (appointment_id) REFERENCES scheduled_appointments(appointment_id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES personnel(personnel_id) ON DELETE SET NULL
);

-- =====================================================
-- PRESCRIPTIONS
-- =====================================================

CREATE TABLE prescriptions (
    prescription_id INT PRIMARY KEY AUTO_INCREMENT,
    client_id INT NOT NULL,
    personnel_id INT NOT NULL,
    drug_id INT NOT NULL,
    appointment_id INT,
    prescription_date DATE NOT NULL,
    dosage_instructions VARCHAR(255),
    frequency VARCHAR(100),
    treatment_duration INT,
    quantity_prescribed INT,
    refills_permitted INT DEFAULT 0,
    refills_claimed INT DEFAULT 0,
    prescription_status ENUM('Active', 'Fulfilled', 'Cancelled', 'Expired') DEFAULT 'Active',
    special_instructions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE,
    FOREIGN KEY (personnel_id) REFERENCES personnel(personnel_id) ON DELETE CASCADE,
    FOREIGN KEY (drug_id) REFERENCES drug_catalog(drug_id) ON DELETE CASCADE,
    FOREIGN KEY (appointment_id) REFERENCES scheduled_appointments(appointment_id) ON DELETE SET NULL
);

-- =====================================================
-- BLOOD_INVENTORY (Blood Bank)
-- =====================================================

CREATE TABLE blood_inventory (
    inventory_id INT PRIMARY KEY AUTO_INCREMENT,
    blood_type ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
    blood_component ENUM('Whole Blood', 'Packed RBC', 'Plasma', 'Platelets', 'Cryoprecipitate') NOT NULL,
    units_available INT NOT NULL DEFAULT 0,
    collection_date DATE,
    expiration_date DATE,
    donor_reference VARCHAR(100),
    screening_status ENUM('Pending', 'Cleared', 'Rejected') DEFAULT 'Pending',
    storage_location VARCHAR(100),
    units_reserved INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- INSERT INITIAL DIVISIONS
-- =====================================================

INSERT INTO divisions (division_code, division_name, division_type, floor_number, wing, operating_budget, capacity_beds, established_date) VALUES
('CARD-01', 'Cardiovascular Division', 'Clinical', 3, 'East', 2500000.00, 40, '2010-01-15'),
('EMER-01', 'Emergency Services', 'Emergency', 1, 'Main', 3500000.00, 25, '2005-06-01'),
('SURG-01', 'Surgical Division', 'Clinical', 4, 'West', 4000000.00, 35, '2008-03-20'),
('PEDIA-01', 'Pediatric Division', 'Clinical', 2, 'South', 1800000.00, 30, '2012-09-10'),
('ADMIN-01', 'Administrative Services', 'Administrative', 5, 'North', 800000.00, 0, '2005-01-01'),
('RADIO-01', 'Radiology and Imaging', 'Support', 1, 'West', 2200000.00, 0, '2007-11-15'),
('LAB-01', 'Laboratory Services', 'Support', 2, 'East', 1500000.00, 0, '2006-04-22');
