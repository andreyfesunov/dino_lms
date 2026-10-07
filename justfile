set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

default:
    @just --list

setup:
    @& ./scripts/dev.ps1 setup

run:
    @& ./scripts/dev.ps1 run

test:
    @& ./scripts/dev.ps1 test

build:
    @& ./scripts/dev.ps1 build

e2e:
    @& ./scripts/dev.ps1 e2e
