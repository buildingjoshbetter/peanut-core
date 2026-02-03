// Commitment Tracking System
// Strategy Reference: Part 11, lines 831-855
//
// Tracks promises, asks, decisions, and deadlines.

export {
  createCommitment,
  getOpenCommitments,
  getUpcomingDeadlines,
  getOverdueCommitments,
  getCommitmentsForEntity,
  getCommitmentsMadeTo,
  getCommitmentsMadeBy,
  updateCommitmentStatus,
  completeCommitment,
  breakCommitment,
  cancelCommitment,
  markReminderSent,
  getCommitmentsNeedingReminders,
  searchCommitments,
} from './tracker';

export {
  extractCommitments,
  COMMITMENT_EXTRACTION_PROMPT,
  type ExtractedCommitment,
} from './extractor';
