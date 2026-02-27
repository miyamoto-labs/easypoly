#!/bin/bash

# Strategy Lab Polish - Quick Test Script

echo "🧪 Testing Strategy Lab Implementation..."
echo ""

# Check if all files exist
echo "📁 Checking files..."
files=(
  "app/dashboard/lab/page.tsx"
  "app/dashboard/lab/components/ResultsActions.tsx"
  "app/dashboard/lab/components/SkeletonLoader.tsx"
  "app/dashboard/lab/leaderboard/page.tsx"
  "app/api/lab/share/route.ts"
  "supabase/migrations/20260225_create_lab_backtests.sql"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ MISSING: $file"
  fi
done

echo ""
echo "📦 Checking dependencies..."

# Check if html2canvas is installed
if grep -q '"html2canvas"' package.json; then
  echo "✅ html2canvas installed"
else
  echo "❌ html2canvas NOT installed"
fi

# Check if file-saver is installed
if grep -q '"file-saver"' package.json; then
  echo "✅ file-saver installed"
else
  echo "❌ file-saver NOT installed"
fi

# Check if @types/file-saver is installed
if grep -q '"@types/file-saver"' package.json; then
  echo "✅ @types/file-saver installed"
else
  echo "❌ @types/file-saver NOT installed"
fi

echo ""
echo "🔍 Checking for syntax errors..."

# Try to build (TypeScript check)
echo "Running TypeScript check..."
npm run build --dry-run 2>&1 | head -20

echo ""
echo "✅ Test complete!"
echo ""
echo "📋 Next steps:"
echo "1. Run: npm run dev"
echo "2. Navigate to: http://localhost:3000/dashboard/lab"
echo "3. Test all features from STRATEGY_LAB_POLISH.md"
echo "4. Run Supabase migration"
echo ""
