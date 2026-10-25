param([switch]$IntegrationOnly, [switch]$BrowserTests)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$source = Join-Path $repo 'supabase'
$migrationName = '20261024051641_chg12_flexible_product_catalog.sql'
$migrationPath = Join-Path $source "migrations/$migrationName"
if (-not (Test-Path -LiteralPath $migrationPath)) { throw 'CHG-12 migration is missing.' }

function Get-FreePorts {
  $listeners = @(); $ports = @()
  try {
    for ($i = 0; $i -lt 8; $i++) {
      $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
      $listener.Start(); $listeners += $listener; $ports += $listener.LocalEndpoint.Port
    }
    return ,$ports
  } finally { foreach ($listener in $listeners) { $listener.Stop() } }
}

function Set-Port([string]$Text, [string]$Section, [string]$Key, [int]$Port) {
  $pattern = "(?ms)(\[$([regex]::Escape($Section))\][^\[]*?\b$([regex]::Escape($Key))\s*=\s*)\d+"
  $result = [regex]::Replace($Text, $pattern, "`${1}$Port", 1)
  if ($result -eq $Text) { throw "Could not assign disposable port $Section.$Key." }
  return $result
}

function Invoke-Cli([string]$WorkDir, [string[]]$CliArgs) {
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = @(& npx.cmd --yes supabase@2.121.0 @CliArgs --workdir $WorkDir 2>&1 | ForEach-Object { [string]$_ }); $exitCode = $LASTEXITCODE }
  finally { $ErrorActionPreference = $oldPreference }
  if ($exitCode -ne 0) {
    $safe = ($output -join "`n") -replace '(?i)(ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|DB_URL)=\S+', '$1=[REDACTED]'
    throw "Supabase CLI failed ($($CliArgs -join ' ')): $safe"
  }
  return $output
}

function New-TestProject([string]$ProjectId, [bool]$IncludeChg12) {
  $workdir = Join-Path $tempRoot $ProjectId
  if (-not $workdir.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Disposable path escaped the system temp directory.' }
  if (Test-Path -LiteralPath $workdir) { throw 'Disposable path already exists.' }
  $supabase = Join-Path $workdir 'supabase'
  New-Item -ItemType Directory -Path (Join-Path $supabase 'migrations') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $source 'config.toml') -Destination $supabase
  $migrations = Get-ChildItem -LiteralPath (Join-Path $source 'migrations') -File |
    Where-Object { $IncludeChg12 -or $_.Name -ne $migrationName }
  foreach ($file in $migrations) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $supabase 'migrations') }
  Copy-Item -LiteralPath (Join-Path $source 'functions') -Destination $supabase -Recurse
  New-Item -ItemType Directory -Path (Join-Path $supabase 'tests') -Force | Out-Null

  $configPath = Join-Path $supabase 'config.toml'
  $config = Get-Content -LiteralPath $configPath -Raw
  $ports = Get-FreePorts
  $config = [regex]::Replace($config, '(?m)^project_id\s*=\s*"[^"]+"', "project_id = `"$ProjectId`"", 1)
  $config = Set-Port $config 'api' 'port' $ports[0]
  $config = Set-Port $config 'db' 'port' $ports[1]
  $config = Set-Port $config 'db' 'shadow_port' $ports[2]
  $config = Set-Port $config 'db.pooler' 'port' $ports[3]
  $config = Set-Port $config 'studio' 'port' $ports[4]
  $config = Set-Port $config 'local_smtp' 'port' $ports[5]
  $config = Set-Port $config 'analytics' 'port' $ports[6]
  $config = [regex]::Replace($config, '(?m)^inspector_port\s*=\s*\d+', "inspector_port = $($ports[7])", 1)
  if ($config -notmatch '(?ms)\[db\.seed\].*?enabled\s*=\s*false.*?sql_paths\s*=\s*\[\]') { throw 'Test project seeding is not explicitly disabled.' }
  $config += @'

[edge_runtime.secrets]
ACCOUNT_PROVISIONING_ENABLED = "true"
ACCOUNT_RECOVERY_ENABLED = "true"
APP_PUBLIC_ORIGIN = "http://127.0.0.1:5174"
APP_ALLOWED_ORIGINS = "http://127.0.0.1:5174"
CHG04_LOCAL_TEST_MODE = "true"
CHG04_LOCAL_TEST_FAIL_PROFILE_INSERT = "true"
CHG04_LOCAL_TEST_FAIL_AUTH_CLEANUP = "true"
'@
  [IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))
  return @{ WorkDir = $workdir; Container = "supabase_db_$ProjectId"; Ports = $ports; Started = $false }
}

function Invoke-LocalSql([string]$Container, [string]$Sql) {
  if ($Container -notmatch '^supabase_db_chg12[a-z0-9]+$') { throw 'Refusing SQL on an unrecognized database container.' }
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = @($Sql | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres 2>&1 | ForEach-Object { [string]$_ }); $exitCode = $LASTEXITCODE }
  finally { $ErrorActionPreference = $oldPreference }
  if ($exitCode -ne 0) { throw "Disposable PostgreSQL assertion failed: $($output -join "`n")" }
  return ($output -join "`n")
}

