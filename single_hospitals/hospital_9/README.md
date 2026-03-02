# Hospital 9 - Western Care Institute

## Database Information
- **DBMS**: PostgreSQL 15
- **Database Name**: hospital_9_db
- **Port**: 5449

## Database Schema
Comprehensive hospital management system with all standard tables.

## Connection Details
- **Host**: localhost
- **Port**: 5449
- **Database**: hospital_9_db
- **Username**: hospital9user
- **Password**: hospital9pass

## How to Start

```bash
cd hospital_9
docker-compose up -d
```

## How to Stop

```bash
docker-compose down
```

## How to Connect

### Using psql (command line)
```bash
docker exec -it hospital_9_db psql -U hospital9user -d hospital_9_db
```

### Using connection string
```
postgresql://hospital9user:hospital9pass@localhost:5449/hospital_9_db
```

### Common Queries

```sql
-- View all departments
SELECT * FROM departments;

-- View all tables
\dt
```

## Data Reset

```bash
docker-compose down -v
docker-compose up -d
```
