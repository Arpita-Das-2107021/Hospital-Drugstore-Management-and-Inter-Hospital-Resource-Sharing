# Hospital 5 - University Medical Center

## Database Information
- **DBMS**: Oracle Database XE 21c
- **Database Name**: hospital5
- **Port**: 1521

## Database Schema
Hospital management system (Oracle version) with all standard tables.
Note: Oracle XE may take 2-3 minutes to fully initialize on first start.

## Connection Details
- **Host**: localhost
- **Port**: 1521
- **SID**: XE
- **Username**: hospital5user
- **Password**: hospital5pass
- **System Password**: Hospital5Pass

## How to Start

```bash
cd hospital_5
docker-compose up -d
```

Wait 2-3 minutes for Oracle to fully initialize.

## How to Stop

```bash
docker-compose down
```

## How to Connect

### Using sqlplus (command line)
```bash
docker exec -it hospital_5_db sqlplus hospital5user/hospital5pass@XE
```

### Using connection string
```
(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(SID=XE)))
User: hospital5user
Password: hospital5pass
```

### Common Queries

```sql
-- View all tables
SELECT table_name FROM user_tables;

-- View departments
SELECT * FROM departments;
```

## Notes

- Oracle Database XE is free but has resource limitations
- First startup takes significantly longer than other databases
- The container is larger (~2GB) than other DBMS containers
- You can manually run schema scripts from sql_scripts folder after startup

## Data Reset

```bash
docker-compose down -v
docker-compose up -d
```
