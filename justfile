set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

default:
    @just --list

migrate:
    @& ./scripts/dev.ps1 migrate

run:
    @& ./scripts/dev.ps1 run

test:
    @& ./scripts/dev.ps1 test

build:
    @& ./scripts/dev.ps1 build

e2e:
    @& ./scripts/dev.ps1 e2e
