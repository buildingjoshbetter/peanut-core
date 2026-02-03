#!/usr/bin/env npx ts-node
/**
 * Generate test database for manual inspection
 * Creates test-peanut.db with synthetic data
 */

import { PeanutCore } from '../src/index';
import { generateTestFixtures } from '../src/fixtures';
import * as fs from 'fs';

async function main() {
  console.log('🔬 Manual Testing Setup\n');
  console.log('='.repeat(60));

  const dbPath = './test-peanut.db';

  // Remove old test database
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('✅ Removed old test database\n');
  }

  // Initialize with file-based database
  const peanut = new PeanutCore({
    dbPath,
    userEmail: 'testuser@example.com',
    userPhone: '+14155550123',
  });

  await peanut.initialize();
  console.log(`✅ Created database: ${dbPath}\n`);

  // Generate large dataset
  console.log('📦 Generating synthetic data...');
  const fixtures = generateTestFixtures({
    contactCount: 100,
    emailCount: 1000,
    messageCount: 500,
    seedValue: 42, // Reproducible
  });

  console.log(`   - ${fixtures.contacts.length} contacts`);
  console.log(`   - ${fixtures.emails.length} emails`);
  console.log(`   - ${fixtures.messages.length} text messages`);
  console.log(`   - ${fixtures.ambiguousContacts.length} ambiguous contacts`);
  console.log('');

  // Ingest emails
  console.log('📨 Ingesting emails...');
  const normalizedEmails = fixtures.emails.map(email => ({
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

  const emailResult = await peanut.ingestMessages(normalizedEmails);
  console.log(`   ✅ Ingested ${emailResult.messagesIngested} emails`);
  console.log(`   ✅ Created ${emailResult.entitiesCreated} entities`);
  console.log(`   ✅ Merged ${emailResult.entitiesMerged} duplicates`);
  if (emailResult.errors.length > 0) {
    console.log(`   ⚠️  ${emailResult.errors.length} errors`);
  }
  console.log('');

  // Ingest messages
  console.log('💬 Ingesting text messages...');
  const normalizedMessages = fixtures.messages.map(msg => ({
    id: msg.id,
    sourceType: 'imessage' as const,
    sourceId: msg.id,
    threadId: msg.threadId,
    sender: msg.sender,
    recipients: [msg.recipient],
    subject: '',
    bodyText: msg.body,
    timestamp: msg.timestamp,
    isFromUser: msg.isFromUser,
  }));

  const msgResult = await peanut.ingestMessages(normalizedMessages);
  console.log(`   ✅ Ingested ${msgResult.messagesIngested} messages`);
  console.log('');

  // Analyze personalities
  console.log('🎭 Analyzing personalities...');
  const recipientCount = peanut.analyzeAllRecipients();
  console.log(`   ✅ Analyzed ${recipientCount} recipient styles`);
  console.log('');

  // Simulate some engagement events
  console.log('📊 Simulating engagement events...');
  
  for (let i = 0; i < 50; i++) {
    const aiLength = 150 + Math.floor(Math.random() * 200);
    const editRatio = Math.random() * 0.5; // 0-50% edits
    const userLength = Math.floor(aiLength * (1 + (Math.random() - 0.5) * editRatio));
    const sentiment = -0.5 + Math.random() * 1.5; // -0.5 to 1.0

    const draftId = `draft-${i}`;
    peanut.recordDraftSent(draftId, aiLength, undefined, Math.random() > 0.5 ? 'work' : 'personal');
    peanut.recordDraftEdited(draftId, userLength, aiLength);
    
    if (Math.random() > 0.3) {
      peanut.recordUserResponse(sentiment, Math.floor(2 + Math.random() * 8));
    }
  }

  console.log('   ✅ Created 50 engagement events');
  console.log('');

  // Get stats
  const stats = await peanut.getStats();
  console.log('='.repeat(60));
  console.log('DATABASE STATISTICS\n');
  console.log(`  Entities: ${stats.entityCount}`);
  console.log(`  Messages: ${stats.messageCount}`);
  console.log(`  Assertions: ${stats.assertionCount}`);
  console.log(`  Graph edges: ${stats.edgeCount}`);
  console.log('');

  const userStyle = peanut.analyzeUserStyle();
  console.log('User Style Profile:');
  console.log(`  - Formality: ${(userStyle.formality * 100).toFixed(0)}%`);
  console.log(`  - Verbosity: ${(userStyle.verbosity * 100).toFixed(0)}%`);
  console.log(`  - Emoji density: ${userStyle.emojiDensity.toFixed(2)}`);
  console.log(`  - Avg message length: ${userStyle.avgMessageLength} chars`);
  console.log(`  - Greeting patterns: ${userStyle.greetingPatterns.length}`);
  console.log(`  - Signoff patterns: ${userStyle.signoffPatterns.length}`);
  console.log('');

  const engagementSummary = peanut.getEngagementSummary();
  console.log('Engagement Summary:');
  console.log(`  - Total interactions: ${engagementSummary.totalInteractions}`);
  console.log(`  - Avg engagement: ${(engagementSummary.averageEngagement * 100).toFixed(0)}%`);
  console.log(`  - Learning rate: ${(engagementSummary.currentLearningRate * 100).toFixed(1)}%`);
  console.log(`  - Vent mode count: ${engagementSummary.ventModeCount}`);
  console.log('');

  // Example queries
  console.log('='.repeat(60));
  console.log('EXAMPLE QUERIES\n');

  console.log('1. Search for "meeting":');
  const searchResults = await peanut.search('meeting', { limit: 3 });
  for (let i = 0; i < Math.min(3, searchResults.length); i++) {
    const result = searchResults[i];
    if (result) {
      const preview = result.highlight ? result.highlight.substring(0, 60) + '...' : 'N/A';
      console.log(`   - Score ${result.score.toFixed(3)}: "${preview}"`);
    }
  }
  console.log('');

  console.log('2. Find entities named "Smith":');
  const smiths = await peanut.findEntities('Smith');
  for (const entity of smiths.slice(0, 3)) {
    console.log(`   - ${entity.canonicalName} (${entity.primaryEmail || 'no email'})`);
  }
  console.log('');

  console.log('3. Recent engagement events:');
  const recentEvents = peanut.getRecentEngagementEvents(5);
  for (const event of recentEvents) {
    console.log(`   - ${event.interactionType} at ${event.timestamp.toISOString()}`);
  }
  console.log('');

  // Print SQL commands
  console.log('='.repeat(60));
  console.log('MANUAL INSPECTION\n');
  console.log(`Database file: ${dbPath}`);
  console.log('');
  console.log('Inspect with SQLite:');
  console.log(`  sqlite3 ${dbPath}`);
  console.log('');
  console.log('Example SQL queries:');
  console.log('  SELECT COUNT(*) FROM entities;');
  console.log('  SELECT COUNT(*) FROM messages;');
  console.log('  SELECT * FROM user_style;');
  console.log('  SELECT * FROM recipient_styles ORDER BY message_count DESC LIMIT 10;');
  console.log('  SELECT * FROM engagement_events ORDER BY timestamp DESC LIMIT 10;');
  console.log('  SELECT * FROM personality_evolution ORDER BY timestamp DESC;');
  console.log('  SELECT * FROM graph_edges LIMIT 10;');
  console.log('');
  console.log('Search for messages:');
  console.log('  SELECT * FROM messages_fts WHERE messages_fts MATCH \'meeting\';');
  console.log('');

  await peanut.close();

  console.log('='.repeat(60));
  console.log('✅ Test database ready for inspection!');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});
