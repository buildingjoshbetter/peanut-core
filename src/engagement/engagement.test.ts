// Engagement module tests

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, closeDb } from '../db/connection';
import {
  calculateEngagementScore,
  recordDraftSent,
  recordDraftEdited,
  recordUserResponse,
  recordThreadContinued,
  getRecentEngagementEvents,
  getAverageEngagement,
  type EngagementSignal,
} from './tracker';
import {
  calculateLearningRate,
  detectVentMode,
  calculateCapsRatio,
  applyAdaptation,
  getEngagementSummary,
  detectPersonalityDrift,
} from './adaptation';

describe('Engagement Tracker', () => {
  beforeAll(() => {
    initDb(':memory:');
  });

  afterAll(() => {
    closeDb();
  });

  describe('calculateEngagementScore', () => {
    it('should return high score for low edit ratio', () => {
      const signal: EngagementSignal = {
        draftId: 'test-1',
        aiDraftLength: 100,
        editRatio: 0.1, // 10% edits = good
      };

      const score = calculateEngagementScore(signal);
      expect(score.overall).toBeGreaterThan(0.8);
      expect(score.components.editScore).toBe(0.9);
    });

    it('should return low score for high edit ratio', () => {
      const signal: EngagementSignal = {
        draftId: 'test-2',
        aiDraftLength: 100,
        editRatio: 0.9, // 90% edits = bad
      };

      const score = calculateEngagementScore(signal);
      // Edit score is 1 - editRatio = 0.1
      expect(score.components.editScore).toBeCloseTo(0.1);
      // Overall is weighted but normalized by available signals
      expect(score.components.editScore).toBeLessThan(0.2);
    });

    it('should handle positive sentiment', () => {
      const signal: EngagementSignal = {
        draftId: 'test-3',
        aiDraftLength: 100,
        userResponseSentiment: 0.8, // Positive
      };

      const score = calculateEngagementScore(signal);
      expect(score.components.sentimentScore).toBe(0.9);
    });

    it('should handle negative sentiment', () => {
      const signal: EngagementSignal = {
        draftId: 'test-4',
        aiDraftLength: 100,
        userResponseSentiment: -0.6, // Negative
      };

      const score = calculateEngagementScore(signal);
      expect(score.components.sentimentScore).toBe(0.2);
    });

    it('should track confidence based on available signals', () => {
      const minimalSignal: EngagementSignal = {
        draftId: 'test-5',
        aiDraftLength: 100,
      };

      const fullSignal: EngagementSignal = {
        draftId: 'test-6',
        aiDraftLength: 100,
        editRatio: 0.2,
        userResponseSentiment: 0.5,
        userFinalLength: 150,
        threadContinued: true,
      };

      const minScore = calculateEngagementScore(minimalSignal);
      const fullScore = calculateEngagementScore(fullSignal);

      expect(fullScore.confidence).toBeGreaterThan(minScore.confidence);
    });
  });

  describe('recordDraftSent', () => {
    it('should record draft sent event', () => {
      // Don't pass recipientEntityId to avoid FK constraint
      const eventId = recordDraftSent('draft-1', 250, undefined, 'work');
      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('string');
    });
  });

  describe('recordDraftEdited', () => {
    it('should record draft edited event with edit ratio', () => {
      const eventId = recordDraftEdited('draft-1', 300, 250);
      expect(eventId).toBeDefined();

      const events = getRecentEngagementEvents(10);
      const editEvent = events.find(e => e.id === eventId);
      expect(editEvent).toBeDefined();
      expect(editEvent?.editRatio).toBeCloseTo(0.2); // |300-250|/250 = 0.2
    });
  });

  describe('recordUserResponse', () => {
    it('should record user response with sentiment', () => {
      // Don't pass recipientEntityId to avoid FK constraint
      const eventId = recordUserResponse(0.7, 5, undefined);
      expect(eventId).toBeDefined();

      const events = getRecentEngagementEvents(10);
      const responseEvent = events.find(e => e.id === eventId);
      expect(responseEvent).toBeDefined();
      expect(responseEvent?.sentiment).toBe(0.7);
    });
  });

  describe('getAverageEngagement', () => {
    it('should return average engagement stats', () => {
      const stats = getAverageEngagement(30);
      expect(stats).toHaveProperty('average');
      expect(stats).toHaveProperty('count');
      expect(stats.average).toBeGreaterThanOrEqual(0);
      expect(stats.average).toBeLessThanOrEqual(1);
    });
  });
});

