# Grace Supply / CHG-00 - pruebas LOCALES de migraciones, ACL y API.
# ADVERTENCIA: db reset --local destruye la base de datos LOCAL de jewel-sales-hub.
# No ejecutar si esa instancia local contiene datos que se necesiten conservar.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http -ErrorAction Stop

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workdir = $repoRoot
$cli = Get-Command npx.cmd -ErrorAction Stop
$dbContainer = 'supabase_db_jewel-sales-hub'

function Invoke-Supabase {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]] $CliArgs)

  & $cli.Source --yes supabase @CliArgs --workdir $workdir
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase CLI failed ($LASTEXITCODE): supabase $($CliArgs -join ' ')"
  }
}

function Assert-LocalDatabaseContainer {
  $containers = @(& docker.exe ps --format '{{.Names}}')
  if ($LASTEXITCODE -ne 0 -or $containers -notcontains $dbContainer) {
    throw "Expected local PostgreSQL container not found: $dbContainer"
  }
}

function Invoke-LocalSqlFile {
  param([Parameter(Mandatory = $true)][string] $RelativePath)

  Assert-LocalDatabaseContainer
  $source = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "SQL file not found: $RelativePath"
  }

  $target = "/tmp/$([IO.Path]::GetFileName($source))"
  & docker.exe cp $source "${dbContainer}:${target}"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to copy SQL file into local container: $RelativePath"
  }

  try {
    & docker.exe exec $dbContainer psql -X -U postgres -d postgres `
      -v ON_ERROR_STOP=1 --single-transaction -f $target
    if ($LASTEXITCODE -ne 0) {
      throw "Local SQL file failed: $RelativePath"
    }
  }
  finally {
    & docker.exe exec $dbContainer rm -f $target | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Could not remove temporary SQL file from local container: $target"
    }
  }
}

function Invoke-LocalSqlScalar {
  param([Parameter(Mandatory = $true)][string] $Sql)

  Assert-LocalDatabaseContainer
  $output = @(& docker.exe exec $dbContainer psql -X -U postgres -d postgres `
    -qAt -v ON_ERROR_STOP=1 -c $Sql)
  if ($LASTEXITCODE -ne 0) {
    throw 'Local PostgreSQL assertion query failed.'
  }
  return ($output -join "`n").Trim()
}

function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)][string] $Method,
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $ApiKey,
    [Parameter(Mandatory = $true)][string] $Bearer,
    [string] $Body = ''
  )

  $request = [System.Net.Http.HttpRequestMessage]::new(
    [System.Net.Http.HttpMethod]::new($Method), "$apiUrl$Path"
  )
  try {
    $request.Headers.Add('apikey', $ApiKey)
    $request.Headers.Authorization = `
      [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $Bearer)
    if ($Body) {
      $request.Content = [System.Net.Http.StringContent]::new(
        $Body, [System.Text.Encoding]::UTF8, 'application/json'
      )
    }
    $response = $http.SendAsync($request).GetAwaiter().GetResult()
    try {
      $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      return [pscustomobject]@{ Status = [int] $response.StatusCode; Body = $content }
    }
    finally {
      $response.Dispose()
    }
  }
  finally {
    $request.Dispose()
  }
}

function Assert-Denied {
  param([string] $Name, $Response)

  # Un 400 por sintaxis errónea no demuestra que funcionen los permisos.
  # 401/403 = autorización denegada; 404 puede ser un objeto intencionalmente
  # oculto del esquema expuesto. Se comprueba aparte que exista en PostgreSQL.
  if ($Response.Status -notin @(401, 403, 404) -or
      $Response.Body -match 'chg00-synthetic-(only|rpc|written)') {
    throw "$Name did not prove access was denied (HTTP $($Response.Status)); body omitted."
  }
  Write-Output "$Name : HTTP $($Response.Status), no synthetic value returned"
}

function Assert-GraphqlRestricted {
  param([string] $Name, $Response)

  if ($Response.Body -match 'chg00-synthetic-(only|rpc|written)') {
    throw "$Name exposed a synthetic marker in the response."
  }

  if ($Response.Status -eq 200) {
    try {
      $payload = $Response.Body | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
      throw "$Name returned HTTP 200 without valid JSON."
    }
    if ($null -eq $payload -or
        (($payload.PSObject.Properties.Name -notcontains 'data') -and
         ($payload.PSObject.Properties.Name -notcontains 'errors'))) {
      throw "$Name returned an unexpected GraphQL response structure."
    }
  }
  elseif ($Response.Status -notin @(400, 401, 403, 404)) {
    throw "$Name returned unexpected HTTP $($Response.Status)."
  }

  # El resultado del endpoint no prueba ausencia de escrituras: más abajo
  # se verifica el estado real de la relación sintética en PostgreSQL.
  Write-Output "$Name : HTTP $($Response.Status), no synthetic marker returned"
}

$configPath = Join-Path $repoRoot 'supabase/config.toml'
$config = Get-Content -LiteralPath $configPath -Raw
if ($config -notmatch '(?m)^project_id\s*=\s*"jewel-sales-hub"\s*$') {
  throw 'Unexpected Supabase local project_id; refusing to reset.'
}
if (Test-Path -LiteralPath (Join-Path $repoRoot 'supabase/.temp/project-ref')) {
  throw 'A linked Supabase project marker exists; refusing local reset.'
}

& docker.exe info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Engine is unavailable in this terminal.'
}
Write-Output 'Docker Engine: available'

# Solo instancia local. Nunca usar --linked o --db-url aquí.
Invoke-Supabase db reset --local --no-seed --yes
Assert-LocalDatabaseContainer

$migrationOutput = @(Invoke-Supabase migration list --local)
foreach ($version in @('20261021041426', '20261021043648')) {
  if (($migrationOutput -join "`n") -notmatch [regex]::Escape($version)) {
    throw "Local migration $version is missing."
  }
}
Write-Output 'Local migrations: 20261021041426 and 20261021043648 present'

