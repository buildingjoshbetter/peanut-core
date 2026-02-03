// PII Scrubbing Module
// Strategy Reference: Part 3, Part 0.3
//
// Detects and scrubs personally identifiable information before storage.
// Supports reversible tokens for authorized reconstruction.

import { v4 as uuid } from 'uuid';

// PII pattern definitions
const PII_PATTERNS = {
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // Phone numbers (various formats)
  phone: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,

  // SSN (US Social Security Number)
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,

  // Credit card numbers (basic patterns)
  creditCard: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9][0-9])[0-9]{12})\b/g,

  // IP addresses
  ipAddress: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,

  // Date of birth patterns (MM/DD/YYYY, YYYY-MM-DD, etc.)
  dateOfBirth: /\b(?:DOB|Date of Birth|Birthday|Born)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/gi,

  // Physical addresses (basic US format)
  address: /\b\d{1,5}\s+(?:[A-Za-z]+\s){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Circle|Cir)\.?\s*(?:#\s*\d+|Apt\.?\s*\d+|Suite\s*\d+|Unit\s*\d+)?\b/gi,

  // Passport numbers (basic patterns)
  passport: /\b[A-Z]{1,2}[0-9]{6,9}\b/g,

  // Driver's license (varies by state, basic pattern)
  driversLicense: /\b(?:DL|Driver'?s?\s*License|License\s*#?)[\s:]*[A-Z0-9]{5,15}\b/gi,

  // Bank account numbers (basic pattern)
  bankAccount: /\b(?:Account|Acct)[\s#:]*\d{8,17}\b/gi,

  // Routing numbers
  routingNumber: /\b(?:Routing|ABA|RTN)[\s#:]*\d{9}\b/gi,
};

export type PiiType = keyof typeof PII_PATTERNS;

export interface PiiMatch {
  type: PiiType;
  value: string;
  start: number;
  end: number;
}

export interface ScrubOptions {
  /** Which PII types to detect/scrub (default: all) */
  types?: PiiType[];
  /** Whether to generate reversible tokens (default: true) */
  reversible?: boolean;
  /** Custom replacement format (default: '[PII_TYPE_TOKEN]') */
  replacementFormat?: (type: PiiType, token: string) => string;
  /** Preserve email domains (e.g., keep @company.com visible) */
  preserveEmailDomains?: string[];
  /** Additional custom patterns */
  customPatterns?: Record<string, RegExp>;
}

export interface PiiScrubResult {
  /** Text with PII replaced by tokens */
  scrubbedText: string;
  /** List of detected PII with their replacements */
  detectedPii: Array<{
    type: PiiType | string;
    original: string;
    replacement: string;
    token: string;
  }>;
  /** Token map for reversing (token -> original) */
  tokenMap: Map<string, string>;
}

/**
 * Detect PII in text without modifying it
 */
export function detectPii(
  text: string,
  options?: { types?: PiiType[]; customPatterns?: Record<string, RegExp> }
): PiiMatch[] {
  const matches: PiiMatch[] = [];
  const types = options?.types || (Object.keys(PII_PATTERNS) as PiiType[]);

  for (const type of types) {
    const pattern = PII_PATTERNS[type];
    if (!pattern) continue;

    // Reset regex state
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        type,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Custom patterns
  if (options?.customPatterns) {
    for (const [name, pattern] of Object.entries(options.customPatterns)) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        matches.push({
          type: name as PiiType,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }
  }

  // Sort by position and remove overlaps
  matches.sort((a, b) => a.start - b.start);
  return removeOverlaps(matches);
}

/**
 * Remove overlapping matches, keeping the longer one
 */
function removeOverlaps(matches: PiiMatch[]): PiiMatch[] {
  const result: PiiMatch[] = [];

  for (const match of matches) {
    const lastMatch = result[result.length - 1];
    if (lastMatch && match.start < lastMatch.end) {
      // Overlap - keep the longer one
      if (match.value.length > lastMatch.value.length) {
        result.pop();
        result.push(match);
      }
    } else {
      result.push(match);
    }
  }

  return result;
}

/**
 * Scrub PII from text, replacing with tokens
 */
export function scrubPii(text: string, options?: ScrubOptions): PiiScrubResult {
  const reversible = options?.reversible !== false;
  const preserveDomains = new Set(options?.preserveEmailDomains || []);
  const replacementFormat = options?.replacementFormat ||
    ((type: PiiType, token: string) => `[${type.toUpperCase()}_${token}]`);

  const matches = detectPii(text, {
    types: options?.types,
    customPatterns: options?.customPatterns,
  });

  const detectedPii: PiiScrubResult['detectedPii'] = [];
  const tokenMap = new Map<string, string>();

  // Process matches in reverse order to preserve indices
  let scrubbedText = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]!;
    const token = reversible ? uuid().slice(0, 8) : 'REDACTED';

    // Special handling for emails with preserved domains
    if (match.type === 'email' && preserveDomains.size > 0) {
      const domain = match.value.split('@')[1];
      if (domain && preserveDomains.has(domain)) {
        continue;  // Skip this email, don't scrub it
      }
    }

    const replacement = replacementFormat(match.type, token);

    scrubbedText =
      scrubbedText.slice(0, match.start) +
      replacement +
      scrubbedText.slice(match.end);

    detectedPii.unshift({
      type: match.type,
      original: match.value,
      replacement,
      token,
    });

    if (reversible) {
      tokenMap.set(token, match.value);
    }
  }

  return {
    scrubbedText,
    detectedPii,
    tokenMap,
  };
}

/**
 * Reverse PII tokens back to original values
 */
export function reversePiiTokens(
  text: string,
  tokenMap: Map<string, string>
): string {
  let result = text;

  for (const [token, original] of tokenMap) {
    // Match any format that includes this token
    const pattern = new RegExp(`\\[[A-Z_]+_${token}\\]`, 'g');
    result = result.replace(pattern, original);
  }

  return result;
}

/**
 * Serialize token map for storage
 */
export function serializeTokenMap(tokenMap: Map<string, string>): string {
  return JSON.stringify(Array.from(tokenMap.entries()));
}

/**
 * Deserialize token map from storage
 */
export function deserializeTokenMap(serialized: string): Map<string, string> {
  const entries = JSON.parse(serialized) as [string, string][];
  return new Map(entries);
}

/**
 * Check if text contains likely PII
 */
export function containsPii(
  text: string,
  options?: { types?: PiiType[] }
): boolean {
  const matches = detectPii(text, options);
  return matches.length > 0;
}

/**
 * Get PII summary for a text
 */
export function getPiiSummary(text: string): Record<PiiType, number> {
  const matches = detectPii(text);
  const summary: Record<string, number> = {};

  for (const match of matches) {
    summary[match.type] = (summary[match.type] || 0) + 1;
  }

  return summary as Record<PiiType, number>;
}

/**
 * Mask PII with asterisks (non-reversible)
 */
export function maskPii(text: string, options?: { types?: PiiType[] }): string {
  const result = scrubPii(text, {
    ...options,
    reversible: false,
    replacementFormat: (type) => {
      switch (type) {
        case 'email':
          return '***@***.***';
        case 'phone':
          return '***-***-****';
        case 'ssn':
          return '***-**-****';
        case 'creditCard':
          return '****-****-****-****';
        default:
          return '[REDACTED]';
      }
    },
  });

  return result.scrubbedText;
}

/**
 * Partially mask PII (show first/last few characters)
 */
export function partialMaskPii(text: string, options?: { types?: PiiType[] }): string {
  const result = scrubPii(text, {
    ...options,
    reversible: false,
    replacementFormat: (type, _token) => {
      // This is a placeholder - in real implementation,
      // we'd need access to the original value
      switch (type) {
        case 'email':
          return 'u***@***.com';
        case 'phone':
          return '(***) ***-**XX';
        case 'creditCard':
          return '****-****-****-XXXX';
        default:
          return '[PARTIALLY_REDACTED]';
      }
    },
  });

  return result.scrubbedText;
}

// Validation helpers
export function isValidEmail(email: string): boolean {
  return PII_PATTERNS.email.test(email);
}

export function isValidPhone(phone: string): boolean {
  return PII_PATTERNS.phone.test(phone);
}

export function isValidSSN(ssn: string): boolean {
  return PII_PATTERNS.ssn.test(ssn);
}
