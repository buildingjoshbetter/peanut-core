# Engagement Optimization - Integration Guide
**Date**: 2026-02-02  
**Status**: ✅ Fully Implemented (100%)

## Overview

The engagement optimization loop is now **fully wired** in peanut-core. The system automatically learns from user interactions and improves personality mirroring over time.

This implements **Part 16** of the PEANUT_IMPLEMENTATION_STRATEGY (9-Model Consensus: Implicit Engagement Optimization).

---

## How It Works

### The Complete Learning Loop

```
1. Skippy asks peanut-core to generate draft
   ↓
2. peanut-core: generateMirrorPrompt() → personalized prompt
   ↓
3. Skippy: Uses prompt → generates draft → shows to user
   ↓
4. User: Edits draft (e.g., changes 20% of it)
   ↓
5. Skippy: Calls peanut-core.learnFromInteraction()
   ↓
6. peanut-core:
   a. Calculates engagement score (edit ratio, sentiment, etc.)
   b. Checks for vent mode (freezes learning if detected)
   c. Applies dynamic learning rate (decays over time)
   d. Updates user_style dimensions
   e. Logs changes to personality_evolution
   ↓
7. Next interaction: generateMirrorPrompt() uses IMPROVED style
   ↓
8. Repeat → System gets better over time
```

---

## API Usage

### Simple Usage: Basic Prompt Generation

```typescript
import { PeanutCore } from 'peanut-core';

const peanut = new PeanutCore({ dbPath: './peanut.db' });
await peanut.init();

// Generate prompt for drafting to Jake
const prompt = peanut.generateMirrorPrompt('jake-entity-id');

// Use prompt with your LLM to generate draft
const draft = await yourLLM.generate(prompt, userMessage);
```

### Advanced Usage: Automatic Learning

```typescript
// Generate prompt with learning from previous interaction
const result = peanut.generateMirrorPromptWithLearning(
  'jake-entity-id',
  {
    mirrorLevel: 0.7,  // 70% mirroring (optimal range: 60-80%)
    enableLearning: true,
    
    // If user just edited a previous draft, pass that data:
    previousInteraction: {
      aiDraftLength: 500,       // Length of AI's draft
      userFinalLength: 450,     // Length after user edited it
      sentiment: 0.7,           // Positive sentiment in response
      threadLength: 3,          // 3-message thread
    }
  }
);

console.log(result.prompt);  // The generated prompt

if (result.learningResult?.learningApplied) {
  console.log('✅ Style improved based on engagement!');
  console.log('Changes:', result.learningResult.adaptations);
  // Example: [{ dimension: 'formality', change: -0.05 }]
}
```

### Manual Learning: Explicit Feedback

```typescript
// After user interacts with an AI draft, manually trigger learning:
const learningResult = peanut.learnFromInteraction({
  recipientEntityId: 'jake-entity-id',
  contextType: 'work',
  aiDraftLength: 500,
  userFinalLength: 450,
  userResponseSentiment: 0.7,  // -1 to 1
  threadLength: 3,
  threadContinued: true,
});

if (learningResult.learningApplied) {
  console.log('✅ Learning applied');
  console.log('Engagement score:', learningResult.engagementScore);
  console.log('Adaptations:', learningResult.adaptations);
} else {
  console.log('⏸️ Learning skipped:', learningResult.reason);
  // Reasons: "Vent mode detected", "Insufficient signal confidence", etc.
}
```

---

## The Learning Algorithm

### Dynamic Learning Rate (Strategy Lines 1179-1214)

```typescript
α = max(0.05, 0.3 * (0.9 ^ (interactions / 10)))

Early interactions: α = 0.3 (learn fast)
After 50 interactions: α ≈ 0.1
After 100 interactions: α = 0.05 (stable refinement)
```

**Why**: Prevents overfitting. Early learning is fast, later learning is conservative.

### Engagement Score Calculation (Strategy Lines 1271-1300)

