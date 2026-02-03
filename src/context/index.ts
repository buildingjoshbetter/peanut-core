// Context Compartmentalization System
// Strategy Reference: Part 8, lines 619-669
//
// Manages hard boundaries between work/personal contexts,
// visibility policies, and persona switching.

export {
  getAllContexts,
  getContext,
  createContext,
  addEntityToContext,
  getEntityContexts,
  getActiveContext,
  setActiveContext,
  canSeeContext,
  getContextFormalityFloor,
  isProfessionalismRequired,
} from './boundaries';

export {
  detectContext,
  autoDetectContext,
  getCurrentSignals,
} from './detection';

export {
  filterByContext,
  setAssertionVisibility,
  getStyleAdjustmentsForContext,
  enforceContextStyle,
  shouldBlockCrossContextLeak,
} from './visibility';
