$ErrorActionPreference = "Stop"

$envPath = Join-Path $PSScriptRoot "..\.env.local"
$envPath = [System.IO.Path]::GetFullPath($envPath)
$content = [System.IO.File]::ReadAllText($envPath)
$placeholder = "DB_PASSWORD=REPLACE_WITH_YOUR_LOCAL_MYSQL_PASSWORD"

if (-not $content.Contains($placeholder)) {
  throw "Expected local password placeholder was not found; refusing to change the file."
}

$securePassword = Read-Host "Enter your local MySQL password (input is masked)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ([string]::IsNullOrEmpty($password)) {
    throw "Password cannot be empty."
  }
  if ($password.Contains("`r") -or $password.Contains("`n")) {
    throw "Password cannot contain a newline."
  }
  $escapedPassword = $password.Replace('\', '\\').Replace('"', '\"')
  $content = $content.Replace($placeholder, "DB_PASSWORD=`"$escapedPassword`"")
  [System.IO.File]::WriteAllText($envPath, $content, [System.Text.UTF8Encoding]::new($false))
  Write-Output "Local MySQL password saved to web/.env.local. The value was not displayed."
}
finally {
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  $password = $null
  $escapedPassword = $null
  $content = $null
  $securePassword.Dispose()
}
