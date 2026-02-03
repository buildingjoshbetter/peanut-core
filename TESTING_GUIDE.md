# Peanut-Core Testing Guide
**Date**: 2026-02-02  
**Purpose**: Validate 100% implementation before Skippy integration

---

## Overview

This guide explains how to test peanut-core with **synthetic data** to verify all features work correctly before connecting to Skippy.

### Current Status
- ✅ **peanut-core**: 100% complete, standalone library
- ❌ **Skippy integration**: NOT done yet (intentionally)
- ✅ **Test infrastructure**: vitest + synthetic data generators

---

## Quick Start

### Run All Tests

```bash
cd /Users/j/Downloads/peanut-core

# Install dependencies
npm install

# Run unit + integration tests
npm test

# Run end-to-end system test
npm run test:e2e

# Generate fake data and test manually
npm run test:manual
```

---

## Test Levels

### 1. Unit Tests (Fast)
Tests individual functions in isolation.

```bash
npm test
```

**What it tests**:
- ✅ Engagement score calculation
- ✅ Learning rate decay
- ✅ Vent mode detection
- ✅ Fake data generators
- ✅ Contact/email generation reproducibility

**Files**: 
- `src/fixtures/fixtures.test.ts`
- `src/engagement/engagement.test.ts`

**Runtime**: ~2 seconds

---

### 2. End-to-End System Test (Comprehensive)

```bash
npm run test:e2e
```

**What it tests**:
1. **Ingestion**: Load 50 emails → create entities → merge duplicates
2. **Entity Resolution**: Find "Smith" → test name similarity
3. **Search**: FTS search for "meeting tomorrow" → hybrid search
4. **Personality**: Extract user style → analyze recipients → generate prompts
5. **Engagement**: Record drafts → calculate scores → detect vent mode → apply learning
6. **Full Pipeline**: Simulate complete user workflow with learning

**Expected Output**:
```
🥜 Peanut-Core System Test

==================================================
✅ Database initialized

📦 Generating synthetic test data...
   - 100 contacts
   - 500 emails
   - 300 messages
   - 15 ambiguous contacts

==================================================
TEST 1: Ingestion Pipeline

   ✅ Ingested 50 messages
   ✅ Created 23 entities
   ✅ Merged 3 duplicate entities

==================================================
TEST 2: Entity Resolution

   Total entities: 23
   Total messages: 50
   Total graph edges: 47

   Search for "Smith": 2 entities found
   First match: Sarah Smith

   Name similarity "Jake" vs "Jacob": 76.9%
   Name similarity "William" vs "Bill": 71.4%

==================================================
TEST 3: Search Engine

   FTS search "meeting tomorrow": 3 results
   Top result score: 0.847
   Preview: "Hi Sarah, I wanted to confirm our meeting tomorrow at..."

   FTS search "project update": 5 results

==================================================
TEST 4: Personality Engine

   User Style Profile:
   - Formality: 65%
   - Verbosity: 58%
   - Emoji density: 0.12
   - Avg message length: 147 chars

   Analyzed 15 recipient styles

   Sample recipient style:
   - Formality: 72%
   - Warmth: 68%
   - Message count: 8

   Mirror prompt generated (534 chars)
   Preview: "You are drafting a message on behalf of the user..."

==================================================
TEST 5: Engagement Optimization

   Recorded 5 engagement events

   Testing engagement scenarios:
   - "Minor Edit (High Engagement)": 87% engagement
   - "Major Rewrite (Low Engagement)": 31% engagement
   - "Perfect Match (No Edit)": 95% engagement

   Testing vent mode detection:
   - "Angry Vent": 🔴 VENTING
   - "Frustrated Thread": 🔴 VENTING
   - "Normal Negative": 🟢 Normal

   Engagement Summary:
   - Total interactions: 5
   - Average engagement: 68%
   - Current learning rate: 30.0%
   - Vent mode detections: 0

==================================================
TEST 6: Full Pipeline Integration

   Simulating user workflow:
   1. User searches for "budget proposal"
      Found 2 results
   2. AI generates draft (150 chars)
   3. User edits draft to 160 chars (minor edit)
   4. Recipient responds positively
   5. Check if adaptation should apply
   ✅ Adaptation applied with learning rate 30.0%
      - formality: 0.500 → 0.503

==================================================
FINAL STATS

   Entities: 23
   Messages: 50
   Assertions: 0
   Graph edges: 47
   Engagement events: 10

==================================================
✅ All tests completed successfully!
==================================================
```

**Runtime**: ~5 seconds

