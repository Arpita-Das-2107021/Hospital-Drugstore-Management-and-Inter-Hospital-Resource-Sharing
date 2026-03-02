# Hospital 6 - Northern District Hospital

## Database Information
- **DBMS**: PostgreSQL 15
- **Database Name**: hospital_6_db
- **Port**: 5446

## Database Schema
Comprehensive hospital management system with all standard tables including:
departments, staff, patients, medications, medical_equipment, blood_bank, organ_registry, appointments, medical_records, and prescriptions.

## Connection Details
- **Host**: localhost
- **Port**: 5446
- **Database**: hospital_6_db
- **Username**: hospital6user
- **Password**: hospital6pass

## How to Start

```bash
cd hospital_6
docker-compose up -d
```

## How to Stop

```bash
docker-compose down
```

## How to Connect

### Using psql (command line)
```bash
docker exec -it hospital_6_db psql -U hospital6user -d hospital_6_db
```

### Using connection string
```
postgresql://hospital6user:hospital6pass@localhost:5446/hospital_6_db
```

### Common Queries

```sql
-- View all departments
SELECT * FROM departments;

-- View staff summary
SELECT role, COUNT(*) as count 
FROM staff 
GROUP BY role;
```

## Data Reset

```bash
docker-compose down -v
docker-compose up -d
```
