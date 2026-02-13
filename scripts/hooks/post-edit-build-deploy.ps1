#!/usr/bin/env pwsh
#---------------------------------------------------------------------------------------------
#  Copyright (c) Dan Shue. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------
#
# Agent Hook: PostToolUse — Build and deploy after file edits
#
# Triggered after editFiles tool completes. Runs the TypeScript build and
# deploys to the test vault. Returns build errors as additionalContext so
# the agent can fix them automatically.
#

$ErrorActionPreference = "Stop"

# Read JSON input from stdin
$inputJson = $input | Out-String
$hookInput = $inputJson | ConvertFrom-Json

# Only run after file-editing tools
$toolName = $hookInput.tool_name
if ($toolName -ne "editFiles" -and $toolName -ne "create_file" -and $toolName -ne "replace_string_in_file" -and $toolName -ne "multi_replace_string_in_file") {
    # Not a file edit — pass through silently
    Write-Output '{}'
    exit 0
}

# Check if any edited files are in src/ or root config files
$toolInput = $hookInput.tool_input | ConvertTo-Json -Depth 10
$relevantPatterns = @("src/", "src\\", "main.ts", "esbuild", "tsconfig", "package.json", "styles/")
$isRelevant = $false
foreach ($pattern in $relevantPatterns) {
    if ($toolInput -match [regex]::Escape($pattern)) {
        $isRelevant = $true
        break
    }
}

if (-not $isRelevant) {
    # Edited files are not plugin source — skip build
    Write-Output '{}'
    exit 0
}

# Run the build
$buildOutput = & npm run build 2>&1 | Out-String

if ($LASTEXITCODE -ne 0) {
    # Build failed — return errors as context so the agent can fix them
    $result = @{
        hookSpecificOutput = @{
            hookEventName     = "PostToolUse"
            additionalContext = "BUILD FAILED. Fix the errors below and try again:`n$buildOutput"
        }
    }
    $result | ConvertTo-Json -Depth 5 -Compress
    exit 0
}

# Build succeeded — deploy
$deployOutput = & node deploy.mjs 2>&1 | Out-String

if ($LASTEXITCODE -ne 0) {
    $result = @{
        hookSpecificOutput = @{
            hookEventName     = "PostToolUse"
            additionalContext = "Build succeeded but DEPLOY FAILED:`n$deployOutput"
        }
    }
    $result | ConvertTo-Json -Depth 5 -Compress
    exit 0
}

# Success — inject confirmation into agent context
$result = @{
    hookSpecificOutput = @{
        hookEventName     = "PostToolUse"
        additionalContext = "Auto build+deploy succeeded. Plugin updated in test vault."
    }
}
$result | ConvertTo-Json -Depth 5 -Compress
exit 0
