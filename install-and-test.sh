#!/bin/bash
# Complete installation and testing script for peanut-core with vectordb

set -e  # Exit on error

echo "🥜 Peanut-Core Installation & Testing"
echo "======================================"
echo ""

cd ~/Downloads/peanut-core

# Step 1: Clean environment
echo "🧹 Step 1/5: Cleaning previous builds and caches..."
rm -rf node_modules/.cache
rm -rf dist/
rm -rf .ts-node
rm -rf *.db *.db-*
echo "   ✅ Cleaned"
echo ""

# Step 2: Install all dependencies (including vectordb)
echo "📦 Step 2/5: Installing dependencies (this will take 2-3 minutes)..."
echo "   Installing vectordb with native dependencies..."
npm install --no-audit
echo "   ✅ All dependencies installed"
echo ""

# Step 3: Build TypeScript
echo "🔨 Step 3/5: Building TypeScript..."
npm run build
echo "   ✅ Build complete"
echo ""

# Step 4: Run end-to-end tests
echo "🧪 Step 4/5: Running end-to-end system test..."
echo ""
npm run test:e2e
echo ""

# Step 5: Run learning loop test
echo "🧠 Step 5/5: Running learning loop test..."
echo ""
npm run test:learning
echo ""

# Success summary
echo "======================================"
echo "✅ ALL TESTS PASSED!"
echo "======================================"
echo ""
echo "📊 Summary:"
echo "   - vectordb: Installed and working"
echo "   - Entity resolution: ✅"
echo "   - Search engine: ✅"
echo "   - Personality engine: ✅"
echo "   - Engagement optimization: ✅"
echo "   - Learning loop: ✅"
echo ""
echo "🚀 peanut-core is ready for Skippy integration!"
