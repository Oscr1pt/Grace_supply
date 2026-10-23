$ErrorActionPreference = 'Stop'

$statusText = npx.cmd supabase@2.121.0 status -o env
foreach ($line in $statusText) {
  if ($line -match '^API_URL="(.*)"$') { $env:LOCAL_SUPABASE_URL = $Matches[1] }
  if ($line -match '^ANON_KEY="(.*)"$') { $env:LOCAL_SUPABASE_ANON_KEY = $Matches[1] }
  if ($line -match '^SERVICE_ROLE_KEY="(.*)"$') { $env:LOCAL_SUPABASE_SERVICE_ROLE_KEY = $Matches[1] }
}
if (-not $env:LOCAL_SUPABASE_URL -or -not $env:LOCAL_SUPABASE_ANON_KEY -or -not $env:LOCAL_SUPABASE_SERVICE_ROLE_KEY) {
  throw 'Supabase local must be running and expose its local API keys.'
}
if ([uri]::new($env:LOCAL_SUPABASE_URL).Host -notin @('localhost', '127.0.0.1', '::1')) {
  throw 'Refusing to run CHG-07 fixtures against a non-local Supabase URL.'
}
$env:LOCAL_SUPABASE_CONTAINER = 'supabase_db_jewel-sales-hub'

$fixturePath = Join-Path $PSScriptRoot '..\tests\fixtures\chg07-fail-supplier-credit.sql'
$cleanupPath = Join-Path $PSScriptRoot '..\tests\fixtures\chg07-drop-failure-trigger.sql'
try {
  Get-Content -Raw $fixturePath | docker exec -i supabase_db_jewel-sales-hub psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f -
  if ($LASTEXITCODE -ne 0) { throw 'Could not install the synthetic local rollback trigger.' }
  $env:RUN_LOCAL_BUSINESS_INTEGRATION = '1'
  node --test tests/business.integration.test.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Get-Content -Raw $cleanupPath | docker exec -i supabase_db_jewel-sales-hub psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f -
}
