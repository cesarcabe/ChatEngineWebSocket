#!/bin/bash

echo "🚀 ChatEngine WebSocket - GitHub Setup Script"
echo "=============================================="
echo ""

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI is not installed."
    echo "Please install GitHub CLI from: https://cli.github.com/"
    echo ""
    echo "After installation, run: gh auth login"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI."
    echo "Please run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI is authenticated"

# Create repository
echo "📝 Creating GitHub repository 'ChatEngineWebSocket'..."
gh repo create ChatEngineWebSocket --public --description "Mini ChatEngine WebSocket server for Lovable integration with Evolution API"

if [ $? -eq 0 ]; then
    echo "✅ Repository created successfully!"
    echo ""
    echo "🔗 Repository URL: https://github.com/$(gh api user -q '.login')/ChatEngineWebSocket"
    echo ""

    # Add remote origin
    echo "🔗 Adding remote origin..."
    git remote add origin "https://github.com/$(gh api user -q '.login')/ChatEngineWebSocket.git"

    # Push code
    echo "📤 Pushing code to GitHub..."
    git push -u origin main

    if [ $? -eq 0 ]; then
        echo ""
        echo "🎉 Success! Repository setup complete."
        echo "🌐 Visit: https://github.com/$(gh api user -q '.login')/ChatEngineWebSocket"
    else
        echo "❌ Failed to push code. Please check your authentication and try again."
    fi
else
    echo "❌ Failed to create repository. It might already exist."
    echo "Please check: https://github.com/$(gh api user -q '.login')/ChatEngineWebSocket"
fi