param([ValidateSet('migrate', 'run', 'test', 'build', 'e2e')][string]$Action = 'run')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}

function Initialize-Tools {
    foreach ($tool in @('go.exe', 'node.exe', 'npm.cmd')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Install $tool and add it to PATH. See README.md." }
    }
    New-Item -ItemType Directory -Force -Path .run | Out-Null
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $lockHash = [BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes((Join-Path (Get-Location) 'client/package-lock.json')))) }
    finally { $hasher.Dispose() }
    $stamp = '.run/client-lock.sha256'
    if (-not (Test-Path client/node_modules/.package-lock.json) -or -not (Test-Path $stamp) -or (Get-Content $stamp -Raw).Trim() -ne $lockHash) {
        Invoke-Checked npm.cmd @('--prefix', 'client', 'ci', '--no-audit', '--no-fund')
        Set-Content -Path $stamp -Value $lockHash
    }
    if (-not (Test-Path .run/goreman-v0.3.19.exe)) {
        $previousBin = $env:GOBIN
        try {
            $env:GOBIN = (Resolve-Path .run).Path
            Invoke-Checked go.exe @('install', 'github.com/mattn/goreman@v0.3.19')
            Move-Item -LiteralPath .run/goreman.exe -Destination .run/goreman-v0.3.19.exe
        } finally { $env:GOBIN = $previousBin }
    }
}

function Build-Api {
    $appVersion = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../VERSION') -Raw).Trim()
    if ($appVersion -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$') { throw 'VERSION must contain a software version, for example 0.1.0.' }
    Invoke-Checked go.exe @('-C', 'lms', 'build', '-ldflags', "-X github.com/andreyfesunov/dino_lms/lms/internal/buildinfo.Version=$appVersion", '-o', '../.run/web.exe', './cmd/web')
}

try {
    if ($Action -eq 'run') {
        $apiAddress = if ($env:DINO_SERVER__ADDR) { $env:DINO_SERVER__ADDR } else { '127.0.0.1:8080' }
        $apiPort = [int]($apiAddress.Split(':')[-1])
        foreach ($port in @(4200, $apiPort)) {
            if ([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object Port -eq $port) {
                throw "Port $port is already in use. Stop its server before running just run."
            }
        }
        if ($apiAddress -ne '127.0.0.1:8080') {
            throw 'Development proxy expects DINO_SERVER__ADDR=127.0.0.1:8080. Clear the override or update client/proxy.conf.json.'
        }
    }
    if ($Action -ne 'migrate') {
        Initialize-Tools
    }
    switch ($Action) {
        'migrate' {
            New-Item -ItemType Directory -Force -Path .run | Out-Null
            Invoke-Checked go.exe @('-C', 'lms', 'build', '-o', '../.run/initializer.exe', './cmd/initializer')
            Invoke-Checked ./.run/initializer.exe @('migrate')
        }
        'run' {
            Build-Api
            Invoke-Checked go.exe @('-C', 'lms', 'build', '-o', '../.run/devrun.exe', './cmd/devrun')
            Write-Host 'Dino LMS: http://localhost:4200 (Ctrl+C stops both servers)'
            $previousAddress = $env:DINO_SERVER__ADDR
            try {
                $env:DINO_SERVER__ADDR = '127.0.0.1:8080'
                Invoke-Checked ./.run/devrun.exe @('.run/goreman-v0.3.19.exe', '-f', 'Procfile', '-rpc-server=false', '-set-ports=false', '-exit-on-error', 'start')
            } finally { $env:DINO_SERVER__ADDR = $previousAddress }
        }
        'test' {
            Invoke-Checked go.exe @('-C', 'lms', 'test', './...')
            Invoke-Checked go.exe @('-C', 'lms', 'vet', './...')
            Invoke-Checked npm.cmd @('--prefix', 'client', 'test', '--', '--watch=false')
        }
        'build' {
            Invoke-Checked npm.cmd @('--prefix', 'client', 'run', 'build')
            Build-Api
        }
        'e2e' {
            Invoke-Checked npm.cmd @('--prefix', 'client', 'run', 'test:e2e')
        }
    }
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