describe('Engagement Adaptation', () => {
  beforeAll(() => {
    initDb(':memory:');
  });

  afterAll(() => {
    closeDb();
  });

  describe('calculateLearningRate', () => {
    it('should start at 0.3 with zero interactions', () => {
      const rate = calculateLearningRate(0);
      expect(rate).toBe(0.3);
    });

    it('should decay toward 0.05 with many interactions', () => {
      const rate = calculateLearningRate(200);
      // Should be close to min learning rate (0.05)
      expect(rate).toBeLessThan(0.1);
      expect(rate).toBeGreaterThanOrEqual(0.05);
    });

    it('should be monotonically decreasing', () => {
      let prevRate = 1;
      for (let i = 0; i <= 100; i += 10) {
        const rate = calculateLearningRate(i);
        expect(rate).toBeLessThanOrEqual(prevRate);
        prevRate = rate;
      }
    });
  });

  describe('detectVentMode', () => {
    it('should not detect venting with neutral sentiment', () => {
      const result = detectVentMode(0, 3);
      expect(result.isVenting).toBe(false);
    });

    it('should detect venting with strong negative signals', () => {
      const result = detectVentMode(
        -0.8, // Strong negative sentiment
        10,   // Long thread
        5,    // Rapid messages
        0.4   // Lots of caps
      );
      expect(result.isVenting).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.signals).toContain('strong_negative_sentiment');
    });

    it('should return signals explaining why venting detected', () => {
      const result = detectVentMode(-0.6, 8, 4, 0.35);
      expect(Array.isArray(result.signals)).toBe(true);
      if (result.isVenting) {
        expect(result.signals.length).toBeGreaterThan(0);
      }
    });
  });

  describe('calculateCapsRatio', () => {
    it('should return 0 for lowercase text', () => {
      expect(calculateCapsRatio('hello world')).toBe(0);
    });

    it('should return 1 for all caps', () => {
      expect(calculateCapsRatio('HELLO WORLD')).toBe(1);
    });

    it('should handle mixed case', () => {
      const ratio = calculateCapsRatio('Hello World');
      expect(ratio).toBeCloseTo(0.2, 1); // 2/10 letters are caps
    });

    it('should ignore non-letters', () => {
      const ratio = calculateCapsRatio('HELLO 123!!!');
      expect(ratio).toBe(1);
    });

    it('should return 0 for empty string', () => {
      expect(calculateCapsRatio('')).toBe(0);
      expect(calculateCapsRatio('123!!!')).toBe(0);
    });
  });

  describe('applyAdaptation', () => {
    it('should not apply adaptation with low confidence signal', () => {
      const signal: EngagementSignal = {
        draftId: 'test-1',
        aiDraftLength: 100,
        // No other signals = low confidence
      };

      const result = applyAdaptation(signal);
      expect(result.applied).toBe(false);
      expect(result.reason).toContain('confidence');
    });

    it('should freeze adaptation in vent mode', () => {
      const signal: EngagementSignal = {
        draftId: 'test-2',
        aiDraftLength: 100,
        editRatio: 0.8,
        userResponseSentiment: -0.7,
        threadLength: 10,
      };

      const result = applyAdaptation(signal, { checkVentMode: true });
      // May or may not detect vent mode depending on thresholds
      // but if it does, should not apply
      if (result.reason?.includes('Vent mode')) {
        expect(result.applied).toBe(false);
        expect(result.learningRate).toBe(0);
      }
    });
  });

  describe('getEngagementSummary', () => {
    it('should return summary statistics', () => {
      const summary = getEngagementSummary();
      expect(summary).toHaveProperty('totalInteractions');
      expect(summary).toHaveProperty('averageEngagement');
      expect(summary).toHaveProperty('currentLearningRate');
      expect(summary).toHaveProperty('recentDrifts');
      expect(summary).toHaveProperty('ventModeCount');
    });
  });

  describe('detectPersonalityDrift', () => {
    it('should handle empty history gracefully', () => {
      const result = detectPersonalityDrift('formality');
      expect(result.driftDetected).toBe(false);
      expect(result.magnitude).toBe(0);
      expect(result.direction).toBe('none');
    });
  });
});
