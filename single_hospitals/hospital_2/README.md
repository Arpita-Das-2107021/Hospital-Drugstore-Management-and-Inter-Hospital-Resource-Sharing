# Hospital 2 - City Medical Center

## Database Information
- **DBMS**: MySQL 8.0
- **Database Name**: hospital_2_db
- **Port**: 3361

## Database Schema
Comprehensive hospital management system (MySQL version) with the following main tables:
- `hospital_info` - Hospital metadata
- `departments` - Hospital departments
- `staff` - Medical and administrative staff
- `patients` - Patient records
- `medications` - Medication catalog
- `medication_inventory` - Medication stock management
- `medical_equipment` - Equipment tracking
- `blood_bank` - Blood bank inventory
- `organ_registry` - Organ transplant registry
- `appointments` - Appointment scheduling
- `medical_records` - Patient medical records
- `prescriptions` - Medication prescriptions

## Connection Details
- **Host**: localhost
- **Port**: 3361
- **Database**: hospital_2_db
- **Username**: hospital2user
- **Password**: hospital2pass
- **Root Password**: root2026

## How to Start

```bash
cd hospital_2
docker-compose up -d
```

## How to Stop

```bash
docker-compose down
```

## How to Connect

### Using mysql (command line)
```bash
docker exec -it hospital_2_db mysql -uhospital2user -phospital2pass hospital_2_db
```

### Using connection string
```
mysql://hospital2user:hospital2pass@localhost:3361/hospital_2_db
```

### Common Queries

```sql
-- View all departments
SELECT * FROM departments;

-- View staff by department
SELECT s.first_name, s.last_name, s.role, s.specialization, d.name as department
FROM staff s
LEFT JOIN departments d ON s.department_id = d.id
ORDER BY d.name, s.last_name;

-- View patients with their appointments
SELECT p.first_name, p.last_name, a.appointment_datetime, s.first_name as doctor_first, 
       s.last_name as doctor_last, a.status
FROM appointments a
JOIN patients p ON a.patient_id = p.id
JOIN staff s ON a.doctor_id = s.id
ORDER BY a.appointment_datetime DESC;

-- View blood bank inventory
SELECT blood_type, component, SUM(units_available) as total_units
FROM blood_bank
WHERE screening_status = 'cleared'
GROUP BY blood_type, component
ORDER BY blood_type, component;

-- View medication inventory
SELECT m.name, m.generic_name, mi.quantity_in_stock, mi.expiry_date, mi.location
FROM medication_inventory mi
JOIN medications m ON mi.medication_id = m.id
WHERE mi.quantity_in_stock > 0
ORDER BY m.name;
```

## Data Reset

To reset the database with fresh data:
```bash
docker-compose down -v
docker-compose up -d
```
