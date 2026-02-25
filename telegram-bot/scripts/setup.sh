#!/bin/bash

# EasyPoly Telegram Bot - Quick Setup Script
# Run this after cloning the repo

set -e

echo "🤖 EasyPoly Telegram Bot - Quick Setup"
echo "======================================"
echo ""

# Check Node.js version
echo "📦 Checking Node.js version..."
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
    echo "❌ Node.js 18+ required. You have: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Check for .env file
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env created"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env and add your credentials:"
    echo "   - TELEGRAM_BOT_TOKEN (from @BotFather)"
    echo "   - SUPABASE_URL and keys (from Supabase dashboard)"
    echo "   - PRIVY_APP_ID and secret (from Privy dashboard)"
    echo ""
else
    echo "✅ .env file exists"
    echo ""
fi

# Check if database migrations are needed
echo "📊 Database Setup"
echo "-----------------"
echo "Run this SQL in your Supabase SQL Editor:"
echo ""
echo "   migrations/001_initial_schema.sql"
echo ""
echo "Or use psql:"
echo "   psql -h <host> -U postgres -d postgres -f migrations/001_initial_schema.sql"
echo ""

# Display next steps
echo "✅ Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Edit .env with your credentials"
echo "2. Run database migrations (see above)"
echo "3. Test locally: npm run dev"
echo "4. Deploy to Railway: railway up"
echo ""
echo "📚 Documentation:"
echo "   - README.md - Full setup guide"
echo "   - TESTING.md - Testing procedures"
echo "   - DEPLOYMENT_CHECKLIST.md - Production deployment"
echo "   - PROJECT_SUMMARY.md - Complete overview"
echo ""
echo "🚀 Ready to launch!"