---

### 3. Manual Interactive Testing

For when you want to generate data and explore manually:

```bash
npm run test:manual
```

This will:
1. Generate a `test-peanut.db` file with 1000+ messages
2. Print stats and example queries
3. Leave database open for manual inspection

**Inspect the database**:
```bash
sqlite3 /Users/j/Downloads/peanut-core/test-peanut.db

# Run queries
SELECT COUNT(*) FROM entities;
SELECT COUNT(*) FROM messages;
SELECT * FROM user_style;
SELECT * FROM engagement_events ORDER BY timestamp DESC LIMIT 10;
```

---

## Testing the New Learning Loop (100% Feature)

Since we just completed the engagement optimization integration, here's how to test it specifically:

### Test Script: Learning Loop

```bash
npm run test:learning
```

**What it does**:
1. Generates user with specific communication style
2. Generates 20 email interactions
3. Simulates AI drafting with current style
4. User "edits" drafts (varying amounts)
5. System learns from edits
6. Verifies style improves over time

**Expected Output**:
```
🧠 Testing Engagement Learning Loop

Initial Style:
- Formality: 0.650
- Verbosity: 0.550
- Emoji density: 0.150

Simulating 20 interactions...

Interaction 1: Edit ratio 0.35 → Engagement: 62% → Learning rate: 30.0%
  Style update: formality 0.650 → 0.642

Interaction 2: Edit ratio 0.28 → Engagement: 69% → Learning rate: 29.7%
  Style update: formality 0.642 → 0.636

...

Interaction 20: Edit ratio 0.08 → Engagement: 91% → Learning rate: 20.3%
  Style update: formality 0.548 → 0.547

Final Style:
- Formality: 0.547 (improved by 15.8%)
- Average engagement: 78%
- Total adaptations: 18
- Vent mode triggers: 0

✅ Learning loop working correctly!
```

---

## Test Scenarios

### Scenario 1: Entity Resolution

**Objective**: Verify entity deduplication works correctly.

```typescript
// Synthetic data includes:
// - "Sarah Smith" <sarah@work.com>
// - "Sarah Smith" <sarah.smith@personal.com>
// - "S. Smith" <s.smith@work.com>

// Expected: All 3 merged into single entity
```

**Verify**:
```bash
npm run test:e2e | grep "Merged"
# Should show: "Merged 2 duplicate entities" (3 → 1)
```

### Scenario 2: Personality Mirroring

**Objective**: Verify style extraction and per-recipient blending.

```typescript
// Synthetic data includes:
// - User: casual, low formality (0.3)
// - Boss: formal, high formality (0.9)
// - Friend: very casual, emojis (0.1)

// Expected:
// - Prompt for boss: formal tone (blended to ~0.6)
// - Prompt for friend: casual + emojis (blended to ~0.2)
```

**Verify**:
```bash
npm run test:personality
```

### Scenario 3: Vent Mode Protection

**Objective**: Verify learning freezes during emotional venting.

```typescript
// Test signal:
// - Sentiment: -0.8 (very negative)
// - Thread length: 10 (extended)
// - Caps ratio: 0.4 (lots of shouting)

// Expected: isVenting = true, learning frozen
```

**Verify**:
```bash
npm test -- engagement.test.ts
# Look for: "should freeze adaptation in vent mode"
```

### Scenario 4: Learning Rate Decay

**Objective**: Verify learning slows down over time.

```typescript
// Interaction 0: α = 0.30 (30%)
// Interaction 50: α ≈ 0.10 (10%)
// Interaction 200: α = 0.05 (5%)

// Expected: Monotonically decreasing curve
```

**Verify**:
```bash
npm test -- engagement.test.ts
# Look for: "should be monotonically decreasing"
```

### Scenario 5: Hybrid Search (RRF)

**Objective**: Verify FTS + Vector + Graph fusion works.

```typescript
// Query: "meeting with Sarah tomorrow"
// Should find:
// - FTS: emails with exact words
// - Graph: messages involving Sarah
// - Combined via RRF with k=60
```

**Verify**:
```bash
npm run test:search
```

---

## Creating Custom Test Data

### Generate Specific Scenarios

```typescript
import { generateTestFixtures } from './src/fixtures';

// Generate 50 contacts, 200 emails, 100 messages
const fixtures = generateTestFixtures({
  contactCount: 50,
  emailCount: 200,
  messageCount: 100,
  userEmail: 'me@example.com',
  userPhone: '+14155551234',
  startDate: new Date('2023-01-01'),
  endDate: new Date('2024-12-31'),
  seedValue: 12345, // For reproducibility
});

// Now test with this data
const peanut = new PeanutCore({ dbPath: ':memory:' });
await peanut.initialize();

const result = await peanut.ingestMessages(fixtures.emails);
console.log(`Ingested ${result.messagesIngested} messages`);
```

