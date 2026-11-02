[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

function Convert-ImageToBase64($filePath) {
    try {
        $img = [System.Drawing.Image]::FromFile($filePath)
        $maxDim = 800
        $w = $img.Width
        $h = $img.Height
        if ($w -gt $maxDim -or $h -gt $maxDim) {
            if ($w -gt $h) {
                $h = [int]($h * $maxDim / $w)
                $w = $maxDim
            } else {
                $w = [int]($w * $maxDim / $h)
                $h = $maxDim
            }
        }
        $bmp = New-Object System.Drawing.Bitmap($w, $h)
        $graph = [System.Drawing.Graphics]::FromImage($bmp)
        $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graph.DrawImage($img, 0, 0, $w, $h)
        
        $ms = New-Object System.IO.MemoryStream
        $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.FormatDescription -eq "JPEG" }
        $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]82)
        $bmp.Save($ms, $codec, $ep)
        
        $bytes = $ms.ToArray()
        $base64 = [Convert]::ToBase64String($bytes)
        $img.Dispose()
        $bmp.Dispose()
        $graph.Dispose()
        $ms.Dispose()
        return "data:image/jpeg;base64,$base64"
    } catch {
        return $null
    }
}

$kizlarFolder = Join-Path $PSScriptRoot "kizlar"
$erkeklerFolder = Join-Path $PSScriptRoot "erkekler"

$kizlarFiles = Get-ChildItem -Path $kizlarFolder -File | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png|webp)$' -and $_.Name -notmatch '^desktop\.ini$' } | Sort-Object Name
$erkeklerFiles = Get-ChildItem -Path $erkeklerFolder -File | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png|webp)$' -and $_.Name -notmatch '^desktop\.ini$' } | Sort-Object Name

Write-Host "Kizlar: $($kizlarFiles.Count) fotograf" -ForegroundColor Cyan
Write-Host "Erkekler: $($erkeklerFiles.Count) fotograf" -ForegroundColor Cyan

$kizlarList = @()
$idx = 1
foreach ($f in $kizlarFiles) {
    if ($idx -gt 15) { break }
    $name = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
    Write-Host "Kiz #$idx : $name"
    $b64 = Convert-ImageToBase64 $f.FullName
    $kizlarList += @{
        slot = $idx
        name = $name
        dataUrl = $b64
    }
    $idx++
}

$erkeklerList = @()
$idx = 1
foreach ($f in $erkeklerFiles) {
    if ($idx -gt 15) { break }
    $name = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
    Write-Host "Erkek #$idx : $name"
    $b64 = Convert-ImageToBase64 $f.FullName
    $erkeklerList += @{
        slot = $idx
        name = $name
        dataUrl = $b64
    }
    $idx++
}

$sharedObj = @{
    kizlar = $kizlarList
    erkekler = $erkeklerList
}

$json = $sharedObj | ConvertTo-Json -Depth 5
$jsContent = "/**`n * Big5 Genel Fotograf Verisi`n * Guncellenme: $(Get-Date -Format 'dd.MM.yyyy HH:mm:ss')`n */`nwindow.BIG5_SHARED_DATA = $json;`n"

$outPath = Join-Path $PSScriptRoot "photos.js"
[System.IO.File]::WriteAllText($outPath, $jsContent, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "photos.js UTF-8 basariyla olusturuldu!" -ForegroundColor Green

& "C:\Program Files\Git\cmd\git.exe" add photos.js
& "C:\Program Files\Git\cmd\git.exe" commit -m "Update clean candidate names with UTF-8"
& "C:\Program Files\Git\cmd\git.exe" push origin main

Write-Host "GitHub guncellemesi tamamlandi!" -ForegroundColor Green