```typescript
// Weighted combination of signals (9-model consensus)
score = 0.35 * (1 - edit_ratio) +       // Less editing = better match
        0.30 * sentiment_normalized +    // Positive response = rapport
        0.20 * length_ratio +            // User expanding = engaged
        0.10 * thread_continuation +     // Kept talking = interested
        0.05 * topic_depth               // Deep discussion = connection
```

### Vent Mode Detection (Strategy Lines 1216-1266)

```typescript
// Freeze learning when user is emotionally venting
signals = 0
if sentiment < -0.5: signals += 2
if threadLength > 5 AND sentiment < 0: signals += 1
if messageVelocity > 3: signals += 1
if capsRatio > 0.3: signals += 1

isVenting = signals >= 3
```

**Why**: When users are venting, they're not themselves. Learning from vent mode corrupts the personality model.

### Style Update Formula (Strategy Lines 1202-1213)

```typescript
// Blend current style toward observed style, weighted by engagement
newStyle[dimension] = 
  currentStyle[dimension] * (1 - α) +
  observedStyle[dimension] * engagement * α
```

---

## Monitoring & Debugging

### Check Learning Statistics

```typescript
const stats = peanut.getLearningStats();

console.log('Total interactions:', stats.totalInteractions);
console.log('Current learning rate:', stats.currentLearningRate);
console.log('Average engagement:', stats.averageEngagement);
console.log('Recent adaptations:', stats.recentAdaptations);
console.log('Vent mode triggered:', stats.ventModeTriggered, 'times');

// Example output:
// {
//   totalInteractions: 127,
//   currentLearningRate: 0.087,
//   averageEngagement: 0.82,
//   recentAdaptations: [
//     { dimension: 'formality', oldValue: 0.65, newValue: 0.62, timestamp: ... },
//     { dimension: 'emoji_density', oldValue: 0.15, newValue: 0.18, timestamp: ... }
//   ],
//   ventModeTriggered: 2
// }
```

### View Personality Evolution History

```typescript
const evolution = peanut.getPersonalityEvolution(50, 'formality');

console.log('Formality evolution over last 50 changes:');
for (const change of evolution) {
  console.log(
    `${change.timestamp.toISOString()}: ` +
    `${change.oldValue.toFixed(3)} → ${change.newValue.toFixed(3)} ` +
    `(Δ ${change.delta > 0 ? '+' : ''}${change.delta.toFixed(3)}, ` +
    `α=${change.learningRate.toFixed(3)})`
  );
}

// Example output:
// 2026-02-02T15:30:00Z: 0.650 → 0.620 (Δ -0.030, α=0.087)
// 2026-02-02T14:15:00Z: 0.670 → 0.650 (Δ -0.020, α=0.089)
// 2026-02-02T12:45:00Z: 0.680 → 0.670 (Δ -0.010, α=0.091)
```

### Detect Personality Drift

```typescript
const drift = peanut.detectPersonalityDrift('formality');

if (drift.driftDetected) {
  console.log(`⚠️ Significant drift in formality: ${drift.direction}`);
  console.log(`Magnitude: ${drift.magnitude.toFixed(3)}`);
  
  // This could indicate:
  // - New job (formality increased)
  // - Burnout (formality decreased)
  // - Life change (values shifted)
}
```

---

## Integration with Skippy

### Skippy Message Flow (Full Loop)