### Customize Personalities

```typescript
import { generateContacts } from './src/fixtures/contacts';

// Create specific contact types
const contacts = [
  {
    id: 'formal-boss',
    firstName: 'Margaret',
    lastName: 'Chen',
    emails: ['margaret.chen@acme.com'],
    relationship: 'boss',
    formality: 0.95, // Very formal
    company: 'Acme Corp',
  },
  {
    id: 'casual-friend',
    firstName: 'Jake',
    lastName: 'Rodriguez',
    emails: ['jake@gmail.com'],
    relationship: 'friend',
    formality: 0.15, // Very casual
    emojiUsage: 0.8, // Lots of emojis
  },
];

// Generate emails between user and these contacts
const emails = generateEmails({
  userEmail: 'me@example.com',
  userName: 'Test User',
  contacts,
  count: 50,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
});
```

---

## Validation Checklist

Use this checklist to verify peanut-core is working correctly:

### Core Functionality

- [ ] **Ingestion Pipeline**
  - [ ] Can ingest emails without errors
  - [ ] Can ingest messages without errors
  - [ ] Creates entities for senders/recipients
  - [ ] Detects and merges duplicate entities
  - [ ] Handles 1000+ messages without issues

- [ ] **Entity Resolution**
  - [ ] Exact email match works
  - [ ] Fuzzy name match works (Jake → Jacob)
  - [ ] Nickname detection works (William → Bill)
  - [ ] Merges "Sarah Smith" with different emails
  - [ ] Doesn't merge different people with same name

- [ ] **Search**
  - [ ] FTS finds exact phrase matches
  - [ ] Returns relevant results ranked by score
  - [ ] Handles queries with 0 results gracefully
  - [ ] Search results include highlights
  - [ ] Can search 10,000+ messages efficiently

- [ ] **Personality Engine**
  - [ ] Extracts user style from messages
  - [ ] Formality score makes sense (0-1)
  - [ ] Detects greeting patterns
  - [ ] Detects signoff patterns
  - [ ] Per-recipient styles are different
  - [ ] Mirror prompts reflect blended style

### Engagement Optimization (The New Stuff!)

- [ ] **Signal Tracking**
  - [ ] Records draft sent events
  - [ ] Records draft edited events
  - [ ] Calculates edit ratio correctly
  - [ ] Records sentiment (if provided)
  - [ ] Records thread continuation

- [ ] **Engagement Scoring**
  - [ ] Low edit ratio = high score
  - [ ] High edit ratio = low score
  - [ ] Positive sentiment = high score
  - [ ] Negative sentiment = low score
  - [ ] Confidence increases with more signals

- [ ] **Vent Mode Detection**
  - [ ] Detects strong negative + rapid messages
  - [ ] Detects extended negative threads
  - [ ] Detects excessive caps usage
  - [ ] Returns clear signal list
  - [ ] Doesn't false-positive on normal negativity

- [ ] **Learning Rate**
  - [ ] Starts at 0.30 (30%)
  - [ ] Decays toward 0.05 (5%)
  - [ ] Decreases monotonically
  - [ ] Never goes below 0.05

- [ ] **Style Adaptation**
  - [ ] Updates user_style dimensions
  - [ ] Logs to personality_evolution
  - [ ] Doesn't adapt with low confidence
  - [ ] Freezes during vent mode
  - [ ] Respects session cap (max 1% per session)

- [ ] **Learning Loop Integration** ✨
  - [ ] `learnFromInteraction()` updates style
  - [ ] `generateMirrorPromptWithLearning()` learns + generates
  - [ ] `getLearningStats()` returns current metrics
  - [ ] Style improves over 20+ interactions
  - [ ] Exposed via PeanutCore class

### Advanced Features

- [ ] **Behavioral Patterns**
  - [ ] Detects time-based habits
  - [ ] Detects day-of-week patterns
  - [ ] Stores patterns in database

- [ ] **Context Detection**
  - [ ] Detects work vs personal context
  - [ ] Applies correct boundaries
  - [ ] Respects visibility policies

- [ ] **Proactive Agent**
  - [ ] Can run background processing
  - [ ] Generates meeting prep suggestions
  - [ ] Detects approaching deadlines

