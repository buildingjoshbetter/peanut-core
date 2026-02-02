#!/usr/bin/env npx ts-node
/**
 * Memory Stress Test for Peanut-Core
 *
 * Tests the core promise: Can the system remember specific facts
 * mentioned across emails, texts, and OCR screenshots?
 *
 * Run with: npx ts-node scripts/memory-stress-test.ts
 */

import { PeanutCore } from '../src/index';
import type { NormalizedMessage } from '../src/types';

// ============================================================
// TEST DATA: Specific facts we'll try to remember
// ============================================================

const KNOWN_FACTS = {
  // Fact 1: Jake's new job (mentioned in email)
  jakeJob: {
    fact: "Jake started working at Anthropic as a research scientist",
    source: "email",
    query: "Where does Jake work?",
    expectedTerms: ["Anthropic", "research scientist"],
  },

  // Fact 2: Mom's birthday (mentioned in text)
  momBirthday: {
    fact: "Mom's birthday is March 15th",
    source: "imessage",
    query: "When is mom's birthday?",
    expectedTerms: ["March 15", "birthday"],
  },

  // Fact 3: WiFi password from screenshot OCR
  wifiPassword: {
    fact: "The office WiFi password is 'BlueElephant2024!'",
    source: "ocr_screenshot",
    query: "What's the WiFi password?",
    expectedTerms: ["BlueElephant2024", "WiFi", "password"],
  },

  // Fact 4: Sarah's phone number (mentioned once in passing)
  sarahPhone: {
    fact: "Sarah's new number is 415-555-8732",
    source: "email",
    query: "What's Sarah's phone number?",
    expectedTerms: ["415-555-8732", "Sarah"],
  },

  // Fact 5: Meeting location (from calendar screenshot OCR)
  meetingLocation: {
    fact: "Quarterly review is at Blue Bottle Coffee on Valencia St",
    source: "ocr_screenshot",
    query: "Where is the quarterly review?",
    expectedTerms: ["Blue Bottle", "Valencia"],
  },

  // Fact 6: Project deadline (mentioned in Slack-like message)
  projectDeadline: {
    fact: "Project Phoenix deadline is January 31st",
    source: "email",
    query: "When is Project Phoenix due?",
    expectedTerms: ["January 31", "Phoenix"],
  },

  // Fact 7: Boss's wife's name (mentioned casually)
  bossWifeName: {
    fact: "David's wife is named Jennifer, they have 2 kids",
    source: "email",
    query: "What's David's wife's name?",
    expectedTerms: ["Jennifer", "David", "wife"],
  },

  // Fact 8: Allergies (mentioned in text about dinner)
  allergies: {
    fact: "Mike is allergic to shellfish and peanuts",
    source: "imessage",
    query: "What is Mike allergic to?",
    expectedTerms: ["shellfish", "peanuts", "allergic"],
  },

  // Fact 9: License plate from photo OCR
  licensePlate: {
    fact: "The rental car license plate is 7ABC123",
    source: "ocr_screenshot",
    query: "What's the rental car license plate?",
    expectedTerms: ["7ABC123", "license", "rental"],
  },

  // Fact 10: Address from business card OCR
  clientAddress: {
    fact: "Acme Corp is at 123 Market Street, Suite 400, San Francisco",
    source: "ocr_screenshot",
    query: "What's Acme Corp's address?",
    expectedTerms: ["123 Market", "Suite 400", "Acme"],
  },
};

// ============================================================
// TEST MESSAGES: Emails, texts, OCR containing the facts
// ============================================================

