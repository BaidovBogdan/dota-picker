$targetPath = $env:COUNTERPICK_OVERWOLF_INSTALLER
$sourceUri = [Uri]'https://download.overwolf.com/install/Download?utm_content=new-light&utm_source=web_app_store'
$allowedHost = 'download.overwolf.com'
$minimumBytes = 65536
$maximumBytes = 67108864

if ([string]::IsNullOrWhiteSpace($targetPath)) {
  exit 10
}

$handler = $null
$client = $null
$response = $null
try {
  Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
  $handler = [Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect = $false
  $handler.AutomaticDecompression = [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
  $client = [Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromMinutes(2)
  $client.DefaultRequestHeaders.UserAgent.TryParseAdd('Counterpick-Desktop-Installer') | Out-Null
  $currentUri = $sourceUri
  for ($redirect = 0; $redirect -le 5; $redirect += 1) {
    if ($currentUri.Scheme -ne 'https' -or $currentUri.Host -ne $allowedHost) {
      throw [InvalidOperationException]::new('The download redirect is not allowlisted')
    }

    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Get, $currentUri)
    try {
      $response = $client.SendAsync($request, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    } finally {
      $request.Dispose()
    }

    $statusCode = [int]$response.StatusCode
    if ($statusCode -ge 300 -and $statusCode -lt 400) {
      $location = $response.Headers.Location
      $response.Dispose()
      $response = $null
      if ($null -eq $location -or $redirect -eq 5) {
        throw [InvalidOperationException]::new('The download redirect chain is invalid')
      }
      $currentUri = if ($location.IsAbsoluteUri) { $location } else { [Uri]::new($currentUri, $location) }
      continue
    }

    $response.EnsureSuccessStatusCode() | Out-Null
    break
  }

  if ($null -eq $response) {
    throw [InvalidOperationException]::new('The download did not return a response')
  }

  $contentLength = $response.Content.Headers.ContentLength
  if ($null -ne $contentLength -and $contentLength -gt $maximumBytes) {
    throw [InvalidOperationException]::new('The download is larger than the configured limit')
  }

  $inputStream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
  $outputStream = [IO.File]::Open($targetPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $buffer = [byte[]]::new(65536)
    $totalBytes = 0L
    while (($readBytes = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $totalBytes += $readBytes
      if ($totalBytes -gt $maximumBytes) {
        throw [InvalidOperationException]::new('The download exceeded the configured limit')
      }
      $outputStream.Write($buffer, 0, $readBytes)
    }
    $outputStream.Flush()
  } finally {
    $outputStream.Dispose()
    $inputStream.Dispose()
    $response.Dispose()
  }

  $downloadedBytes = [IO.File]::ReadAllBytes($targetPath)
  if ($downloadedBytes.Length -lt $minimumBytes -or $downloadedBytes.Length -gt $maximumBytes -or $downloadedBytes[0] -ne 0x4D -or $downloadedBytes[1] -ne 0x5A) {
    throw [InvalidOperationException]::new('The download is not a bounded Windows executable')
  }

  exit 0
} catch {
  Remove-Item -LiteralPath $targetPath -Force -ErrorAction SilentlyContinue
  exit 1
} finally {
  if ($null -ne $response) {
    $response.Dispose()
  }
  if ($null -ne $client) {
    $client.Dispose()
  }
  if ($null -ne $handler) {
    $handler.Dispose()
  }
}