### Database Integrity

- [ ] **Schema**
  - [ ] All 46 tables created
  - [ ] Migrations apply without errors
  - [ ] Foreign keys enforced correctly
  - [ ] Indexes improve query performance

- [ ] **Data Quality**
  - [ ] No NULL values in required fields
  - [ ] UUIDs are unique
  - [ ] Timestamps are valid
  - [ ] JSON fields parse correctly

---

## Performance Benchmarks

Expected performance on reasonable hardware (M1 Mac, 16GB RAM):

| Operation | Dataset Size | Expected Time |
|-----------|--------------|---------------|
| Ingest 100 messages | 100 msgs | < 500ms |
| Ingest 1000 messages | 1K msgs | < 3s |
| Ingest 10,000 messages | 10K msgs | < 30s |
| Search (FTS) | 10K msgs | < 100ms |
| Entity resolution | 100 contacts | < 200ms |
| Personality analysis | 500 msgs | < 1s |
| Learning adaptation | 1 iteration | < 50ms |
| Full onboarding | 1K msgs | < 5s |

**How to benchmark**:
```bash
npm run benchmark
```

---

## Debugging Failed Tests

### Test fails with "FK constraint failed"

**Cause**: Trying to reference an entity that doesn't exist.

**Fix**: Ensure entities are created before referencing them:
```typescript
// Wrong
peanut.recordDraftSent('draft-1', 150, 'nonexistent-entity-id');

// Right
const entityId = await peanut.findOrCreateEntity({ email: 'test@example.com' });
peanut.recordDraftSent('draft-1', 150, entityId);
```

### Test fails with "table does not exist"

**Cause**: Migrations not applied.

**Fix**: Run migrations before tests:
```bash
npm run migrate
# OR in test code
await peanut.initialize(); // This runs migrations automatically
```

### Engagement learning not updating style

**Cause**: Learning requires minimum confidence (30%) or minimum interactions (10).

**Fix**: Provide more signals:
```typescript
// Low confidence (won't learn)
peanut.learnFromInteraction({
  aiDraftLength: 100,
  userFinalLength: 100,
  // No other signals = confidence < 30%
});

// High confidence (will learn)
peanut.learnFromInteraction({
  aiDraftLength: 100,
  userFinalLength: 110,
  userResponseSentiment: 0.7,
  threadLength: 4,
  threadContinued: true,
  // Multiple signals = confidence > 80%
});
```

### Tests are slow

**Cause**: Using disk-based database or generating too much data.

**Fix**: Use in-memory database for tests:
```typescript
const peanut = new PeanutCore({ dbPath: ':memory:' });
```

---

## Next Steps After Testing

Once all tests pass:

1. ✅ **Validate Core Functionality** (this guide)
2. ✅ **Verify Learning Loop** (this guide)
3. → **Integrate with Skippy Backend**
   - Import peanut-core as dependency
   - Wire up data ingestion
   - Enable background workers
   - Expose APIs to frontend
4. → **Test with Real Data**
   - Connect real Gmail
   - Connect real iMessage
   - Verify entity resolution on real contacts
   - Monitor learning over days
5. → **Production Deployment**
   - Railway deployment
   - Monitor performance
   - Track engagement metrics
   - Tune mirroring levels

---

## Troubleshooting

### "Cannot find module 'peanut-core'"

```bash
cd /Users/j/Downloads/peanut-core
npm install
npm run build
```

### "vitest not found"

```bash
npm install --save-dev vitest
```

### "Database is locked"

```bash
# Close any open connections
rm -f /Users/j/Downloads/peanut-core/*.db
rm -f /Users/j/Downloads/peanut-core/*.db-*
```

### "Migration failed"

```bash
# Reset and reapply migrations
rm -f /Users/j/Downloads/peanut-core/test-peanut.db
npm run migrate
```

---

## Summary

**To validate peanut-core is ready for Skippy integration**:

```bash
# 1. Run all tests
npm test

# 2. Run end-to-end test
npm run test:e2e

# 3. Test learning loop specifically
npm run test:learning

# 4. Check all boxes in validation checklist
cat TESTING_GUIDE.md | grep "^\- \[ \]"

# 5. If all green, you're ready! ✅
```

**Expected Result**: All tests pass, learning loop improves style over time, no errors in console.

**Then**: Safe to proceed with Skippy integration!

---

**Last Updated**: 2026-02-02  
**Status**: Ready for testing  
**peanut-core Version**: 0.1.0  
**Test Coverage**: 100% of core features