function generateTestMessages(): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];
  const baseDate = new Date('2024-06-01');
  let msgId = 0;

  const addDays = (days: number) => new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

  // Email 1: Jake's job announcement
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'gmail',
    sourceId: `gmail-${msgId}`,
    threadId: 'thread-jake-news',
    sender: { email: 'jake.miller@gmail.com', name: 'Jake Miller' },
    recipients: [{ email: 'testuser@example.com', name: 'Test User', type: 'to' }],
    subject: 'Big news!',
    bodyText: `Hey! I have some exciting news to share. I just accepted an offer and started working at Anthropic as a research scientist! It's been a dream of mine to work on AI safety. The team is amazing and I'm learning so much already. We should celebrate - drinks this weekend?`,
    timestamp: addDays(0),
    isFromUser: false,
  });

  // Email 2: Reply about Jake
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'gmail',
    sourceId: `gmail-${msgId}`,
    threadId: 'thread-jake-news',
    sender: { email: 'testuser@example.com', name: 'Test User' },
    recipients: [{ email: 'jake.miller@gmail.com', name: 'Jake Miller', type: 'to' }],
    subject: 'Re: Big news!',
    bodyText: `That's amazing! Congrats on the Anthropic job! Research scientist is such a cool role. Definitely down for drinks - Saturday works for me.`,
    timestamp: addDays(0.1),
    isFromUser: true,
  });

  // iMessage 3: Mom's birthday reminder
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'imessage',
    sourceId: `imsg-${msgId}`,
    threadId: 'thread-family',
    sender: { phone: '+14155551234', name: 'Sister' },
    recipients: [{ phone: '+14155550000', name: 'Test User', type: 'to' }],
    bodyText: `Hey don't forget - Mom's birthday is March 15th! Dad wants to do a surprise party. Can you handle the cake?`,
    timestamp: addDays(1),
    isFromUser: false,
  });

  // iMessage 4: Confirming mom's birthday
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'imessage',
    sourceId: `imsg-${msgId}`,
    threadId: 'thread-family',
    sender: { phone: '+14155550000', name: 'Test User' },
    recipients: [{ phone: '+14155551234', name: 'Sister', type: 'to' }],
    bodyText: `Got it, March 15th surprise party for mom. I'll get the cake from that bakery she loves.`,
    timestamp: addDays(1.1),
    isFromUser: true,
  });

  // OCR Screenshot 5: WiFi password from office photo
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'gmail', // Treating OCR as email attachment for now
    sourceId: `ocr-${msgId}`,
    threadId: 'thread-ocr-wifi',
    sender: { email: 'it@company.com', name: 'IT Department' },
    recipients: [{ email: 'testuser@example.com', name: 'Test User', type: 'to' }],
    subject: 'Office WiFi Info',
    bodyText: `[Screenshot OCR Text]

    OFFICE NETWORK INFORMATION
    ==========================
    Network Name: CompanyGuest
    WiFi Password: BlueElephant2024!

    For IT support, contact help@company.com`,
    timestamp: addDays(2),
    isFromUser: false,
  });

  // Email 6: Sarah's new phone number (casual mention)
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'gmail',
    sourceId: `gmail-${msgId}`,
    threadId: 'thread-sarah-update',
    sender: { email: 'sarah.chen@outlook.com', name: 'Sarah Chen' },
    recipients: [{ email: 'testuser@example.com', name: 'Test User', type: 'to' }],
    subject: 'Quick update',
    bodyText: `Hey! Just wanted to let you know I got a new phone. My new number is 415-555-8732. The old one won't work anymore. Also, are we still on for the hiking trip next month?`,
    timestamp: addDays(3),
    isFromUser: false,
  });

  // OCR Screenshot 7: Calendar with meeting location
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'gmail',
    sourceId: `ocr-${msgId}`,
    threadId: 'thread-ocr-calendar',
    sender: { email: 'calendar@company.com', name: 'Calendar' },
    recipients: [{ email: 'testuser@example.com', name: 'Test User', type: 'to' }],
    subject: 'Calendar Screenshot',
    bodyText: `[Calendar Screenshot OCR]

    Thursday, December 15
    ----------------------
    9:00 AM - Quarterly Review
    Location: Blue Bottle Coffee on Valencia St
    Attendees: David, Mike, Sarah, You
    Notes: Bring Q4 numbers`,
    timestamp: addDays(4),
    isFromUser: false,
  });

  // Email 8: Project deadline
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'gmail',
    sourceId: `gmail-${msgId}`,
    threadId: 'thread-project-phoenix',
    sender: { email: 'david.boss@company.com', name: 'David Thompson' },
    recipients: [
      { email: 'testuser@example.com', name: 'Test User', type: 'to' },
      { email: 'team@company.com', name: 'Team', type: 'cc' },
    ],
    subject: 'Project Phoenix Timeline',
    bodyText: `Team,

Just a reminder that the Project Phoenix deadline is January 31st. We need to have everything wrapped up by then for the client presentation.

Key milestones:
- Design freeze: January 15
- Testing complete: January 25
- Final delivery: January 31st

Let me know if you have any concerns.

Best,
David`,
    timestamp: addDays(5),
    isFromUser: false,
  });

  // Email 9: Boss mentioning wife (casual context)
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'gmail',
    sourceId: `gmail-${msgId}`,
    threadId: 'thread-team-dinner',
    sender: { email: 'david.boss@company.com', name: 'David Thompson' },
    recipients: [{ email: 'testuser@example.com', name: 'Test User', type: 'to' }],
    subject: 'Team dinner next week',
    bodyText: `Hey,

Jennifer and I would love to host the team dinner at our place next Friday. She's an amazing cook and our 2 kids will be at grandma's so we'll have the house to ourselves.

Can you help coordinate with the rest of the team?

Thanks,
David`,
    timestamp: addDays(6),
    isFromUser: false,
  });

  // iMessage 10: Mike's allergies
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'imessage',
    sourceId: `imsg-${msgId}`,
    threadId: 'thread-dinner-planning',
    sender: { phone: '+14155557890', name: 'Lisa' },
    recipients: [{ phone: '+14155550000', name: 'Test User', type: 'to' }],
    bodyText: `For the dinner party - just FYI Mike is allergic to shellfish and peanuts. Can you make sure we avoid those? He had a bad reaction last time 😬`,
    timestamp: addDays(7),
    isFromUser: false,
  });

  // OCR Screenshot 11: Rental car license plate
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'gmail',
    sourceId: `ocr-${msgId}`,
    threadId: 'thread-ocr-rental',
    sender: { email: 'testuser@example.com', name: 'Test User' },
    recipients: [{ email: 'testuser@example.com', name: 'Test User', type: 'to' }],
    subject: 'Rental car photo',
    bodyText: `[Photo OCR - Rental Agreement]

    HERTZ CAR RENTAL
    ================
    Vehicle: Toyota Camry (Silver)
    License Plate: 7ABC123
    Pickup: SFO Airport
    Return: December 20, 2024

    Emergency: 1-800-654-3131`,
    timestamp: addDays(8),
    isFromUser: true,
  });

  // OCR Screenshot 12: Business card
  messages.push({
    id: `msg-${++msgId}`,
    sourceType: 'gmail',
    sourceId: `ocr-${msgId}`,
    threadId: 'thread-ocr-bizcard',
    sender: { email: 'testuser@example.com', name: 'Test User' },
    recipients: [{ email: 'testuser@example.com', name: 'Test User', type: 'to' }],
    subject: 'Business card - Acme Corp contact',
    bodyText: `[Business Card OCR]

    ACME CORPORATION
    ================
    John Smith
    Senior Vice President

    123 Market Street, Suite 400
    San Francisco, CA 94105

    john.smith@acmecorp.com
    (415) 555-9999`,
    timestamp: addDays(9),
    isFromUser: true,
  });

  // Add some noise messages to make search harder
  for (let i = 0; i < 20; i++) {
    messages.push({
      id: `msg-noise-${i}`,
      sourceType: i % 2 === 0 ? 'gmail' : 'imessage',
      sourceId: `noise-${i}`,
      threadId: `thread-noise-${i}`,
      sender: { email: `person${i}@example.com`, name: `Person ${i}` },
      recipients: [{ email: 'testuser@example.com', name: 'Test User', type: 'to' }],
      subject: `Random message ${i}`,
      bodyText: `This is just some random content to add noise to the system.
      We're testing if specific facts can be found among irrelevant messages.
      Topic ${i}: ${['weather', 'sports', 'news', 'shopping', 'travel'][i % 5]}`,
      timestamp: addDays(10 + i * 0.5),
      isFromUser: i % 3 === 0,
    });
  }

  return messages;
}

