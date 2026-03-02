-- =====================================================
-- STAFF DATA FOR ST. MARY'S MEDICAL CENTER (Hospital 4)
-- =====================================================

-- Insert staff members for St. Mary's Medical Center (Cardiothoracic Surgery focus)
INSERT INTO staff (department_id, employee_id, first_name, last_name, email, phone, role, specialization, hire_date, shift_pattern)
SELECT 
    d.id as department_id,
    'SMC001', 'Dr. Richard', 'Blackwood', 'richard.blackwood@stmarysmedical.com', '+1-555-0401', 'doctor', 'Cardiac Surgery', '2015-03-20', 'on_call'
FROM departments d WHERE d.name = 'Cardiothoracic Surgery';

INSERT INTO staff (department_id, employee_id, first_name, last_name, email, phone, role, specialization, hire_date, shift_pattern)
SELECT 
    d.id as department_id,
    'SMC002', 'Dr. Catherine', 'Hayes', 'catherine.hayes@stmarysmedical.com', '+1-555-0402', 'doctor', 'Thoracic Surgery', '2017-08-15', 'day'
FROM departments d WHERE d.name = 'Cardiothoracic Surgery';

INSERT INTO staff (department_id, employee_id, first_name, last_name, email, phone, role, specialization, hire_date, shift_pattern)
SELECT 
    d.id as department_id,
    'SMC003', 'Dr. James', 'Rivera', 'james.rivera@stmarysmedical.com', '+1-555-0403', 'doctor', 'Interventional Cardiology', '2018-11-10', 'day'
FROM departments d WHERE d.name = 'Cardiology';

INSERT INTO staff (department_id, employee_id, first_name, last_name, email, phone, role, specialization, hire_date, shift_pattern)
SELECT 
    d.id as department_id,
    'SMC004', 'Michelle', 'Thompson', 'michelle.thompson@stmarysmedical.com', '+1-555-0404', 'nurse', 'Cardiac Surgery Nursing', '2019-04-18', 'rotating'
FROM departments d WHERE d.name = 'Cardiovascular ICU';

INSERT INTO staff (department_id, employee_id, first_name, last_name, email, phone, role, specialization, hire_date, shift_pattern)
SELECT 
    d.id as department_id,
    'SMC005', 'Robert', 'Chen', 'robert.chen@stmarysmedical.com', '+1-555-0405', 'technician', 'Perfusionist', '2016-09-25', 'on_call'
FROM departments d WHERE d.name = 'Perfusion';

INSERT INTO staff (department_id, employee_id, first_name, last_name, email, phone, role, specialization, hire_date, shift_pattern)
SELECT 
    d.id as department_id,
    'SMC006', 'Dr. Amanda', 'Foster', 'amanda.foster@stmarysmedical.com', '+1-555-0406', 'doctor', 'Cardiac Anesthesia', '2017-01-12', 'on_call'
FROM departments d WHERE d.name = 'Anesthesiology';

INSERT INTO staff (department_id, employee_id, first_name, last_name, email, phone, role, specialization, hire_date, shift_pattern)
SELECT 
    d.id as department_id,
    'SMC007', 'Linda', 'Martinez', 'linda.martinez@stmarysmedical.com', '+1-555-0407', 'pharmacist', 'Cardiovascular Pharmacy', '2018-06-30', 'day'
FROM departments d WHERE d.name = 'Pharmacy';

INSERT INTO staff (department_id, employee_id, first_name, last_name, email, phone, role, specialization, hire_date, shift_pattern)
SELECT 
    d.id as department_id,
    'SMC008', 'Dr. Peter', 'Williams', 'peter.williams@stmarysmedical.com', '+1-555-0408', 'doctor', 'Emergency Medicine', '2019-10-05', 'rotating'
FROM departments d WHERE d.name = 'Emergency Department';

INSERT INTO staff (department_id, employee_id, first_name, last_name, email, phone, role, specialization, hire_date, shift_pattern)
SELECT 
    d.id as department_id,
    'SMC009', 'Nancy', 'Davis', 'nancy.davis@stmarysmedical.com', '+1-555-0409', 'nurse', 'Catheterization Lab', '2020-02-14', 'day'
FROM departments d WHERE d.name = 'Cardiac Catheterization';

INSERT INTO staff (department_id, employee_id, first_name, last_name, email, phone, role, specialization, hire_date, shift_pattern)
SELECT 
    d.id as department_id,
    'SMC010', 'Dr. Sarah', 'Johnson', 'sarah.johnson@stmarysmedical.com', '+1-555-0410', 'doctor', 'Electrophysiology', '2016-12-08', 'day'
FROM departments d WHERE d.name = 'Cardiology';