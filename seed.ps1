# =========================
# seed.ps1  —  Crea utenti + profili + audit
# =========================

# ---- CONFIG .env.local ----
$envPath = ".env.local"
if (-not (Test-Path $envPath)) { Write-Error ".env.local non trovato"; exit 1 }

$envMap = @{}
Get-Content $envPath | Where-Object {$_ -match "="} | ForEach-Object {
  $k,$v = $_.Split("=",2); $envMap[$k.Trim()] = $v.Trim()
}
$SUPABASE_URL = $envMap["NEXT_PUBLIC_SUPABASE_URL"]
$SERVICE_ROLE = $envMap["SUPABASE_SERVICE_ROLE_KEY"]

if (-not $SUPABASE_URL -or -not $SERVICE_ROLE) {
  Write-Error "Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local"; exit 1
}

# Header base
$hdr = @{
  "apikey"       = $SERVICE_ROLE
  "Authorization"= "Bearer $SERVICE_ROLE"
  "Content-Type" = "application/json"
}

# Helper per copiare headers e aggiungere Prefer
function With-Prefer($headers, $prefer) {
  $h = @{}
  foreach ($k in $headers.Keys) { $h[$k] = $headers[$k] }
  $h["Prefer"] = $prefer
  return $h
}

# ---- FUNZIONI ----
function Get-UserIdByEmail($email) {
  try {
    $u = Invoke-RestMethod -Method Get -Uri "$SUPABASE_URL/auth/v1/admin/users?email=$([uri]::EscapeDataString($email))" -Headers $hdr -ErrorAction Stop
    if ($u -and $u.users -and $u.users.Count -gt 0) { return $u.users[0].id }
  } catch { }
  return $null
}

function Ensure-User($username, $password, $role) {
  $email = "u_$username@local"

  # 1) Crea utente se manca
  $userId = Get-UserIdByEmail $email
  if (-not $userId) {
    $body = @{
      email          = $email
      password       = $password
      email_confirm  = $true
    } | ConvertTo-Json
    try {
      $res = Invoke-RestMethod -Method Post -Uri "$SUPABASE_URL/auth/v1/admin/users" -Headers $hdr -Body $body -ErrorAction Stop
      $userId = $res.user.id
      Write-Host "Creato: $username -> $email"
    } catch {
      $userId = Get-UserIdByEmail $email
      if (-not $userId) { throw $_ }
      Write-Host "Esistente (post create fallita ma presente): $username -> $email"
    }
  } else {
    Write-Host "Esistente: $username -> $email"
  }

  # 2) Upsert profilo
  $prof = @{ id = $userId; username = $username; role = $role } | ConvertTo-Json
  $hdrProfiles = With-Prefer $hdr "resolution=merge-duplicates"
  Invoke-RestMethod -Method Post -Uri "$SUPABASE_URL/rest/v1/profiles" -Headers $hdrProfiles -Body $prof | Out-Null

  # 3) Audit RPC
  $audit = @{
    p_actor     = $userId
    p_action    = "admin_seed_user"
    p_entity    = "profiles"
    p_entity_id = $userId
    p_payload   = @{ username = $username; role = $role }
  } | ConvertTo-Json -Depth 5
  Invoke-RestMethod -Method Post -Uri "$SUPABASE_URL/rest/v1/rpc/log_audit" -Headers $hdr -Body $audit | Out-Null
}

# ---- UTENTI ----
$users = @(
  @{ username = "Edgardo.Perrelli";     password = "Plenzich@2026!"; role = "admin"  },
  @{ username = "Mara.Boccia";          password = "Plenzich@25";    role = "editor" },
  @{ username = "Francesco.Desantis";   password = "Plenzich@25";    role = "editor" },
  @{ username = "Lorenzo.Alessandrini"; password = "Plenzich@25";    role = "editor" },
  @{ username = "Christian.Arragoni";   password = "Plenzich@25";    role = "editor" },
  @{ username = "tecnico.pdr";          password = "Plenzich@25";    role = "viewer" }
)

# ---- ESECUZIONE ----
foreach ($u in $users) {
  Ensure-User -username $u.username -password $u.password -role $u.role
}

Write-Host "Seed completato."
