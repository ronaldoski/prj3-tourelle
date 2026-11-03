# diag-mqtt.ps1 - diagnostic connexion ESP8266 -> Mosquitto (etat=-2)
# Lancer dans un PowerShell ADMINISTRATEUR, depuis C:\Users\bilal\mqtt :
#   powershell -ExecutionPolicy Bypass -File .\diag-mqtt.ps1
$attendu = "192.168.0.194"   # MQTT_HOST dans secrets.h

Write-Host "`n=== 1. Docker / Mosquitto ===" -ForegroundColor Cyan
$etat = docker ps --filter "name=mosquitto" --format "{{.Status}} | {{.Ports}}" 2>$null
if ($etat) { Write-Host "OK  $etat" -ForegroundColor Green }
else { Write-Host "KO  conteneur arrete ou Docker Desktop ferme -> ouvre Docker Desktop puis 'docker compose up -d'" -ForegroundColor Red }

Write-Host "`n=== 2. IP du PC ===" -ForegroundColor Cyan
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and
  $_.InterfaceAlias -notmatch "vEthernet|WSL|Loopback|Docker"
}
$ips | ForEach-Object { Write-Host ("    {0,-16} {1}" -f $_.IPAddress, $_.InterfaceAlias) }
if ($ips.IPAddress -contains $attendu) { Write-Host "OK  le PC a bien $attendu" -ForegroundColor Green }
else {
  Write-Host "KO  le PC n'a PLUS l'IP $attendu (DHCP l'a changee)" -ForegroundColor Red
  Write-Host "    -> mets la nouvelle IP dans secrets.h (MQTT_HOST) et code\.env (EXPO_PUBLIC_BROKER_HOST)" -ForegroundColor Yellow
  Write-Host "    -> re-televerse le sketch, relance 'npx expo start -c'" -ForegroundColor Yellow
}

Write-Host "`n=== 3. Ports du broker sur le PC ===" -ForegroundColor Cyan
foreach ($p in 1883, 9001) {
  $ok = (Test-NetConnection -ComputerName 127.0.0.1 -Port $p -WarningAction SilentlyContinue).TcpTestSucceeded
  if ($ok) { Write-Host "OK  port $p ouvert" -ForegroundColor Green }
  else { Write-Host "KO  port $p ferme -> Mosquitto n'ecoute pas (voir point 1)" -ForegroundColor Red }
}

Write-Host "`n=== 4. Profil reseau + pare-feu ===" -ForegroundColor Cyan
Get-NetConnectionProfile | ForEach-Object { Write-Host ("    {0} : {1}" -f $_.InterfaceAlias, $_.NetworkCategory) }
$regle = Get-NetFirewallRule -DisplayName "Mosquitto MQTT" -ErrorAction SilentlyContinue
if ($regle) { Write-Host "OK  regle pare-feu 'Mosquitto MQTT' deja presente" -ForegroundColor Green }
else {
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($admin) {
    New-NetFirewallRule -DisplayName "Mosquitto MQTT" -Direction Inbound -Protocol TCP -LocalPort 1883,9001 -Action Allow -Profile Any | Out-Null
    Write-Host "OK  regle pare-feu ajoutee (TCP 1883 + 9001 entrants, tous profils)" -ForegroundColor Green
  } else {
    Write-Host "KO  aucune regle pour 1883/9001 -> relance ce script en ADMINISTRATEUR" -ForegroundColor Red
  }
}
Write-Host "`nCompare l'IP du point 2 avec celle affichee par l'ESP au demarrage (moniteur serie) : les 3 premiers nombres doivent etre identiques.`n"
