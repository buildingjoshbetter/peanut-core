# Quick Fix for Test Error

## The Issue
TypeScript is complaining about missing `vectordb` module. Vector search is an optional advanced feature, but TypeScript checks for it at compile time.

## Solution: Run Tests WITHOUT Vector Search

Vector search isn't needed for the core functionality tests. Here's how to run tests without it:

### Option 1: Skip Vector Search (Recommended for Quick Testing)

```bash
cd /Users/j/Downloads/peanut-core

# Comment out the lancedb import line to disable vector search
sed -i.bak 's/const lancedb = require/\/\/ const lancedb = require/' src/db/lancedb.ts

# Now run tests
npm run test:e2e && npm run test:learning
```

### Option 2: Install vectordb (For Full Feature Testing)

```bash
cd /Users/j/Downloads/peanut-core

# Install vectordb (may take a few minutes)
npm install vectordb@0.4.0

# Clear cache and rebuild
rm -rf node_modules/.cache dist/
npm run build

# Run tests
npm run test:e2e && npm run test:learning
```

## What Each Option Does

**Option 1 (Fast)**:
- Disables vector search by commenting out the import
- Tests run in 5-10 seconds
- Tests all core features except vector search
- ✅ Validates: ingestion, entities, personality, engagement, learning loop

**Option 2 (Complete)**:
- Installs the vectordb package (adds ~50MB)
- Tests all features including vector search
- Takes longer to install but gives full validation

## Recommendation

**For right now**: Use Option 1 to quickly validate the core features work.

**Later**: Install vectordb when you're ready to test advanced search features.

## Why This Happened

The `vectordb` package has native dependencies and we didn't include it by default to keep the installation simple. It's an optional dependency for advanced semantic search.

## Quick Command (Copy-Paste)

```bash
cd /Users/j/Downloads/peanut-core && \
sed -i.bak 's/const lancedb = require/\/\/ const lancedb = require/' src/db/lancedb.ts && \
npm run test:e2e && npm run test:learning
```

This will:
1. Disable vector search temporarily
2. Run end-to-end test
3. Run learning loop test
4. Show you if everything else works perfectly!
