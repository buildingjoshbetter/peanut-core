# Using Anthropic Instead of Ollama
**How to Configure Peanut-Core for Anthropic-Only Usage**

---

## TL;DR: You Have 2 Options

### Option 1: Skippy Backend Does ALL AI Calls (RECOMMENDED)
```
✅ Simple (no peanut-core changes needed)
✅ Skippy already has Anthropic configured
✅ Peanut-core just stores/retrieves data
✅ Extraction happens in skippy-backend
```

### Option 2: Add Anthropic Support to Peanut-Core
```
⚠️ Requires modifying peanut-core LLM code
⚠️ Need to add Anthropic SDK
⚠️ More complex, but more flexible
```

**My Recommendation: Option 1 (Skippy does AI, peanut-core stores results)**

---

## The Problem: Peanut-Core's LLM Code is Ollama-Focused

### Current State (Ollama-Compatible)

```typescript
// src/extraction/llm.ts

export interface LLMConfig {
  endpoint: string;       // "http://localhost:11434/api/generate"
  model: string;          // "llama3"
}

// This is designed for Ollama or OpenAI-compatible endpoints
export async function callLLM(prompt: string, config: LLMConfig) {
  // Ollama format
  if (config.endpoint.includes('/api/generate')) {
    return callOllama(prompt, config);
  }
  // OpenAI format
  else {
    return callOpenAI(prompt, config);
  }
}
```

**Issue:** Anthropic's API is DIFFERENT from both Ollama and OpenAI formats.

---

## Option 1: Skippy Backend Does AI (RECOMMENDED)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   SKIPPY BACKEND                            │
│                                                             │
│  1. Receive email                                           │
│  2. Call Anthropic to extract entities                      │
│  3. Pass extracted entities to peanut-core                  │
│  4. Peanut-core stores in SQLite                           │
│                                                             │
│  Anthropic: ✅ (Skippy does it)                             │
│  Peanut-core: ✅ (just stores data)                         │
└─────────────────────────────────────────────────────────────┘
```

### How It Works

```typescript
// skippy-backend/src/services/sync.ts

async function syncEmail(email: GmailMessage) {
  // 1. SKIPPY does AI extraction with Anthropic
  const entities = await extractEntitiesWithAnthropic(email.body);
  const facts = await extractFactsWithAnthropic(email.body);
  
  // 2. PEANUT-CORE stores the results (no AI needed)
  await peanut.ingestMessages([{
    id: email.id,
    text: email.body,
    sender: email.from,
    recipients: email.to,
    timestamp: email.date
  }]);
  
  // 3. Manually insert extracted entities into peanut-core
  // (since peanut-core didn't do the extraction)
  for (const entity of entities) {
    const { entityId } = await peanut.resolveEntity({
      name: entity.name,
      type: entity.type,
      email: entity.email
    });
  }
}

async function extractEntitiesWithAnthropic(text: string) {
  // Use your existing Anthropic code from skippy-backend
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    messages: [{
      role: 'user',
      content: `Extract entities from: ${text}`
    }]
  });
  
  return parseEntities(response.content);
}
```

### What Changes in Peanut-Core

**Answer: NOTHING**

Peanut-core doesn't need to call LLMs at all. It just:
- Stores messages
- Stores entities (you provide them)
- Resolves entity duplicates
- Provides search
- Provides context retrieval

**Background extraction?** Skippy backend runs a cron job:
```typescript
// skippy-backend/src/workers/extraction.ts

setInterval(async () => {
  // Get unprocessed messages from peanut-core
  const db = peanut.getDb();
  const messages = db.prepare(`
    SELECT * FROM messages 
    WHERE extracted = 0 
    LIMIT 10
  `).all();
  
  for (const message of messages) {
    // Extract with Anthropic
    const entities = await extractWithAnthropic(message.text);
    
    // Store in peanut-core
    for (const entity of entities) {
      await peanut.resolveEntity({ name: entity.name });
    }
    
    // Mark as processed
    db.prepare('UPDATE messages SET extracted = 1 WHERE id = ?')
      .run(message.id);
  }
}, 60000); // Every minute
```

---

## Option 2: Add Anthropic to Peanut-Core

### What Needs to Change

```typescript
// 1. Add Anthropic SDK
// peanut-core/package.json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.20.0",  // ADD THIS
    "better-sqlite3": "^11.0.0",
    "uuid": "^9.0.0"
  }
}

// 2. Create Anthropic LLM function
// peanut-core/src/extraction/llm.ts

