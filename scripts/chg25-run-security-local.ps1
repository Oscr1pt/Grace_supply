$ErrorActionPreference = "Stop"

$expectedProject = "chg25cleanf7e21a9c"
$dbContainer = "supabase_db_$expectedProject"
$apiUrl = "http://127.0.0.1:55431"
$mailpitUrl = "http://127.0.0.1:55434"
$logPath = Join-Path $env:TEMP ("chg25-security-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Get-ContainerEnvValue([string]$container, [string]$name) {
  $raw = & docker inspect $container --format "{{range .Config.Env}}{{println .}}{{end}}" 2>$null
  foreach ($line in $raw) {
    if ($line -like "$name=*") { return $line.Substring($name.Length + 1) }
  }
  return $null
}

function Assert-Http([string]$url, [int[]]$allowed, [string]$label) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -Method Get -TimeoutSec 8
    $status = [int]$response.StatusCode
  } catch {
    $status = [int]$_.Exception.Response.StatusCode.value__
  }
  if ($allowed -notcontains $status) { throw "$label returned HTTP $status" }
  Write-Output "$label HTTP $status"
}

$dbState = & docker inspect $dbContainer --format "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}" 2>$null
if ($dbState -notmatch '^running\|healthy$') { throw "PostgreSQL container is not healthy: $dbState" }
$env:LOCAL_SUPABASE_URL = $apiUrl
$env:LOCAL_SUPABASE_JWT_SECRET = Get-ContainerEnvValue "supabase_auth_$expectedProject" "GOTRUE_JWT_SECRET"
$env:LOCAL_SUPABASE_CONTAINER = $dbContainer
$env:LOCAL_MAILPIT_URL = $mailpitUrl
$env:RUN_LOCAL_SECURITY_INTEGRATION = "1"

if (-not $env:LOCAL_SUPABASE_JWT_SECRET) {
  throw "Required local credentials are unavailable from the existing stack"
}

$env:JWT_FOR_KEYS = $env:LOCAL_SUPABASE_JWT_SECRET
$derivedKeys = & node -e "const crypto=require('node:crypto'); const secret=process.env.JWT_FOR_KEYS; const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'); const sign=p=>enc({alg:'HS256',typ:'JWT'})+'.'+enc(p)+'.'+crypto.createHmac('sha256',secret).update(enc({alg:'HS256',typ:'JWT'})+'.'+enc(p)).digest('base64url'); console.log(sign({iss:'supabase-demo',role:'anon',exp:1983812999})); console.log(sign({iss:'supabase-demo',role:'service_role',exp:1983812999}));"
$env:LOCAL_SUPABASE_ANON_KEY = $derivedKeys[0]
$env:LOCAL_SUPABASE_SERVICE_ROLE_KEY = $derivedKeys[1]

Assert-Http "$apiUrl/auth/v1/health" @(200) "Auth health"
Assert-Http "$apiUrl/functions/v1/complete-initial-password" @(401, 403) "complete-initial-password route"
Assert-Http "$apiUrl/functions/v1/username-login" @(400, 401, 405) "username-login route"
Assert-Http "$apiUrl/functions/v1/manage-profile" @(401, 403) "manage-profile route"
Assert-Http "$apiUrl/functions/v1/username-recovery" @(400, 401, 403, 405) "username-recovery route"
Assert-Http "$mailpitUrl/api/v1/messages" @(200) "Mailpit"

$started = Get-Date
$output = & node --test tests/security.integration.test.mjs 2>&1
$processExit = $LASTEXITCODE
$elapsed = ((Get-Date) - $started).TotalSeconds
$output | Set-Content -LiteralPath $logPath -Encoding utf8
$output | Select-Object -Last 35
Write-Output "LOG=$logPath"
Write-Output "EXIT=$processExit"
Write-Output ("DURATION_SECONDS={0:N1}" -f $elapsed)
exit $processExit
