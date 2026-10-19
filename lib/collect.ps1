param(
    [int]$Hours = 24,
    [int]$MaxDumps = 40
)

$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$hoursAbs = [Math]::Abs($Hours)
if ($hoursAbs -lt 1) { $hoursAbs = 1 }
if ($hoursAbs -gt 720) { $hoursAbs = 720 }
$start = (Get-Date).AddHours(-$hoursAbs)

function To-Iso([object]$value) {
    if ($null -eq $value) { return $null }
    try { return ([datetime]$value).ToUniversalTime().ToString('o') } catch { return $null }
}

function Get-Prop($event, [int]$index) {
    try {
        if ($event.Properties.Count -gt $index) {
            $v = $event.Properties[$index].Value
            if ($null -eq $v) { return $null }
            return [string]$v
        }
    } catch { }
    return $null
}

function Short-Message($event) {
    try {
        $m = [string]$event.Message
        if ([string]::IsNullOrWhiteSpace($m)) { return $null }
        $m = $m -replace "`r?`n", ' / '
        if ($m.Length -gt 320) { $m = $m.Substring(0, 320) + '...' }
        return $m
    } catch { return $null }
}

function Hex32([object]$value) {
    try {
        $n = [uint32]$value
        return ('0x{0:x8}' -f $n)
    } catch { return $null }
}

function Read-WerReport([string]$reportPath) {
    if ([string]::IsNullOrWhiteSpace($reportPath)) { return $null }
    $path = $reportPath -replace '^\\\\\?\\', ''
    $wer = Join-Path $path 'Report.wer'
    if (-not (Test-Path -LiteralPath $wer)) { return $null }
    $map = @{}
    try {
        foreach ($line in (Get-Content -LiteralPath $wer -Encoding Unicode -ErrorAction Stop)) {
            $idx = $line.IndexOf('=')
            if ($idx -gt 0) {
                $k = $line.Substring(0, $idx)
                if (-not $map.ContainsKey($k)) { $map[$k] = $line.Substring($idx + 1) }
            }
        }
    } catch { return $null }
    return [pscustomobject]@{
        app           = $map['Sig[0].Value']
        appVersion    = $map['Sig[1].Value']
        module        = $map['Sig[3].Value']
        moduleVersion = $map['Sig[4].Value']
        exceptionCode = $map['Sig[6].Value']
        faultOffset   = $map['Sig[7].Value']
        eventType     = $map['EventType']
        bucket        = $map['Response.BucketId']
        appPath       = $map['UI[2]']
        loadedModule0 = $map['LoadedModule[0]']
    }
}

# ---------------------------------------------------------------- Application
$appEvents = @()
try {
    $events = Get-WinEvent -FilterHashtable @{
        LogName   = 'Application'
        Id        = 1000, 1001, 1002, 1026
        StartTime = $start
    } -ErrorAction Stop
} catch {
    $events = @()
}

foreach ($e in @($events)) {
    $rec = [ordered]@{
        log      = 'Application'
        id       = [int]$e.Id
        recordId = [long]$e.RecordId
        time     = (To-Iso $e.TimeCreated)
        provider = [string]$e.ProviderName
        level    = [string]$e.LevelDisplayName
        type     = 'other'
    }

    switch ([int]$e.Id) {
        1000 {
            if ($e.ProviderName -ne 'Application Error') { break }
            $rec.type            = 'crash'
            $rec.app             = Get-Prop $e 0
            $rec.appVersion      = Get-Prop $e 1
            $rec.appTimestamp    = Get-Prop $e 2
            $rec.module          = Get-Prop $e 3
            $rec.moduleVersion   = Get-Prop $e 4
            $rec.moduleTimestamp = Get-Prop $e 5
            $rec.exceptionCode   = Get-Prop $e 6
            $rec.faultOffset     = Get-Prop $e 7
            $rec.processId       = Get-Prop $e 8
            $rec.appStartTime    = Get-Prop $e 9
            $rec.appPath         = Get-Prop $e 10
            $rec.modulePath      = Get-Prop $e 11
            $rec.reportId        = Get-Prop $e 12
        }
        1002 {
            if ($e.ProviderName -ne 'Application Hang') { break }
            $rec.type         = 'hang'
            $rec.app          = Get-Prop $e 0
            $rec.appVersion   = Get-Prop $e 1
            $rec.appTimestamp = Get-Prop $e 2
            $rec.hangType     = Get-Prop $e 3
            $rec.message      = Short-Message $e
        }
        1026 {
            if ($e.ProviderName -ne '.NET Runtime') { break }
            $rec.type    = 'dotnet'
            $rec.app     = 'unknown'
            $rec.message = Short-Message $e
            if ($rec.message -match 'Application:\s*([^\s/]+)') { $rec.app = $matches[1] }
        }
        1001 {
            if ($e.ProviderName -ne 'Windows Error Reporting') { break }
            $eventType = Get-Prop $e 2
            if ([string]::IsNullOrWhiteSpace($eventType)) { break }
            if ($eventType -cnotmatch '^(APPCRASH|APPHANG|BEX|CLR|MoApp|AppHang)') { break }
            $rec.type            = 'wer'
            $rec.eventType       = $eventType
            $rec.bucket          = Get-Prop $e 0
            $rec.app             = Get-Prop $e 5
            $rec.appVersion      = Get-Prop $e 6
            $rec.appTimestamp    = Get-Prop $e 7
            $rec.module          = Get-Prop $e 8
            $rec.moduleVersion   = Get-Prop $e 9
            $rec.moduleTimestamp = Get-Prop $e 10
            $rec.exceptionCode   = Get-Prop $e 11
            $rec.faultOffset     = Get-Prop $e 12
            $reportPath          = Get-Prop $e 16
            if (-not [string]::IsNullOrWhiteSpace($reportPath)) {
                $rec.reportPath = $reportPath -replace '^\\\\\?\\', ''
                $wer = Read-WerReport $rec.reportPath
                if ($null -ne $wer) {
                    $rec.wer = $wer
                    if ([string]::IsNullOrWhiteSpace($rec.app) -and $wer.app) { $rec.app = $wer.app }
                    if ([string]::IsNullOrWhiteSpace($rec.appPath) -and $wer.appPath) { $rec.appPath = $wer.appPath }
                }
            }
        }
    }

    if ($rec.type -ne 'other') {
        $hasApp = -not [string]::IsNullOrWhiteSpace($rec.app)
        if ($hasApp -or $rec.type -eq 'dotnet') {
            $appEvents += [pscustomobject]$rec
        }
    }
}

