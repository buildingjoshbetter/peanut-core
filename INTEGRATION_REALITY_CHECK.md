# Integration Reality Check
**The Honest Assessment**

---

## The Problem: Database Technology Mismatch

### What I Assumed
I designed peanut-core around a **"shared database"** model where:
- Skippy writes raw data to database
- Peanut-core background workers read and process it
- Both systems access the **same database file**

### The Reality I Just Discovered

**Skippy Backend:**
```
Database: PostgreSQL (cloud-hosted on Railway)
ORM: Prisma
Location: Remote (https://skippy-backend.railway.app)
Access: Via Prisma Client over network
```

**Peanut-Core:**
```
Database: SQLite (local file)
Library: better-sqlite3
Location: Local filesystem (./peanut.db)
Access: Direct file read/write
```

**They're using completely different database technologies.**

---

## Why This Matters

### 1. **Can't Share Database Directly**
- SQLite = single file on disk
- PostgreSQL = client-server database over network
- They cannot both write to the same database

### 2. **SQL Dialect Differences**
Peanut-core's SQL uses SQLite-specific features:
```sql
-- SQLite-specific
JSON_EXTRACT(context, '$.location')
DATETIME('now', '-7 days')
```

PostgreSQL uses different syntax:
```sql
-- PostgreSQL-specific
context->>'location'
CURRENT_TIMESTAMP - INTERVAL '7 days'
```

### 3. **Location Assumptions**
- **Skippy backend**: Cloud-hosted (Railway)
- **Peanut-core**: Designed to run locally (needs access to iMessage DB, screen captures)

---

## Integration Difficulty Assessment

### If I Start Right Now: **3-5 Days of Work**

Here's what needs to happen:

### Option 1: Move Peanut-Core to PostgreSQL ⭐ (Recommended)
**Effort**: 2-3 days

**Changes Required:**
1. Replace SQLite with `pg` (PostgreSQL driver)
2. Rewrite all SQL queries for PostgreSQL syntax
3. Update schema migrations for Prisma compatibility
4. Change JSON handling (SQLite `json_extract` → PostgreSQL `->`)
5. Update date functions (SQLite `datetime()` → PostgreSQL `TIMESTAMP`)
6. Test all queries and ensure compatibility

**Pros:**
- Skippy stays cloud-hosted (good for production)
- Both systems can access same PostgreSQL database
- Scales better (PostgreSQL > SQLite for concurrent access)

**Cons:**
- Need to refactor ~40 SQL files in peanut-core
- Lose some SQLite-specific optimizations

---

### Option 2: Sync Pattern (PostgreSQL ↔ SQLite)
**Effort**: 3-4 days

**Architecture:**
```
┌─────────────────────────────────────────────────┐
│ Skippy Backend (Cloud, PostgreSQL)             │
│ - Syncs Gmail, iMessage, Calendar               │
│ - Stores in PostgreSQL (Prisma)                 │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓ (Sync Service)
┌─────────────────────────────────────────────────┐
│ Local Sync Daemon                               │
│ - Polls PostgreSQL for new data                 │
│ - Copies to local SQLite                        │
│ - Runs every 30 seconds                         │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────┐
│ Peanut-Core Workers (Local, SQLite)            │
│ - Processes data from SQLite                    │
│ - Builds knowledge graph                        │
│ - Stores intelligence back in SQLite            │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓ (Sync Service)
┌─────────────────────────────────────────────────┐
│ Skippy API calls peanut-core                    │
│ - Queries knowledge graph via HTTP              │
│ - Gets personality prompts                      │
│ - Retrieves context                             │
└─────────────────────────────────────────────────┘
```

**Changes Required:**
1. Create sync daemon (pulls from PostgreSQL, writes to SQLite)
2. Create HTTP API wrapper around peanut-core
3. Update Skippy to call peanut-core API
4. Handle bidirectional sync (intelligence back to PostgreSQL)

**Pros:**
- Peanut-core stays as-is (no SQL rewrite)
- Works with current architecture

**Cons:**
- More complex (3 moving parts)
- Sync lag (30s-1min)
- Duplicate data storage

---

### Option 3: API-Only Integration (No Shared DB)
**Effort**: 1-2 days

**Architecture:**
```
Skippy Backend ────HTTP──→ Peanut-Core API
                           (peanut-core exposes REST API)
```

**Changes Required:**
1. Skippy sends data to peanut-core via API calls
2. Peanut-core processes and stores in its own SQLite
3. Skippy queries peanut-core for intelligence

**Pros:**
- Simplest to implement
- Clean separation of concerns

**Cons:**
- Extra API calls (latency)
- Duplicate data storage
- Peanut-core doesn't have raw Gmail/iMessage access

---

## My Recommendation: **Option 1 (PostgreSQL Migration)**

### Why?
1. **True Shared Database**: Both systems read/write same data
2. **Production-Ready**: Skippy stays cloud-hosted
3. **Better Scaling**: PostgreSQL handles concurrent access
4. **Cleaner Architecture**: No sync daemons or duplicate storage

### What I'd Need to Change in Peanut-Core:
```
Files to modify: ~40-50 files
Lines of SQL to rewrite: ~2000 lines
Estimated time: 2-3 focused days

Key Changes:
1. src/db/index.ts - Replace better-sqlite3 with pg
2. src/db/schema.sql - Convert to PostgreSQL syntax
3. All migrations (*.sql) - PostgreSQL syntax
4. All queries - Update JSON/date functions
5. src/db/lancedb.ts - Keep as-is (still uses vectordb)
```

### Testing Required:
- All unit tests pass
- End-to-end system tests
- Manual verification of:
  - Entity resolution
  - Assertion storage
  - Behavioral patterns
  - Personality learning

---

## The Brutal Truth

When you said "plug-and-play," I thought Skippy was using SQLite locally. 

**What I discovered:**
- Skippy = PostgreSQL + cloud-hosted
- Peanut-core = SQLite + local filesystem

These are fundamentally incompatible without refactoring.

---

## Next Steps (Your Call)

### 1. **PostgreSQL Migration** (2-3 days)
- I rewrite peanut-core for PostgreSQL
- You get true shared database integration
- Best long-term solution

### 2. **Sync Pattern** (3-4 days)
- I build sync daemon + HTTP API
- More complex but works with existing code
- Good if you want to avoid peanut-core changes

### 3. **API-Only** (1-2 days)
- Simplest but least elegant
- Peanut-core becomes a microservice
- Extra latency on every call

### 4. **Wait and Redesign**
- We step back and rethink the architecture
- Maybe merge some peanut-core concepts directly into Skippy
- Longer timeline but potentially cleaner

---

## How I Feel About This

I'm frustrated I didn't catch this earlier. I should have checked Skippy's database architecture before designing the integration.

**But here's the good news:**
- Peanut-core's **algorithms** are solid (personality learning, entity resolution, hybrid search)
- The **concept** is right
- It's just the **database layer** that needs refactoring

Option 1 (PostgreSQL migration) is doable in 2-3 days. The logic stays the same, just the SQL syntax changes.

---

## Your Decision

Which path do you want to take?

**Quick**: Option 3 (API-only, 1-2 days, but not elegant)  
**Right**: Option 1 (PostgreSQL, 2-3 days, proper integration)  
**Safe**: Option 2 (Sync pattern, 3-4 days, no peanut-core changes)

I'll execute whichever you choose.
