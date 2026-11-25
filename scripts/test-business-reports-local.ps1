$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$projectId = 'gracereports' + ([guid]::NewGuid().ToString('N').Substring(0, 12))
$workdir = Join-Path $tempRoot $projectId
$supabaseDir = Join-Path $workdir 'supabase'
$dbContainer = "supabase_db_$projectId"

if (-not $workdir.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing a disposable Supabase workdir outside the Windows temp directory.'
}
if ($projectId -eq 'jewel-sales-hub' -or $projectId -notmatch '^gracereports[a-f0-9]{12}$') {
  throw 'Unexpected disposable Supabase project identity.'
}
if (Test-Path -LiteralPath $workdir) { throw 'Generated disposable project path already exists.' }


function Invoke-Supabase([string[]]$Arguments) {
  # Evita que mensajes informativos del CLI por stderr
  # interrumpan Windows PowerShell 5.1.
  # El cambio solo afecta al ámbito de esta función.
  $ErrorActionPreference = 'Continue'

  $output = @(
    & npx.cmd --yes supabase@2.121.0 @Arguments --workdir $workdir 2>&1 |
      ForEach-Object { [string]$_ }
  )

  $exitCode = $LASTEXITCODE

  # Ocultar posibles credenciales en la salida del CLI.
  $safe = ($output -join "`n")
  $safe = $safe -replace '(?im)^\s*(ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|DB_URL|anon key|service.role key|db url)\s*[:=].*$', '$1=[REDACTED]'
  $safe = $safe -replace 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[JWT REDACTED]'

  # Seguimos considerando fallo cualquier salida no exitosa.
  if ($exitCode -ne 0) {
    throw "Supabase CLI failed ($($Arguments -join ' ')), exit code $exitCode`: $safe"
  }

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
Copy-Item -LiteralPath (Join-Path $repo 'supabase/tests') -Destination $supabaseDir -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'supabase/functions') -Destination (Join-Path $supabaseDir 'functions') -Recurse

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

Write-Host "Starting isolated local project $projectId on separately allocated loopback ports."
Invoke-Supabase @(
  'start',
  '--exclude',
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
) | ForEach-Object { Write-Host $_ }

$containerNames = @(& docker.exe --context desktop-linux ps --format '{{.Names}}')
if ($LASTEXITCODE -ne 0 -or $dbContainer -notin $containerNames) {
  throw "Expected isolated database container $dbContainer is not running. The stack was left intact for inspection."
}

Invoke-Supabase @('db', 'reset', '--local', '--no-seed', '--yes') | ForEach-Object { Write-Host $_ }
$migrationList = Invoke-Supabase @('migration', 'list', '--local')
if (($migrationList -join "`n") -notmatch '20261125181237') {
  throw 'The business reports migration is not present in the local migration history.'
}

$sqlPath = Join-Path $supabaseDir 'tests/business_reports_rpc.sql'
$sql = Get-Content -LiteralPath $sqlPath -Raw
$sqlOutput = @($sql | & docker.exe --context desktop-linux exec -i $dbContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f - 2>&1 | ForEach-Object { [string]$_ })
if ($LASTEXITCODE -ne 0) {
  throw "Business reports PostgreSQL assertions failed: $($sqlOutput -join "`n"). Stack left intact for inspection."
}
$sqlOutput | ForEach-Object { Write-Host $_ }
Write-Host 'Business reports local PostgreSQL assertions passed. Synthetic rows were rolled back by the SQL test.'
Write-Host "Disposable stack remains running for inspection: $workdir"
