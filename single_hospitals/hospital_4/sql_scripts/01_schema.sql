-- =====================================================
-- HOSPITAL 4: CENTRAL BILLING - SQL Server Schema
-- Financial/Billing terminology
-- =====================================================

-- =====================================================
-- SERVICE_CENTERS (Departments)
-- =====================================================

CREATE TABLE service_centers (
    center_id INT IDENTITY(1,1) PRIMARY KEY,
    center_code NVARCHAR(20) UNIQUE NOT NULL,
    center_name NVARCHAR(255) NOT NULL,
    service_type NVARCHAR(20) CHECK (service_type IN ('Clinical', 'Diagnostic', 'Support', 'Administrative')),
    location_floor INT,
    operating_area NVARCHAR(50),
    annual_budget DECIMAL(15,2),
    bed_count INT DEFAULT 0,
    manager_id INT, -- References staff_members
    established_date DATE,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
GO

-- =====================================================
-- STAFF_MEMBERS (Staff)
-- =====================================================

CREATE TABLE staff_members (
    staff_id INT IDENTITY(1,1) PRIMARY KEY,
    center_id INT,
    employee_number NVARCHAR(50) UNIQUE NOT NULL,
    first_name NVARCHAR(100) NOT NULL,
    last_name NVARCHAR(100) NOT NULL,
    job_title NVARCHAR(255) NOT NULL,
    employment_status NVARCHAR(20) CHECK (employment_status IN ('Active', 'Inactive', 'Contract', 'Temporary')),
    certification NVARCHAR(255),
    license_number NVARCHAR(100) UNIQUE,
    hourly_wage DECIMAL(10,2),
    work_schedule NVARCHAR(20) CHECK (work_schedule IN ('Day', 'Night', 'Rotating', 'Flexible')),
    phone_number NVARCHAR(20),
    email_address NVARCHAR(255) UNIQUE NOT NULL,
    hire_date DATE,
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (center_id) REFERENCES service_centers(center_id) ON DELETE SET NULL
);
GO

-- Add foreign key after staff_members table exists
ALTER TABLE service_centers ADD CONSTRAINT fk_center_manager 
    FOREIGN KEY (manager_id) REFERENCES staff_members(staff_id) ON DELETE SET NULL;
GO

-- =====================================================
-- ACCOUNT_HOLDERS (Patients)
-- =====================================================

CREATE TABLE account_holders (
    account_id INT IDENTITY(1,1) PRIMARY KEY,
    account_number NVARCHAR(50) UNIQUE NOT NULL,
    full_name NVARCHAR(255) NOT NULL,
    birth_date DATE,
    gender NVARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
    blood_type NVARCHAR(5) CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    contact_phone NVARCHAR(20),
    email_address NVARCHAR(255),
    billing_address NVARCHAR(MAX),
    city NVARCHAR(100),
    state_code NVARCHAR(50),
    zip_code NVARCHAR(20),
    emergency_contact NVARCHAR(255),
    emergency_phone NVARCHAR(20),
    insurance_provider NVARCHAR(255),
    policy_number NVARCHAR(100),
    allergies NVARCHAR(MAX),
    medical_notes NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
GO

-- =====================================================
-- PHARMACEUTICAL_PRODUCTS (Medications)
-- =====================================================

CREATE TABLE pharmaceutical_products (
    product_id INT IDENTITY(1,1) PRIMARY KEY,
    product_name NVARCHAR(255) NOT NULL,
    generic_name NVARCHAR(255),
    brand_name NVARCHAR(255),
    strength NVARCHAR(100),
    dosage_form NVARCHAR(100),
    route NVARCHAR(100),
    therapeutic_class NVARCHAR(255),
    manufacturer NVARCHAR(255),
    ndc_number NVARCHAR(50) UNIQUE,
    controlled_substance BIT DEFAULT 0,
    prescription_required BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
GO

-- =====================================================
-- PHARMACY_INVENTORY (Medication Inventory)
-- =====================================================

CREATE TABLE pharmacy_inventory (
    inventory_id INT IDENTITY(1,1) PRIMARY KEY,
    product_id INT NOT NULL,
    batch_number NVARCHAR(100),
    quantity_on_hand INT NOT NULL DEFAULT 0,
    unit_cost DECIMAL(10,2),
    expiration_date DATE,
    manufacture_date DATE,
    supplier NVARCHAR(255),
    reorder_point INT DEFAULT 10,
    max_quantity INT,
    storage_location NVARCHAR(255),
    last_updated DATETIME2 DEFAULT GETDATE(),
    created_at DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT unique_product_batch UNIQUE (product_id, batch_number),
    FOREIGN KEY (product_id) REFERENCES pharmaceutical_products(product_id) ON DELETE CASCADE
);
GO

-- =====================================================
-- MEDICAL_ASSETS (Medical Equipment)
-- =====================================================

CREATE TABLE medical_assets (
    asset_id INT IDENTITY(1,1) PRIMARY KEY,
    center_id INT,
    asset_name NVARCHAR(255) NOT NULL,
    asset_type NVARCHAR(50) CHECK (asset_type IN ('Diagnostic', 'Surgical', 'Monitoring', 'Therapeutic', 'Life Support', 'Imaging')),
    model NVARCHAR(255),
    manufacturer NVARCHAR(255),
    serial_number NVARCHAR(100) UNIQUE,
    purchase_date DATE,
    purchase_cost DECIMAL(12,2),
    warranty_expiry DATE,
    last_maintenance DATE,
    next_maintenance DATE,
    status NVARCHAR(20) DEFAULT 'Available' CHECK (status IN ('Available', 'In Use', 'Maintenance', 'Repair', 'Retired')),
    location NVARCHAR(255),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (center_id) REFERENCES service_centers(center_id) ON DELETE SET NULL
);
GO

-- =====================================================
-- SERVICE_APPOINTMENTS (Appointments)
-- =====================================================

CREATE TABLE service_appointments (
    appointment_id INT IDENTITY(1,1) PRIMARY KEY,
    account_id INT NOT NULL,
    staff_id INT NOT NULL,
    center_id INT,
    appointment_datetime DATETIME2 NOT NULL,
    duration_minutes INT DEFAULT 30,
    service_type NVARCHAR(50) CHECK (service_type IN ('Consultation', 'Follow-up', 'Emergency', 'Procedure', 'Examination')),
    reason NVARCHAR(MAX),
    status NVARCHAR(20) DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'No Show')),
    notes NVARCHAR(MAX),
    billable_amount DECIMAL(10,2),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (account_id) REFERENCES account_holders(account_id) ON DELETE CASCADE,
    FOREIGN KEY (staff_id) REFERENCES staff_members(staff_id) ON DELETE CASCADE,
    FOREIGN KEY (center_id) REFERENCES service_centers(center_id) ON DELETE SET NULL
);
GO

-- =====================================================
-- CLINICAL_DOCUMENTATION (Medical Records)
-- =====================================================

CREATE TABLE clinical_documentation (
    document_id INT IDENTITY(1,1) PRIMARY KEY,
    account_id INT NOT NULL,
    appointment_id INT,
    staff_id INT,
    document_type NVARCHAR(50) CHECK (document_type IN ('Lab Report', 'Imaging', 'Progress Note', 'Procedure Note', 'Discharge Summary')),
    document_date DATE NOT NULL,
    document_title NVARCHAR(255) NOT NULL,
    document_content NVARCHAR(MAX),
    clinical_findings NVARCHAR(MAX),
    created_by INT,
    created_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (account_id) REFERENCES account_holders(account_id) ON DELETE CASCADE,
    FOREIGN KEY (appointment_id) REFERENCES service_appointments(appointment_id) ON DELETE SET NULL,
    FOREIGN KEY (staff_id) REFERENCES staff_members(staff_id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES staff_members(staff_id)
);
GO

-- =====================================================
-- MEDICATION_PRESCRIPTIONS (Prescriptions)
-- =====================================================

CREATE TABLE medication_prescriptions (
    prescription_id INT IDENTITY(1,1) PRIMARY KEY,
    account_id INT NOT NULL,
    staff_id INT NOT NULL,
    product_id INT NOT NULL,
    appointment_id INT,
    prescription_date DATE NOT NULL,
    dosage NVARCHAR(255),
    frequency NVARCHAR(100),
    duration_days INT,
    quantity_prescribed INT,
    refills_allowed INT DEFAULT 0,
    refills_used INT DEFAULT 0,
    status NVARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Completed', 'Cancelled', 'Expired')),
    instructions NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (account_id) REFERENCES account_holders(account_id) ON DELETE CASCADE,
    FOREIGN KEY (staff_id) REFERENCES staff_members(staff_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES pharmaceutical_products(product_id) ON DELETE CASCADE,
    FOREIGN KEY (appointment_id) REFERENCES service_appointments(appointment_id) ON DELETE SET NULL
);
GO

-- =====================================================
-- INSERT INITIAL SERVICE CENTERS
-- =====================================================

INSERT INTO service_centers (center_code, center_name, service_type, location_floor, operating_area, annual_budget, bed_count, established_date) VALUES
('BILL-001', 'Billing and Financial Services', 'Administrative', 1, 'Main', 1000000.00, 0, '2005-01-01'),
('CARD-001', 'Cardiology Services', 'Clinical', 2, 'East Wing', 2800000.00, 35, '2008-03-15'),
('EMER-001', 'Emergency Revenue Center', 'Clinical', 1, 'West Wing', 4200000.00, 20, '2005-06-01'),
('SURG-001', 'Surgical Revenue Center', 'Clinical', 3, 'North Wing', 5500000.00, 30, '2007-11-20'),
('DIAG-001', 'Diagnostic Imaging Center', 'Diagnostic', 0, 'Basement', 3200000.00, 0, '2006-09-10'),
('PHAR-001', 'Pharmacy Revenue Center', 'Support', 1, 'Central', 1800000.00, 0, '2005-03-01'),
('PEDI-001', 'Pediatric Services', 'Clinical', 2, 'South Wing', 2200000.00, 25, '2010-05-15');
GO