import Anthropic from '@anthropic-ai/sdk';

export async function callAnthropic(
  prompt: string,
  config: LLMConfig & { apiKey: string }
): Promise<LLMResponse> {
  const anthropic = new Anthropic({ apiKey: config.apiKey });
  
  const response = await anthropic.messages.create({
    model: config.model,  // "claude-sonnet-4-20250514"
    max_tokens: config.maxTokens ?? 2000,
    temperature: config.temperature ?? 0.1,
    messages: [{ role: 'user', content: prompt }]
  });
  
  const text = response.content[0]?.type === 'text' 
    ? response.content[0].text 
    : '';
  
  return {
    text,
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens
    }
  };
}

// 3. Update callLLM to detect Anthropic
export async function callLLM(
  prompt: string,
  config: LLMConfig & { apiKey?: string }
): Promise<LLMResponse> {
  // Detect Anthropic
  if (config.endpoint.includes('anthropic.com') || 
      config.model.includes('claude')) {
    return callAnthropic(prompt, config as LLMConfig & { apiKey: string });
  }
  // Detect Ollama
  else if (config.endpoint.includes('/api/generate')) {
    return callOllama(prompt, config);
  }
  // OpenAI-compatible
  else {
    return callOpenAI(prompt, config);
  }
}

// 4. Configure when calling peanut-core
// skippy-backend/src/services/peanut.ts

await peanut.runExtraction({
  endpoint: 'https://api.anthropic.com/v1/messages',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
  temperature: 0.1,
  maxTokens: 2000
}, 10);
```

### Embeddings (Separate Issue)

Anthropic doesn't provide embeddings. You have 3 options:

**Option A: Skip embeddings (use FTS only)**
```typescript
// Just use simpleSearch (no embeddings needed)
const results = await peanut.search(query); // Uses FTS only
```

**Option B: Use Voyage AI for embeddings**
```typescript
// Add voyage-ai SDK for embeddings
// Cost: $0.13 per 1M tokens (cheaper than OpenAI)
```

**Option C: Use OpenAI for embeddings only**
```typescript
// Keep Anthropic for extraction
// Use OpenAI just for embeddings
// Cost: $0.13 per 1M tokens
```

**My Recommendation:** Start with **Option A (skip embeddings)**. FTS search is already excellent for email/message search. Add embeddings later if needed.

---

## What I Recommend: Hybrid Approach

### Best Strategy

```
1. SKIPPY BACKEND does all AI calls
   ├── Uses existing Anthropic integration
   ├── Extracts entities, facts, relationships
   └── Passes results to peanut-core

2. PEANUT-CORE handles intelligence
   ├── Stores messages
   ├── Resolves entities
   ├── Builds relationship graph
   ├── Provides search
   └── Provides context retrieval

3. NO embeddings initially
   ├── FTS search is excellent
   ├── Add later if needed
   └── Saves $0.44/user/month
```

---

## Implementation Example

### Skippy Backend: Extract with Anthropic

```typescript
// skippy-backend/src/services/peanut-extraction.ts

import Anthropic from '@anthropic-ai/sdk';
import { PeanutCore } from 'peanut-core';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const peanut = new PeanutCore({ dbPath: './data/peanut.db' });
await peanut.initialize();

/**
 * Extract entities from text using Anthropic
 */
async function extractEntities(text: string) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Extract all entities (people, companies, dates) from this text.
Return JSON format: { "entities": [{ "name": "...", "type": "person|company|...", "email": "..." }] }

Text: ${text}`
    }]
  });
  
  const content = response.content[0]?.type === 'text' 
    ? response.content[0].text 
    : '';
  
  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  
  const result = JSON.parse(jsonMatch[0]);
  return result.entities || [];
}

/**
 * Process an email: ingest to peanut, extract entities, resolve
 */
export async function processEmailForPeanut(email: {
  id: string;
  subject: string;
  body: string;
  from: string;
  to: string[];
  date: Date;
}) {
  // 1. Ingest message to peanut-core
  await peanut.ingestMessages([{
    id: email.id,
    text: `${email.subject}\n\n${email.body}`,
    sender: email.from,
    recipients: email.to,
    timestamp: email.date,
    metadata: { type: 'email', subject: email.subject }
  }]);
  
  // 2. Extract entities with Anthropic
  const entities = await extractEntities(email.body);
  
  // 3. Resolve entities in peanut-core
  const resolvedEntities = [];
  for (const entity of entities) {
    const { entityId } = await peanut.resolveEntity({
      name: entity.name,
      type: entity.type,
      email: entity.email
    });
    resolvedEntities.push(entityId);
  }
  
  // 4. Create relationships (if needed)
  // TODO: Call Anthropic to extract relationships
  
  return {
    messageId: email.id,
    entities: resolvedEntities
  };
}
```

