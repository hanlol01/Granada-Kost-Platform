param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Stop', 'Start')]
    [string]$Action,
    [int]$ExpectedApiPid = 0
)
$ErrorActionPreference = 'Stop'
$taskApiDirectory = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not (Test-Path -LiteralPath (Join-Path $taskApiDirectory 'dist/main.js'))) {
    throw 'Built local API entry point is required'
}
if ($Action -eq 'Stop') {
    if ($ExpectedApiPid -le 0) { throw 'An exact previously inspected API PID is required' }
    $taskListeners = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
    if ($taskListeners.Count -ne 1 -or $taskListeners[0].LocalAddress -ne '127.0.0.1' -or $taskListeners[0].OwningProcess -ne $ExpectedApiPid) {
        throw 'Local API listener changed; inspect it before stopping'
    }
    $taskApiProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$ExpectedApiPid"
    if ($taskApiProcess.Name -ne 'node.exe' -or $taskApiProcess.CommandLine -notmatch 'dist/main\.js') {
        throw 'Expected local API command not found'
    }
    Stop-Process -Id $ExpectedApiPid
    $taskRemaining = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
    if ($taskRemaining.Count -gt 0) { throw 'Port 3000 is still listening; do not migrate yet' }
    [pscustomobject]@{ StoppedApiPid = $ExpectedApiPid; Port3000Listening = $false } | ConvertTo-Json -Compress
    exit 0
}
if (@(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
    throw 'Port 3000 is in use; do not launch another API'
}
$taskNodeExecutable = (Get-Command node -ErrorAction Stop).Source
$taskLogName = 'kostation-h08-api-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
$taskLogDirectory = Join-Path ([System.IO.Path]::GetTempPath()) $taskLogName
New-Item -ItemType Directory -Path $taskLogDirectory | Out-Null
$taskStarted = Start-Process -FilePath $taskNodeExecutable -ArgumentList 'dist/main.js' `
    -WorkingDirectory $taskApiDirectory -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $taskLogDirectory 'startup.out.log') `
    -RedirectStandardError (Join-Path $taskLogDirectory 'startup.err.log')
for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
    $taskStarted.Refresh()
    if ($taskStarted.HasExited) { throw "New local API exited; inspect logs in $taskLogDirectory" }
    $taskNewListener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
    if ($taskNewListener.Count -eq 1 -and $taskNewListener[0].OwningProcess -eq $taskStarted.Id) {
        [pscustomobject]@{ ApiPid = $taskStarted.Id; LocalAddress = '127.0.0.1'; Port = 3000; Logs = $taskLogDirectory } | ConvertTo-Json -Compress
        exit 0
    }
    Start-Sleep -Milliseconds 500
}
throw "Local API did not bind its expected port; inspect logs in $taskLogDirectory"
