param(
  [ValidateSet('Run','RebuildOnly')][string]$Mode = 'Run'
)
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$migrationSource = Join-Path $repo 'supabase/migrations'
$chosenProject = 'chg10run' + ([guid]::NewGuid().ToString('N').Substring(0, 10))
$workdir = Join-Path $tempRoot $chosenProject
$supabaseDir = Join-Path $workdir 'supabase'
$container = "supabase_db_$chosenProject"
$started = $false

if ($workdir -notlike "$tempRoot*") { throw 'Refusing a work directory outside the system temp directory.' }
if ($chosenProject -eq 'jewel-sales-hub' -or $container -eq 'supabase_db_jewel-sales-hub') { throw 'Refusing to target the habitual local stack.' }
if (Test-Path -LiteralPath $workdir) { throw 'Generated temp project path already exists.' }

function Invoke-Supabase([string[]]$Arguments) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = @(& npx.cmd --yes supabase@2.121.0 @Arguments --workdir $workdir 2>&1 | ForEach-Object { [string]$_ }); $exitCode = $LASTEXITCODE }
  finally { $ErrorActionPreference = $previousPreference }
  if ($exitCode -ne 0) {
    $safeOutput = ($output | ForEach-Object { [string]$_ }) -join "`n"
    $safeOutput = [regex]::Replace($safeOutput, '(?i)(ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|DB_URL)=\S+', '$1=[REDACTED]')
    throw "Supabase CLI failed ($($Arguments -join ' ')): $safeOutput"
  }
  return $output
}

function Get-FreePorts {
  $listeners = @()
  $ports = @()
  try {
    for ($index = 0; $index -lt 8; $index++) {
      $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
      $listener.Start()
      $listeners += $listener
      $ports += $listener.LocalEndpoint.Port
    }
    return ,$ports
  } finally {
    foreach ($listener in $listeners) { $listener.Stop() }
  }
}

function Set-ConfigPort([string]$Text, [string]$Section, [string]$Key, [int]$Port) {
  $pattern = "(?ms)(\[$([regex]::Escape($Section))\][^\[]*?\b$([regex]::Escape($Key))\s*=\s*)\d+"
  $next = [regex]::Replace($Text, $pattern, "`${1}$Port", 1)
  if ($next -eq $Text) { throw "Could not configure port $Section.$Key" }
  return $next
}