# Este archivo funcionó con supabase db query en los ensayos previos.
Invoke-Supabase db query --local --file 'supabase/tests/chg00_containment.sql'
Write-Output 'CHG-00 SQL assertions: passed'

# Se capturan las claves locales sin mostrarlas en consola ni en archivos.
$envOutput = @(Invoke-Supabase status --output env)
$envText = $envOutput -join "`n"
foreach ($key in @('API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY')) {
  if ($envText -notmatch "(?m)^$key=(.+)$") {
    throw "Supabase local status did not provide $key."
  }
  Set-Variable -Name $key -Value $Matches[1].Trim().Trim('"')
}

$apiUrl = $API_URL.TrimEnd('/')
if ($apiUrl -notmatch '^http://(127\.0\.0\.1|localhost)(:\d+)?$') {
  throw 'API_URL is not a local HTTP loopback address; refusing API probes.'
}

$http = [System.Net.Http.HttpClient]::new()
$userId = $null
$fixtureCreated = $false
$primaryError = $null
$cleanupErrors = @()
$testEmail = "chg00-$([guid]::NewGuid().ToString('N'))@example.test"
$testPassword = "C00-$([guid]::NewGuid().ToString('N'))-aA9!"

try {
  # Las fixtures contienen varias sentencias: psql evita el fallo de prepared statement.
  Invoke-LocalSqlFile 'supabase/tests/chg00_http_fixture.sql'
  $fixtureCreated = $true

  # Control positivo: tabla y función existen realmente en la base local.
  $fixturePresent = Invoke-LocalSqlScalar @'
SELECT CASE WHEN
  to_regclass('public.chg00_http_access_probe') IS NOT NULL
  AND to_regprocedure('public.chg00_http_rpc_probe()') IS NOT NULL
THEN 'OK' ELSE 'FAIL' END;
'@
  if ($fixturePresent -ne 'OK') {
    throw 'Synthetic HTTP fixture table or RPC function is missing in public schema.'
  }

  # Control positivo de gateway/Auth antes de interpretar respuestas 404.
  $health = Invoke-Api 'GET' '/auth/v1/settings' $ANON_KEY $ANON_KEY
  if ($health.Status -ne 200) {
    throw "Local Auth gateway health probe failed (HTTP $($health.Status))."
  }
  Write-Output 'Local API gateway: available'

  $anonRead = Invoke-Api 'GET' '/rest/v1/chg00_http_access_probe?select=id,secret' $ANON_KEY $ANON_KEY
  Assert-Denied 'anon REST read' $anonRead
  $anonWrite = Invoke-Api 'POST' '/rest/v1/chg00_http_access_probe' $ANON_KEY $ANON_KEY '{"id":2,"secret":"chg00-synthetic-written"}'
  Assert-Denied 'anon REST insert' $anonWrite
  $anonRpc = Invoke-Api 'POST' '/rest/v1/rpc/chg00_http_rpc_probe' $ANON_KEY $ANON_KEY '{}'
  Assert-Denied 'anon RPC' $anonRpc

  $anonGraphql = Invoke-Api 'POST' '/graphql/v1' $ANON_KEY $ANON_KEY '{"query":"{ chg00HttpAccessProbeCollection { edges { node { id secret } } } }"}'
  Assert-GraphqlRestricted 'anon GraphQL read' $anonGraphql
  $anonMutationBody = @{ query = 'mutation { insertIntoChg00HttpAccessProbeCollection(objects: [{ id: 4, secret: "chg00-synthetic-written" }]) { records { id secret } } }' } | ConvertTo-Json -Compress
  $anonGraphqlMutation = Invoke-Api 'POST' '/graphql/v1' $ANON_KEY $ANON_KEY $anonMutationBody
  Assert-GraphqlRestricted 'anon GraphQL mutation' $anonGraphqlMutation

  # Crear un usuario LOCAL confirmado: no depende de que el signup público
  # esté habilitado ni necesita enviar correo a una dirección ficticia.
  $createBody = @{
    email = $testEmail
    password = $testPassword
    email_confirm = $true
  } | ConvertTo-Json -Compress
  $created = Invoke-Api 'POST' '/auth/v1/admin/users' $SERVICE_ROLE_KEY $SERVICE_ROLE_KEY $createBody
  if ($created.Status -notin @(200, 201)) {
    throw "Local synthetic Auth admin creation failed (HTTP $($created.Status))."
  }
  $createdData = $created.Body | ConvertFrom-Json
  if ($createdData.id) { $userId = $createdData.id }
  elseif ($createdData.user -and $createdData.user.id) { $userId = $createdData.user.id }
  if (-not $userId) { throw 'Local Auth admin creation did not return the user id.' }

  $loginBody = @{ email = $testEmail; password = $testPassword } | ConvertTo-Json -Compress
  $tokenResponse = Invoke-Api 'POST' '/auth/v1/token?grant_type=password' $ANON_KEY $ANON_KEY $loginBody
  if ($tokenResponse.Status -ne 200) {
    throw "Local synthetic Auth login failed (HTTP $($tokenResponse.Status))."
  }
  $tokenData = $tokenResponse.Body | ConvertFrom-Json
  $authenticatedToken = $tokenData.access_token
  if (-not $authenticatedToken -or $tokenData.user.id -ne $userId) {
    throw 'Local synthetic Auth token is missing or belongs to another user.'
  }

  $authRead = Invoke-Api 'GET' '/rest/v1/chg00_http_access_probe?select=id,secret' $ANON_KEY $authenticatedToken
  Assert-Denied 'authenticated REST read' $authRead
  $authWrite = Invoke-Api 'POST' '/rest/v1/chg00_http_access_probe' $ANON_KEY $authenticatedToken '{"id":3,"secret":"chg00-synthetic-written"}'
  Assert-Denied 'authenticated REST insert' $authWrite
  $authRpc = Invoke-Api 'POST' '/rest/v1/rpc/chg00_http_rpc_probe' $ANON_KEY $authenticatedToken '{}'
  Assert-Denied 'authenticated RPC' $authRpc

  $authGraphql = Invoke-Api 'POST' '/graphql/v1' $ANON_KEY $authenticatedToken '{"query":"{ chg00HttpAccessProbeCollection { edges { node { id secret } } } }"}'
  Assert-GraphqlRestricted 'authenticated GraphQL read' $authGraphql
  $authMutationBody = @{ query = 'mutation { insertIntoChg00HttpAccessProbeCollection(objects: [{ id: 5, secret: "chg00-synthetic-written" }]) { records { id secret } } }' } | ConvertTo-Json -Compress
  $authGraphqlMutation = Invoke-Api 'POST' '/graphql/v1' $ANON_KEY $authenticatedToken $authMutationBody
  Assert-GraphqlRestricted 'authenticated GraphQL mutation' $authGraphqlMutation

  # Aserción directa en PostgreSQL: ni REST ni GraphQL dejaron inserciones.
  $state = Invoke-LocalSqlScalar @'
SELECT CASE WHEN
  COUNT(*) = 1
  AND COUNT(*) FILTER (WHERE id = 1 AND secret = 'chg00-synthetic-only') = 1
THEN 'OK' ELSE 'FAIL' END
FROM public.chg00_http_access_probe;
'@
  if ($state -ne 'OK') {
    throw 'Synthetic fixture state changed: an unauthorized write may have succeeded.'
  }
  Write-Output 'PostgreSQL integrity assertion: no unauthorized synthetic writes'
}
catch {
  $primaryError = $_
}
finally {
  if ($userId) {
    try {
      $deleteUser = Invoke-Api 'DELETE' "/auth/v1/admin/users/$userId" $SERVICE_ROLE_KEY $SERVICE_ROLE_KEY
      if ($deleteUser.Status -lt 200 -or $deleteUser.Status -ge 300) {
        $cleanupErrors += "Synthetic Auth user removal returned HTTP $($deleteUser.Status)."
      }
    }
    catch {
      $cleanupErrors += "Synthetic Auth user removal failed: $($_.Exception.Message)"
    }
  }

  if ($fixtureCreated) {
    try {
      Invoke-LocalSqlFile 'supabase/tests/chg00_http_fixture_cleanup.sql'
      $fixtureRemaining = Invoke-LocalSqlScalar @'
SELECT CASE WHEN
  to_regclass('public.chg00_http_access_probe') IS NULL
  AND to_regprocedure('public.chg00_http_rpc_probe()') IS NULL
THEN 'OK' ELSE 'FAIL' END;
'@
      if ($fixtureRemaining -ne 'OK') {
        $cleanupErrors += 'Temporary SQL fixture table or RPC function was not removed.'
      }
    }
    catch {
      $cleanupErrors += "Synthetic SQL fixture cleanup failed: $($_.Exception.Message)"
    }
  }
  $http.Dispose()
}

if ($primaryError) {
  if ($cleanupErrors.Count -gt 0) {
    Write-Warning ('Cleanup also failed: ' + ($cleanupErrors -join '; '))
  }
  throw $primaryError
}
if ($cleanupErrors.Count -gt 0) {
  throw ('CHG-00 verification passed, but cleanup failed: ' + ($cleanupErrors -join '; '))
}
Write-Output 'Local CHG-00 verification finished: checks passed; temporary SQL resources and Auth user removed.'
