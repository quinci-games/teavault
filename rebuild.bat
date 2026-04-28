@echo off
setlocal

echo === TeaVault rebuild ===
echo.

pushd "%~dp0"

echo [1/4] Building client + server...
call npm run build
if errorlevel 1 goto :fail

echo.
echo [2/4] Stopping TeaVault service...
sc stop TeaVault.exe >nul 2>&1

REM Give the service a moment to release the port
set ATTEMPTS=0
:WAIT_PORT
set /a ATTEMPTS=ATTEMPTS+1
if %ATTEMPTS% gtr 10 goto :PORT_DONE
netstat -aon | findstr ":3004" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 goto :PORT_DONE
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3004" ^| findstr "LISTENING"') do (
  echo   Killing orphan PID %%p on port 3004
  taskkill /F /PID %%p >nul 2>&1
)
ping -n 2 127.0.0.1 >nul
goto :WAIT_PORT
:PORT_DONE

echo.
echo [3/4] Starting TeaVault service...
sc start TeaVault.exe >nul 2>&1
if errorlevel 1 (
  echo   Service not installed or failed to start. Run: npm run service:install
  goto :done
)

echo.
echo [4/4] Waiting for health check...
set HEALTH_ATTEMPTS=0
:HEALTH
set /a HEALTH_ATTEMPTS=HEALTH_ATTEMPTS+1
if %HEALTH_ATTEMPTS% gtr 15 (
  echo   WARNING: health check did not respond. Check the service log.
  goto :done
)
ping -n 2 127.0.0.1 >nul
curl -s -o nul -w "%%{http_code}" http://localhost:3004/api/health > "%TEMP%\tv_health.txt" 2>nul
set /p HEALTH=<"%TEMP%\tv_health.txt"
del "%TEMP%\tv_health.txt" >nul 2>&1
if "%HEALTH%"=="200" (
  echo   OK - server responded 200.
  goto :done
)
goto :HEALTH

:done
echo.
echo === Done. ===
popd
pause
exit /b 0

:fail
echo.
echo *** Build failed. ***
popd
pause
exit /b 1
