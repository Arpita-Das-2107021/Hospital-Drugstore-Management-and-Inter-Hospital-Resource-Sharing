# Hospital 4 - Central Regional Hospital

## Database Information
- **DBMS**: Microsoft SQL Server 2022 Express
- **Database Name**: master (default), create hospital_4_db as needed
- **Port**: 1441

## Database Schema
Hospital management system (SQL Server version) with all standard tables.
Note: SQL Server may take 30-60 seconds to fully initialize on first start.

## Connection Details
- **Host**: localhost
- **Port**: 1441
- **Username**: sa
- **Password**: Hospital4Pass!

## How to Start

```bash
cd hospital_4
docker-compose up -d
```

Wait about 30-60 seconds for SQL Server to fully initialize.

## How to Stop

```bash
docker-compose down
```

## How to Connect

### Using sqlcmd (command line)
```bash
docker exec -it hospital_4_db /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "Hospital4Pass!"
```

### Using connection string
```
Server=localhost,1441;User Id=sa;Password=Hospital4Pass!;TrustServerCertificate=True
```

### Common Queries

```sql
-- List all databases
SELECT name FROM sys.databases;
GO

-- Create database (if needed)
CREATE DATABASE hospital_4_db;
GO

USE hospital_4_db;
GO
```

## Notes

- SQL Server uses `;GO` batch separators
- Password must meet complexity requirements
- Initial startup takes longer than other databases
- You can manually run schema scripts from sql_scripts folder

## Data Reset

```bash
docker-compose down -v
docker-compose up -d
```
