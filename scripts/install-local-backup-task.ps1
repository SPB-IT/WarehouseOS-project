[CmdletBinding()]
param([string]$TaskName = '', [string]$DailyAt = '')
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $projectDirectory 'backup.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $TaskName) { $TaskName = $config.taskName }
if (-not $DailyAt) { $DailyAt = $config.dailyAt }
$runner = Join-Path $PSScriptRoot 'run-backup.ps1'
if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory '.env.local'))) { throw 'Missing .env.local' }
if (-not (Test-Path -LiteralPath (Split-Path -Parent $config.backupDirectory))) { throw 'NAS is not accessible' }
$scheduledTime = [DateTime]::ParseExact($DailyAt, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction -Execute $powershellExe -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`"" -WorkingDirectory $projectDirectory
$trigger = New-ScheduledTaskTrigger -Daily -At $scheduledTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Back up $($config.project) to NAS daily; retain seven daily files. Requires Windows sign-in and NAS connectivity." -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output "Installed: $TaskName | Daily: $DailyAt | Destination: $($config.backupDirectory)"
