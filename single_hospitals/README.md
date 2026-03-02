# Multi-Hospital Database System

## Overview
This project contains 10 independent hospital databases, each using a **different database management system (DBMS)** technology. All hospitals implement your existing schema with tables for departments, staff, patients, medications, medical equipment, blood bank, organ registry, appointments, medical records, and prescriptions.

## Hospital Systems

| Hospital | DBMS | Port | Database Name |
|----------|------|------|---------------|
| Hospital 1 - Metro General | **PostgreSQL 15** | 5441 | hospital_1_db |
| Hospital 2 - City Medical Center | **MySQL 8.0** | 3361 | hospital_2_db |
| Hospital 3 - Regional Healthcare | **MariaDB 10.11** | 3362 | hospital_3_db |
| Hospital 4 - Central Regional | **SQL Server 2022** | 1441 | master |
| Hospital 5 - University Medical | **Oracle XE 21c** | 1521 | hospital5 |
| Hospital 6 - Northern District | **PostgreSQL 15** | 5446 | hospital_6_db |
| Hospital 7 - Southern Medical | **MySQL 8.0** | 3363 | hospital_7_db |
| Hospital 8 - Eastern Health | **MariaDB 10.11** | 3364 | hospital_8_db |
| Hospital 9 - Western Care | **PostgreSQL 15** | 5449 | hospital_9_db |
| Hospital 10 - Downtown Medical | **SQL Server 2022** | 1442 | master |

## Quick Start

### Start All Hospitals
```bash
.\start_all_hospitals.bat
```

### Stop All Hospitals
```bash
.\stop_all_hospitals.bat
```

### Start Individual Hospital
```bash
cd hospital_X
docker-compose up -d
```

### Stop Individual Hospital
```bash
cd hospital_X
docker-compose down
```

## Database Schema

All hospitals share the same conceptual schema with these main tables:
- **hospital_info** - Hospital metadata
- **departments** - Hospital departments (Emergency, Cardiology, etc.)
- **staff** - Medical and administrative staff
- **patients** - Patient records
- **medications** - Medication catalog
- **medication_inventory** - Stock management
- **medical_equipment** - Equipment tracking
- **blood_bank** - Blood bank inventory
- **organ_registry** - Organ transplant registry
- **appointments** - Appointment scheduling
- **medical_records** - Patient medical records
- **prescriptions** - Medication prescriptions

The schema is adapted for each DBMS with appropriate syntax and data types.

## Connection Details

Each hospital folder contains a **README.md** with:
- Specific connection strings
- Sample queries for that DBMS
- Setup and troubleshooting instructions

### Quick Connection Examples

**PostgreSQL (Hospitals 1, 6, 9):**
```bash
docker exec -it hospital_1_db psql -U hospital1user -d hospital_1_db
```

**MySQL (Hospitals 2, 7):**
```bash
docker exec -it hospital_2_db mysql -uhospital2user -phospital2pass hospital_2_db
```

**MariaDB (Hospitals 3, 8):**
```bash
docker exec -it hospital_3_db mysql -uhospital3user -phospital3pass hospital_3_db
```

**SQL Server (Hospitals 4, 10):**
```bash
docker exec -it hospital_4_db /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "Hospital4Pass!"
```

**Oracle (Hospital 5):**
```bash
docker exec -it hospital_5_db sqlplus hospital5user/hospital5pass@XE
```

## Requirements

- Docker Desktop installed and running
- At least 8GB RAM recommended (16GB for running all hospitals)
- At least 20GB free disk space
- Windows PowerShell (for batch scripts)

## Performance Notes

- **PostgreSQL** (Hospitals 1, 6, 9): Fastest startup (~5 seconds), lightweight
- **MySQL/MariaDB** (Hospitals 2, 3, 7, 8): Fast startup (~10 seconds)
- **SQL Server** (Hospitals 4, 10): Slower startup (30-60 seconds)
- **Oracle** (Hospital 5): Slowest startup (2-3 minutes), largest container (~2GB)

## Data Reset

To completely reset a specific hospital:
```bash
cd hospital_X
docker-compose down -v
docker-compose up -d
```

To reset all hospitals:
```bash
.\stop_all_hospitals.bat
docker volume prune -f
.\start_all_hospitals.bat
```

## Directory Structure

```
single_hospitals/
├── README.md (this file)
├── start_all_hospitals.bat
├── stop_all_hospitals.bat
├── hospital_1/ - PostgreSQL with full seed data
├── hospital_2/ - MySQL with converted schema
├── hospital_3/ - MariaDB with base schema
├── hospital_4/ - SQL Server with base schema
├── hospital_5/ - Oracle with base schema
├── hospital_6/ - PostgreSQL with base schema
├── hospital_7/ - MySQL with base schema
├── hospital_8/ - MariaDB with base schema
├── hospital_9/ - PostgreSQL with base schema
└── hospital_10/ - SQL Server with base schema
```

## Troubleshooting

### Container Won't Start
```bash
cd hospital_X
docker-compose down -v
docker-compose up -d
```

### Check Container Logs
```bash
docker-compose logs -f
```

### View Running Containers
```bash
docker ps
```

### Port Already in Use
Edit the `docker-compose.yml` file and change the port mapping.

### SQL Server Takes Too Long
This is normal - SQL Server requires 30-60 seconds to initialize.

### Oracle Won't Start
Oracle requires significant resources. Ensure Docker has at least 4GB RAM allocated.

## Project Purpose

This multi-DBMS setup demonstrates:
- **Database portability** - Same schema across different DBMS platforms
- **Technology diversity** - Working with PostgreSQL, MySQL, MariaDB, SQL Server, and Oracle
- **Real-world scenarios** - Different hospitals using different database technologies
- **SQL dialect differences** - Adapting queries for each DBMS

## License

This is a demonstration project for educational purposes.