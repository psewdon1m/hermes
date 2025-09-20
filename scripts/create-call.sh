#!/bin/bash

# TGCall Link Generator for Unix/Linux/macOS
# Creates a new video call and returns the shareable link

echo "🚀 TGCall Link Generator"
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the call generator
node "$SCRIPT_DIR/create-call.js" "$@"
