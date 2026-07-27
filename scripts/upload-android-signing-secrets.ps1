$ErrorActionPreference = "Stop"

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$secretRoot = Join-Path $workspaceRoot "signing\github-secrets"
$secretNames = @(
  "ANDROID_KEYSTORE_BASE64",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD"
)

& gh auth status 2>$null
if ($LASTEXITCODE -ne 0) { throw "GitHub CLI is not authenticated. Run 'gh auth login' first." }

foreach ($name in $secretNames) {
  $secretFile = Join-Path $secretRoot "$name.txt"
  if (-not (Test-Path -LiteralPath $secretFile)) { throw "Missing signing secret file: $secretFile" }
  Get-Content -LiteralPath $secretFile -Raw | gh secret set $name --repo varadanexus/varada-ems-v2
  if ($LASTEXITCODE -ne 0) { throw "Could not upload GitHub Actions secret $name." }
}

Write-Host "Android release signing secrets uploaded to GitHub Actions."
