# Minimal dependency-free static file server (raw TCP) for local testing.
# Serves the script's own directory over http://127.0.0.1:<port>/
# localhost is a secure context, so service worker + getUserMedia work.
param([int]$Port = 5180)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8';
  '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8';
  '.webmanifest'='application/manifest+json; charset=utf-8';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif';
  '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.webp'='image/webp';
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.ttf'='font/ttf';
  '.docx'='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  '.xlsx'='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  '.map'='application/json'; '.txt'='text/plain; charset=utf-8';
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "Static server on http://127.0.0.1:$Port  (root: $root)"

function Send-Response($stream, [int]$code, [string]$status, [string]$ctype, [byte[]]$body) {
  $headers = "HTTP/1.1 $code $status`r`n"
  $headers += "Content-Type: $ctype`r`n"
  $headers += "Content-Length: $($body.Length)`r`n"
  $headers += "Cache-Control: no-cache`r`n"
  $headers += "Access-Control-Allow-Origin: *`r`n"
  $headers += "Connection: close`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $stream.Write($hb, 0, $hb.Length)
  if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 5000
    $stream = $client.GetStream()
    # Read request line (enough to get the path).
    $buf = New-Object byte[] 4096
    $read = $stream.Read($buf, 0, $buf.Length)
    if ($read -le 0) { $client.Close(); continue }
    $reqText = [System.Text.Encoding]::ASCII.GetString($buf, 0, $read)
    $firstLine = ($reqText -split "`r`n")[0]
    $parts = $firstLine -split ' '
    $method = $parts[0]; $rawPath = if ($parts.Length -ge 2) { $parts[1] } else { '/' }

    # Strip query/hash, decode, normalize.
    $path = ($rawPath -split '\?')[0]
    $path = ($path -split '#')[0]
    $path = [System.Uri]::UnescapeDataString($path)
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $rel = $path.TrimStart('/').Replace('/', '\')
    $full = Join-Path $root $rel

    # Prevent path traversal: resolved file must stay under root.
    $resolved = $null
    try { $resolved = (Resolve-Path -LiteralPath $full -ErrorAction Stop).Path } catch { $resolved = $null }

    if ($resolved -and $resolved.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved -PathType Leaf)) {
      $ext = [System.IO.Path]::GetExtension($resolved).ToLower()
      $ctype = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($resolved)
      Send-Response $stream 200 'OK' $ctype $bytes
    } else {
      $msg = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found: ' + $path)
      Send-Response $stream 404 'Not Found' 'text/plain; charset=utf-8' $msg
    }
  } catch {
    # ignore per-connection errors
  } finally {
    try { $client.Close() } catch {}
  }
}
