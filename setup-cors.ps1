# PowerShell script to set up CORS for Firebase Storage
# This script requires Google Cloud SDK to be installed

Write-Host "Setting up CORS for Firebase Storage bucket..."

# Get the project ID from .firebaserc
$firebaserc = Get-Content ".firebaserc" | ConvertFrom-Json
$projectId = $firebaserc.projects.default

if (-not $projectId) {
    Write-Error "Could not find project ID in .firebaserc"
    exit 1
}

$bucketName = "$projectId.firebasestorage.app"

Write-Host "Project ID: $projectId"
Write-Host "Bucket: $bucketName"

# Apply CORS configuration
try {
    gsutil cors set cors.json gs://$bucketName
    Write-Host "CORS configuration applied successfully!"
} catch {
    Write-Error "Failed to apply CORS configuration. Make sure Google Cloud SDK is installed and you're authenticated."
    Write-Host "To install Google Cloud SDK, visit: https://cloud.google.com/sdk/docs/install"
    Write-Host "Then run: gcloud auth login"
}