$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore

$htmlPath = Join-Path $PSScriptRoot 'demo-video.html'
$gifPath = Join-Path $PSScriptRoot 'live-poll-demo.gif'
$framesDir = Join-Path $PSScriptRoot '.demo-frames'
foreach ($path in @($framesDir)) {
    if (Test-Path $path) {
        Remove-Item -LiteralPath $path -Recurse -Force
    }
}

New-Item -ItemType Directory -Path $framesDir | Out-Null

& node (Join-Path $PSScriptRoot 'capture-demo-frames.mjs') $htmlPath $framesDir

if ($LASTEXITCODE -ne 0) {
    throw "Frame capture failed with exit code $LASTEXITCODE"
}

if (-not (Get-ChildItem -LiteralPath $framesDir -Filter 'frame-*.png' -ErrorAction SilentlyContinue)) {
    throw "No PNG frames were generated in $framesDir"
}

$encoder = [System.Windows.Media.Imaging.GifBitmapEncoder]::new()

foreach ($framePath in (Get-ChildItem -LiteralPath $framesDir -Filter 'frame-*.png' | Sort-Object Name)) {
    $stream = [System.IO.File]::Open($framePath.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read)

    try {
        $decoder = [System.Windows.Media.Imaging.PngBitmapDecoder]::new(
            $stream,
            [System.Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,
            [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
        )

        $sourceFrame = $decoder.Frames[0]
        $metadata = [System.Windows.Media.Imaging.BitmapMetadata]::new('gif')
        $metadata.SetQuery('/grctlext/Delay', [uint16]16)

        $frame = [System.Windows.Media.Imaging.BitmapFrame]::Create(
            $sourceFrame,
            $sourceFrame.Thumbnail,
            $metadata,
            $sourceFrame.ColorContexts
        )

        $encoder.Frames.Add($frame)
    }
    finally {
        $stream.Dispose()
    }
}

$output = [System.IO.File]::Open($gifPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)

try {
    $encoder.Save($output)
}
finally {
    $output.Dispose()
}

Remove-Item -LiteralPath $framesDir -Recurse -Force
Write-Host "Generated $gifPath"
