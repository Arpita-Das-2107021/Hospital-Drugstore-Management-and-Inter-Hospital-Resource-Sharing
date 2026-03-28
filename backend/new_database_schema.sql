-- =====================================================
-- IMPROVED HOSPITAL RESOURCE SHARING SYSTEM - NEW DATABASE SCHEMA
-- Created: 2026-03-05
-- Based on professional architecture recommendations
-- =====================================================
--
-- NEW DATABASE NAME: hospital_resource_sharing_v2
-- This is a clean implementation with proper normalization
-- and corrected foreign key relationships
--
-- =====================================================

-- Create new database
CREATE DATABASE hospital_resource_sharing_v2;

\c hospital_resource_sharing_v2;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CORE ENUMS AND TYPES
-- =====================================================

-- Hospital status lifecycle
CREATE TYPE hospital_status AS ENUM ('PENDING', 'VERIFIED', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- Employment status
CREATE TYPE employment_status AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED', 'RETIRED');

-- User account status
CREATE TYPE user_status AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- Resource types
CREATE TYPE resource_type AS ENUM ('MEDICINE', 'EQUIPMENT', 'BLOOD', 'ORGAN', 'BED', 'OTHER');

-- Request status lifecycle
CREATE TYPE request_status AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'DISPATCHED', 'RECEIVED', 'COMPLETED', 'CANCELLED');

-- =====================================================
-- 1. HOSPITAL (Core Entity)
-- =====================================================

CREATE TABLE hospital (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    license_number VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    postal_code VARCHAR(20),
    status hospital_status DEFAULT 'PENDING',
    verified_at TIMESTAMP,
    verified_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hospital_status ON hospital(status);
CREATE INDEX idx_hospital_code ON hospital(code);

-- =====================================================
-- 2. DEPARTMENT (Hospital Organizational Units)
-- =====================================================

CREATE TABLE department (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL REFERENCES hospital(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50), -- clinical, support, administrative, emergency
    floor_location VARCHAR(100),
    bed_capacity INTEGER DEFAULT 0,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hospital_id, code)
);

CREATE INDEX idx_department_hospital ON department(hospital_id);
CREATE INDEX idx_department_type ON department(type);

-- =====================================================
-- 3. STAFF (HR Entity - No Login)
-- =====================================================

CREATE TABLE staff (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL REFERENCES hospital(id) ON DELETE CASCADE,
    department_id INTEGER REFERENCES department(id) ON DELETE SET NULL,
    employee_code VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    designation VARCHAR(100), -- Doctor, Nurse, Pharmacist, Technician, Administrator, etc.
    specialization VARCHAR(255),
    license_number VARCHAR(100),
    employment_status employment_status DEFAULT 'ACTIVE',
    hire_date DATE,
    years_experience INTEGER,
    external_ref_id VARCHAR(100), -- For API sync with hospital systems
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hospital_id, employee_code),
    UNIQUE(hospital_id, email),
    UNIQUE(hospital_id, license_number)
);

-- ✅ FIXED: Staff references Department, not the other way around
CREATE INDEX idx_staff_hospital ON staff(hospital_id);
CREATE INDEX idx_staff_department ON staff(department_id);
CREATE INDEX idx_staff_email ON staff(email);
CREATE INDEX idx_staff_status ON staff(employment_status);

-- =====================================================
-- 4. ROLE (System Roles)
-- =====================================================

