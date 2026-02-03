# Skippy Integration Status

**Date**: 2026-02-02  
**peanut-core Version**: 0.1.0 (100% Complete)  
**Integration Status**: ❌ **NOT INTEGRATED YET**

---

## Current Architecture

### What We Have Now

```
┌─────────────────────────────────────────────────────────┐
│                    SKIPPY (Existing)                    │
│                                                         │
│  - Frontend UI                                          │
│  - Backend API                                          │
│  - Gmail sync                                           │
│  - iMessage reading                                     │
│  - Calendar access                                      │
│  - OCR processing                                       │
│                                                         │
│  Status: ✅ Working independently                       │
└─────────────────────────────────────────────────────────┘

                         ❌ NO CONNECTION ❌

┌─────────────────────────────────────────────────────────┐
│                 PEANUT-CORE (New)                       │
│                                                         │
│  - Entity resolution                                    │
│  - Personality mirroring                                │
│  - Engagement learning                                  │
│  - Behavioral intelligence                              │
│  - Hybrid search                                        │
│  - Proactive agent                                      │
│                                                         │
│  Status: ✅ 100% complete, standalone                   │
└─────────────────────────────────────────────────────────┘
```

### What "NOT INTEGRATED" Means

**We DID**:
- ✅ Build peanut-core as a complete TypeScript library
- ✅ Implement all 46 database tables
- ✅ Implement all algorithms from strategy
- ✅ Create all APIs and methods
- ✅ Design the integration architecture
- ✅ Test with synthetic data

**We DID NOT**:
- ❌ Modify any Skippy code
- ❌ Import peanut-core into Skippy's package.json
- ❌ Wire up Skippy's data to peanut-core
- ❌ Deploy them together
- ❌ Connect the databases
- ❌ Enable background workers in Skippy

**Analogy**: We built a brand new engine (peanut-core) that's sitting next to the car (Skippy), but we haven't installed it yet.

---

## Planned Integration Architecture

### After Integration (What It Will Look Like)

```
┌─────────────────────────────────────────────────────────┐
│                    SKIPPY BACKEND                       │
│                                                         │
│  1. Syncs Gmail → Writes to peanut.db (messages table) │
│  2. Syncs iMessage → Writes to peanut.db               │
│  3. Syncs Calendar → Writes to peanut.db               │
│  4. OCR screenshots → Writes to peanut.db              │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  import { PeanutCore } from 'peanut-core';      │   │
│  │                                                 │   │
│  │  const peanut = new PeanutCore({                │   │
│  │    dbPath: './skippy-peanut.db'                 │   │
│  │  });                                            │   │
│  │                                                 │   │
│  │  // Use peanut-core APIs                       │   │
│  │  const prompt = peanut.generateMirrorPrompt(); │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                             │
                             │ Shared SQLite Database
                             ↓
┌─────────────────────────────────────────────────────────┐
│              SKIPPY-PEANUT.DB (Shared)                  │
│                                                         │
│  - messages (written by Skippy, read by peanut)        │
│  - entities (managed by peanut)                         │
│  - assertions (managed by peanut)                       │
│  - behavioral_patterns (managed by peanut)              │
│  - personality styles (managed by peanut)               │
│  - engagement events (written by Skippy + peanut)       │
│  - ... (all 46 tables)                                  │
└─────────────────────────────────────────────────────────┘
                             │
                             │ Background Processing
                             ↓
┌─────────────────────────────────────────────────────────┐
│              PEANUT-CORE WORKERS                        │
│                                                         │
│  Background Worker (runs every 30s):                    │
│    - Processes new messages → creates entities          │
│    - Detects patterns → stores in behavioral_patterns   │
│    - Updates personality styles                         │
│    - Generates predictions                              │
│                                                         │
│  Proactive Worker (runs every 5min):                    │
│    - Checks for upcoming meetings → prep suggestions    │
│    - Checks for deadlines → warnings                    │
│    - Generates proactive nudges                         │
└─────────────────────────────────────────────────────────┘
```

---

## Integration Steps (Not Done Yet)

### Phase 1: Basic Integration (Day 1)

**Files to modify in Skippy**:

1. **`skippy-backend/package.json`**:
```json
{
  "dependencies": {
    "peanut-core": "file:../../peanut-core"
  }
}
```

2. **`skippy-backend/src/services/peanut.ts`** (new file):
```typescript
import { PeanutCore } from 'peanut-core';

const peanut = new PeanutCore({
  dbPath: './data/skippy-peanut.db',
  userEmail: process.env.USER_EMAIL,
  userPhone: process.env.USER_PHONE,
});

await peanut.initialize();

export default peanut;
```

3. **`skippy-backend/src/routes/emails/sync.ts`** (modify existing):
```typescript
import peanut from '../services/peanut';

// After syncing Gmail messages:
const normalizedMessages = gmailMessages.map(convertToNormalizedFormat);
await peanut.ingestMessages(normalizedMessages);
```

4. **`skippy-backend/src/routes/messages/draft.ts`** (modify existing):
```typescript
import peanut from '../services/peanut';

// When generating email draft:
const { prompt } = peanut.generateMirrorPromptWithLearning(
  recipientEntityId,
  { enableLearning: true }
);

const aiDraft = await ollama.generate(prompt, userMessage);

// Track for learning
peanut.recordDraftSent('draft-id', aiDraft.length, recipientEntityId);
```

**Status**: ❌ Not done yet

### Phase 2: Background Workers (Day 2)

**Files to create in Skippy**:

