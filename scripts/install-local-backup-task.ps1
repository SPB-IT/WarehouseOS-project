[CmdletBinding()]
param(
  [string]$TaskName = 'WarehouseOS Daily Local Backup',
  [string]$DailyAt = '20:00'
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$backupScript = Join-Path $PSScriptRoot 'backup-local.mjs'
$envFile = Join-Path $projectDirectory '.env.local'
$nodeCommand = Get-Command node.exe -ErrorAction Stop

if (-not (Test-Path -LiteralPath $backupScript -PathType Leaf)) {
  throw "Backup script not found: $backupScript"
}
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw "Supabase settings not found: $envFile"
}

$scheduledTime = [DateTime]::ParseExact(
  $DailyAt,
  'HH:mm',
  [Globalization.CultureInfo]::InvariantCulture
)
$action = New-ScheduledTaskAction `
  -Execute $nodeCommand.Source `
  -Argument "`"$backupScript`"" `
  -WorkingDirectory $projectDirectory
$trigger = New-ScheduledTaskTrigger -Daily -At $scheduledTime
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Back up WarehouseOS to a local JSON file and retain the latest seven daily files.' `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

$backupDirectory = Join-Path $env:USERPROFILE 'WarehouseOS-Backups'
Write-Host "Installed scheduled task: $TaskName"
Write-Host "Daily time: $DailyAt (a missed run starts when Windows is next available)"
Write-Host "Backup folder: $backupDirectory"