function Start-TestProject([hashtable]$Project) {
  $null = Invoke-Cli $Project.WorkDir @('start')
  $Project.Started = $true
  $names = & docker ps --format '{{.Names}}'
  if ($LASTEXITCODE -ne 0 -or $Project.Container -notin $names) { throw 'The expected disposable PostgreSQL container did not start.' }
}

function Stop-TestProject([hashtable]$Project) {
  if ($Project.Started) {
    # The explicit project ID is the selector for stop; do not use --all.
    $projectId = Split-Path -Leaf $Project.WorkDir
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $output = @(& npx.cmd --yes supabase@2.121.0 stop --project-id $projectId --no-backup 2>&1 | ForEach-Object { [string]$_ }); $exitCode = $LASTEXITCODE }
    finally { $ErrorActionPreference = $oldPreference }
    if ($exitCode -ne 0) { throw "Could not stop disposable Supabase project $projectId : $($output -join "`n")" }
    $Project.Started = $false
  }
  if (Test-Path -LiteralPath $Project.WorkDir) {
    $resolved = (Resolve-Path -LiteralPath $Project.WorkDir).Path
    if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing cleanup outside the temp directory.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}

function Get-Fingerprint([string]$Container) {
  $dump = & docker exec $Container pg_dump -U postgres -d postgres --schema-only --no-owner --no-comments 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Could not fingerprint disposable database schema.' }
  $stable = ($dump | Where-Object { $_ -notmatch '^-- (Dumped from|Dumped by)' -and $_ -notmatch '^\\(un)?restrict(?:\s|$)' }) -join "`n"
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($stable)))).Replace('-','').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

