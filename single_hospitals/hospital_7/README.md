# Hospital 7 - Southern Medical Complex

## Database Information
- **DBMS**: MySQL 8.0
- **Database Name**: hospital_7_db
- **Port**: 3363

## Database Schema
Hospital management system (MySQL version) with all standard tables.

## Connection Details
- **Host**: localhost
- **Port**: 3363
- **Database**: hospital_7_db
- **Username**: hospital7user
- **Password**: hospital7pass
- **Root Password**: root2026

## How to Start

```bash
cd hospital_7
docker-compose up -d
```

## How to Stop

```bash
docker-compose down
```

## How to Connect

### Using mysql (command line)
```bash
docker exec -it hospital_7_db mysql -uhospital7user -phospital7pass hospital_7_db
```

### Using connection string
```
mysql://hospital7user:hospital7pass@localhost:3363/hospital_7_db
```

### Common Queries

```sql
-- View all departments
SELECT * FROM departments;

-- View staff
SELECT * FROM staff;
```

## Data Reset

```bash
docker-compose down -v
docker-compose up -d
```
