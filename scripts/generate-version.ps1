# 从 package.json 读取版本号并生成 C++ 头文件

param(
    [string]$PackageJsonPath = "package.json",
    [string]$OutputPath = "wasm/src/version.h"
)

try {
    # 读取 package.json
    $packageJson = Get-Content $PackageJsonPath -Raw | ConvertFrom-Json
    $version = $packageJson.version

    Write-Host "Generating version.h with version: $version" -ForegroundColor Cyan

    # 生成头文件内容
    $headerContent = @"
/**
 * Auto-generated version header
 * DO NOT EDIT MANUALLY
 */
#pragma once

#define DICE_VERSION "$version"
"@

    # 写入文件
    $OutputPath = Join-Path $PSScriptRoot ".." $OutputPath
    $headerContent | Out-File -FilePath $OutputPath -Encoding UTF8 -NoNewline

    Write-Host "✓ Generated: $OutputPath" -ForegroundColor Green
}
catch {
    Write-Host "✗ Failed to generate version.h: $_" -ForegroundColor Red
    exit 1
}
