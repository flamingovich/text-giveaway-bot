# Создаёт архив для загрузки на сервер (без node_modules)
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "giveaway-bot-deploy.zip"

$items = @(
    "src",
    "assets",
    "deploy",
    "data",
    "background.jpg",
    "rollerbot_logo.jpg",
    "package.json",
    "package-lock.json",
    ".env.example",
    "README.md"
)

if (Test-Path $out) { Remove-Item $out -Force }

Push-Location $root
try {
    Compress-Archive -Path $items -DestinationPath $out -Force
    Write-Host "Архив готов: $out"
    Write-Host "Размер: $([math]::Round((Get-Item $out).Length / 1MB, 2)) MB"
} finally {
    Pop-Location
}
