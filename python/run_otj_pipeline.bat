@echo off
:: ============================================================
::  OTJ Pipeline Runner
::  Schedule 1: 6:00 AM  — morning refresh + resolve yesterday
::  Schedule 2: 3:00 PM  — pre-tip updates + injury check
:: ============================================================

set PYTHON=C:\Python314\python.exe
set SCRIPT_DIR=C:\Users\snipy\overtime-journal\python
set LOG_DIR=C:\Users\snipy\overtime-journal\logs

:: Create logs folder if it doesn't exist
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: Timestamp for log file
for /f "tokens=1-4 delims=/ " %%a in ('date /t') do set DATE=%%b-%%c-%%d
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIME=%%a-%%b
set LOGFILE=%LOG_DIR%\otj_%DATE%_%TIME%.log

echo ============================================================ >> "%LOGFILE%"
echo  OTJ Pipeline — %DATE% %TIME% >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"

cd /d "%SCRIPT_DIR%"

:: ── Step 1: Resolve yesterday's picks (runs every time) ──────────────────────
echo. >> "%LOGFILE%"
echo  [1/2] Resolving yesterday's picks... >> "%LOGFILE%"
"%PYTHON%" resolve_picks.py >> "%LOGFILE%" 2>&1

if %ERRORLEVEL% == 0 (
    echo  ✓ Picks resolved >> "%LOGFILE%"
) else (
    echo  ⚠ Pick resolution failed — continuing pipeline >> "%LOGFILE%"
)

:: ── Step 2: Run today's slate analysis and push to Supabase ──────────────────
echo. >> "%LOGFILE%"
echo  [2/2] Pushing today's slate... >> "%LOGFILE%"
"%PYTHON%" push_to_supabase.py >> "%LOGFILE%" 2>&1

if %ERRORLEVEL% == 0 (
    echo  ✓ Slate pushed successfully >> "%LOGFILE%"
) else (
    echo  ✗ Slate push failed — Exit code %ERRORLEVEL% >> "%LOGFILE%"
)

echo. >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"
echo  Pipeline complete — %DATE% %TIME% >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"
