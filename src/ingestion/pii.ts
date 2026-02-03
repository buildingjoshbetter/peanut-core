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
 * Shows enough to identify the value while hiding sensitive parts
 */
export function partialMaskPii(text: string, options?: { types?: PiiType[] }): string {
  const matches = detectPii(text, { types: options?.types });

  // Process matches in reverse order to preserve indices
  let result = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]!;
    const masked = createPartialMask(match.type, match.value);

    result =
      result.slice(0, match.start) +
      masked +
      result.slice(match.end);
  }

  return result;
}

/**
 * Create a partial mask for a PII value
 * Shows first/last characters to help identify while hiding sensitive parts
 */
function createPartialMask(type: PiiType, value: string): string {
  switch (type) {
    case 'email': {
      // john.doe@company.com -> j*****e@c*****y.com
      const [local, domain] = value.split('@');
      if (!local || !domain) return '***@***.***';
      const maskedLocal = local.length > 2
        ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
        : '*'.repeat(local.length);
      const domainParts = domain.split('.');
      const maskedDomain = domainParts.map(part =>
        part.length > 2
          ? part[0] + '*'.repeat(part.length - 2) + part[part.length - 1]
          : part
      ).join('.');
      return `${maskedLocal}@${maskedDomain}`;
    }

    case 'phone': {
      // (555) 123-4567 -> (***) ***-4567
      // Show only last 4 digits
      const digits = value.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      return `(***) ***-${last4}`;
    }

    case 'ssn': {
      // 123-45-6789 -> ***-**-6789
      // Show only last 4 digits
      const digits = value.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      return `***-**-${last4}`;
    }

    case 'creditCard': {
      // 4111111111111111 -> ****-****-****-1111
      // Show only last 4 digits
      const digits = value.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      return `****-****-****-${last4}`;
    }

    case 'ipAddress': {
      // 192.168.1.100 -> 192.168.***.***
      // Show first two octets
      const parts = value.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.***.***`;
      }
      return '***.***.***.***';
    }

    case 'address': {
      // 123 Main Street Apt 4 -> 1** M*** S***** A** *
      // Show first letter of each word
      const words = value.split(/\s+/);
      return words.map(word => {
        if (/^\d+$/.test(word)) {
          // Numbers: show first digit
          return word[0] + '*'.repeat(word.length - 1);
        }
        return word.length > 1
          ? word[0] + '*'.repeat(word.length - 1)
          : '*';
      }).join(' ');
    }

    case 'passport':
    case 'driversLicense': {
      // Show first 2 and last 2 characters
      if (value.length > 4) {
        return value.slice(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
      }
      return '*'.repeat(value.length);
    }

    default:
      // Generic: show first and last character
      if (value.length > 2) {
        return value[0] + '*'.repeat(value.length - 2) + value[value.length - 1];
      }
      return '*'.repeat(value.length);
  }
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
