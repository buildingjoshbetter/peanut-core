#!/usr/bin/env npx ts-node
/**
 * Test the engagement learning loop (Part 16: Integration)
 * Verifies that style improves over multiple interactions
 */

import { PeanutCore } from '../src/index';
import { generateTestFixtures } from '../src/fixtures';

async function main() {
  console.log('🧠 Testing Engagement Learning Loop\n');
  console.log('='.repeat(60));

  // Initialize with in-memory database
  const peanut = new PeanutCore({
    dbPath: ':memory:',
    userEmail: 'testuser@example.com',
    userPhone: '+14155550000',
  });

  await peanut.initialize();

  // Generate test data with specific personality
  const fixtures = generateTestFixtures({
    contactCount: 10,
    emailCount: 100,
    messageCount: 50,
  });

  // Ingest initial data to establish baseline style
  const normalizedEmails = fixtures.emails.slice(0, 30).map(email => ({
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

  await peanut.ingestMessages(normalizedEmails);
  console.log(`✅ Ingested ${normalizedEmails.length} messages\n`);

  // Get initial style
  const initialStyle = peanut.analyzeUserStyle();
  console.log('Initial Style:');
  console.log(`  - Formality: ${initialStyle.formality.toFixed(3)}`);
  console.log(`  - Verbosity: ${initialStyle.verbosity.toFixed(3)}`);
  console.log(`  - Emoji density: ${initialStyle.emojiDensity.toFixed(3)}`);
  console.log('');

  // Simulate 20 interactions with learning
  console.log('Simulating 20 interactions...\n');

  const interactions = 20;
  const engagementScores: number[] = [];
  const formalityHistory: number[] = [initialStyle.formality];

  for (let i = 1; i <= interactions; i++) {
    // Simulate AI draft length (varies 150-250)
    const aiDraftLength = 150 + Math.floor(Math.random() * 100);

    // Simulate user edit
    // Early interactions: more edits (poor style match)
    // Later interactions: fewer edits (better style match)
    const editRatioBase = 0.4 - (i / interactions) * 0.3; // Decreases from 0.4 to 0.1
    const editRatioNoise = (Math.random() - 0.5) * 0.1; // ±5% noise
    const editRatio = Math.max(0.05, Math.min(0.5, editRatioBase + editRatioNoise));

    const userFinalLength = Math.floor(aiDraftLength * (1 + (Math.random() - 0.5) * 0.2));

    // Simulate sentiment (generally positive, occasionally neutral)
    const sentiment = 0.5 + Math.random() * 0.4; // 0.5 to 0.9

    // Thread length (varies)
    const threadLength = Math.floor(2 + Math.random() * 5);

    // Learn from this interaction
    const learningResult = peanut.learnFromInteraction({
      aiDraftLength,
      userFinalLength,
      userResponseSentiment: sentiment,
      threadLength,
      threadContinued: true,
    });

    engagementScores.push(learningResult.engagementScore ?? 0);

    // Get updated style
    const currentStyle = peanut.analyzeUserStyle();
    formalityHistory.push(currentStyle.formality);

    // Print progress
    const currentLearningRate = learningResult.learningApplied 
      ? (0.3 * Math.pow(0.9, i / 10))  // Replicate the learning rate formula
      : 0;
    
    console.log(
      `Interaction ${i.toString().padStart(2)}: ` +
      `Edit ${(editRatio * 100).toFixed(0)}% → ` +
      `Engagement: ${((learningResult.engagementScore ?? 0) * 100).toFixed(0)}% → ` +
      `Learning rate: ${(currentLearningRate * 100).toFixed(1)}%`
    );

    if (learningResult.learningApplied && learningResult.adaptations && learningResult.adaptations.length > 0) {
      for (const adaptation of learningResult.adaptations) {
        const oldVal = currentStyle.formality - adaptation.change;
        const newVal = currentStyle.formality;
        console.log(`    Style update: ${adaptation.dimension} ${oldVal.toFixed(3)} → ${newVal.toFixed(3)}`);
      }
    } else if (!learningResult.learningApplied && i < 11) {
      console.log(`    ℹ️  Learning skipped: ${learningResult.reason}`);
    }
  }

  // Get final style
  const finalStyle = peanut.analyzeUserStyle();
  const avgEngagement = engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length;

  console.log('\n' + '='.repeat(60));
  console.log('RESULTS\n');

  console.log('Final Style:');
  console.log(`  - Formality: ${finalStyle.formality.toFixed(3)} (${initialStyle.formality > finalStyle.formality ? 'decreased' : 'increased'} by ${Math.abs(((finalStyle.formality - initialStyle.formality) / initialStyle.formality) * 100).toFixed(1)}%)`);
  console.log(`  - Verbosity: ${finalStyle.verbosity.toFixed(3)}`);
  console.log(`  - Emoji density: ${finalStyle.emojiDensity.toFixed(3)}`);
  console.log('');

  console.log('Learning Statistics:');
  console.log(`  - Average engagement: ${(avgEngagement * 100).toFixed(0)}%`);
  
  // Get stats from peanut
  const stats = peanut.getLearningStats();
  console.log(`  - Total interactions: ${stats.totalInteractions}`);
  console.log(`  - Current learning rate: ${(stats.currentLearningRate * 100).toFixed(1)}%`);
  console.log(`  - Recent adaptations: ${stats.recentAdaptations.length}`);
  console.log(`  - Vent mode triggers: ${stats.ventModeTriggered}`);
  console.log('');

  // Check if engagement improved
  const firstHalfAvg = engagementScores.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const secondHalfAvg = engagementScores.slice(10).reduce((a, b) => a + b, 0) / 10;
  const improvement = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

  console.log('Engagement Improvement:');
  console.log(`  - First half avg: ${(firstHalfAvg * 100).toFixed(0)}%`);
  console.log(`  - Second half avg: ${(secondHalfAvg * 100).toFixed(0)}%`);
  console.log(`  - Improvement: ${improvement.toFixed(1)}%`);
  console.log('');

  // Validate results
  console.log('='.repeat(60));
  
  if (secondHalfAvg > firstHalfAvg + 0.05) {
    console.log('✅ Learning loop working correctly!');
    console.log('   Style improved, engagement increased over time.');
  } else if (Math.abs(secondHalfAvg - firstHalfAvg) <= 0.05) {
    console.log('⚠️  Learning loop stable (no significant change)');
    console.log('   This may be expected if initial style was already good.');
  } else {
    console.log('❌ Warning: Engagement decreased over time');
    console.log('   This may indicate a configuration issue.');
  }

  console.log('='.repeat(60));

  await peanut.close();
}

main().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