$initialContainers = @(& docker ps --format '{{.Names}}')
if ($LASTEXITCODE -ne 0) { throw 'Docker is unavailable; local migration verification cannot run.' }
$habitualWasRunning = 'supabase_db_jewel-sales-hub' -in $initialContainers
$projects = [System.Collections.Generic.List[hashtable]]::new()
try {
  $full = New-TestProject ('chg12full' + [guid]::NewGuid().ToString('N').Substring(0,8)) $true
  $projects.Add($full)
  Start-TestProject $full
  $null = Invoke-Cli $full.WorkDir @('db','reset','--local','--no-seed','--yes')
  $migrationAssertion = Get-Content -LiteralPath (Join-Path $source 'tests/chg10_rebuild_contract.sql') -Raw
  $null = Invoke-LocalSql $full.Container $migrationAssertion
  $null = Invoke-LocalSql $full.Container (Get-Content -LiteralPath (Join-Path $source 'tests/chg12_product_catalog.sql') -Raw)
  $fingerprint1 = Get-Fingerprint $full.Container
  Write-Host "Full clean rebuild 1/2 passed (16 migrations; schema fingerprint $fingerprint1)."

  if ($IntegrationOnly -or $BrowserTests -or $env:RUN_LOCAL_CATALOG_INTEGRATION -eq '1') {
    $status = Invoke-Cli $full.WorkDir @('status','-o','env')
    $values = @{}
    foreach ($line in $status) { if ([string]$line -match '^([A-Z_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") } }
    foreach ($required in @('API_URL','ANON_KEY','SERVICE_ROLE_KEY','JWT_SECRET')) { if (-not $values.ContainsKey($required)) { throw "Local status omitted $required." } }
    if ([Uri]::new($values.API_URL).Host -notin @('localhost','127.0.0.1','::1')) { throw 'Integration tests require a loopback Supabase URL.' }
    $saved = @{}
    $map = @{
      LOCAL_SUPABASE_URL=$values.API_URL; LOCAL_SUPABASE_ANON_KEY=$values.ANON_KEY;
      LOCAL_SUPABASE_SERVICE_ROLE_KEY=$values.SERVICE_ROLE_KEY; LOCAL_SUPABASE_JWT_SECRET=$values.JWT_SECRET;
      LOCAL_SUPABASE_CONTAINER=$full.Container; LOCAL_MAILPIT_URL="http://127.0.0.1:$($full.Ports[5])";
      VITE_SUPABASE_URL=$values.API_URL; VITE_SUPABASE_ANON_KEY=$values.ANON_KEY
    }
    foreach ($key in $map.Keys) { $saved[$key] = [Environment]::GetEnvironmentVariable($key,'Process'); [Environment]::SetEnvironmentVariable($key,$map[$key],'Process') }
    try {
      if ($BrowserTests) {
        $env:CHG13_DISPOSABLE_TESTS='1'
        if ($env:CHG13_CATALOG_ONLY -eq '1') { & npm.cmd run test:browser -- tests/browser/chg13-inventory-catalog.spec.mjs }
        else { & npm.cmd run test:browser }
        if ($LASTEXITCODE -ne 0) { throw 'Disposable local browser suite failed.' }
      }
      $env:RUN_LOCAL_SECURITY_INTEGRATION='1'
      & node --test tests/security.integration.test.mjs
      if ($LASTEXITCODE -ne 0) { throw 'CHG-12 Auth/RLS integration suite failed.' }
      $env:RUN_LOCAL_BUSINESS_INTEGRATION='1'
      $businessFixture = Get-Content -LiteralPath (Join-Path $repo 'tests/fixtures/chg07-fail-supplier-credit.sql') -Raw
      $businessCleanup = Get-Content -LiteralPath (Join-Path $repo 'tests/fixtures/chg07-drop-failure-trigger.sql') -Raw
      $null = Invoke-LocalSql $full.Container $businessFixture
      try {
        & node --test tests/business.integration.test.mjs
        if ($LASTEXITCODE -ne 0) { throw 'CHG-12 financial integration suite failed.' }
      } finally { $null = Invoke-LocalSql $full.Container $businessCleanup }
    } finally {
      Remove-Item Env:RUN_LOCAL_SECURITY_INTEGRATION,Env:RUN_LOCAL_BUSINESS_INTEGRATION,Env:CHG13_DISPOSABLE_TESTS -ErrorAction SilentlyContinue
      foreach ($key in $map.Keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key],'Process') }
    }
  }
  Stop-TestProject $full
  if ($IntegrationOnly -or $BrowserTests) {
    Write-Host 'Disposable local Auth/RLS, financial integration, and requested browser suites completed.'
    return
  }

  $second = New-TestProject ('chg12full' + [guid]::NewGuid().ToString('N').Substring(0,8)) $true
  $projects.Add($second)
  Start-TestProject $second
  $null = Invoke-Cli $second.WorkDir @('db','reset','--local','--no-seed','--yes')
  $null = Invoke-LocalSql $second.Container $migrationAssertion
  $null = Invoke-LocalSql $second.Container (Get-Content -LiteralPath (Join-Path $source 'tests/chg12_product_catalog.sql') -Raw)
  $fingerprint2 = Get-Fingerprint $second.Container
  if ($fingerprint1 -ne $fingerprint2) { throw "Independent clean rebuilds differ: $fingerprint1 / $fingerprint2" }
  Write-Host "Full clean rebuild 2/2 passed; independent schema fingerprints match: $fingerprint2."
  Stop-TestProject $second

  $upgrade = New-TestProject ('chg12upgrade' + [guid]::NewGuid().ToString('N').Substring(0,6)) $false
  $projects.Add($upgrade)
  Start-TestProject $upgrade
  $null = Invoke-Cli $upgrade.WorkDir @('db','reset','--local','--no-seed','--yes')
  $null = Invoke-LocalSql $upgrade.Container (Get-Content -LiteralPath (Join-Path $source 'tests/chg12_synthetic_upgrade_seed.sql') -Raw)
  Copy-Item -LiteralPath $migrationPath -Destination (Join-Path $upgrade.WorkDir "supabase/migrations/$migrationName")
  $null = Invoke-Cli $upgrade.WorkDir @('migration','up','--local')
  $null = Invoke-LocalSql $upgrade.Container (Get-Content -LiteralPath (Join-Path $source 'tests/chg12_synthetic_upgrade_contract.sql') -Raw)
  $null = Invoke-LocalSql $upgrade.Container (Get-Content -LiteralPath (Join-Path $source 'tests/chg12_product_catalog.sql') -Raw)
  Write-Host 'Synthetic upgrade passed: UUIDs, SKU, DOP amounts, stock, sale snapshots, purchase references and legacy attribute mapping were preserved.'
  Stop-TestProject $upgrade
} finally {
  foreach ($project in $projects) {
    if (Test-Path -LiteralPath $project.WorkDir) { Stop-TestProject $project }
  }
  $finalContainers = @(& docker ps --format '{{.Names}}')
  if ($LASTEXITCODE -ne 0) { throw 'Could not verify the final Docker state.' }
  if ($habitualWasRunning -ne ('supabase_db_jewel-sales-hub' -in $finalContainers)) { throw 'The habitual local Supabase container state changed during isolated testing.' }
  $remainingTestContainers = @($finalContainers | Where-Object { $_ -match '^supabase_db_chg12(full|upgrade)[a-z0-9]+$' })
  foreach ($container in $remainingTestContainers) {
    $projectId = $container -replace '^supabase_db_', ''
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $stopOutput = @(& npx.cmd --yes supabase@2.121.0 stop --project-id $projectId --no-backup 2>&1 | ForEach-Object { [string]$_ }); $stopCode = $LASTEXITCODE }
    finally { $ErrorActionPreference = $oldPreference }
    if ($stopCode -ne 0) { throw "Could not clean disposable project $projectId : $($stopOutput -join "`n")" }
  }
  $finalContainers = @(& docker ps --format '{{.Names}}')
  if ($finalContainers | Where-Object { $_ -match '^supabase_db_chg12(full|upgrade)[a-z0-9]+$' }) { throw 'A CHG-12 disposable database container remains running after exact project shutdown.' }
}