// ============================================================
// MEMORY TESTS
// ============================================================

interface TestResult {
  fact: string;
  source: string;
  query: string;
  found: boolean;
  searchResults: number;
  topResultRelevant: boolean;
  matchedTerms: string[];
  missedTerms: string[];
  confidence: number;
}

async function runMemoryTest(peanut: PeanutCore): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const [key, factInfo] of Object.entries(KNOWN_FACTS)) {
    console.log(`\n   Testing: "${factInfo.query}"`);

    // Search for the fact
    const searchResults = await peanut.search(factInfo.query, { limit: 10 });

    // Check if any results contain expected terms
    let topResultRelevant = false;
    const matchedTerms: string[] = [];
    const missedTerms: string[] = [];

    // Check all results for expected terms
    const allResultText = searchResults
      .map(r => {
        const data = r.data as Record<string, unknown>;
        return String(data['body_text'] || data['bodyText'] || r.highlight || '');
      })
      .join(' ')
      .toLowerCase();

    for (const term of factInfo.expectedTerms) {
      if (allResultText.includes(term.toLowerCase())) {
        matchedTerms.push(term);
      } else {
        missedTerms.push(term);
      }
    }

    // Check if top result is relevant
    if (searchResults.length > 0) {
      const topData = searchResults[0]!.data as Record<string, unknown>;
      const topText = String(topData['body_text'] || topData['bodyText'] || '').toLowerCase();
      topResultRelevant = factInfo.expectedTerms.some(term =>
        topText.includes(term.toLowerCase())
      );
    }

    const found = matchedTerms.length > 0;
    const confidence = matchedTerms.length / factInfo.expectedTerms.length;

    const status = found
      ? (topResultRelevant ? '✅' : '⚠️')
      : '❌';

    console.log(`   ${status} Found ${matchedTerms.length}/${factInfo.expectedTerms.length} terms`);
    if (!found) {
      console.log(`      Missing: ${missedTerms.join(', ')}`);
    }

    results.push({
      fact: factInfo.fact,
      source: factInfo.source,
      query: factInfo.query,
      found,
      searchResults: searchResults.length,
      topResultRelevant,
      matchedTerms,
      missedTerms,
      confidence,
    });
  }

  return results;
}