1. **`skippy-backend/src/workers/peanut-processor.ts`** (new):
```typescript
import peanut from '../services/peanut';

// Run every 30 seconds
setInterval(async () => {
  await peanut.processUnprocessedData();
}, 30000);
```

2. **`skippy-backend/src/workers/proactive-agent.ts`** (new):
```typescript
import peanut from '../services/peanut';

// Run every 5 minutes
setInterval(async () => {
  const triggers = await peanut.checkProactiveTriggers();
  for (const trigger of triggers) {
    // Send notification to user
    await sendNotification(trigger);
  }
}, 300000);
```

**Status**: ❌ Not done yet

### Phase 3: Frontend Integration (Day 3)

**Files to modify in Skippy**:

1. **`skippy-frontend/src/components/DraftComposer.tsx`**:
```typescript
// When user edits and sends draft:
await api.recordDraftEdited({
  draftId,
  aiDraftLength,
  userFinalLength,
});

// Show learning result to user (optional):
if (learningResult.learningApplied) {
  showToast('✅ AI learned from your edit!');
}
```

2. **`skippy-frontend/src/pages/SettingsPage.tsx`**:
```typescript
// Add learning stats display:
const stats = await api.getLearningStats();

<div>
  <h3>AI Learning</h3>
  <p>Total interactions: {stats.totalInteractions}</p>
  <p>Average engagement: {stats.averageEngagement * 100}%</p>
  <p>Learning rate: {stats.currentLearningRate * 100}%</p>
</div>
```

**Status**: ❌ Not done yet

---

## Why We Haven't Integrated Yet

**Deliberate Decision**:
1. ✅ Build peanut-core to 100% completion first
2. ✅ Test thoroughly with synthetic data
3. ✅ Verify all algorithms work correctly
4. ✅ Document integration architecture
5. → **THEN** integrate with Skippy (next step)

**Benefits of This Approach**:
- No risk of breaking existing Skippy functionality
- Can test peanut-core in isolation
- Clear separation of concerns
- Easy to debug issues
- Can validate 100% completion independently

---

## Integration Checklist

When you're ready to integrate:

### Pre-Integration
- [x] peanut-core 100% complete
- [x] All tests passing
- [x] Documentation complete
- [ ] Skippy backend ready
- [ ] Database migration plan
- [ ] Rollback plan

### During Integration
- [ ] Install peanut-core as dependency
- [ ] Import PeanutCore in Skippy backend
- [ ] Wire up Gmail sync
- [ ] Wire up iMessage sync
- [ ] Wire up Calendar sync
- [ ] Wire up OCR
- [ ] Enable background workers
- [ ] Test with real data

### Post-Integration
- [ ] Monitor entity resolution accuracy
- [ ] Monitor personality mirroring quality
- [ ] Track engagement improvements
- [ ] Tune mirroring levels (60-80% range)
- [ ] Monitor learning rate effectiveness
- [ ] Check for vent mode false positives

---

## Database Migration Strategy

### Current Skippy Database

```
skippy.db (existing):
- users
- emails
- messages
- calendars
- oauth_tokens
```

### After Integration

**Option 1: Separate Databases**
```
skippy.db (existing):
- users
- emails (raw Gmail data)
- messages (raw iMessage data)
- oauth_tokens

peanut.db (new):
- entities
- assertions
- behavioral_patterns
- personality styles
- all 46 peanut tables
```

**Option 2: Shared Database** (Recommended)
```
skippy-peanut.db (merged):
- users (from skippy)
- oauth_tokens (from skippy)
- emails_raw (from skippy)
- messages_raw (from skippy)
- entities (from peanut)
- assertions (from peanut)
- behavioral_patterns (from peanut)
- ... (all 46 peanut tables)
```

**Recommendation**: Use shared database for simpler architecture.

---

## Timeline Estimate

If you decide to integrate now:

| Phase | Effort | Description |
|-------|--------|-------------|
| **Phase 1: Basic Integration** | 4-6 hours | Import peanut-core, wire up ingestion |
| **Phase 2: Background Workers** | 2-3 hours | Enable processing + proactive agent |
| **Phase 3: Frontend Integration** | 3-4 hours | Show learning stats, track edits |
| **Phase 4: Testing** | 4-8 hours | Test with real data, tune parameters |
| **Phase 5: Deployment** | 2-4 hours | Deploy to Railway, monitor |

**Total**: 15-25 hours (2-3 days)

---

## Current File Locations

### Skippy (Existing)
```
/Users/j/Downloads/Trainer-main/apps/skippy-backend/
  - src/
    - routes/
      - emails/
      - messages/
    - services/
      - gmail.ts
      - imessage.ts
```

### Peanut-Core (New)
```
/Users/j/Downloads/peanut-core/
  - src/
    - index.ts (main API)
    - personality/mirror.ts (learning loop)
    - engagement/ (optimization)
    - workers/ (background processing)
  - dist/ (compiled JS, after npm run build)
```

**To integrate**: Skippy imports from `peanut-core/dist/index.js`

---

## Summary

### ✅ What's Done
- peanut-core: 100% complete, tested, ready
- All algorithms implemented
- All APIs functional
- Test suite passing
- Documentation complete

### ❌ What's NOT Done
- Skippy integration (no code modified in Skippy)
- Background workers not running
- Frontend not showing learning stats
- Real data not flowing through system

### ➡️ Next Step
**Integrate peanut-core with Skippy** (estimated 2-3 days)

---

**Status**: ✅ peanut-core ready, ⏸️ integration pending  
**Decision Point**: Start integration now or test more with synthetic data?  
**Recommendation**: Run test suite (`npm run test:e2e`) to validate, then proceed with integration.
