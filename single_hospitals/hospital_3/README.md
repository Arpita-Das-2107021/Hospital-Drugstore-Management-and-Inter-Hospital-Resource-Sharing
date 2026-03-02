# Hospital 3 - Regional Healthcare Center

## Database Information
- **DBMS**: MariaDB 10.11
- **Database Name**: hospital_3_db
- **Port**: 3362

## Database Schema
Comprehensive hospital management system (MariaDB version) with all standard tables including:
departments, staff, patients, medications, medical_equipment, blood_bank, organ_registry, appointments, medical_records, and prescriptions.

## Connection Details
- **Host**: localhost
- **Port**: 3362
- **Database**: hospital_3_db
- **Username**: hospital3user
- **Password**: hospital3pass
- **Root Password**: root2026

## How to Start

```bash
cd hospital_3
docker-compose up -d
```

## How to Stop

```bash
docker-compose down
```

## How to Connect

### Using mysql (command line)
```bash
docker exec -it hospital_3_db mysql -uhospital3user -phospital3pass hospital_3_db
```

### Using connection string
```
mysql://hospital3user:hospital3pass@localhost:3362/hospital_3_db
```

### Common Queries

```sql
-- View all departments
SELECT * FROM departments;

-- View staff by role
SELECT role, COUNT(*) as count 
FROM staff 
GROUP BY role;

-- View medication inventory
SELECT m.name, mi.quantity_in_stock 
FROM medication_inventory mi
JOIN medications m ON mi.medication_id = m.id;
```

## Data Reset

To reset the database:
```bash
docker-compose down -v
docker-compose up -d
```
