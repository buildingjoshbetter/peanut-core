// Belief Revision System
// Strategy Reference: Part 12, lines 1015-1020
//
// Handles contradiction detection, confidence updates, and time-travel queries.

export {
  detectContradictions,
  getPendingContradictions,
  getHighSeverityContradictions,
  areContradictory,
} from './detector';

export {
  autoResolve,
  userResolve,
  getRevisionHistory,
  applyConfidenceDecay,
  getAssertionsAtTime,
} from './resolver';
