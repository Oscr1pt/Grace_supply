$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$projectId = 'gracereportshttp' + ([guid]::NewGuid().ToString('N').Substring(0, 10))
$workdir = Join-Path $tempRoot $projectId
$supabaseDir = Join-Path $workdir 'supabase'
$dbContainer = "supabase_db_$projectId"

if (-not $workdir.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing a disposable Supabase workdir outside the Windows temp directory.'
}
if ($projectId -eq 'jewel-sales-hub' -or $projectId -notmatch '^gracereportshttp[a-f0-9]{10}$') {
  throw 'Unexpected disposable project identity.'
}
if (Test-Path -LiteralPath $workdir) { throw 'Generated disposable project path already exists.' }

function Invoke-Supabase([string[]]$Arguments) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = @(
      & npx.cmd --offline --yes supabase@2.121.0 @Arguments --workdir $workdir 2>&1 |
        ForEach-Object { [string]$_ }
    )
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  $safe = ($output -join "`n")
  $safe = $safe -replace '(?im)^\s*(ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|DB_URL|anon key|service.role key|db url)\s*[:=].*$', '$1=[REDACTED]'
  $safe = $safe -replace 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[JWT REDACTED]'
  if ($exitCode -ne 0) { throw "Supabase CLI failed ($($Arguments -join ' ')), exit code $exitCode`: $safe" }
  return $safe
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
  $updated = [regex]::Replace($Text, $pattern, "`${1}$Port", 1)
  if ($updated -eq $Text) { throw "Could not configure local port $Section.$Key" }
  return $updated
}

New-Item -ItemType Directory -Path $supabaseDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'supabase/config.toml') -Destination $supabaseDir
Copy-Item -LiteralPath (Join-Path $repo 'supabase/migrations') -Destination $supabaseDir -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'supabase/functions') -Destination (Join-Path $supabaseDir 'functions') -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'supabase/tests') -Destination (Join-Path $supabaseDir 'tests') -Recurse

$configPath = Join-Path $supabaseDir 'config.toml'
$config = Get-Content -LiteralPath $configPath -Raw
$ports = Get-FreePorts
$config = [regex]::Replace($config, '(?m)^project_id\s*=\s*"[^"]+"', "project_id = `"$projectId`"", 1)
$config = Set-ConfigPort $config 'api' 'port' $ports[0]
$config = Set-ConfigPort $config 'db' 'port' $ports[1]
$config = Set-ConfigPort $config 'db' 'shadow_port' $ports[2]
$config = Set-ConfigPort $config 'db.pooler' 'port' $ports[3]
$config = Set-ConfigPort $config 'studio' 'port' $ports[4]
$config = Set-ConfigPort $config 'local_smtp' 'port' $ports[5]
$config = Set-ConfigPort $config 'analytics' 'port' $ports[6]
$config = [regex]::Replace($config, '(?m)^inspector_port\s*=\s*\d+', "inspector_port = $($ports[7])", 1)
[IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))

Write-Host "Starting isolated HTTP integration project $projectId (PostgreSQL, Auth, PostgREST, Kong, Edge Runtime)."
Invoke-Supabase @(
  'start',
  '--ignore-health-check',
  '--exclude',
  'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,logflare,vector,supavisor'
) | ForEach-Object { Write-Host $_ }

$containerNames = @(& docker.exe --context desktop-linux ps --format '{{.Names}}')
if ($LASTEXITCODE -ne 0 -or $dbContainer -notin $containerNames) {
  throw "Expected isolated database container $dbContainer is not running. The new stack was left intact."
}

Invoke-Supabase @('db', 'reset', '--local', '--no-seed', '--yes') | ForEach-Object { Write-Host $_ }
$migrationList = Invoke-Supabase @('migration', 'list', '--local')
if (($migrationList -join "`n") -notmatch '20261125181237') {
  throw 'The business reports migration is not present in the isolated HTTP test stack.'
}

$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  $statusLines = @(& npx.cmd --offline --yes supabase@2.121.0 status -o env --workdir $workdir 2>$null)
  $statusExitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousPreference
}
if ($statusExitCode -ne 0) { throw "Supabase local status failed with exit code $statusExitCode." }
$values = @{}
foreach ($line in $statusLines) {
  if ($line -match '^([A-Z_]+)="(.*)"$') { $values[$Matches[1]] = $Matches[2] }
}
foreach ($name in @('API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY')) {
  if (-not $values.ContainsKey($name)) { throw "Supabase local status omitted required field $name." }
}
if ([uri]::new($values.API_URL).Host -notin @('localhost', '127.0.0.1', '::1')) {
  throw 'Refusing to run reports HTTP integration against a non-local API URL.'
}
$env:LOCAL_SUPABASE_URL = $values.API_URL
$env:LOCAL_SUPABASE_ANON_KEY = $values.ANON_KEY
$env:LOCAL_SUPABASE_SERVICE_ROLE_KEY = $values.SERVICE_ROLE_KEY
$env:VITE_SUPABASE_URL = $values.API_URL
$env:VITE_SUPABASE_ANON_KEY = $values.ANON_KEY
$env:VITE_ACCOUNT_PROVISIONING_ENABLED = 'true'
$env:VITE_ACCOUNT_RECOVERY_ENABLED = 'false'
$env:CI = '1'

function Get-LocalHttpStatus([scriptblock]$Request) {
  try {
    $response = & $Request
    return [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    throw
  }
}

$baseUrl = $values.API_URL.TrimEnd('/')
$publicHeaders = @{ apikey = $values.ANON_KEY }
$authStatus = Get-LocalHttpStatus { Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri "$baseUrl/auth/v1/health" -Headers $publicHeaders }
$postgrestStatus = Get-LocalHttpStatus { Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri "$baseUrl/rest/v1/" -Headers $publicHeaders }
$functionStatus = Get-LocalHttpStatus {
  Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Method Post -Uri "$baseUrl/functions/v1/username-login" -Headers $publicHeaders -ContentType 'application/json' -Body '{"username":"","password":""}'
}
if ($authStatus -ne 200 -or $postgrestStatus -ne 200 -or $functionStatus -ne 401) {
  throw "Local endpoint preflight failed: Auth=$authStatus PostgREST=$postgrestStatus username-login=$functionStatus. The test suite was not run."
}
Write-Host "Local HTTP endpoints PASS: Auth=$authStatus PostgREST=$postgrestStatus username-login=$functionStatus (expected invalid-input response)."

Write-Host 'Running real Auth/PostgREST/Edge Function and Reports route tests. Local keys are held only in process environment and are not printed.'
& npm.cmd run test:browser -- tests/browser/business-reports-http.spec.mjs
$testExitCode = $LASTEXITCODE
Write-Host "Isolated local project remains available for inspection: $workdir"
exit $testExitCode