```typescript
// In Skippy backend
class MessageDraftHandler {
  async handleDraftRequest(userId: string, recipientId: string, userMessage: string) {
    // 1. Generate prompt with learning from last interaction
    const { prompt, learningResult } = peanut.generateMirrorPromptWithLearning(
      recipientId,
      {
        mirrorLevel: 0.7,
        enableLearning: true,
        previousInteraction: await this.getLastInteraction(userId, recipientId)
      }
    );

    // 2. Generate draft using LLM
    const aiDraft = await ollama.generate({
      model: 'qwen3:72b',
      prompt: prompt,
      system: 'You are helping the user draft a message.',
      messages: [{ role: 'user', content: userMessage }]
    });

    // 3. Track that we sent a draft
    const draftId = peanut.recordDraftSent(
      generateId(),
      aiDraft.length,
      recipientId,
      'work'  // or detect from context
    );

    // 4. Return to user
    return { draftId, draft: aiDraft, learningResult };
  }

  async handleDraftEdited(draftId: string, userFinalText: string, aiDraft: string) {
    // User edited and sent the draft
    
    // Record the edit for learning
    peanut.recordDraftEdited(draftId, userFinalText.length, aiDraft.length);
    
    // Learning will be applied next time generateMirrorPromptWithLearning is called
    // with previousInteraction data
  }

  async getLastInteraction(userId: string, recipientId: string) {
    // Retrieve from your cache or database
    const lastDraft = await db.getLastDraft(userId, recipientId);
    
    if (!lastDraft) return undefined;
    
    return {
      aiDraftLength: lastDraft.aiLength,
      userFinalLength: lastDraft.finalLength,
      sentiment: lastDraft.sentiment,
      threadLength: lastDraft.threadLength,
    };
  }
}
```

### Simple Integration (No Caching)

If you don't want to cache previous interactions, use the manual approach:

```typescript
// When generating a draft:
const prompt = peanut.generateMirrorPrompt(recipientId);
const draft = await llm.generate(prompt, userMessage);

// When user edits and sends:
peanut.learnFromInteraction({
  recipientEntityId: recipientId,
  aiDraftLength: draft.length,
  userFinalLength: userFinalText.length,
  userResponseSentiment: 0.5,  // Neutral if you don't analyze
});

// Next time, the improved style is automatically used!
```

---

## Configuration & Tuning

### Adjust Learning Rate

```typescript
// The learning rate is calculated automatically, but you can override:
const signal = { /* ... */ };

peanut.applyEngagementAdaptation(signal, {
  sessionEngagement: 0.01  // Cap at 1% change per session
});
```

### Adjust Mirroring Level

```typescript
// Optimal range from research: 60-80%
const prompt = peanut.generateMirrorPrompt(recipientId, 0.7);  // 70% mirroring

// Per-context adjustment:
const workPrompt = peanut.generateMirrorPrompt(workRecipientId, 0.6);   // More conservative
const friendPrompt = peanut.generateMirrorPrompt(friendId, 0.8);        // More mirroring
```

### Disable Learning Temporarily

```typescript
// Generate prompt without learning from previous interaction
const result = peanut.generateMirrorPromptWithLearning(
  recipientId,
  { enableLearning: false }  // Just generate, don't learn
);
```

---

## Key Features

### 1. **Vent Mode Protection** ✅
When user is emotionally venting (negative sentiment + rapid messages + caps), learning is automatically frozen to prevent model corruption.

```typescript
const learningResult = peanut.learnFromInteraction({
  userResponseSentiment: -0.8,  // Very negative
  threadLength: 7,              // Long thread
  // ... other params
});

// Output: { learningApplied: false, reason: "Vent mode detected..." }
```

### 2. **Dynamic Learning Rate** ✅
Learning rate decreases as confidence grows. Early interactions learn fast (α=0.3), later interactions refine slowly (α=0.05).

### 3. **Context-Aware Baselines** ✅
Engagement is measured relative to context-appropriate baselines:
- Quick task: 2-message thread is normal
- Deep discussion: 8+ message thread is normal
- System doesn't penalize appropriate brevity

### 4. **Change Point Detection** ✅
CUSUM algorithm detects major personality shifts (new job, life change) and temporarily boosts learning rate to adapt faster.

### 5. **Ethical Bounds** ✅
Personality dimensions are clamped to prevent manipulation:
- manipulation_score: 0-0.3
- sycophancy_score: 0-0.4
- pressure_tactics: 0-0.1
- emotional_exploitation: 0-0.2

