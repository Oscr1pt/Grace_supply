$ErrorActionPreference = 'Stop'

$statusText = npx.cmd supabase@2.121.0 status -o env
foreach ($line in $statusText) {
  if ($line -match '^API_URL="(.*)"$') { $env:LOCAL_SUPABASE_URL = $Matches[1] }
  if ($line -match '^ANON_KEY="(.*)"$') { $env:LOCAL_SUPABASE_ANON_KEY = $Matches[1] }
  if ($line -match '^SERVICE_ROLE_KEY="(.*)"$') { $env:LOCAL_SUPABASE_SERVICE_ROLE_KEY = $Matches[1] }
  if ($line -match '^INBUCKET_URL="(.*)"$') { $env:LOCAL_MAILPIT_URL = $Matches[1] }
  if ($line -match '^MAILPIT_URL="(.*)"$') { $env:LOCAL_MAILPIT_URL = $Matches[1] }
}
if (-not $env:LOCAL_SUPABASE_URL -or -not $env:LOCAL_SUPABASE_ANON_KEY -or -not $env:LOCAL_SUPABASE_SERVICE_ROLE_KEY) {
  throw 'Supabase local must be running and expose its local API keys.'
}
if (-not $env:LOCAL_MAILPIT_URL) { throw 'Supabase local must expose its Mailpit URL for invitation and recovery browser tests.' }
if ([uri]::new($env:LOCAL_SUPABASE_URL).Host -notin @('localhost', '127.0.0.1', '::1')) {
  throw 'Refusing to run browser tests against a non-local Supabase URL.'
}
$env:VITE_SUPABASE_URL = $env:LOCAL_SUPABASE_URL
$env:VITE_SUPABASE_ANON_KEY = $env:LOCAL_SUPABASE_ANON_KEY
npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
