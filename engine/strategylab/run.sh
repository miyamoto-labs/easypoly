#!/bin/bash

# Strategy Lab Backend Startup Script

echo "🧪 Starting Strategy Lab Backend..."
echo ""

# Check Python version
python3 --version

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found - using mock data for development"
    echo "To use real Synthdata API, create .env with: SYNTHDATA_API_KEY=your_key_here"
fi

echo ""
echo "✅ Backend starting on http://localhost:8001"
echo ""

# Run the server
python main.py
