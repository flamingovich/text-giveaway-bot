# Деплой на сервер одной командой (вызывается из deploy-update.bat)
$ErrorActionPreference = "Stop"

$localConfig = Join-Path $PSScriptRoot "update-remote.local.ps1"
if (-not (Test-Path $localConfig)) {
    Write-Host ""
    Write-Host "Нет файла deploy\update-remote.local.ps1" -ForegroundColor Yellow
    Write-Host "Скопируйте deploy\update-remote.local.ps1.example -> deploy\update-remote.local.ps1"
    Write-Host "и впишите пароль от сервера."
    Write-Host ""
    exit 1
}

. $localConfig

if (-not $ServerHost) { $ServerHost = "2.26.104.154" }
if (-not $ServerUser) { $ServerUser = "root" }
if (-not $RemoteCommand) { $RemoteCommand = "bash /opt/giveaway-bot/deploy/update.sh" }

$target = "${ServerUser}@${ServerHost}"

Write-Host ""
Write-Host "=== RollerBot: обновление на сервере ===" -ForegroundColor Cyan
Write-Host "Сервер: $target"
Write-Host ""

function Ensure-PoshSSH {
    if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
        Write-Host "Первый запуск: ставлю модуль Posh-SSH (нужен интернет, один раз)..." -ForegroundColor Yellow
        Set-PSRepository PSGallery -InstallationPolicy Trusted -ErrorAction SilentlyContinue
        Install-Module Posh-SSH -Scope CurrentUser -Force -AllowClobber
    }
    Import-Module Posh-SSH -ErrorAction Stop
}

function Invoke-RemoteUpdateWithPassword {
    Ensure-PoshSSH
    $securePassword = ConvertTo-SecureString $ServerPassword -AsPlainText -Force
    $credential = New-Object System.Management.Automation.PSCredential($ServerUser, $securePassword)
    $session = New-SSHSession -ComputerName $ServerHost -Credential $credential -AcceptKey -ErrorAction Stop
    try {
        $result = Invoke-SSHCommand -SessionId $session.SessionId -Command $RemoteCommand
        if ($result.Output) {
            Write-Host $result.Output
        }
        if ($result.Error) {
            Write-Host $result.Error -ForegroundColor DarkYellow
        }
        if ($result.ExitStatus -ne 0) {
            throw "Команда на сервере завершилась с кодом $($result.ExitStatus)"
        }
    } finally {
        Remove-SSHSession -SessionId $session.SessionId | Out-Null
    }
}

function Invoke-RemoteUpdateWithSsh {
    Write-Host "Пароль не задан — ssh запросит его один раз." -ForegroundColor Yellow
    & ssh $target $RemoteCommand
    if ($LASTEXITCODE -ne 0) {
        throw "ssh завершился с кодом $LASTEXITCODE"
    }
}

try {
    if ($ServerPassword) {
        Invoke-RemoteUpdateWithPassword
    } else {
        Invoke-RemoteUpdateWithSsh
    }
    Write-Host ""
    Write-Host "Готово." -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host ""
    Write-Host "Ошибка: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    exit 1
}