### Skippy Backend: Background Worker

```typescript
// skippy-backend/src/workers/peanut-processor.ts

import { PeanutCore } from 'peanut-core';
import { processEmailForPeanut } from '../services/peanut-extraction';
import prisma from '../lib/prisma';

const peanut = new PeanutCore({ dbPath: './data/peanut.db' });

/**
 * Process unprocessed emails in background
 */
export async function runPeanutExtractionWorker() {
  // Get emails that haven't been processed by peanut yet
  const emails = await prisma.email.findMany({
    where: { peanutProcessed: false },
    take: 10,
    orderBy: { date: 'desc' }
  });
  
  for (const email of emails) {
    try {
      await processEmailForPeanut({
        id: email.id,
        subject: email.subject || '',
        body: email.cleanedContent || email.summary || '',
        from: email.fromEmail,
        to: [email.toEmail],
        date: email.date
      });
      
      // Mark as processed
      await prisma.email.update({
        where: { id: email.id },
        data: { peanutProcessed: true }
      });
      
      console.log(`[Peanut] Processed email ${email.id}`);
    } catch (error) {
      console.error(`[Peanut] Failed to process ${email.id}:`, error);
    }
  }
}

// Run every minute
setInterval(runPeanutExtractionWorker, 60000);
```

### Skippy Backend: Use Peanut for Context

```typescript
// skippy-backend/src/routes/emails/drafts.ts

import { PeanutCore } from 'peanut-core';

const peanut = new PeanutCore({ dbPath: './data/peanut.db' });

async function generateDraft(emailId: string) {
  const email = await prisma.email.findUnique({ where: { id: emailId } });
  
  // 1. Resolve sender entity
  const { entityId } = await peanut.resolveEntity({
    name: email.fromName,
    email: email.fromEmail
  });
  
  // 2. Search for context
  const context = await peanut.search(
    `emails with ${email.fromName} about ${email.subject}`,
    { limit: 5 }
  );
  
  // 3. Get personality prompt
  const personalityPrompt = peanut.generateMirrorPrompt(entityId);
  
  // 4. Generate draft with Anthropic
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    messages: [{
      role: 'user',
      content: `
        ${personalityPrompt}
        
        Previous context:
        ${context.map(c => c.snippet).join('\n')}
        
        Generate a reply to this email:
        Subject: ${email.subject}
        From: ${email.fromName}
        Body: ${email.summary}
      `
    }]
  });
  
  return response.content[0]?.text || '';
}
```

---

## Summary: What to Modify

### Option 1: Skippy Does AI (RECOMMENDED)

**Peanut-core changes:** NONE

**Skippy backend changes:**
1. ✅ Add peanut-core dependency
2. ✅ Initialize peanut-core at startup
3. ✅ Create `peanut-extraction.ts` (extract with Anthropic)
4. ✅ Create `peanut-processor.ts` (background worker)
5. ✅ Modify `drafts.ts` (use peanut for context)
6. ✅ Add `peanutProcessed` field to Email model

**No Ollama needed. No peanut-core changes needed.**

---

### Option 2: Peanut-Core Does AI

**Peanut-core changes:**
1. Add `@anthropic-ai/sdk` to package.json
2. Create `callAnthropic()` in `llm.ts`
3. Update `callLLM()` to detect Anthropic
4. Skip embeddings (or use Voyage AI)

**Skippy backend changes:**
1. Pass Anthropic API key to peanut-core
2. Call `peanut.runExtraction()` with Anthropic config

**More complex, but more self-contained.**

---

## My Recommendation

**Use Option 1: Skippy does AI, Peanut-core stores results**

**Why:**
- ✅ No peanut-core changes needed
- ✅ Skippy already has Anthropic configured
- ✅ Simpler architecture
- ✅ Easier to debug
- ✅ Can switch AI providers without changing peanut-core

**Start simple, optimize later.**

---

## Bottom Line

**You DON'T need to modify peanut-core for Anthropic.**

Just:
1. Skippy backend calls Anthropic for extraction
2. Skippy backend passes results to peanut-core
3. Peanut-core stores and provides context

**Zero peanut-core changes. Just integration code in Skippy.**

Ready to start? 🚀
