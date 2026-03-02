@echo off
echo ==========================================
echo Starting All Hospital Databases
echo Multi-DBMS Architecture
echo ==========================================

echo.
echo Starting Hospital 1 (PostgreSQL)...
cd hospital_1
docker-compose up -d
cd ..

echo.
echo Starting Hospital 2 (MySQL)...
cd hospital_2
docker-compose up -d
cd ..

echo.
echo Starting Hospital 3 (MariaDB)...
cd hospital_3
docker-compose up -d
cd ..

echo.
echo Starting Hospital 4 (SQL Server) - This may take 30-60 seconds...
cd hospital_4
docker-compose up -d
cd ..

echo.
echo Starting Hospital 5 (Oracle) - This may take 2-3 minutes...
cd hospital_5
docker-compose up -d
cd ..

echo.
echo Starting Hospital 6 (PostgreSQL)...
cd hospital_6
docker-compose up -d
cd ..

echo.
echo Starting Hospital 7 (MySQL)...
cd hospital_7
docker-compose up -d
cd ..

echo.
echo Starting Hospital 8 (MariaDB)...
cd hospital_8
docker-compose up -d
cd ..

echo.
echo Starting Hospital 9 (PostgreSQL)...
cd hospital_9
docker-compose up -d
cd ..

echo.
echo Starting Hospital 10 (SQL Server) - This may take 30-60 seconds...
cd hospital_10
docker-compose up -d
cd ..

echo.
echo ==========================================
echo All 10 hospitals started successfully!
echo ==========================================
echo.
echo Database Ports:
echo Hospital 1:  PostgreSQL  - localhost:5441
echo Hospital 2:  MySQL       - localhost:3361
echo Hospital 3:  MariaDB     - localhost:3362
echo Hospital 4:  SQL Server  - localhost:1441
echo Hospital 5:  Oracle XE   - localhost:1521
echo Hospital 6:  PostgreSQL  - localhost:5446
echo Hospital 7:  MySQL       - localhost:3363
echo Hospital 8:  MariaDB     - localhost:3364
echo Hospital 9:  PostgreSQL  - localhost:5449
echo Hospital 10: SQL Server  - localhost:1442
echo.
echo Note: SQL Server and Oracle containers may take longer to fully initialize
echo Check status: docker ps
echo View logs: docker-compose logs -f
echo.
echo ==========================================

pause