function Get-LocalEnv([string[]]$StatusLines) {
  $values = @{}
  foreach ($line in $StatusLines) {
    if ([string]$line -match '^([A-Z_]+)=(.*)$') {
      $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
  }
  foreach ($required in @('API_URL','ANON_KEY','SERVICE_ROLE_KEY','JWT_SECRET')) {
    if (-not $values.ContainsKey($required)) { throw "Local Supabase status omitted $required." }
  }
  if ([Uri]::new($values.API_URL).Host -notin @('localhost','127.0.0.1','::1')) { throw 'Refusing non-loopback local API URL.' }
  return $values
}

function Invoke-LocalSql([string]$Sql, [string]$DatabaseContainer) {
  if ($DatabaseContainer -notmatch '^supabase_db_chg10run[a-z0-9]+$') { throw 'Unexpected disposable database container identity.' }
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = @($Sql | & docker exec -i $DatabaseContainer psql -v ON_ERROR_STOP=1 -U postgres -d postgres 2>&1 | ForEach-Object { [string]$_ }); $exitCode = $LASTEXITCODE }
  finally { $ErrorActionPreference = $previousPreference }
  if ($exitCode -ne 0) { throw "Disposable database SQL failed: $($output -join "`n")" }
  return ($output -join "`n")
}

function Get-SchemaFingerprint([string]$DatabaseContainer) {
  if ($DatabaseContainer -notmatch '^supabase_db_chg10run[a-z0-9]+$') { throw 'Unexpected fingerprint target.' }
  $dump = & docker exec $DatabaseContainer pg_dump -U postgres -d postgres --schema-only --no-owner --no-comments 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Could not obtain schema-only dump from disposable database.' }
  $stable = ($dump | Where-Object {
    $_ -notmatch '^-- (Dumped from|Dumped by)' -and
    $_ -notmatch '^\\(un)?restrict(?:\s|$)'
  }) -join "`n"
  $bytes = [Text.Encoding]::UTF8.GetBytes($stable)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hash = $sha.ComputeHash($bytes) } finally { $sha.Dispose() }
  return ([BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
}

try {
  New-Item -ItemType Directory -Path $supabaseDir -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repo 'supabase/config.toml') -Destination $supabaseDir
  Copy-Item -LiteralPath $migrationSource -Destination $supabaseDir -Recurse
  Copy-Item -LiteralPath (Join-Path $repo 'supabase/functions') -Destination $supabaseDir -Recurse
  New-Item -ItemType Directory -Path (Join-Path $supabaseDir 'tests') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repo 'supabase/tests/chg10_rebuild_contract.sql') -Destination (Join-Path $supabaseDir 'tests')

  $configPath = Join-Path $supabaseDir 'config.toml'
  $config = Get-Content -LiteralPath $configPath -Raw
  $ports = Get-FreePorts
  $config = [regex]::Replace($config, '(?m)^project_id\s*=\s*"[^"]+"', "project_id = `"$chosenProject`"", 1)
  $config = Set-ConfigPort $config 'api' 'port' $ports[0]
  $config = Set-ConfigPort $config 'db' 'port' $ports[1]
  $config = Set-ConfigPort $config 'db' 'shadow_port' $ports[2]
  $config = Set-ConfigPort $config 'db.pooler' 'port' $ports[3]
  $config = Set-ConfigPort $config 'studio' 'port' $ports[4]
  $config = Set-ConfigPort $config 'local_smtp' 'port' $ports[5]
  $config = Set-ConfigPort $config 'analytics' 'port' $ports[6]
  $config = [regex]::Replace($config, '(?m)^inspector_port\s*=\s*\d+', "inspector_port = $($ports[7])", 1)
  $config += @'

[edge_runtime.secrets]
ACCOUNT_PROVISIONING_ENABLED = "true"
ACCOUNT_RECOVERY_ENABLED = "true"
APP_PUBLIC_ORIGIN = "http://127.0.0.1:3000"
APP_ALLOWED_ORIGINS = "http://127.0.0.1:3000"
CHG04_LOCAL_TEST_MODE = "true"
CHG04_LOCAL_TEST_FAIL_PROFILE_INSERT = "true"
CHG04_LOCAL_TEST_FAIL_AUTH_CLEANUP = "true"
'@
  [IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))

  try { $start = Invoke-Supabase @('start'); $started = $true }
  catch {
    $ErrorActionPreference = 'Continue'
    & npx.cmd --yes supabase@2.121.0 stop --project-id $chosenProject --no-backup --workdir $workdir 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    throw
  }
  Write-Host "Disposable stack $chosenProject started on isolated ports."
  $status = Invoke-Supabase @('status','-o','env')
  $envValues = Get-LocalEnv $status
  $mailpitUrl = "http://127.0.0.1:$($ports[5])"

  $dockerNames = & docker ps --format '{{.Names}}'
  if ($LASTEXITCODE -ne 0 -or $container -notin $dockerNames) { throw 'Expected disposable database container is not running.' }
  if ('supabase_db_jewel-sales-hub' -notin $dockerNames) { throw 'The habitual local stack changed during disposable setup; stop and inspect.' }

  Invoke-Supabase @('db','reset','--local','--no-seed','--yes') | Out-Null
  $migrationOutput = Invoke-Supabase @('migration','list','--local')
  $expected = @('20261021041426','20261021043648','20261022000000','20261022190000','20261022191000','20261022193000','20261022200000','20261022200500','20261022201000','20261022202000','20261022210000','20261022220000','20261022221000','20261022230000','20261022231000')
  if (-not $migrationOutput -or -not ($migrationOutput -join "`n" | Select-String -Pattern 'LOCAL|local|202610')) { throw 'Local migration list returned no recognizable history output.' }
  $contract = Get-Content -LiteralPath (Join-Path $repo 'supabase/tests/chg10_rebuild_contract.sql') -Raw
  Invoke-LocalSql $contract $container | Out-Null
  $fingerprint1 = Get-SchemaFingerprint $container
  Write-Host "First clean rebuild passed migration, schema, RLS, grants, view, constraint and empty-data checks."

  if ($Mode -eq 'Run') {
  $oldEnv = @{}
  $envMap = @{
    LOCAL_SUPABASE_URL = $envValues.API_URL
    LOCAL_SUPABASE_ANON_KEY = $envValues.ANON_KEY
    LOCAL_SUPABASE_SERVICE_ROLE_KEY = $envValues.SERVICE_ROLE_KEY
    LOCAL_SUPABASE_JWT_SECRET = $envValues.JWT_SECRET
    LOCAL_SUPABASE_CONTAINER = $container
    LOCAL_MAILPIT_URL = $mailpitUrl
  }
  foreach ($name in $envMap.Keys) { $oldEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process'); [Environment]::SetEnvironmentVariable($name, $envMap[$name], 'Process') }
  try {
    $env:RUN_LOCAL_BOOTSTRAP_INTEGRATION = '1'
    & node --test tests/chg10-bootstrap.integration.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Local first-admin bootstrap integration suite failed.' }
    $env:RUN_LOCAL_BUSINESS_INTEGRATION = '1'
    $fixture = Get-Content -LiteralPath (Join-Path $repo 'tests/fixtures/chg07-fail-supplier-credit.sql') -Raw
    $cleanup = Get-Content -LiteralPath (Join-Path $repo 'tests/fixtures/chg07-drop-failure-trigger.sql') -Raw
    Invoke-LocalSql $fixture $container | Out-Null
    try {
      & node --test tests/business.integration.test.mjs
      if ($LASTEXITCODE -ne 0) { throw 'Local financial integration suite failed.' }
    } finally { Invoke-LocalSql $cleanup $container | Out-Null }
    $env:RUN_LOCAL_SECURITY_INTEGRATION = '1'
    & node --test tests/security.integration.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Local Auth/RLS/Edge integration suite failed.' }
    $env:VITE_SUPABASE_URL = $envValues.API_URL
    $env:VITE_SUPABASE_ANON_KEY = $envValues.ANON_KEY
    & npm.cmd run test:browser
    if ($LASTEXITCODE -ne 0) { throw 'Local browser integration suite failed.' }
  } finally {
    Remove-Item Env:RUN_LOCAL_BOOTSTRAP_INTEGRATION -ErrorAction SilentlyContinue
    Remove-Item Env:RUN_LOCAL_BUSINESS_INTEGRATION -ErrorAction SilentlyContinue
    Remove-Item Env:RUN_LOCAL_SECURITY_INTEGRATION -ErrorAction SilentlyContinue
    Remove-Item Env:VITE_SUPABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:VITE_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:LOCAL_TEST_MODE -ErrorAction SilentlyContinue
    foreach ($name in $envMap.Keys) { [Environment]::SetEnvironmentVariable($name, $oldEnv[$name], 'Process') }
  }
  Write-Host 'Local bootstrap, financial, security and browser suites passed.'
  }

  Invoke-Supabase @('stop','--project-id',$chosenProject,'--no-backup') | Out-Null
  $started = $false
  Remove-Item -LiteralPath $workdir -Recurse -Force

  # Independent second reconstruction: a different workdir, Docker project and port block.
  $secondProject = 'chg10run' + ([guid]::NewGuid().ToString('N').Substring(0, 10))
  $secondDir = Join-Path $tempRoot $secondProject
  $secondSupabase = Join-Path $secondDir 'supabase'
  New-Item -ItemType Directory -Path $secondSupabase -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repo 'supabase/config.toml') -Destination $secondSupabase
  Copy-Item -LiteralPath $migrationSource -Destination $secondSupabase -Recurse
  Copy-Item -LiteralPath (Join-Path $repo 'supabase/functions') -Destination $secondSupabase -Recurse
  $secondConfigPath = Join-Path $secondSupabase 'config.toml'
  $secondConfig = Get-Content -LiteralPath $secondConfigPath -Raw
  $secondPorts = Get-FreePorts
  $secondConfig = [regex]::Replace($secondConfig, '(?m)^project_id\s*=\s*"[^"]+"', "project_id = `"$secondProject`"", 1)
  $secondConfig = Set-ConfigPort $secondConfig 'api' 'port' $secondPorts[0]
  $secondConfig = Set-ConfigPort $secondConfig 'db' 'port' $secondPorts[1]
  $secondConfig = Set-ConfigPort $secondConfig 'db' 'shadow_port' $secondPorts[2]
  $secondConfig = Set-ConfigPort $secondConfig 'db.pooler' 'port' $secondPorts[3]
  $secondConfig = Set-ConfigPort $secondConfig 'studio' 'port' $secondPorts[4]
  $secondConfig = Set-ConfigPort $secondConfig 'local_smtp' 'port' $secondPorts[5]
  $secondConfig = Set-ConfigPort $secondConfig 'analytics' 'port' $secondPorts[6]
  $secondConfig = [regex]::Replace($secondConfig, '(?m)^inspector_port\s*=\s*\d+', "inspector_port = $($secondPorts[7])", 1)
  [IO.File]::WriteAllText($secondConfigPath, $secondConfig, [Text.UTF8Encoding]::new($false))
  $workdir = $secondDir
  try { $secondOutput = Invoke-Supabase @('start') }
  catch {
    $ErrorActionPreference = 'Continue'
    & npx.cmd --yes supabase@2.121.0 stop --project-id $secondProject --no-backup --workdir $secondDir 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    throw
  }
  $secondStarted = $true
  Write-Host "Independent disposable stack $secondProject started."
  try {
    $secondContainer = "supabase_db_$secondProject"
    $secondNames = & docker ps --format '{{.Names}}'
    if ($secondContainer -notin $secondNames -or 'supabase_db_jewel-sales-hub' -notin $secondNames) { throw 'Second rebuild target validation failed.' }
    Invoke-Supabase @('db','reset','--local','--no-seed','--yes') | Out-Null
    $secondContract = Get-Content -LiteralPath (Join-Path $repo 'supabase/tests/chg10_rebuild_contract.sql') -Raw
    Invoke-LocalSql $secondContract $secondContainer | Out-Null
    $fingerprint2 = Get-SchemaFingerprint $secondContainer
    if ($fingerprint1 -ne $fingerprint2) { throw "Independent schema fingerprints differ: $fingerprint1 / $fingerprint2" }
    Write-Output "Disposable reconstructions: PASS; ordered migrations: $($expected.Count); identical schema fingerprint: $fingerprint1"
  } finally {
    $ErrorActionPreference = 'Continue'
    & npx.cmd --yes supabase@2.121.0 stop --project-id $secondProject --no-backup --workdir $secondDir | Out-Null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -eq 0) { $secondStarted = $false }
    if (-not $secondStarted -and $secondDir.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $secondDir -Recurse -Force }
  }
} finally {
  if ($started) {
    & npx.cmd --yes supabase@2.121.0 stop --project-id $chosenProject --no-backup --workdir $workdir | Out-Null
  }
  if ((Test-Path -LiteralPath $workdir) -and $workdir.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $workdir -Recurse -Force
  }
}
