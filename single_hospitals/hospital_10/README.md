# Hospital 10 - Downtown Medical Plaza

## Database Information
- **DBMS**: Microsoft SQL Server 2022 Express
- **Port**: 1442

## Database Schema
Hospital management system (SQL Server version).
Note: SQL Server may take 30-60 seconds to fully initialize on first start.

## Connection Details
- **Host**: localhost
- **Port**: 1442
- **Username**: sa
- **Password**: Hospital10Pass!

## How to Start

```bash
cd hospital_10
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
docker exec -it hospital_10_db /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "Hospital10Pass!"
```

### Using connection string
```
Server=localhost,1442;User Id=sa;Password=Hospital10Pass!;TrustServerCertificate=True
```

### Common Queries

```sql
-- List all databases
SELECT name FROM sys.databases;
GO

-- Create database if needed
CREATE DATABASE hospital_10_db;
GO
```

## Notes

- SQL Server uses `;GO` batch separators  
- Initial startup takes longer than other databases
- You can manually run schema scripts from sql_scripts folder after startup

## Data Reset

```bash
docker-compose down -v
docker-compose up -d
```
