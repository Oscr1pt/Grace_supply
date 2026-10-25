
# CHG-03 local reconstruction and schema contract verification.
# This intentionally resets only the isolated local Supabase stack named by config.toml.

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$configPath = Join-Path $repoRoot 'supabase/config.toml'
$config = Get-Content -LiteralPath $configPath -Raw

if ($config -notmatch '(?m)^project_id\s*=\s*"jewel-sales-hub"\s*$') {
  throw 'Unexpected Supabase local project_id; refusing local reset.'
}
if (Test-Path -LiteralPath (Join-Path $repoRoot 'supabase/.temp/project-ref')) {
  throw 'A linked Supabase project marker exists; refusing local reset.'
}

$dbContainer = 'supabase_db_jewel-sales-hub'
$npxPath = (Get-Command npx.cmd -ErrorAction Stop).Source
$dockerPath = (Get-Command docker.exe -ErrorAction Stop).Source

function ConvertTo-WindowsArgument {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string] $Value)

  if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') {
    return $Value
  }

  $builder = New-Object System.Text.StringBuilder
  [void] $builder.Append('"')
  $slashes = 0

  foreach ($character in $Value.ToCharArray()) {
    if ($character -eq [char]92) {
      $slashes++
      continue
    }
    if ($character -eq [char]34) {
      if ($slashes -gt 0) {
        [void] $builder.Append(('\' * ($slashes * 2)))
      }
      [void] $builder.Append('\"')
      $slashes = 0
      continue
    }
    if ($slashes -gt 0) {
      [void] $builder.Append(('\' * $slashes))
    }
    [void] $builder.Append($character)
    $slashes = 0
  }

  if ($slashes -gt 0) {
    [void] $builder.Append(('\' * ($slashes * 2)))
  }
  [void] $builder.Append('"')
  return $builder.ToString()
}

function ConvertTo-BatchToken {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string] $Value)

  if ($Value.Contains('"')) {
    throw 'Unexpected quote in a local CLI argument.'
  }
  return '"' + $Value.Replace('%', '%%').Replace('^', '^^') + '"'
}

function Protect-ProcessText {
  param([AllowEmptyString()][string] $Text)

  $safe = $Text -replace '(?i)(Bearer\s+)[A-Za-z0-9._~+/=-]+', '$1[REDACTED]'
  $safe = $safe -replace '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', '[REDACTED_TOKEN]'
  $safe = $safe -replace '(?i)\b([a-z0-9_-]*(?:key|token|secret|password|credential)[a-z0-9_-]*)\b(\s*[:=]\s*)[^\s,;]+', '$1$2[REDACTED]'
  $safe = $safe -replace '(?i)(postgres(?:ql)?://[^:/\s]+:)[^@\s]+(@)', '$1[REDACTED]$2'
  $safe = $safe -replace '\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+\b', '[REDACTED_KEY]'
  return $safe
}

function Invoke-NativeProcess {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $FilePath,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]] $Arguments,
    [Parameter(Mandatory = $true)][string] $DisplayName,
    [Parameter(Mandatory = $true)][string] $WorkingDirectory,
    [switch] $AllowFailure
  )

  $tempRoot = [IO.Path]::GetTempPath()
  $stdoutPath = Join-Path $tempRoot ([Guid]::NewGuid().ToString('N') + '.stdout.tmp')
  $stderrPath = Join-Path $tempRoot ([Guid]::NewGuid().ToString('N') + '.stderr.tmp')

  try {
    $extension = [IO.Path]::GetExtension($FilePath)

    if ($extension -ieq '.cmd' -or $extension -ieq '.bat') {
      $quotedPath = ConvertTo-BatchToken -Value $FilePath
      $quotedArguments = @(
        $Arguments | ForEach-Object {
          ConvertTo-BatchToken -Value $_
        }
      )
      $commandLine = 'call ' + $quotedPath
      if ($quotedArguments.Count -gt 0) {
        $commandLine += ' ' + ($quotedArguments -join ' ')
      }
      $startFile = $env:ComSpec
      $startArguments = '/d /s /c "' + $commandLine + '"'
    }
    else {
      $startFile = $FilePath
      $startArguments = (
        @($Arguments | ForEach-Object {
          ConvertTo-WindowsArgument -Value $_
        }) -join ' '
      )
    }

    $process = Start-Process -FilePath $startFile -ArgumentList $startArguments `
      -WorkingDirectory $WorkingDirectory `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -NoNewWindow -Wait -PassThru

    $stdout = if (Test-Path -LiteralPath $stdoutPath) {
      [IO.File]::ReadAllText($stdoutPath)
    } else { '' }

    $stderr = if (Test-Path -LiteralPath $stderrPath) {
      [IO.File]::ReadAllText($stderrPath)
    } else { '' }

    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
      foreach ($line in ($stderr -split '\r?\n' | Where-Object { $_ -ne '' })) {
        Write-Host (
          '[stderr {0}] {1}' -f $DisplayName,
          (Protect-ProcessText -Text $line)
        )
      }
    }

    $result = [pscustomobject]@{
      ExitCode = [int] $process.ExitCode
      Stdout = $stdout
      Stderr = $stderr
    }

    if ($result.ExitCode -ne 0 -and -not $AllowFailure) {
      throw "$DisplayName exited with code $($result.ExitCode). See sanitized process diagnostics above."
    }

    return $result
  }
  finally {
    foreach ($tempFile in @($stdoutPath, $stderrPath)) {
      if ($tempFile -and (Test-Path -LiteralPath $tempFile)) {
        Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

function Invoke-Supabase {
  param(
    [Parameter(Mandatory = $true)][string[]] $CliArgs,
    [switch] $AllowFailure
  )

  $localConfig = Join-Path $repoRoot 'supabase/config.toml'

  if (-not (Test-Path -LiteralPath $localConfig)) {
    throw 'No se encontró la configuración local de Supabase.'
  }

  $currentConfig = Get-Content -LiteralPath $localConfig -Raw

  if ($currentConfig -notmatch '(?m)^project_id\s*=\s*"jewel-sales-hub"\s*$') {
    throw 'Unexpected Supabase local project_id; refusing CLI execution.'
  }

  if (Test-Path -LiteralPath (Join-Path $repoRoot 'supabase/.temp/project-ref')) {
    throw 'A linked Supabase project marker exists; refusing Supabase CLI execution.'
  }

  if ($CliArgs -notcontains '--local' -or
      $CliArgs -contains '--linked' -or
      $CliArgs -contains '--db-url' -or
      $CliArgs -contains '--project-ref') {
    throw 'Supabase verifier commands must explicitly target the guarded local project.'
  }

  $arguments = @('--yes', 'supabase') + $CliArgs + @('--workdir', $repoRoot)

  return Invoke-NativeProcess -FilePath $npxPath `
    -Arguments $arguments `
    -DisplayName 'npx.cmd supabase' `
    -WorkingDirectory $repoRoot `
    -AllowFailure:$AllowFailure
}

function Invoke-Docker {
  param([Parameter(Mandatory = $true)][string[]] $DockerArgs)

  return Invoke-NativeProcess -FilePath $dockerPath `
    -Arguments $DockerArgs `
    -DisplayName 'docker.exe' `
    -WorkingDirectory $repoRoot
}

function Get-SchemaDigest {
  $sql = @'
SELECT md5(string_agg(signature, E'\n' ORDER BY signature))
FROM (
  SELECT table_name || '.' || column_name || ':' || data_type || ':' || udt_name || ':' || is_nullable || ':' || coalesce(column_default, '') AS signature
  FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL
  SELECT rel.relname || ':' || con.conname || ':' || pg_get_constraintdef(con.oid) AS signature
  FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
  UNION ALL
  SELECT tablename || ':' || indexname || ':' || indexdef
  FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL
  SELECT rel.relname || ':rls:' || rel.relrowsecurity || ':' || rel.relforcerowsecurity
  FROM pg_class rel JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public' AND rel.relkind IN ('r', 'p')
  UNION ALL
  SELECT pol.polrelid::regclass::text || ':' || pol.polname || ':' || pg_get_expr(pol.polqual, pol.polrelid) || ':' || pg_get_expr(pol.polwithcheck, pol.polrelid)
  FROM pg_policy pol JOIN pg_class rel ON rel.oid = pol.polrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace WHERE ns.nspname = 'public'
) schema_parts;
'@

  $result = Invoke-Docker -DockerArgs @(
    'exec', $dbContainer, 'psql', '-X', '-qAt',
    '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c', $sql
  )

  $digest = $result.Stdout.Trim()
  if ($digest -notmatch '^[0-9a-f]{32}$') {
    throw 'Could not calculate local schema signature.'
  }
  return $digest
}

# Verify Docker.
$dockerInfo = Invoke-Docker -DockerArgs @('info', '--format', '{{.ServerVersion}}')
Write-Output 'Docker Engine: available'

# Verify migration file.
$migration = Join-Path $repoRoot 'supabase/migrations/20261022000000_chg03_versioned_domain_schema.sql'
$checksum = (Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output "CHG-03 migration SHA-256: $checksum"

# First clean rebuild and SQL tests.
$null = Invoke-Supabase -CliArgs @('db', 'reset', '--local', '--no-seed', '--yes')

$containerResult = Invoke-Docker -DockerArgs @('ps', '--format', '{{.Names}}')
if (($containerResult.Stdout -split '\r?\n') -notcontains $dbContainer) {
  throw "Expected local database container was not started: $dbContainer"
}

$migrationResult = Invoke-Supabase -CliArgs @('migration', 'list', '--local')
$migrationOutput = $migrationResult.Stdout

if ($migrationOutput -notmatch '20261022000000') {
  throw 'CHG-03 migration is absent from local migration history.'
}

$versionMarkers = @(
  '20261021041426',
  '20261021043648',
  '20261022000000'
)

$lastMarker = -1
foreach ($version in $versionMarkers) {
  $position = $migrationOutput.IndexOf(
    $version, [StringComparison]::Ordinal
  )
  if ($position -lt 0 -or $position -le $lastMarker) {
    throw 'Local migration order differs from the expected CHG-00 then CHG-03 sequence.'
  }
  $lastMarker = $position
}

$null = Invoke-Supabase -CliArgs @(
  'db', 'query', '--local', '--file',
  'supabase/tests/chg03_schema_contract.sql'
)

Write-Output 'CHG-03 SQL schema assertions: passed'
$firstDigest = Get-SchemaDigest

# Second clean rebuild.
$null = Invoke-Supabase -CliArgs @('db', 'reset', '--local', '--no-seed', '--yes')

$migrationResult = Invoke-Supabase -CliArgs @('migration', 'list', '--local')
if ($migrationResult.Stdout -notmatch '20261022000000') {
  throw 'CHG-03 migration missing after repeated clean rebuild.'
}

$secondDigest = Get-SchemaDigest
if ($firstDigest -ne $secondDigest) {
  throw 'Repeated clean rebuild produced a different schema signature.'
}

Write-Output 'Repeated clean rebuild: identical table/column/constraint signature'
Write-Output 'Temporary fixtures: rolled back by SQL assertions'

# Negative test: start from CHG-00 only.
# Never delete rows from the migration history manually.
try {
  $null = Invoke-Supabase -CliArgs @(
    'db', 'reset', '--local', '--no-seed', '--yes',
    '--version', '20261021043648'
  )

  # Ensure CHG-03 is absent.
  $baselineResult = Invoke-Docker -DockerArgs @(
    'exec', $dbContainer, 'psql', '-X', '-qAt',
    '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c',
    "SELECT CASE WHEN to_regclass('public.clients') IS NULL AND NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261022000000') THEN 'OK' ELSE 'FAIL' END;"
  )

  if ($baselineResult.Stdout.Trim() -ne 'OK') {
    throw 'Negative test did not start from a clean CHG-00-only baseline.'
  }

  # Create a synthetic table to trigger the precondition.
  $null = Invoke-Docker -DockerArgs @(
    'exec', $dbContainer, 'psql', '-X', '-qAt',
    '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c',
    'CREATE TABLE public.chg03_precondition_probe (id integer PRIMARY KEY);'
  )

  $beforeFailedMigrationDigest = Get-SchemaDigest

  # CHG-03 must reject the unexpected table.
  $failureResult = Invoke-Supabase `
    -CliArgs @('migration', 'up', '--local') `
    -AllowFailure

  $failureText = $failureResult.Stdout + "`n" + $failureResult.Stderr

  if (
    $failureResult.ExitCode -eq 0 -or
    $failureText -notmatch 'clean baseline precondition failed'
  ) {
    throw 'The migration did not fail with the expected clean-baseline precondition.'
  }

  # Verify no partial domain schema or incorrect migration history.
  $rollbackResult = Invoke-Docker -DockerArgs @(
    'exec', $dbContainer, 'psql', '-X', '-qAt',
    '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c',
    "SELECT CASE WHEN to_regclass('public.chg03_precondition_probe') IS NOT NULL AND to_regclass('public.clients') IS NULL AND NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261022000000') THEN 'OK' ELSE 'FAIL' END;"
  )

  if ($rollbackResult.Stdout.Trim() -ne 'OK') {
    throw 'Failed migration changed the migration history or the expected baseline.'
  }

  $afterFailedMigrationDigest = Get-SchemaDigest

  if ($beforeFailedMigrationDigest -ne $afterFailedMigrationDigest) {
    throw 'Failed migration unexpectedly modified the public schema.'
  }

  Write-Output 'Failed precondition: migration rejected, not recorded, public schema unchanged'
}
finally {
  # Always restore the full local baseline.
  # The reset also removes the synthetic table.
  $null = Invoke-Supabase -CliArgs @(
    'db', 'reset', '--local', '--no-seed', '--yes'
  )
}

# Verify the full migration was restored.
$restoredResult = Invoke-Supabase -CliArgs @('migration', 'list', '--local')

if ($restoredResult.Stdout -notmatch '20261022000000') {
  throw 'CHG-03 migration was not restored after the negative test.'
}

if ((Get-SchemaDigest) -ne $secondDigest) {
  throw 'Final clean rebuild did not restore the verified domain schema.'
}

Write-Output 'Final full local baseline: migration history and schema restored'
Write-Output 'Local CHG-03 reconstruction verification finished.'
