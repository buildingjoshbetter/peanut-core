# How Peanut-Core Integrates with Skippy
**The Complete Learning System Explained**

---

## Part 1: The Integration Architecture

### The Shared Database Model

```
┌─────────────────────────────────────────────────────────────────┐
│                        SKIPPY BACKEND                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Data Acquisition Layer (What Skippy Already Does)       │  │
│  │                                                           │  │
│  │  • Gmail OAuth → Syncs emails every 5 minutes            │  │
│  │  • iMessage → Reads local database                       │  │
│  │  • Calendar → Syncs Google Calendar                      │  │
│  │  • OCR → Screenshots via Apple Vision                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│                    WRITES TO DATABASE                           │
│                           ↓                                     │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                  SHARED SQLITE DATABASE                         │
│                    (skippy-peanut.db)                          │
│                                                                 │
│  RAW DATA (Written by Skippy):                                 │
│  ├── messages (emails, texts) - marked as unprocessed         │
│  ├── calendar_events - marked as unprocessed                   │
│  ├── screen_captures - marked as unprocessed                   │
│  └── contacts - seeded once                                    │
│                                                                 │
│  INTELLIGENCE (Written by peanut-core):                        │
│  ├── entities (people, companies, projects)                    │
│  ├── assertions (facts extracted)                              │
│  ├── graph_edges (relationships)                               │
│  ├── behavioral_patterns (habits, rhythms)                     │
│  ├── user_style (personality model)                            │
│  ├── recipient_styles (per-person communication)               │
│  ├── engagement_events (learning signals)                      │
│  └── personality_evolution (audit log)                         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                  PEANUT-CORE WORKERS                            │
│                 (Background Processing)                         │
│                                                                 │
│  Worker 1: Data Processor (runs every 30 seconds)              │
│  ├── Finds unprocessed messages                                │
│  ├── Extracts entities (Sarah Chen, TechCorp)                  │
│  ├── Creates assertions (Sarah works_at TechCorp)              │
│  ├── Builds graph relationships                                │
│  ├── Updates behavioral patterns                               │
│  └── Marks as processed                                        │
│                                                                 │
│  Worker 2: Proactive Agent (runs every 5 minutes)              │
│  ├── Checks for upcoming meetings → prep suggestions           │
│  ├── Checks for approaching deadlines → warnings               │
│  ├── Detects patterns → suggests actions                       │
│  └── Surfaces to Skippy frontend                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 2: The User Experience Flow

### Scenario: User Asks Skippy to Draft an Email

```
USER TYPES: "Draft an email to Jake about the budget"

┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Skippy Backend Receives Request                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Skippy Calls Peanut-Core                               │
│                                                                 │
│  const peanut = new PeanutCore({ dbPath: './skippy-peanut.db' });│
│                                                                 │
│  // Find Jake in the knowledge graph                           │
│  const jake = await peanut.findEntity('Jake');                 │
│  // jake = { id: 'jake-123', name: 'Jake Rodriguez',          │
│  //          role: 'colleague', lastContact: '2 days ago' }    │
│                                                                 │
│  // Search for context about budget                            │
│  const context = await peanut.search('budget Jake');           │
│  // Returns: Recent email thread, budget doc mention, etc.     │
│                                                                 │
│  // Generate personality-matched prompt                        │
│  const { prompt, learningResult } =                            │
│    peanut.generateMirrorPromptWithLearning(                    │
│      jake.id,                                                  │
│      {                                                         │
│        enableLearning: true,                                   │
│        mirrorLevel: 0.7,  // 70% match Jake's style          │
│        previousInteraction: await getLastDraft(jake.id)        │
│      }                                                         │
│    );                                                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Generate Prompt (Behind the Scenes)                    │
│                                                                 │
│  What peanut-core does:                                        │
│  1. Analyzes YOUR past emails to Jake                          │
│     - You're casual with Jake (formality: 0.3)                 │
│     - You use "hey" as greeting                                │
│     - You keep it brief (avg 150 chars)                        │
│     - You use emojis occasionally (density: 0.15)              │
│                                                                 │
│  2. Analyzes Jake's communication style                        │
│     - Jake is also casual (formality: 0.25)                    │
│     - Jake responds fast (avg 15 min)                          │
│     - Jake likes direct asks                                   │
│                                                                 │
│  3. Generates dynamic prompt:                                  │
│     "You are drafting an email to Jake Rodriguez.             │
│      Match the user's casual, friendly style with Jake:       │
│      - Start with 'Hey Jake' or 'Hey'                         │
│      - Keep it brief (around 150 chars)                       │
│      - Be direct and to the point                             │
│      - Casual tone, contractions are fine                     │
│      - Reference: You're discussing the Q4 budget             │
│      - Context: Jake asked for vendor list on Tuesday"        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: LLM Generates Draft                                    │
│                                                                 │
│  Skippy sends prompt + user message to Ollama/LLM:             │
│                                                                 │
│  Draft Output:                                                 │
│  "Hey Jake,                                                    │
│                                                                 │
│   Quick update on the budget - got the vendor list you        │
│   needed. Should have everything ready for Friday's review.   │
│                                                                 │
│   Let me know if you need it sooner.                          │
│                                                                 │
│   Cheers"                                                      │
│                                                                 │
│  Length: 162 chars (close to user's 150 avg) ✅                │
│  Tone: Casual ✅                                               │
│  Greeting: "Hey Jake" ✅                                       │
│  References context ✅                                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: User Sees Draft in Skippy UI                           │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Draft Email to Jake Rodriguez                           │ │
│  │                                                           │ │
│  │  Hey Jake,                                               │ │
│  │                                                           │ │
│  │  Quick update on the budget - got the vendor list you    │ │
│  │  needed. Should have everything ready for Friday's       │ │
│  │  review.                                                 │ │
│  │                                                           │ │
│  │  Let me know if you need it sooner.                     │ │
│  │                                                           │ │
│  │  Cheers                                                  │ │
│  │                                                           │ │
│  │  [Edit] [Send] [Regenerate]                             │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                     USER MAKES CHOICE
                            ↓
                    ┌───────┴───────┐
                    │               │
              USER SENDS        USER EDITS
             UNCHANGED          THEN SENDS
                    │               │
                    └───────┬───────┘
                            ↓
```

---

## Part 3: The Silent Learning Loop

### What Happens After User Edits/Sends

```
┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO A: User Sends Unchanged (HIGH ENGAGEMENT)             │
└─────────────────────────────────────────────────────────────────┘

User clicks "Send" without editing → Perfect match!

Skippy Backend Records:
  peanut.recordDraftSent('draft-123', 162, jake.id, 'work');
  peanut.recordDraftEdited('draft-123', 162, 162);  // No edits!

Behind the Scenes (Automatic):
  1. Engagement score calculated: 100% (no edits)
  2. Learning signal: "This style works for Jake" ✅
  3. User style confidence increases
  4. Jake-specific style reinforced
  5. Logged to personality_evolution table

Result: Next time, even MORE confident in this style

┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO B: User Makes Minor Edits (GOOD ENGAGEMENT)           │
└─────────────────────────────────────────────────────────────────┘

AI Draft: "Hey Jake,\n\nQuick update..."  (162 chars)
User Edit: "Hey Jake - quick update..."   (150 chars)
Change: Removed "\n\n", made it more compact

Skippy Backend Records:
  peanut.recordDraftSent('draft-123', 162, jake.id);
  peanut.recordDraftEdited('draft-123', 150, 162);  // 7% edit

Behind the Scenes (Automatic):
  1. Engagement score: 93% (small edits)
  2. Learning signal: "User prefers more compact" 📝
  3. System adjusts: verbosity 0.50 → 0.48
  4. Learning rate: 23.3% (early, learning fast)
  5. Logged: "verbosity decreased by 0.02"

Result: Next Jake email will be slightly more compact

┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO C: User Rewrites Half (LOW ENGAGEMENT)                │
└─────────────────────────────────────────────────────────────────┘

AI Draft: "Hey Jake,\n\nQuick update on the budget..."
User Edit: "Jake - Here's the vendor list. Ready Friday."
Change: 50% rewrite - different tone, more direct

Skippy Backend Records:
  peanut.recordDraftSent('draft-123', 162, jake.id);
  peanut.recordDraftEdited('draft-123', 95, 162);  // 41% edit!

Behind the Scenes (Automatic):
  1. Engagement score: 59% (major edits)
  2. Learning signal: "Style mismatch, adjust!" ⚠️
  3. System adjusts multiple dimensions:
     - formality 0.30 → 0.28 (more casual)
     - verbosity 0.50 → 0.45 (more terse)
     - directness 0.50 → 0.60 (more direct)
  4. Learning rate: 23.3%
  5. Logged: "Major adjustment based on 59% engagement"

Result: Next Jake email will be terser and more direct

┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO D: User is Venting (FREEZE LEARNING)                  │
└─────────────────────────────────────────────────────────────────┘

User sends: "JAKE THIS IS RIDICULOUS we need this NOW"
Sentiment: -0.8 (very negative)
Caps ratio: 0.4 (40% caps)
Message velocity: 4 messages in 2 minutes

Behind the Scenes (Automatic):
  1. Vent mode detected! 🔴
  2. Signals: strong_negative_sentiment, excessive_caps, rapid_messages
  3. Learning FROZEN (no personality updates)
  4. Logged: "Vent mode active - learning paused"

Result: System doesn't learn from emotional outbursts

Reason: When you're venting, you're NOT yourself. Learning from 
this would corrupt the personality model.
```

---

## Part 4: How Learning Accumulates Over Time

### Week 1: Initial Learning (Fast)

```
User has Skippy draft 20 emails in first week.

Interaction 1: Edit ratio 35% → Engagement 62% → Learning rate 30%
  Style changes: formality -0.05, verbosity -0.03

Interaction 5: Edit ratio 28% → Engagement 69% → Learning rate 29.7%
  Style changes: formality -0.03, emoji_density +0.02

Interaction 10: Edit ratio 18% → Engagement 79% → Learning rate 27%
  Style changes: formality -0.02

Interaction 20: Edit ratio 10% → Engagement 88% → Learning rate 23%
  Style changes: formality -0.01

┌─────────────────────────────────────────────────────────────────┐
│ Week 1 Summary                                                  │
│                                                                 │
│  Starting engagement: 62%                                       │
│  Ending engagement: 88%                                         │
│  Improvement: +42%                                              │
│                                                                 │
│  User edits decreased: 35% → 10%                                │
│  System is learning what you want! ✅                           │
└─────────────────────────────────────────────────────────────────┘
```

### Month 1: Refinement (Medium Speed)

```
After 100 interactions:

Learning rate decayed: 30% → 12%
Average engagement: 85%
Edit ratio: 8% (very low - good!)

Changes:
- Formality stabilized at 0.28 (casual)
- Verbosity at 0.45 (brief)
- Emoji density at 0.18 (occasional)

Per-Recipient Profiles Established:
- Jake: very casual, brief (150 chars)
- Sarah (boss): formal, detailed (300 chars)
- Mom: warm, emojis frequent (100 chars)

┌─────────────────────────────────────────────────────────────────┐
│ Month 1 Summary                                                 │
│                                                                 │
│  Total interactions: 100                                        │
│  Average engagement: 85%                                        │
│  Learning rate: 12% (slowing down appropriately)               │
│                                                                 │
│  System now "gets" you for most situations ✅                   │
│  Still learning edge cases                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Month 6: Mastery (Slow Refinement)

```
After 500 interactions:

Learning rate: 5% (minimum)
Average engagement: 92%
Edit ratio: 3% (minimal tweaks only)

System knows:
- Your style for 50+ different people
- Your work vs personal voice
- Your stressed vs relaxed tone
- Your morning vs evening energy
- Your decision patterns
- Your values and priorities

┌─────────────────────────────────────────────────────────────────┐
│ Month 6 Summary                                                 │
│                                                                 │
│  Total interactions: 500+                                       │
│  Average engagement: 92%                                        │
│  Learning rate: 5% (stable, conservative refinement)           │
│                                                                 │
│  System feels like talking to yourself ✅                       │
│  Only learning rare edge cases now                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 5: How It Evolves Automatically

### Change Point Detection (Life Events)

```
SCENARIO: User Gets New Job

Before:
- Work emails: formal (0.7), detailed (300 chars)
- Company: TechCorp
- Contacts: Jake, Sarah, Mike

Week 1 at New Job:
- Suddenly drafting emails to NewCo people
- Style is still formal (0.7) but feels wrong
- User edits heavily (40%+)

Behind the Scenes:
1. CUSUM algorithm detects drift ⚠️
2. Major shift in communication patterns detected
3. Learning rate TEMPORARILY INCREASES: 5% → 20%
4. System learns new company culture faster
5. New recipient profiles built for NewCo people

Week 3 at New Job:
- Style adapted to NewCo culture (formality 0.5)
- Edit ratio back to normal (8%)
- Learning rate returns to stable (5%)

Result: System adapted to life change automatically
```

### Context Switching

```
USER PATTERN DETECTED:

Monday-Friday, 9am-5pm:
- Uses Slack, email
- Formal tone (0.6)
- Brief messages (150 chars)
- Work context active
- System only shows work contacts/data

Evenings & Weekends:
- Uses iMessage
- Casual tone (0.2)
- Varied length (50-300 chars)
- Personal context active
- System only shows personal contacts/data

How It Learns:
1. Detects app patterns (Slack = work, iMessage = personal)
2. Detects time patterns (9-5 = work, evenings = personal)
3. Learns different personality for each context
4. Hard boundary: work data NEVER leaks to personal

Result: Two different versions of Skippy, same user
```

---

## Part 6: The Magic From User's Perspective

### What User Experiences

```
Day 1 with Skippy + Peanut-Core:

User: "Draft email to Jake"

Skippy: [Generates draft in YOUR style for Jake]
        Hey Jake, quick update on the budget...

User: "...wait, that's actually exactly how I talk to Jake"
User: *sends unchanged*

═══════════════════════════════════════════════════════════════

Week 2:

User: "Draft email to new client"

Skippy: [Uses more formal style - detects "client" context]
        Dear Ms. Johnson,
        
        Thank you for reaching out regarding...

User: "Perfect"
User: *sends unchanged*

═══════════════════════════════════════════════════════════════

Month 2:

User: "Find that agreement I was looking at"

Skippy: [Searches screen captures + emails]
        "You were looking at two agreements:
         1. TechCorp MSA (yesterday, Safari)
         2. Service Agreement v3 (Tuesday, Sarah shared it)
         
         The MSA is waiting for your signature on Section 4.2"

User: "Holy shit, how did it know that?"

═══════════════════════════════════════════════════════════════

Month 6:

User: "Hey Skippy"

Skippy: "Hey! You've got that meeting with Sarah in 20 minutes.
        Here's what you should know:
        - She asked about Q4 budget on Tuesday
        - Jake sent the vendor list yesterday
        - Your commitment: have proposal ready today
        
        Want me to pull up the budget doc?"

User: "This thing reads my mind"
```

### What User DOESN'T See (Silent Learning)

```
Behind every interaction:

1. Engagement signals recorded
   - Edit ratio calculated
   - Sentiment analyzed
   - Thread continuation tracked

2. Learning updates applied
   - Style dimensions adjusted
   - Confidence scores updated
   - Evolution logged

3. Patterns detected
   - Behavioral habits identified
   - Communication rhythms learned
   - Cognitive patterns inferred

4. Context maintained
   - Work/personal boundaries enforced
   - Active context detected
   - Visibility policies applied

5. Proactive triggers checked
   - Meeting prep opportunities
   - Deadline warnings
   - Commitment tracking

User just thinks: "This AI gets me"

Reality: 500+ micro-learnings over time
```

---

## Part 7: Technical Implementation in Skippy

### Code Example: Complete Integration

```typescript
// skippy-backend/src/services/peanut.ts

import { PeanutCore } from 'peanut-core';

// Initialize peanut-core (once at startup)
const peanut = new PeanutCore({
  dbPath: './data/skippy-peanut.db',
  userEmail: process.env.USER_EMAIL,
  userPhone: process.env.USER_PHONE,
});

await peanut.initialize();

// Export for use throughout backend
export default peanut;
```

```typescript
// skippy-backend/src/routes/drafts/generate.ts

import peanut from '../services/peanut';
import { generateWithOllama } from '../services/ollama';

export async function generateDraft(req, res) {
  const { recipientName, topic, context } = req.body;
  
  // 1. Find recipient in knowledge graph
  const recipient = await peanut.findEntity(recipientName);
  
  if (!recipient) {
    return res.status(404).json({ error: 'Recipient not found' });
  }
  
  // 2. Search for relevant context
  const searchResults = await peanut.search(
    `${recipientName} ${topic}`,
    { limit: 5, contextType: 'work' }
  );
  
  // 3. Generate personality-matched prompt WITH learning
  const { prompt, learningResult } = peanut.generateMirrorPromptWithLearning(
    recipient.id,
    {
      enableLearning: true,
      mirrorLevel: 0.7,
      previousInteraction: await getLastDraft(req.userId, recipient.id)
    }
  );
  
  // 4. Generate draft with LLM
  const draft = await generateWithOllama({
    model: 'qwen3:72b',
    system: prompt,
    messages: [
      {
        role: 'user',
        content: `Draft an email about: ${topic}\n\nContext: ${context}`
      }
    ]
  });
  
  // 5. Track draft for learning
  const draftId = uuid();
  peanut.recordDraftSent(draftId, draft.length, recipient.id, 'work');
  
  // 6. Return draft + metadata
  res.json({
    draft: draft,
    draftId: draftId,
    recipient: recipient,
    context: searchResults,
    learningApplied: learningResult?.learningApplied,
    engagementScore: learningResult?.engagementScore,
  });
}
```

```typescript
// skippy-backend/src/routes/drafts/send.ts

export async function sendDraft(req, res) {
  const { draftId, originalLength, finalText, recipientId } = req.body;
  
  // Record edit for learning
  peanut.recordDraftEdited(draftId, finalText.length, originalLength);
  
  // Cache for next interaction's learning
  await cacheInteraction(req.userId, recipientId, {
    aiDraftLength: originalLength,
    userFinalLength: finalText.length,
    timestamp: new Date(),
  });
  
  // Send email via Gmail API
  await sendEmail(finalText, recipientId);
  
  res.json({ success: true });
}
```

```typescript
// skippy-backend/src/workers/background-processor.ts

import peanut from '../services/peanut';

// Run every 30 seconds
setInterval(async () => {
  try {
    // Process unprocessed data
    await peanut.processUnprocessedData();
    
    // Update behavioral patterns
    await peanut.updateBehavioralPatterns();
    
    // Generate predictions
    await peanut.generatePredictions();
    
  } catch (error) {
    console.error('Background processing error:', error);
  }
}, 30000);
```

```typescript
// skippy-backend/src/workers/proactive-agent.ts

import peanut from '../services/peanut';
import { sendNotification } from '../services/notifications';

// Run every 5 minutes
setInterval(async () => {
  try {
    // Check for proactive triggers
    const triggers = await peanut.checkProactiveTriggers();
    
    for (const trigger of triggers) {
      if (trigger.type === 'meeting_prep') {
        // Send notification to user
        await sendNotification({
          title: `Meeting in ${trigger.timeUntil}`,
          body: trigger.prepSuggestion,
          action: 'open_prep',
        });
      }
      
      if (trigger.type === 'deadline_warning') {
        await sendNotification({
          title: 'Deadline approaching',
          body: `${trigger.commitment} due ${trigger.dueDate}`,
          action: 'view_commitment',
        });
      }
    }
  } catch (error) {
    console.error('Proactive agent error:', error);
  }
}, 300000);
```

---

## Part 8: Key Insights

### Why This Architecture Works

1. **Shared Database = Simple**
   - Skippy writes raw data
   - Peanut-core processes it
   - No API overhead
   - Atomic transactions

2. **Background Workers = Non-Blocking**
   - Processing happens async
   - Skippy stays fast
   - Users don't wait for analysis
   - Acceptable 30s lag for intelligence

3. **Silent Learning = No Friction**
   - User never clicks "Was this helpful?"
   - System learns from behavior
   - Edit ratios reveal truth
   - Engagement score is implicit

4. **Decaying Learning Rate = Stability**
   - Early: learn fast (30%)
   - Later: refine slowly (5%)
   - Prevents thrashing
   - Adapts to life changes via CUSUM

5. **Vent Mode = Quality**
   - Emotional outbursts don't corrupt model
   - Only learn from "normal you"
   - Maintains personality accuracy

6. **Per-Recipient = Context-Aware**
   - Jake style ≠ Boss style ≠ Mom style
   - Different you for different people
   - Just like real life

---

## Summary: The Complete Learning Loop

```
1. Skippy syncs data (emails, messages, calendar, screens)
   ↓
2. Peanut-core processes in background (every 30s)
   ↓
3. User asks Skippy to draft message
   ↓
4. Peanut-core generates personality-matched prompt
   ↓
5. LLM generates draft using that prompt
   ↓
6. User edits draft (or doesn't)
   ↓
7. Peanut-core records edit ratio
   ↓
8. Learning update applied (if engagement > 30% confidence)
   ↓
9. Next draft is better
   ↓
10. Repeat forever → System gets better and better

RESULT: After 6 months, Skippy feels like talking to yourself
```

---

**Status**: Architecture designed ✅  
**Integration Effort**: 2-3 days  
**User Experience**: Magic 🎩✨