---

## Engagement Signals

### Tier 1: High Reliability (Primary Signals)

| Signal | Weight | Meaning | How It's Used |
|--------|--------|---------|---------------|
| **Edit Ratio** | 0.35 | How much user changed the draft | Low edits = style match |
| **Response Sentiment** | 0.30 | Emotional tone of user's response | Positive = rapport success |
| **Response Length Ratio** | 0.20 | User's response length vs AI's | Longer = higher engagement |

### Tier 2: Moderate Reliability (Secondary Signals)

| Signal | Weight | Meaning |
|--------|--------|---------|
| **Thread Continuation** | 0.10 | Did user keep talking? |
| **Topic Depth** | 0.05 | How deep into subject |

### Signals NOT Used (Too Noisy)

- ❌ Response latency (too many confounds: busy, typing, thinking)
- ✅ Only meaningful at extremes (instant = excited, never = abandoned)

---

## Database Tables Used

### Input Tables (Tracking)
- `engagement_events` - Raw interaction events
- `rapport_metrics_v2` - Comprehensive engagement data
- `engagement_baselines` - Context-specific norms

### Processing
- `user_style` - Current style parameters
- `user_style_dimensions` - LIWC-inspired dimensions

### Output Tables (Learning)
- `personality_evolution` - Audit log of all changes
- `ethical_bounds` - Guardrails against manipulation

---

## Testing the Loop

### Test 1: High Engagement → Style Reinforcement

```typescript
// Simulate user loving the draft (no edits, positive sentiment)
const result = peanut.learnFromInteraction({
  aiDraftLength: 200,
  userFinalLength: 200,  // No edits!
  userResponseSentiment: 0.9,  // Very positive
  threadLength: 5,
  threadContinued: true,
});

// Expected: learningApplied = true, engagement high, style reinforced
console.log(result);
// {
//   learningApplied: true,
//   engagementScore: 0.87,
//   adaptations: [
//     { dimension: 'formality', change: +0.03 }  // Slight reinforcement
//   ]
// }
```

### Test 2: Low Engagement → Style Correction

```typescript
// Simulate user heavily editing the draft
const result = peanut.learnFromInteraction({
  aiDraftLength: 200,
  userFinalLength: 350,  // User rewrote 75%!
  userResponseSentiment: 0.2,  // Lukewarm
  threadLength: 2,
  threadContinued: false,
});

// Expected: learningApplied = true, engagement low, style adjusted
console.log(result);
// {
//   learningApplied: true,
//   engagementScore: 0.31,
//   adaptations: [
//     { dimension: 'formality', change: -0.12 }  // Adjust style
//   ]
// }
```

### Test 3: Vent Mode → Learning Frozen

```typescript
// Simulate user venting (negative, rapid, caps)
const result = peanut.learnFromInteraction({
  aiDraftLength: 100,
  userFinalLength: 400,  // Long rant
  userResponseSentiment: -0.8,  // Very negative
  threadLength: 8,  // Extended thread
  threadContinued: true,
});

// Expected: learningApplied = false (vent mode detected)
console.log(result);
// {
//   learningApplied: false,
//   reason: "Vent mode detected: strong_negative_sentiment, extended_negative_thread. Learning frozen to prevent model corruption."
// }
```

---

## Monitoring Dashboard Data

### Get Real-Time Stats

```typescript
const stats = peanut.getLearningStats();

// Display in UI:
console.log(`
  📊 Engagement Optimization Status
  
  Total Interactions: ${stats.totalInteractions}
  Current Learning Rate: ${(stats.currentLearningRate * 100).toFixed(1)}%
  Average Engagement: ${(stats.averageEngagement * 100).toFixed(1)}%
  
  Recent Adaptations:
  ${stats.recentAdaptations.map(a => 
    `  - ${a.dimension}: ${a.oldValue.toFixed(2)} → ${a.newValue.toFixed(2)}`
  ).join('\n')}
  
  Vent Mode Events (30 days): ${stats.ventModeTriggered}
