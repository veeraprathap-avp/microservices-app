@echo off
REM Correlation ID End-to-End Test Script (Windows)
REM This script tests the correlation ID propagation across all microservices

setlocal enabledelayedexpansion

set GATEWAY_URL=http://localhost:3000
REM Generate correlation ID with timestamp
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c%%a%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a%%b)
set CORRELATION_ID=test-trace-!mydate!!mytime!

echo.
echo ========================================
echo Correlation ID E2E Test
echo ========================================
echo Using Correlation ID: %CORRELATION_ID%
echo.

REM Check if gateway is running
echo 1. Checking API Gateway health...
curl -s "%GATEWAY_URL%/health" >nul 2>&1
if errorlevel 1 (
  echo X API Gateway not running on %GATEWAY_URL%
  echo   Start it with: cd api-gateway ^&^& npm start
  exit /b 1
)
echo + API Gateway is running
echo.

REM Test 1: GET users with correlation ID
echo 2. Testing GET /api/users with custom correlation ID...
curl -s -i -H "x-correlation-id: %CORRELATION_ID%" "%GATEWAY_URL%/api/users" >temp_response.txt 2>&1
findstr /I "x-correlation-id: %CORRELATION_ID%" temp_response.txt >nul
if errorlevel 1 (
  echo X GET /api/users failed or missing correlation ID
  del temp_response.txt
  exit /b 1
)
echo + GET /api/users returned with correct correlation ID
del temp_response.txt
echo.

REM Test 2: GET products
echo 3. Testing GET /api/products...
curl -s -i -H "x-correlation-id: %CORRELATION_ID%" "%GATEWAY_URL%/api/products" >temp_response.txt 2>&1
findstr /I "x-correlation-id: %CORRELATION_ID%" temp_response.txt >nul
if errorlevel 1 (
  echo X GET /api/products missing correlation ID
  del temp_response.txt
  exit /b 1
)
echo + GET /api/products returned with correct correlation ID
del temp_response.txt
echo.

REM Test 3: Auto-generate correlation ID
echo 4. Testing auto-generated correlation ID...
curl -s -i "%GATEWAY_URL%/api/products" >temp_response.txt 2>&1
findstr /I "x-correlation-id:" temp_response.txt >nul
if errorlevel 1 (
  echo X Failed to auto-generate correlation ID
  del temp_response.txt
  exit /b 1
)
echo + Auto-generated correlation ID successfully
del temp_response.txt
echo.

echo ========================================
echo + All correlation ID tests passed!
echo ========================================
echo.
echo How to view correlation ID in service logs:
echo - Each service logs the correlation ID with every request
echo - Look for 'correlationId: %CORRELATION_ID%' in the logs
echo - Check the service console output to verify propagation
echo.
echo Test completed successfully!
