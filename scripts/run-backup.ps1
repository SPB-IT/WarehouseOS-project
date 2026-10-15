$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectDirectory '.backup-logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Continue'
& $nodeCommand.Source (Join-Path $PSScriptRoot 'backup-local.mjs') *> (Join-Path $logDirectory 'latest.log')
exit $LASTEXITCODE
