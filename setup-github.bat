@echo off
echo 🚀 ChatEngine WebSocket - GitHub Setup Script
echo ==============================================
echo.

REM Check if GitHub CLI is installed
gh --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ GitHub CLI is not installed.
    echo Please install GitHub CLI from: https://cli.github.com/
    echo.
    echo After installation, run: gh auth login
    goto :eof
)

REM Check if user is authenticated
gh auth status >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Not authenticated with GitHub CLI.
    echo Please run: gh auth login
    goto :eof
)

echo ✅ GitHub CLI is authenticated

REM Create repository
echo 📝 Creating GitHub repository 'ChatEngineWebSocket'...
gh repo create ChatEngineWebSocket --public --description "Mini ChatEngine WebSocket server for Lovable integration with Evolution API"

if %errorlevel% equ 0 (
    echo ✅ Repository created successfully!
    echo.

    REM Get username for URL construction
    for /f "tokens=*" %%i in ('gh api user -q ".login"') do set GH_USERNAME=%%i
    echo 🔗 Repository URL: https://github.com/%GH_USERNAME%/ChatEngineWebSocket
    echo.

    REM Add remote origin
    echo 🔗 Adding remote origin...
    git remote add origin "https://github.com/%GH_USERNAME%/ChatEngineWebSocket.git"

    REM Push code
    echo 📤 Pushing code to GitHub...
    git push -u origin main

    if %errorlevel% equ 0 (
        echo.
        echo 🎉 Success! Repository setup complete.
        echo 🌐 Visit: https://github.com/%GH_USERNAME%/ChatEngineWebSocket
    ) else (
        echo ❌ Failed to push code. Please check your authentication and try again.
    )
) else (
    echo ❌ Failed to create repository. It might already exist.
    echo Please check your GitHub account for existing repositories.
)