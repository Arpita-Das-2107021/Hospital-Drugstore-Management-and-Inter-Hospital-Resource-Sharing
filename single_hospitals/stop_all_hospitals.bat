@echo off
echo ==========================================
echo Stopping All Hospital Databases
echo Multi-DBMS Architecture
echo ==========================================

echo.
echo Stopping Hospital 1 (PostgreSQL)...
cd hospital_1
docker-compose down
cd ..

echo.
echo Stopping Hospital 2 (MySQL)...
cd hospital_2
docker-compose down
cd ..

echo.
echo Stopping Hospital 3 (MariaDB)...
cd hospital_3
docker-compose down
cd ..

echo.
echo Stopping Hospital 4 (SQL Server)...
cd hospital_4
docker-compose down
cd ..

echo.
echo Stopping Hospital 5 (Oracle)...
cd hospital_5
docker-compose down
cd ..

echo.
echo Stopping Hospital 6 (PostgreSQL)...
cd hospital_6
docker-compose down
cd ..

echo.
echo Stopping Hospital 7 (MySQL)...
cd hospital_7
docker-compose down
cd ..

echo.
echo Stopping Hospital 8 (MariaDB)...
cd hospital_8
docker-compose down
cd ..

echo.
echo Stopping Hospital 9 (PostgreSQL)...
cd hospital_9
docker-compose down
cd ..

echo.
echo Stopping Hospital 10 (SQL Server)...
cd hospital_10
docker-compose down
cd ..

echo.
echo ==========================================
echo All 10 hospitals stopped successfully!
echo ==========================================
echo.
echo To completely remove all data volumes, run:
echo docker volume prune -f
echo.
echo ==========================================

pause