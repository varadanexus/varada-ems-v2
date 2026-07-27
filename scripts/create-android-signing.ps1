$ErrorActionPreference = "Stop"

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$signingRoot = Join-Path $workspaceRoot "signing"
$githubSecretsRoot = Join-Path $signingRoot "github-secrets"
$keystorePath = Join-Path $signingRoot "varada-ems-release.p12"
$privateKeyPath = Join-Path $signingRoot "private-key.pem"
$certificatePath = Join-Path $signingRoot "certificate.pem"
$opensslCandidates = @(
  "C:\Program Files\Git\usr\bin\openssl.exe",
  "C:\Program Files\Git\mingw64\bin\openssl.exe"
)
$openssl = $opensslCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $openssl) { throw "OpenSSL was not found in the Git for Windows installation." }
if (Test-Path -LiteralPath $keystorePath) { throw "A release keystore already exists at $keystorePath. It was not overwritten." }

New-Item -ItemType Directory -Force -Path $githubSecretsRoot | Out-Null
$secretBytes = New-Object byte[] 36
[Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
$password = [Convert]::ToBase64String($secretBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
$alias = "varada_ems_release"

try {
  & $openssl req -x509 -newkey rsa:4096 -sha256 -nodes -days 9125 `
    -subj "/C=IN/ST=Telangana/O=Varada Nexus/OU=EMS/CN=Varada EMS Android" `
    -keyout $privateKeyPath -out $certificatePath
  if ($LASTEXITCODE -ne 0) { throw "OpenSSL could not generate the Android signing certificate." }

  & $openssl pkcs12 -export -out $keystorePath -inkey $privateKeyPath -in $certificatePath `
    -name $alias -passout "pass:$password"
  if ($LASTEXITCODE -ne 0) { throw "OpenSSL could not generate the PKCS12 release keystore." }

  [IO.File]::WriteAllText((Join-Path $githubSecretsRoot "ANDROID_KEYSTORE_BASE64.txt"), [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystorePath)))
  [IO.File]::WriteAllText((Join-Path $githubSecretsRoot "ANDROID_KEYSTORE_PASSWORD.txt"), $password)
  [IO.File]::WriteAllText((Join-Path $githubSecretsRoot "ANDROID_KEY_ALIAS.txt"), $alias)
  [IO.File]::WriteAllText((Join-Path $githubSecretsRoot "ANDROID_KEY_PASSWORD.txt"), $password)
  [IO.File]::WriteAllText((Join-Path $signingRoot "BACKUP-THIS-FOLDER.txt"), "This folder contains the permanent Varada EMS Android signing identity. Back it up securely. Never commit or share it.`r`n")
} finally {
  if (Test-Path -LiteralPath $privateKeyPath) { Remove-Item -LiteralPath $privateKeyPath -Force }
}

Write-Host "Android release signing material created in the ignored signing directory."
Write-Host "Back up the signing directory securely; losing it prevents updates to installed release APKs."