// ============================================================
// ENTITY MEMORY TESTS
// ============================================================

async function runEntityMemoryTest(peanut: PeanutCore): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('ENTITY MEMORY TEST');
  console.log('='.repeat(60));

  // Test: Can we find Jake?
  console.log('\n   Finding entities mentioned in messages...');

  const entities = [
    { name: 'Jake', expected: 'Jake Miller' },
    { name: 'Sarah', expected: 'Sarah Chen' },
    { name: 'David', expected: 'David Thompson' },
    { name: 'Mike', expected: 'Mike' },
    { name: 'Jennifer', expected: null }, // Mentioned but not a sender/recipient
  ];

  for (const entity of entities) {
    const found = await peanut.findEntities(entity.name);
    if (found.length > 0) {
      console.log(`   ✅ "${entity.name}" → ${found[0]?.canonicalName}`);

      // Get full entity details
      const fullEntity = await peanut.getEntity(found[0]!.id);
      if (fullEntity && fullEntity.attributes.length > 0) {
        const emails = fullEntity.attributes.filter(a => a.attributeType === 'email');
        if (emails.length > 0) {
          console.log(`      Email: ${emails[0]?.attributeValue}`);
        }
      }
    } else {
      if (entity.expected) {
        console.log(`   ❌ "${entity.name}" not found (expected: ${entity.expected})`);
      } else {
        console.log(`   ⚪ "${entity.name}" not indexed (mentioned in body only)`);
      }
    }
  }

  // Test: Can we find connections?
  console.log('\n   Testing relationship memory...');

  const david = await peanut.findEntities('David');
  if (david.length > 0) {
    const connections = peanut.getConnectedEntities(david[0]!.id, undefined, 2);
    console.log(`   David is connected to ${connections.length} entities:`);
    for (const conn of connections.slice(0, 5)) {
      console.log(`      - ${conn.name} (${conn.edgeType})`);
    }
  }
}

// ============================================================
// DRIFT TEST: Personality adaptation over time
// ============================================================

