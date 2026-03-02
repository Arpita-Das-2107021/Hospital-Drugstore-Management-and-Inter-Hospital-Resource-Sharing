-- =====================================================
-- HOSPITAL 3: APPOINTCARE - MariaDB Schema
-- Appointment/Booking terminology
-- =====================================================

-- =====================================================
-- FACILITIES (Departments)
-- =====================================================

CREATE TABLE facilities (
    facility_id INT PRIMARY KEY AUTO_INCREMENT,
    facility_code VARCHAR(20) UNIQUE NOT NULL,
    facility_name VARCHAR(255) NOT NULL,
    facility_category ENUM('Consultation Room', 'Specialist Room', 'Treatment Room', 'Examination Room', 'Therapy Room', 'Support Area'),
    building_name VARCHAR(100),
    floor_level VARCHAR(20),
    room_identifier VARCHAR(50),
    capacity_persons INT DEFAULT 0,
    facility_head_id INT, -- References practitioners
    has_equipment BOOLEAN DEFAULT FALSE,
    accessibility_features TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- PRACTITIONERS (Staff)
-- =====================================================

CREATE TABLE practitioners (
    practitioner_id INT PRIMARY KEY AUTO_INCREMENT,
    facility_id INT,
    practitioner_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    professional_title VARCHAR(255),
    specialty_area VARCHAR(255),
    qualification_details TEXT,
    license_certificate VARCHAR(100) UNIQUE,
    phone_number VARCHAR(20),
    email_address VARCHAR(255) UNIQUE NOT NULL,
    consultation_rate DECIMAL(10,2),
    rating_average DECIMAL(3,2) DEFAULT 0.00,
    total_reviews INT DEFAULT 0,
    years_of_practice INT,
    accepts_new_clients BOOLEAN DEFAULT TRUE,
    hired_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE SET NULL
);

-- Add foreign key after practitioners table exists
ALTER TABLE facilities ADD CONSTRAINT fk_facility_head 
    FOREIGN KEY (facility_head_id) REFERENCES practitioners(practitioner_id) ON DELETE SET NULL;

-- =====================================================
-- CLIENTS (Patients)
-- =====================================================

CREATE TABLE clients (
    client_id INT PRIMARY KEY AUTO_INCREMENT,
    client_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    mobile_number VARCHAR(20),
    email_contact VARCHAR(255),
    birth_date DATE,
    gender_identity ENUM('Male', 'Female', 'Other'),
    blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
    preferred_language VARCHAR(50) DEFAULT 'English',
    notification_preference ENUM('Email', 'SMS', 'Phone', 'Mail'),
    membership_level ENUM('Standard', 'Premium', 'VIP'),
    home_address TEXT,
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    insurance_details VARCHAR(255),
    allergy_information TEXT,
    medical_conditions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- MEDICATION_CATALOG (Medications)  
-- =====================================================

CREATE TABLE medication_catalog (
    medication_id INT PRIMARY KEY AUTO_INCREMENT,
    medication_name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    brand_name VARCHAR(255),
    dose_strength VARCHAR(100),
    form_type VARCHAR(100),
    administration_method VARCHAR(100),
    therapeutic_category VARCHAR(255),
    manufacturer_name VARCHAR(255),
    product_code VARCHAR(50) UNIQUE,
    controlled_status BOOLEAN DEFAULT FALSE,
    prescription_required BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- MEDICATION_STOCK (Medication Inventory)
-- =====================================================

CREATE TABLE medication_stock (
    stock_id INT PRIMARY KEY AUTO_INCREMENT,
    medication_id INT NOT NULL,
    batch_identifier VARCHAR(100),
    current_quantity INT NOT NULL DEFAULT 0,
    price_per_unit DECIMAL(10,2),
    expiry_date DATE,
    production_date DATE,
    supplier_company VARCHAR(255),
    low_stock_alert INT DEFAULT 15,
    max_stock_limit INT,
    shelf_location VARCHAR(255),
    stock_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_med_batch (medication_id, batch_identifier),
    FOREIGN KEY (medication_id) REFERENCES medication_catalog(medication_id) ON DELETE CASCADE
);

-- =====================================================
-- MEDICAL_DEVICES (Medical Equipment)
-- =====================================================

CREATE TABLE medical_devices (
    device_id INT PRIMARY KEY AUTO_INCREMENT,
    facility_id INT,
    device_name VARCHAR(255) NOT NULL,
    device_category ENUM('Diagnostic', 'Surgical', 'Monitoring', 'Therapeutic', 'Life Support', 'Imaging'),
    model_info VARCHAR(255),
    manufacturer VARCHAR(255),
    device_serial VARCHAR(100) UNIQUE,
    purchase_date DATE,
    purchase_price DECIMAL(12,2),
    warranty_until DATE,
    last_maintenance DATE,
    next_maintenance_due DATE,
    device_status ENUM('Available', 'In Use', 'Under Repair', 'Out of Service', 'Retired') DEFAULT 'Available',
    location_info VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE SET NULL
);

-- =====================================================
-- BOOKINGS (Appointments)
-- =====================================================

CREATE TABLE bookings (
    booking_id INT PRIMARY KEY AUTO_INCREMENT,
    booking_reference VARCHAR(50) UNIQUE NOT NULL,
    client_id INT NOT NULL,
    practitioner_id INT NOT NULL,
    facility_id INT,
    appointment_datetime TIMESTAMP NOT NULL,
    duration_minutes INT DEFAULT 30,
    booking_type ENUM('Consultation', 'Follow-up', 'Emergency', 'Screening', 'Treatment'),
    appointment_reason TEXT,
    booking_status ENUM('Confirmed', 'Pending', 'In Progress', 'Completed', 'Cancelled', 'No Show') DEFAULT 'Pending',
    booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP NULL,
    payment_status ENUM('Pending', 'Paid', 'Refunded') DEFAULT 'Pending',
    payment_amount DECIMAL(10,2),
    attended BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE,
    FOREIGN KEY (practitioner_id) REFERENCES practitioners(practitioner_id) ON DELETE CASCADE,
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE SET NULL 
);

-- =====================================================
-- CLIENT_RECORDS (Medical Records)
-- =====================================================

CREATE TABLE client_records (
    record_id INT PRIMARY KEY AUTO_INCREMENT,
    client_id INT NOT NULL,
    booking_id INT,
    practitioner_id INT,
    record_category ENUM('Lab Results', 'Imaging', 'Consultation Notes', 'Treatment Plan', 'Discharge Summary'),
    record_date DATE NOT NULL,
    record_title VARCHAR(255) NOT NULL,
    record_content TEXT,
    test_findings JSON,
    file_attachments TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL,
    FOREIGN KEY (practitioner_id) REFERENCES practitioners(practitioner_id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES practitioners(practitioner_id) ON DELETE SET NULL
);

-- =====================================================
-- MEDICATION_ORDERS (Prescriptions)
-- =====================================================

CREATE TABLE medication_orders (
    order_id INT PRIMARY KEY AUTO_INCREMENT,
    client_id INT NOT NULL,
    practitioner_id INT NOT NULL,
    medication_id INT NOT NULL,
    booking_id INT,
    order_date DATE NOT NULL,
    dosage_amount VARCHAR(255),
    frequency_schedule VARCHAR(100),
    treatment_days INT,
    quantity_ordered INT,
    refills_authorized INT DEFAULT 0,
    refills_dispensed INT DEFAULT 0,
    order_status ENUM('Active', 'Completed', 'Cancelled', 'Expired') DEFAULT 'Active',
    special_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE,
    FOREIGN KEY (practitioner_id) REFERENCES practitioners(practitioner_id) ON DELETE CASCADE,
    FOREIGN KEY (medication_id) REFERENCES medication_catalog(medication_id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL
);

-- =====================================================
-- BLOOD_STORAGE (Blood Bank)  
-- =====================================================

CREATE TABLE blood_storage (
    storage_id INT PRIMARY KEY AUTO_INCREMENT,
    blood_type ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
    blood_component ENUM('Whole Blood', 'Red Cells', 'Plasma', 'Platelets', 'Cryoprecipitate') NOT NULL,
    units_in_storage INT NOT NULL DEFAULT 0,
    collection_date DATE,
    expiry_date DATE,
    donor_code VARCHAR(100),
    testing_status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    storage_compartment VARCHAR(100),
    reserved_units INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- INSERT INITIAL FACILITIES
-- =====================================================

INSERT INTO facilities (facility_code, facility_name, facility_category, building_name, floor_level, room_identifier, capacity_persons, has_equipment, accessibility_features) VALUES
('FAC-101', 'General Consultation Room A', 'Consultation Room', 'Main Building', '2nd Floor', 'Room 201', 3, TRUE, 'Wheelchair accessible'),
('FAC-102', 'Specialist Cardiology Suite', 'Specialist Room', 'Medical Tower', '3rd Floor', 'Suite 301', 4, TRUE, 'Wheelchair accessible, ECG equipment'),
('FAC-103', 'Emergency Treatment Room', 'Treatment Room', 'Emergency Wing', '1st Floor', 'ER-101', 5, TRUE, 'Full emergency equipment'),
('FAC-104', 'Pediatric Consultation Room', 'Consultation Room', 'Family Center', '1st Floor', 'Room 105', 4, TRUE, 'Child-friendly environment'),
('FAC-105', 'Diagnostic Imaging Suite', 'Support Area', 'Diagnostic Center', 'Basement', 'Imaging-B01', 2, TRUE, 'Lead-lined walls'),
('FAC-106', 'Physical Therapy Room', 'Therapy Room', 'Rehabilitation Wing', '2nd Floor', 'PT-201', 6, TRUE, 'Exercise equipment'),
('FAC-107', 'Pharmacy Consultation Area', 'Support Area', 'Main Building', '1st Floor', 'Pharmacy', 2, FALSE, 'Private consultation area');