# Hospital 8 - Eastern Health Services

## Database Information
- **DBMS**: MariaDB 10.11
- **Database Name**: hospital_8_db
- **Port**: 3364

## Database Schema
Hospital management system (MariaDB version) with all standard tables.

## Connection Details
- **Host**: localhost
- **Port**: 3364
- **Database**: hospital_8_db
- **Username**: hospital8user
- **Password**: hospital8pass
- **Root Password**: root2026

## How to Start

```bash
cd hospital_8
docker-compose up -d
```

## How to Stop

```bash
docker-compose down
```

## How to Connect

### Using mysql (command line)
```bash
docker exec -it hospital_8_db mysql -uhospital8user -phospital8pass hospital_8_db
```

### Using connection string
```
mysql://hospital8user:hospital8pass@localhost:3364/hospital_8_db
```

### Common Queries

```sql
-- View all departments
SELECT * FROM departments;

-- View staff by department
SELECT s.*, d.name as department_name 
FROM staff s
LEFT JOIN departments d ON s.department_id = d.id;
```

## Data Reset

```bash
docker-compose down -v
docker-compose up -d
```