# --------------------------------------------------------------------- System
$systemEvents = @()
try {
    $sys = Get-WinEvent -FilterHashtable @{
        LogName   = 'System'
        Id        = 41, 1001, 4101, 6008
        StartTime = $start
    } -ErrorAction Stop
} catch {
    $sys = @()
}

foreach ($e in @($sys)) {
    $rec = [ordered]@{
        log      = 'System'
        id       = [int]$e.Id
        recordId = [long]$e.RecordId
        time     = (To-Iso $e.TimeCreated)
        provider = [string]$e.ProviderName
        level    = [string]$e.LevelDisplayName
        message  = Short-Message $e
        kind     = 'other'
    }

    if ([int]$e.Id -eq 4101) {
        $rec.kind = 'tdr'
    } elseif ([int]$e.Id -eq 41) {
        $rec.kind = 'power'
        $rec.bugcheckCode = Hex32 (Get-Prop $e 0)
        $rec.bugcheckParameters = @(
            Get-Prop $e 1, Get-Prop $e 2, Get-Prop $e 3, Get-Prop $e 4
        )
    } elseif ([int]$e.Id -eq 6008) {
        $rec.kind = 'shutdown'
    } elseif ([int]$e.Id -eq 1001 -and $e.ProviderName -match 'SystemErrorReporting|BugCheck') {
        $rec.kind = 'bugcheck'
        $rec.bugcheckCode = Hex32 (Get-Prop $e 0)
        $rec.bugcheckParameters = @(
            Get-Prop $e 1, Get-Prop $e 2, Get-Prop $e 3, Get-Prop $e 4
        )
        $rec.dumpPath = Get-Prop $e 5
    }

    if ($rec.kind -ne 'other') {
        $systemEvents += [pscustomobject]$rec
    }
}

# ------------------------------------------------------------------ Dump files
$dumps = @()
$dumpDirs = @(
    (Join-Path $env:LOCALAPPDATA 'CrashDumps'),
    'C:\Windows\Minidump',
    'C:\Windows\LiveKernelReports'
)
foreach ($dir in $dumpDirs) {
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    try {
        Get-ChildItem -LiteralPath $dir -Filter *.dmp -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -ge $start } |
            Select-Object -First $MaxDumps |
            ForEach-Object {
                $kind = 'user'
                if ($dir -match 'Minidump') { $kind = 'bugcheck' }
                if ($dir -match 'LiveKernel') { $kind = 'livekernel' }
                $dumps += [pscustomobject]@{
                    path   = $_.FullName
                    sizeMB = [Math]::Round($_.Length / 1MB, 2)
                    time   = (To-Iso $_.LastWriteTime)
                    kind   = $kind
                }
            }
    } catch { }
}

# ----------------------------------------------------------- Record checkpoints
function Get-MaxRecordId([string]$logName) {
    try {
        $latest = Get-WinEvent -LogName $logName -MaxEvents 1 -ErrorAction Stop
        if ($null -ne $latest) { return [long]$latest.RecordId }
    } catch { }
    return [long]0
}

$maxApp = Get-MaxRecordId 'Application'
$maxSys = Get-MaxRecordId 'System'

$result = [pscustomobject]@{
    ok           = $true
    generatedAt  = (To-Iso (Get-Date))
    windowStart  = (To-Iso $start)
    hours        = $hoursAbs
    events       = @($appEvents | Sort-Object time)
    system       = @($systemEvents | Sort-Object time)
    dumps        = @($dumps | Sort-Object time -Descending)
    maxRecordIds = [pscustomobject]@{
        Application = $maxApp
        System      = $maxSys
    }
    errors       = @()
}

try {
    $result | ConvertTo-Json -Depth 8 -Compress
} catch {
    [pscustomobject]@{
        ok     = $false
        error  = [string]$_.Exception.Message
        events = @()
        system = @()
        dumps  = @()
    } | ConvertTo-Json -Depth 5 -Compress
}
