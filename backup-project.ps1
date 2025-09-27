# Routemaster Project Backup Script
# This script creates a timestamped backup of the project excluding temporary files

param(
    [string]$BackupPath = "..\routemaster-backups",
    [switch]$Compress
)

# Get current timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupName = "routemaster-backup-$timestamp"

# Create backup directory if it doesn't exist
if (!(Test-Path $BackupPath)) {
    New-Item -ItemType Directory -Path $BackupPath -Force
    Write-Host "Created backup directory: $BackupPath" -ForegroundColor Green
}

Write-Host "Starting backup of Routemaster project..." -ForegroundColor Yellow
Write-Host "Timestamp: $timestamp" -ForegroundColor Cyan

if ($Compress) {
    # Create compressed backup (ZIP)
    $zipPath = Join-Path $BackupPath "$backupName.zip"
    
    # Create temporary directory for staging
    $tempDir = Join-Path $env:TEMP $backupName
    
    # Copy files excluding problematic directories
    Write-Host "Copying files to temporary staging area..." -ForegroundColor Yellow
    robocopy "." $tempDir /E /XD ".next" "node_modules" ".git" "dist" "build" /XF "*.log" "*.tmp" /R:0 /W:0 /NJH /NJS
    
    # Compress the staged files
    Write-Host "Compressing backup..." -ForegroundColor Yellow
    Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -CompressionLevel Optimal
    
    # Clean up temporary directory
    Remove-Item $tempDir -Recurse -Force
    
    Write-Host "Compressed backup created: $zipPath" -ForegroundColor Green
} else {
    # Create directory backup
    $backupDir = Join-Path $BackupPath $backupName
    
    Write-Host "Creating directory backup..." -ForegroundColor Yellow
    $result = robocopy "." $backupDir /E /XD ".next" "node_modules" ".git" "dist" "build" /XF "*.log" "*.tmp" /R:0 /W:0
    
    if ($LASTEXITCODE -le 1) {
        Write-Host "Directory backup created: $backupDir" -ForegroundColor Green
    } else {
        Write-Host "Backup completed with warnings. Exit code: $LASTEXITCODE" -ForegroundColor Yellow
    }
}

# Display backup summary
Write-Host "`nBackup Summary:" -ForegroundColor Cyan
Write-Host "- Project: Routemaster" -ForegroundColor White
Write-Host "- Timestamp: $timestamp" -ForegroundColor White
Write-Host "- Location: $BackupPath" -ForegroundColor White
Write-Host "- Type: $(if ($Compress) { 'Compressed (ZIP)' } else { 'Directory' })" -ForegroundColor White

Write-Host "`nBackup completed successfully!" -ForegroundColor Green
Write-Host "`nUsage examples:" -ForegroundColor Cyan
Write-Host "  .\backup-project.ps1                    # Create directory backup" -ForegroundColor Gray
Write-Host "  .\backup-project.ps1 -Compress          # Create compressed backup" -ForegroundColor Gray
Write-Host "  .\backup-project.ps1 -BackupPath C:\Backups  # Custom backup location" -ForegroundColor Gray