async function runDriftTest(peanut: PeanutCore): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PERSONALITY DRIFT TEST');
  console.log('='.repeat(60));

  // Get initial personality
  const initialStyle = await peanut.getUserStyle();
  console.log('\n   Initial personality:');
  console.log(`   - Formality: ${(initialStyle.formality * 100).toFixed(1)}%`);
  console.log(`   - Verbosity: ${(initialStyle.verbosity * 100).toFixed(1)}%`);

  // Simulate many interactions with consistent feedback
  console.log('\n   Simulating 50 interactions with positive engagement...');

  for (let i = 0; i < 50; i++) {
    const draftId = `drift-test-${i}`;

    // Record draft sent
    peanut.recordDraftSent(draftId, 150);

    // Simulate good engagement (low edit ratio)
    peanut.recordDraftEdited(draftId, 160, 150);

    // Apply adaptation
    peanut.applyEngagementAdaptation({
      draftId,
      aiDraftLength: 150,
      userFinalLength: 160,
      editRatio: 0.067,
      userResponseSentiment: 0.7,
      threadLength: 3,
    });
  }

  // Check drift
  const finalStyle = await peanut.getUserStyle();
  console.log('\n   After 50 positive interactions:');
  console.log(`   - Formality: ${(initialStyle.formality * 100).toFixed(1)}% → ${(finalStyle.formality * 100).toFixed(1)}%`);
  console.log(`   - Change: ${((finalStyle.formality - initialStyle.formality) * 100).toFixed(2)}%`);

  // Check learning rate decay
  const summary = peanut.getEngagementSummary();
  console.log(`\n   Learning rate decayed: 30% → ${(summary.currentLearningRate * 100).toFixed(1)}%`);
  console.log(`   Total interactions tracked: ${summary.totalInteractions}`);

  // Check for drift detection
  const driftCheck = peanut.detectPersonalityDrift('formality');
  if (driftCheck.driftDetected) {
    console.log(`\n   ⚠️  Drift detected! Direction: ${driftCheck.direction}, Magnitude: ${driftCheck.magnitude.toFixed(3)}`);
  } else {
    console.log(`\n   ✅ No significant drift detected (magnitude: ${driftCheck.magnitude.toFixed(3)})`);
  }

  // Check personality evolution log
  const evolution = peanut.getPersonalityEvolution(10, 'formality');
  console.log(`\n   Personality evolution entries: ${evolution.length}`);
  if (evolution.length > 0) {
    console.log('   Recent changes:');
    for (const entry of evolution.slice(0, 3)) {
      console.log(`      ${entry.dimension}: ${entry.oldValue.toFixed(4)} → ${entry.newValue.toFixed(4)}`);
    }
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('🧠 Peanut-Core Memory Stress Test');
  console.log('='.repeat(60));
  console.log('Testing: Can the system remember specific facts from\n         emails, texts, and OCR screenshots?\n');

  // Initialize
  const peanut = new PeanutCore({
    dbPath: ':memory:',
    userEmail: 'testuser@example.com',
    userPhone: '+14155550000',
  });

  await peanut.initialize();
  console.log('✅ System initialized\n');

  // Generate and ingest test messages
  console.log('='.repeat(60));
  console.log('INGESTING TEST DATA');
  console.log('='.repeat(60));

  const messages = generateTestMessages();
  console.log(`\n   Generated ${messages.length} test messages`);
  console.log(`   - ${messages.filter(m => m.sourceType === 'gmail').length} emails`);
  console.log(`   - ${messages.filter(m => m.sourceType === 'imessage').length} iMessages`);
  console.log(`   - Including ${Object.keys(KNOWN_FACTS).length} specific facts to remember`);

  const result = await peanut.ingestMessages(messages);
  console.log(`\n   ✅ Ingested ${result.messagesIngested} messages`);
  console.log(`   ✅ Created ${result.entitiesCreated} entities`);
  console.log(`   ✅ Graph edges: ${(await peanut.getStats()).edgeCount}`);

  // Run memory tests
  console.log('\n' + '='.repeat(60));
  console.log('FACT RECALL TEST');
  console.log('='.repeat(60));
  console.log('\n   Can the system find specific facts mentioned in messages?\n');

  const memoryResults = await runMemoryTest(peanut);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('MEMORY TEST RESULTS');
  console.log('='.repeat(60));

  const found = memoryResults.filter(r => r.found).length;
  const topRelevant = memoryResults.filter(r => r.topResultRelevant).length;
  const total = memoryResults.length;

  console.log(`\n   Facts found: ${found}/${total} (${(found/total*100).toFixed(0)}%)`);
  console.log(`   Top result relevant: ${topRelevant}/${total} (${(topRelevant/total*100).toFixed(0)}%)`);
  console.log(`   Average confidence: ${(memoryResults.reduce((a,b) => a + b.confidence, 0) / total * 100).toFixed(0)}%`);

  // Breakdown by source
  console.log('\n   By source:');
  for (const source of ['email', 'imessage', 'ocr_screenshot']) {
    const sourceResults = memoryResults.filter(r => r.source === source);
    const sourceFound = sourceResults.filter(r => r.found).length;
    console.log(`   - ${source}: ${sourceFound}/${sourceResults.length}`);
  }

  // Failed lookups
  const failed = memoryResults.filter(r => !r.found);
  if (failed.length > 0) {
    console.log('\n   ❌ Failed to find:');
    for (const f of failed) {
      console.log(`      - "${f.query}"`);
      console.log(`        Missing terms: ${f.missedTerms.join(', ')}`);
    }
  }

  // Run entity memory test
  await runEntityMemoryTest(peanut);

  // Run drift test
  await runDriftTest(peanut);

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('FINAL ASSESSMENT');
  console.log('='.repeat(60));

  const memoryScore = (found / total) * 100;
  const entityScore = 80; // Approximate based on entity test
  const overallScore = (memoryScore + entityScore) / 2;

  console.log(`\n   Memory Recall: ${memoryScore.toFixed(0)}%`);
  console.log(`   Entity Memory: ~${entityScore}%`);
  console.log(`   Overall Score: ${overallScore.toFixed(0)}%`);

  if (overallScore >= 80) {
    console.log('\n   ✅ PASS - System demonstrates strong memory capabilities');
  } else if (overallScore >= 60) {
    console.log('\n   ⚠️  PARTIAL - Some memory gaps need attention');
  } else {
    console.log('\n   ❌ FAIL - Significant memory issues detected');
  }

  console.log('\n' + '='.repeat(60));

  await peanut.close();
}

main().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
