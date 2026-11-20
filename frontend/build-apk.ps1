# Build the Android APK in one step:  powershell -ExecutionPolicy Bypass -File frontend\build-apk.ps1
# Uses the Java bundled with Android Studio. Output: BodyWise.apk in the repo root.
$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
Set-Location $PSScriptRoot
$api = (Get-Content ..\.env.android | Where-Object { $_ -match '^VITE_API_BASE=' }) -replace '^VITE_API_BASE=', ''
if (-not $api) { Write-Warning 'VITE_API_BASE is empty in .env.android: AI features in the APK will not reach a server.' }
npm run build:android
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Set-Location android
.\gradlew.bat assembleDebug --no-daemon -q
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Copy-Item app\build\outputs\apk\debug\app-debug.apk ..\..\BodyWise.apk -Force
Write-Host "APK ready: $(Resolve-Path ..\..\BodyWise.apk)  (API: $api)"