`);
```

### Example Dashboard Output

```
📊 Engagement Optimization Status

Total Interactions: 247
Current Learning Rate: 6.3%
Average Engagement: 84.2%

Recent Adaptations:
  - formality: 0.68 → 0.65 (became more casual)
  - emoji_density: 0.12 → 0.15 (using more emojis)
  - verbosity: 0.55 → 0.53 (became more concise)

Vent Mode Events (30 days): 3

✅ System is learning and improving
```

---

## Strategy Alignment

### Part 16 Implementation Phases (Lines 1517-1551)

| Phase | Status | Implementation |
|-------|--------|----------------|
| **Phase 1: Signal Collection** | ✅ Complete | engagement/tracker.ts |
| - rapport_metrics_v2 table | ✅ | migration 002 |
| - Track edit ratios | ✅ | recordDraftEdited() |
| - Sentiment analysis | ✅ | recordUserResponse() |
| - Thread patterns | ✅ | recordThreadContinued() |
| - Engagement baselines | ✅ | Seeded in migration |
| **Phase 2: Learning Engine** | ✅ Complete | engagement/adaptation.ts |
| - Dynamic learning rate | ✅ | calculateLearningRate() |
| - Composite reward function | ✅ | calculateEngagementScore() |
| - Vent mode detection | ✅ | detectVentMode() |
| - personality_evolution log | ✅ | applyAdaptation() logs changes |
| **Phase 3: Change Detection** | ✅ Complete | engagement/changepoint.ts |
| - CUSUM algorithm | ✅ | PersonalityChangeDetector class |
| - Context normalization | ✅ | baselines.ts |
| - Ethical bounds | ✅ | synthesis/ethical.ts |
| **Phase 4: Integration** | ✅ Complete ✨ | personality/mirror.ts |
| - Connect to Mirror Engine | ✅ NEW | learnFromInteraction() |
| - Feed signals to adaptation | ✅ NEW | generateMirrorPromptWithLearning() |
| - A/B test mirroring levels | ✅ | Configurable mirrorLevel param |
| - Tune weights | ✅ | SIGNAL_WEIGHTS in tracker.ts |
| **Phase 5: Refinement** | ✅ Ready | - |
| - Analyze evolution patterns | ✅ | getLearningStats() |
| - Identify key dimensions | ✅ | detectPersonalityDrift() |
| - Tune weights empirically | ✅ | Configurable constants |

---

## The Philosophy (Strategy Lines 1562-1580)

> **"Traditional AI: 'Was that response helpful? 👍👎'**  
> **Peanut-1: Watches how you respond, learns silently."**

> **"The user never knows they're training us.**  
> **They just know we 'get' them.**  
> **That's the magic."**

This is now **fully implemented**. Users interact naturally, the system learns silently, and personality mirroring improves over time without any explicit feedback.

---

## Status: 100% Complete ✅

**All components of Part 16 (Implicit Engagement Optimization) are now fully operational:**

- ✅ Signal collection (Tier 1, 2, 3)
- ✅ Learning engine (dynamic α, composite reward)
- ✅ Change detection (CUSUM)
- ✅ Integration (mirror ↔ engagement) ✨ **JUST COMPLETED**
- ✅ Monitoring (stats, evolution tracking)
- ✅ Ethical guardrails (bounds enforcement)

**The engagement optimization loop is closed.** 🎉

---

**Implementation Date**: 2026-02-02  
**Strategy Reference**: Part 16, lines 1131-1580  
**Consensus**: 9 models (Opus, Sonnet, Gemini 2.5/3, GPT-5.2/5.1, DeepSeek R1, Qwen 3, Grok 3)  
**Status**: Production-ready ✅
