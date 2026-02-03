#!/bin/bash
# Fix dependencies and run tests

echo "🔧 Fixing peanut-core dependencies..."
echo ""

# 1. Install vectordb dependency
echo "📦 Installing vectordb..."
npm install vectordb@0.4.0

# 2. Clear any TypeScript caches
echo "🧹 Clearing caches..."
rm -rf node_modules/.cache
rm -rf dist/

# 3. Rebuild
echo "🔨 Building..."
npm run build

# 4. Run tests
echo ""
echo "🧪 Running tests..."
echo ""
npm run test:e2e

echo ""
echo "🧠 Testing learning loop..."
echo ""
npm run test:learning