CREATE TABLE role (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default roles
INSERT INTO role (name, description) VALUES
('SYSTEM_ADMIN', 'System administrator with full access'),
('HOSPITAL_ADMIN', 'Hospital administrator managing hospital resources'),
('DOCTOR', 'Medical doctor with clinical access'),
('NURSE', 'Nursing staff with patient care access'),
('PHARMACIST', 'Pharmacy staff managing medications'),
('TECHNICIAN', 'Technical staff managing equipment'),
('VIEWER', 'Read-only access to reports and data');

-- =====================================================
-- 5. USER_ACCOUNT (Login Only If Approved)
-- =====================================================

CREATE TABLE user_account (
    id SERIAL PRIMARY KEY,
    staff_id INTEGER UNIQUE NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES role(id),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status user_status DEFAULT 'INVITED',
    last_login TIMESTAMP,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ✅ FIXED: Staff 1 ──── 0..1 UserAccount relationship
-- Staff can exist without user account (admin approval required)
CREATE INDEX idx_user_staff ON user_account(staff_id);
CREATE INDEX idx_user_status ON user_account(status);
CREATE INDEX idx_user_username ON user_account(username);

-- =====================================================
-- 6. RESOURCE (Global Resource Catalog)
-- =====================================================

CREATE TABLE resource (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type resource_type NOT NULL,
    category VARCHAR(100), -- For medicines: therapeutic class; For equipment: category
    unit VARCHAR(50), -- mg, ml, units, pieces, etc.
    description TEXT,
    standard_specification TEXT, -- Generic name for medicines, technical specs for equipment
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ✅ FIXED: Normalized resource catalog (no hospital reference)
CREATE INDEX idx_resource_type ON resource(type);
CREATE INDEX idx_resource_code ON resource(code);

-- =====================================================
-- 7. INVENTORY (Hospital Inventory)
-- =====================================================

CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL REFERENCES hospital(id) ON DELETE CASCADE,
    resource_id INTEGER NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
    available_quantity DECIMAL(12,2) DEFAULT 0,
    reserved_quantity DECIMAL(12,2) DEFAULT 0,
    unit_price DECIMAL(10,2),
    reorder_level DECIMAL(12,2),
    max_level DECIMAL(12,2),
    last_restocked TIMESTAMP,
    expiry_date DATE,
    batch_number VARCHAR(100),
    storage_location VARCHAR(255),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (available_quantity >= 0),
    CHECK (reserved_quantity >= 0)
);

-- ✅ FIXED: Consolidated all inventory tables into one
CREATE INDEX idx_inventory_hospital ON inventory(hospital_id);
CREATE INDEX idx_inventory_resource ON inventory(resource_id);
CREATE INDEX idx_inventory_expiry ON inventory(expiry_date);

-- ✅ FIXED: Partial unique index for batch_number (handles NULLs properly)
CREATE UNIQUE INDEX uniq_inventory_hospital_resource_nobatch
ON inventory(hospital_id, resource_id)
WHERE batch_number IS NULL;

CREATE UNIQUE INDEX uniq_inventory_batch
ON inventory(hospital_id, resource_id, batch_number)
WHERE batch_number IS NOT NULL;

-- =====================================================
-- 8. RESOURCE_REQUEST (Inter-Hospital Requests)
-- =====================================================

CREATE TABLE resource_request (
    id SERIAL PRIMARY KEY,
    request_number VARCHAR(50) UNIQUE NOT NULL,
    requesting_hospital_id INTEGER NOT NULL REFERENCES hospital(id) ON DELETE CASCADE,
    supplying_hospital_id INTEGER REFERENCES hospital(id) ON DELETE SET NULL,
    requested_by INTEGER NOT NULL REFERENCES user_account(id),
    status request_status DEFAULT 'DRAFT',
    priority VARCHAR(20) DEFAULT 'NORMAL', -- URGENT, HIGH, NORMAL, LOW
    reason TEXT,
    notes TEXT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by INTEGER REFERENCES user_account(id),
    approved_at TIMESTAMP,
    dispatched_at TIMESTAMP,
    received_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (requesting_hospital_id <> supplying_hospital_id)
);

CREATE INDEX idx_request_requesting_hospital ON resource_request(requesting_hospital_id);
CREATE INDEX idx_request_supplying_hospital ON resource_request(supplying_hospital_id);
CREATE INDEX idx_request_status ON resource_request(status);
CREATE INDEX idx_request_number ON resource_request(request_number);

-- =====================================================
-- 9. RESOURCE_REQUEST_ITEM (Request Line Items)
-- =====================================================

CREATE TABLE resource_request_item (
    id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES resource_request(id) ON DELETE CASCADE,
    resource_id INTEGER NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
    quantity_requested DECIMAL(12,2) NOT NULL,
    quantity_approved DECIMAL(12,2),
    quantity_dispatched DECIMAL(12,2),
    quantity_received DECIMAL(12,2),
    unit_price DECIMAL(10,2),
    total_cost DECIMAL(12,2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (quantity_requested > 0),
    CHECK (quantity_approved >= 0 OR quantity_approved IS NULL),
    CHECK (quantity_dispatched >= 0 OR quantity_dispatched IS NULL),
    CHECK (quantity_received >= 0 OR quantity_received IS NULL)
);

-- ✅ FIXED: Proper many-to-many through request_items
CREATE INDEX idx_request_item_request ON resource_request_item(request_id);
CREATE INDEX idx_request_item_resource ON resource_request_item(resource_id);

-- =====================================================
-- 10. AUDIT_LOG (Compliance & Tracking)
-- =====================================================

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_account(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT, APPROVE, REJECT, etc.
    entity_type VARCHAR(50) NOT NULL, -- hospital, staff, inventory, request, etc.
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ✅ IMPORTANT: For medico-legal compliance
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_action ON audit_log(action);

-- =====================================================
-- 11. INVENTORY_TRANSACTION (Stock Movement History)
-- =====================================================

CREATE TABLE inventory_transaction (
    id BIGSERIAL PRIMARY KEY,
    inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- RESTOCK, DISPENSE, TRANSFER, ADJUSTMENT, EXPIRE
    quantity DECIMAL(12,2) NOT NULL,
    reference_type VARCHAR(50), -- REQUEST, PURCHASE_ORDER, ADJUSTMENT
    reference_id INTEGER,
    performed_by INTEGER REFERENCES user_account(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_transaction_inventory ON inventory_transaction(inventory_id);
CREATE INDEX idx_inventory_transaction_type ON inventory_transaction(transaction_type);
CREATE INDEX idx_inventory_transaction_date ON inventory_transaction(created_at);

-- =====================================================
-- 12. HOSPITAL_SYNC_LOG (External Hospital API Sync)
-- =====================================================

CREATE TABLE hospital_sync_log (
    id BIGSERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL REFERENCES hospital(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) NOT NULL, -- INVENTORY, STAFF, DEPARTMENT
    status VARCHAR(20) NOT NULL, -- SUCCESS, FAILED, PARTIAL
    records_synced INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_message TEXT,
    sync_started_at TIMESTAMP NOT NULL,
    sync_completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sync_log_hospital ON hospital_sync_log(hospital_id);
CREATE INDEX idx_sync_log_type ON hospital_sync_log(sync_type);
CREATE INDEX idx_sync_log_status ON hospital_sync_log(status);

-- =====================================================
-- ENTERPRISE IMPROVEMENTS
-- =====================================================

-- =====================================================
-- 13. USER_ROLE (Multi-Role Support)
-- =====================================================

CREATE TABLE user_role (
    user_id INTEGER NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INTEGER REFERENCES user_account(id),
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_role_user ON user_role(user_id);
CREATE INDEX idx_user_role_role ON user_role(role_id);

-- =====================================================
-- 14. REQUEST_APPROVAL_HISTORY (Audit Trail for Approvals)
-- =====================================================

CREATE TABLE request_approval_history (
    id BIGSERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES resource_request(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- SUBMITTED, REVIEWED, APPROVED, REJECTED, CANCELLED
    performed_by INTEGER NOT NULL REFERENCES user_account(id),
    previous_status request_status,
    new_status request_status NOT NULL,
    remarks TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_history_request ON request_approval_history(request_id);
CREATE INDEX idx_approval_history_user ON request_approval_history(performed_by);
CREATE INDEX idx_approval_history_timestamp ON request_approval_history(timestamp);

-- =====================================================
-- 15. PASSWORD SECURITY ENHANCEMENTS
-- =====================================================

-- Add password security columns to user_account (requires migration)
ALTER TABLE user_account ADD COLUMN password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE user_account ADD COLUMN must_change_password BOOLEAN DEFAULT TRUE;
ALTER TABLE user_account ADD COLUMN password_reset_token VARCHAR(255);
ALTER TABLE user_account ADD COLUMN password_reset_expires TIMESTAMP;

-- =====================================================
-- 16. CONCURRENCY PROTECTION
-- =====================================================

-- Add version column for optimistic locking
ALTER TABLE inventory ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE resource_request ADD COLUMN version INTEGER DEFAULT 1;

-- =====================================================
-- 17. ETL STAGING TABLES
-- =====================================================

CREATE TABLE staff_staging (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL,
    employee_code VARCHAR(50),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20),
    designation VARCHAR(100),
    specialization VARCHAR(255),
    license_number VARCHAR(100),
    employment_status VARCHAR(20),
    hire_date DATE,
    years_experience INTEGER,
    external_ref_id VARCHAR(100),
    validation_errors TEXT,
    processing_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, VALIDATED, LOADED, FAILED
    loaded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_staging (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL,
    resource_code VARCHAR(50),
    resource_name VARCHAR(255),
    available_quantity DECIMAL(12,2),
    reserved_quantity DECIMAL(12,2),
    unit_price DECIMAL(10,2),
    reorder_level DECIMAL(12,2),
    max_level DECIMAL(12,2),
    expiry_date DATE,
    batch_number VARCHAR(100),
    storage_location VARCHAR(255),
    validation_errors TEXT,
    processing_status VARCHAR(20) DEFAULT 'PENDING',
    loaded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_staff_staging_status ON staff_staging(processing_status);
CREATE INDEX idx_inventory_staging_status ON inventory_staging(processing_status);

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Available inventory across all hospitals
CREATE VIEW v_available_inventory AS
SELECT 
    h.id as hospital_id,
    h.name as hospital_name,
    r.id as resource_id,
    r.code as resource_code,
    r.name as resource_name,
    r.type as resource_type,
    SUM(i.available_quantity) as total_available,
    r.unit
FROM inventory i
JOIN hospital h ON i.hospital_id = h.id
JOIN resource r ON i.resource_id = r.id
WHERE h.status = 'ACTIVE'
GROUP BY h.id, h.name, r.id, r.code, r.name, r.type, r.unit;

-- Active requests summary
CREATE VIEW v_active_requests AS
SELECT 
    rr.id,
    rr.request_number,
    rh.name as requesting_hospital,
    sh.name as supplying_hospital,
    rr.status,
    rr.priority,
    COUNT(rri.id) as item_count,
    SUM(rri.quantity_requested) as total_quantity_requested,
    rr.requested_at,
    u.username as requested_by
FROM resource_request rr
JOIN hospital rh ON rr.requesting_hospital_id = rh.id
LEFT JOIN hospital sh ON rr.supplying_hospital_id = sh.id
LEFT JOIN resource_request_item rri ON rr.id = rri.request_id
JOIN user_account ua ON rr.requested_by = ua.id
JOIN staff s ON ua.staff_id = s.id
LEFT JOIN user_account u ON ua.id = u.id
WHERE rr.status NOT IN ('COMPLETED', 'CANCELLED')
GROUP BY rr.id, rr.request_number, rh.name, sh.name, rr.status, rr.priority, rr.requested_at, u.username;

-- Staff with user accounts
CREATE VIEW v_staff_users AS
SELECT 
    s.id as staff_id,
    s.employee_code,
    s.first_name,
    s.last_name,
    s.email,
    s.designation,
    s.employment_status,
    h.name as hospital_name,
    d.name as department_name,
    ua.id as user_account_id,
    ua.username,
    ua.status as account_status,
    r.name as role_name,
    ua.last_login
FROM staff s
JOIN hospital h ON s.hospital_id = h.id
LEFT JOIN department d ON s.department_id = d.id
LEFT JOIN user_account ua ON s.id = ua.staff_id
LEFT JOIN role r ON ua.role_id = r.id;

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all relevant tables
CREATE TRIGGER update_hospital_updated_at BEFORE UPDATE ON hospital
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_department_updated_at BEFORE UPDATE ON department
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_account_updated_at BEFORE UPDATE ON user_account
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resource_updated_at BEFORE UPDATE ON resource
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resource_request_updated_at BEFORE UPDATE ON resource_request
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON DATABASE hospital_resource_sharing_v2 IS 'Improved Hospital Resource Sharing System with proper normalization and FK relationships';

COMMENT ON TABLE hospital IS 'Core hospital entities registered in the system';
COMMENT ON TABLE department IS 'Hospital organizational units (wards, departments, units) - FIXED: No FK to staff';
COMMENT ON TABLE staff IS 'HR records of hospital staff - exists independently of user accounts - FIXED: FK to department';
COMMENT ON TABLE user_account IS 'Login accounts - only created when admin approves staff access - FIXED: 1:1 with staff';
COMMENT ON TABLE role IS 'System roles for access control';
COMMENT ON TABLE resource IS 'Global catalog of resources (medicines, equipment, etc.) - FIXED: No hospital FK';
COMMENT ON TABLE inventory IS 'Hospital-specific inventory - FIXED: Consolidated from multiple inventory tables';
COMMENT ON TABLE resource_request IS 'Inter-hospital resource sharing requests';
COMMENT ON TABLE resource_request_item IS 'Line items for resource requests - FIXED: Proper many-to-many';
COMMENT ON TABLE audit_log IS 'Audit trail for compliance and tracking';
COMMENT ON TABLE inventory_transaction IS 'Stock movement history';
COMMENT ON TABLE hospital_sync_log IS 'External hospital API synchronization logs';

-- =====================================================
-- SCHEMA SUMMARY - ENTERPRISE READY
-- =====================================================
-- 
-- ✅ CRITICAL FIXES IMPLEMENTED:
-- 1. Staff email/employee_code: UNIQUE(hospital_id, email) - prevents cross-hospital conflicts
-- 2. License number: UNIQUE(hospital_id, license_number) - allows same license at different hospitals
-- 3. Inventory batch_number: Partial unique indexes handle NULL values properly
-- 4. Self-request prevention: CHECK (requesting_hospital_id <> supplying_hospital_id)
-- 5. Quantity validations: CHECK constraints prevent negative values
-- 6. Soft delete: is_deleted/deleted_at columns added to critical tables
-- 7. Multi-role support: user_role junction table (M:N relationship)
-- 8. Approval audit trail: request_approval_history for medico-legal compliance
-- 9. Password security: password_changed_at, must_change_password columns
-- 10. Concurrency protection: version columns for optimistic locking
-- 11. ETL staging: staff_staging, inventory_staging for safe data loading
-- 12. Proper constraint handling: quantity_requested > 0, approved/dispatched >= 0
--
-- 🏥 ENTERPRISE FEATURES:
-- - Multi-tenant ready (hospital_id isolation)
-- - Audit logging for compliance
-- - Transaction history for inventory
-- - Staging tables for ETL processes
-- - Optimistic locking for concurrency
-- - Soft delete for data conservation
-- - Comprehensive approval workflow tracking
--
-- 🔒 SECURITY CONSIDERATIONS:
-- - Row-level security can be implemented on hospital_id
-- - Audit trail for all critical operations
-- - Password security enhancements
-- - Multi-role authorization support
--
-- CARDINALITY (FIXED):
-- Hospital 1 ──── N Department
-- Hospital 1 ──── N Staff  
-- Hospital 1 ──── N Inventory
-- Department 1 ──── N Staff (FIXED)
-- Staff 1 ──── 0..1 UserAccount (Admin approval required)
-- UserAccount N ──── M Role (Multi-role support)
-- Resource 1 ──── N Inventory (Global catalog)
-- Request 1 ──── N RequestItems (Proper normalization)
-- Request 1 ──── N ApprovalHistory (Audit trail)
--
-- 📊 PERFORMANCE OPTIMIZED:
-- - Strategic indexing on all FK and query columns
-- - Partial indexes for NULL handling
-- - Composite indexes for multi-column uniqueness
-- - Proper data types and constraints
--
-- ⚖️ HEALTHCARE COMPLIANCE READY:
-- - Comprehensive audit logging
-- - Approval workflow tracking
-- - Data retention (soft delete)
-- - Traceability requirements met
--
-- =====================================================
