param(
  [string]$Output = "client-demo/gold-khanjar/audio/narration-piper-male.wav"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $root "client-demo/gold-khanjar/narration-ja.txt"
$outputPath = Join-Path $root $Output
$outputDirectory = Split-Path -Parent $outputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$piperRoot = Join-Path $root ".tmp-piper"
$model = Join-Path $piperRoot "models/ja_JP-hi_fi_captain-medium.onnx"
$config = "$model.json"
if (!(Test-Path -LiteralPath $model) -or !(Test-Path -LiteralPath $config)) {
  throw "Piperの日本語音声モデルがありません: $model"
}
$env:PYTHONPATH = $piperRoot
py -m piper `
  --model $model `
  --config $config `
  --input-file $scriptPath `
  --output-file $outputPath `
  --speaker 1 `
  --length-scale 0.82 `
  --sentence-silence 0.12
if ($LASTEXITCODE -ne 0) { throw "Piper narration generation failed ($LASTEXITCODE)" }

Write-Output $outputPath
