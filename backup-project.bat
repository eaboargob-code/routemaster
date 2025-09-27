@echo off
echo Routemaster Project Backup
echo ==========================
echo.
echo Choose backup type:
echo 1. Directory backup (faster)
echo 2. Compressed backup (smaller)
echo.
set /p choice="Enter your choice (1 or 2): "

if "%choice%"=="1" (
    echo Running directory backup...
    powershell -ExecutionPolicy Bypass -File "backup-project.ps1"
) else if "%choice%"=="2" (
    echo Running compressed backup...
    powershell -ExecutionPolicy Bypass -File "backup-project.ps1" -Compress
) else (
    echo Invalid choice. Running default directory backup...
    powershell -ExecutionPolicy Bypass -File "backup-project.ps1"
)

echo.
pause