#!/usr/bin/env npx ts-node
/**
 * End-to-end system test for peanut-core
 * Run with: npx ts-node scripts/test-system.ts
 */

import { PeanutCore } from '../src/index';
import { getDefaultFixtures, getEngagementFixtures } from '../src/fixtures';

async function main() {
  console.log('🥜 Peanut-Core System Test\n');
  console.log('='.repeat(50));

  // Initialize with in-memory database
  const peanut = new PeanutCore({
    dbPath: ':memory:',
    userEmail: 'testuser@example.com',
    userPhone: '+14155550000',
  });

  await peanut.initialize();
  console.log('✅ Database initialized\n');

  // Generate test data
  console.log('📦 Generating synthetic test data...');
  const fixtures = getDefaultFixtures();
  console.log(`   - ${fixtures.contacts.length} contacts`);
  console.log(`   - ${fixtures.emails.length} emails`);
  console.log(`   - ${fixtures.messages.length} messages`);
  console.log(`   - ${fixtures.ambiguousContacts.length} ambiguous contacts\n`);

  // Test 1: Ingestion
  console.log('='.repeat(50));
  console.log('TEST 1: Ingestion Pipeline\n');

  const normalizedEmails = fixtures.emails.slice(0, 50).map(email => ({
    id: email.id,
    sourceType: 'gmail' as const,
    sourceId: email.id,
    threadId: email.threadId,
    sender: email.sender,
    recipients: email.recipients,
    subject: email.subject,
    bodyText: email.body,
    timestamp: email.timestamp,
    isFromUser: email.isFromUser,
  }));

  const ingestResult = await peanut.ingestMessages(normalizedEmails);
  console.log(`   ✅ Ingested ${ingestResult.messagesIngested} messages`);
  console.log(`   ✅ Created ${ingestResult.entitiesCreated} entities`);
  console.log(`   ✅ Merged ${ingestResult.entitiesMerged} duplicate entities`);
  if (ingestResult.errors.length > 0) {
    console.log(`   ⚠️  ${ingestResult.errors.length} errors`);
  }

  // Test 2: Entity Resolution
  console.log('\n' + '='.repeat(50));
  console.log('TEST 2: Entity Resolution\n');

  const stats = await peanut.getStats();
  console.log(`   Total entities: ${stats.entityCount}`);
  console.log(`   Total messages: ${stats.messageCount}`);
  console.log(`   Total graph edges: ${stats.edgeCount}`);

  // Find entities
  const foundEntities = await peanut.findEntities('Smith');
  console.log(`\n   Search for "Smith": ${foundEntities.length} entities found`);
  if (foundEntities.length > 0) {
    console.log(`   First match: ${foundEntities[0]?.canonicalName}`);
  }

  // Test name similarity
  const similarity = peanut.nameSimilarity('Jake', 'Jacob');
  console.log(`\n   Name similarity "Jake" vs "Jacob": ${(similarity * 100).toFixed(1)}%`);

  const similarity2 = peanut.nameSimilarity('William', 'Bill');
  console.log(`   Name similarity "William" vs "Bill": ${(similarity2 * 100).toFixed(1)}%`);

  // Test 3: Search
  console.log('\n' + '='.repeat(50));
  console.log('TEST 3: Search Engine\n');

  const searchResults = await peanut.search('meeting tomorrow', { limit: 5 });
  console.log(`   FTS search "meeting tomorrow": ${searchResults.length} results`);
  if (searchResults.length > 0) {
    console.log(`   Top result score: ${searchResults[0]?.score.toFixed(3)}`);
    if (searchResults[0]?.highlight) {
      const preview = searchResults[0].highlight.substring(0, 60) + '...';
      console.log(`   Preview: "${preview}"`);
    }
  }

  const searchResults2 = await peanut.search('project update', { limit: 5 });
  console.log(`\n   FTS search "project update": ${searchResults2.length} results`);

  // Test 4: Personality Engine
  console.log('\n' + '='.repeat(50));
  console.log('TEST 4: Personality Engine\n');

  // Analyze user style
  const userStyle = peanut.analyzeUserStyle();
  console.log('   User Style Profile:');
  console.log(`   - Formality: ${(userStyle.formality * 100).toFixed(0)}%`);
  console.log(`   - Verbosity: ${(userStyle.verbosity * 100).toFixed(0)}%`);
  console.log(`   - Emoji density: ${userStyle.emojiDensity.toFixed(2)}`);
  console.log(`   - Avg message length: ${userStyle.avgMessageLength} chars`);

  // Analyze all recipients
  const recipientCount = peanut.analyzeAllRecipients();
  console.log(`\n   Analyzed ${recipientCount} recipient styles`);

  const allStyles = peanut.getAllRecipientStyles();
  if (allStyles.length > 0) {
    console.log(`\n   Sample recipient style:`);
    const sample = allStyles[0];
    console.log(`   - Formality: ${((sample?.formality ?? 0) * 100).toFixed(0)}%`);
    console.log(`   - Warmth: ${((sample?.warmth ?? 0) * 100).toFixed(0)}%`);
    console.log(`   - Message count: ${sample?.messageCount}`);
  }

  // Generate mirror prompt
  const mirrorPrompt = peanut.generateMirrorPrompt(undefined, 0.7);
  console.log(`\n   Mirror prompt generated (${mirrorPrompt.length} chars)`);
  console.log(`   Preview: "${mirrorPrompt.substring(0, 100)}..."`);

  // Test 5: Engagement System
  console.log('\n' + '='.repeat(50));
  console.log('TEST 5: Engagement Optimization\n');

  // Record some engagement events
  peanut.recordDraftSent('draft-001', 150, undefined, 'work');
  peanut.recordDraftEdited('draft-001', 165, 150); // 10% edit
  peanut.recordDraftSent('draft-002', 200, undefined, 'personal');
  peanut.recordDraftEdited('draft-002', 350, 200); // 75% edit
  peanut.recordUserResponse(0.7, 3); // Positive sentiment

  console.log('   Recorded 5 engagement events');

  // Calculate engagement score
  const engagementFixtures = getEngagementFixtures();
  console.log('\n   Testing engagement scenarios:');

  for (const scenario of engagementFixtures.draftScenarios.slice(0, 3)) {
    const score = peanut.calculateEngagementScore({
      draftId: 'test',
      aiDraftLength: scenario.aiDraftLength,
      userFinalLength: scenario.userFinalLength,
      editRatio: Math.abs(scenario.userFinalLength - scenario.aiDraftLength) / scenario.aiDraftLength,
    });
    console.log(`   - "${scenario.name}": ${(score.overall * 100).toFixed(0)}% engagement`);
  }

  // Test vent mode detection
  console.log('\n   Testing vent mode detection:');
  for (const scenario of engagementFixtures.ventModeScenarios.slice(0, 3)) {
    const result = peanut.detectVentMode(
      scenario.sentiment,
      scenario.threadLength,
      scenario.messageVelocity,
      scenario.capsRatio
    );
    const status = result.isVenting ? '🔴 VENTING' : '🟢 Normal';
    console.log(`   - "${scenario.name}": ${status}`);
  }

  // Get engagement summary
  const summary = peanut.getEngagementSummary();
  console.log('\n   Engagement Summary:');
  console.log(`   - Total interactions: ${summary.totalInteractions}`);
  console.log(`   - Average engagement: ${(summary.averageEngagement * 100).toFixed(0)}%`);
  console.log(`   - Current learning rate: ${(summary.currentLearningRate * 100).toFixed(1)}%`);
  console.log(`   - Vent mode detections: ${summary.ventModeCount}`);

  // Test 6: Full Pipeline
  console.log('\n' + '='.repeat(50));
  console.log('TEST 6: Full Pipeline Integration\n');

  // Simulate a complete flow
  console.log('   Simulating user workflow:');
  console.log('   1. User searches for "budget proposal"');
  const budgetResults = await peanut.search('budget proposal', { limit: 3 });
  console.log(`      Found ${budgetResults.length} results`);

  console.log('   2. AI generates draft (150 chars)');
  const draftId = 'workflow-draft-001';
  peanut.recordDraftSent(draftId, 150);

  console.log('   3. User edits draft to 160 chars (minor edit)');
  peanut.recordDraftEdited(draftId, 160, 150);

  console.log('   4. Recipient responds positively');
  peanut.recordUserResponse(0.8, 4);

  console.log('   5. Check if adaptation should apply');
  const adaptResult = peanut.applyEngagementAdaptation({
    draftId,
    aiDraftLength: 150,
    userFinalLength: 160,
    editRatio: 0.067,
    userResponseSentiment: 0.8,
    threadLength: 4,
  }, { checkVentMode: true });

  if (adaptResult.applied) {
    console.log(`   ✅ Adaptation applied with learning rate ${(adaptResult.learningRate * 100).toFixed(1)}%`);
    for (const change of adaptResult.changes) {
      console.log(`      - ${change.dimension}: ${change.oldValue.toFixed(3)} → ${change.newValue.toFixed(3)}`);
    }
  } else {
    console.log(`   ℹ️  Adaptation not applied: ${adaptResult.reason}`);
  }

  // Final stats
  console.log('\n' + '='.repeat(50));
  console.log('FINAL STATS\n');

  const finalStats = await peanut.getStats();
  console.log(`   Entities: ${finalStats.entityCount}`);
  console.log(`   Messages: ${finalStats.messageCount}`);
  console.log(`   Assertions: ${finalStats.assertionCount}`);
  console.log(`   Graph edges: ${finalStats.edgeCount}`);

  const recentEvents = peanut.getRecentEngagementEvents(100);
  console.log(`   Engagement events: ${recentEvents.length}`);

  // Cleanup
  await peanut.close();

  console.log('\n' + '='.repeat(50));
  console.log('✅ All tests completed successfully!');
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
