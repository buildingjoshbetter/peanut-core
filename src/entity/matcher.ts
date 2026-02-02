// Fuzzy matching utilities for entity resolution

/**
 * Jaro-Winkler similarity score between two strings
 * Returns a score between 0 (no similarity) and 1 (exact match)
 */
export function jaroWinkler(s1: string, s2: string): number {
  // Handle edge cases
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const s1Lower = s1.toLowerCase();
  const s2Lower = s2.toLowerCase();

  // Calculate Jaro similarity
  const jaroSim = jaro(s1Lower, s2Lower);

  // Winkler modification: boost for common prefix
  const prefixLength = commonPrefixLength(s1Lower, s2Lower, 4);
  const winklerSim = jaroSim + (prefixLength * 0.1 * (1 - jaroSim));

  return Math.min(winklerSim, 1.0);
}

/**
 * Jaro similarity between two strings
 */
function jaro(s1: string, s2: string): number {
  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;

  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Length of common prefix (up to max)
 */
function commonPrefixLength(s1: string, s2: string, max: number): number {
  let i = 0;
  while (i < max && i < s1.length && i < s2.length && s1[i] === s2[i]) {
    i++;
  }
  return i;
}

/**
 * Normalize a name for comparison
 * - Lowercase
 * - Remove titles (Dr., Mr., Mrs., etc.)
 * - Remove suffixes (Jr., Sr., III, etc.)
 * - Remove extra whitespace
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(dr|mr|mrs|ms|prof|sir|dame|rev)\.?\s*/gi, '')
    .replace(/\b(jr|sr|iii|ii|iv|esq|phd|md)\.?\s*$/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if one name could be a nickname/variant of another
 */
const NICKNAME_MAP: Record<string, string[]> = {
  'william': ['will', 'bill', 'billy', 'willy', 'liam'],
  'robert': ['rob', 'bob', 'bobby', 'robbie'],
  'richard': ['rick', 'dick', 'richie', 'ricky'],
  'james': ['jim', 'jimmy', 'jamie'],
  'john': ['jack', 'johnny', 'jon'],
  'michael': ['mike', 'mikey', 'mick'],
  'christopher': ['chris', 'kit', 'topher'],
  'jennifer': ['jen', 'jenny', 'jenn'],
  'elizabeth': ['liz', 'lizzy', 'beth', 'betty', 'eliza'],
  'katherine': ['kate', 'kathy', 'katie', 'kat', 'kitty'],
  'margaret': ['maggie', 'meg', 'peggy', 'marge'],
  'daniel': ['dan', 'danny'],
  'joseph': ['joe', 'joey'],
  'david': ['dave', 'davy'],
  'anthony': ['tony', 'ant'],
  'alexander': ['alex', 'sandy', 'xander'],
  'samuel': ['sam', 'sammy'],
  'benjamin': ['ben', 'benny', 'benji'],
  'jacob': ['jake', 'jakey'],
  'matthew': ['matt', 'matty'],
  'thomas': ['tom', 'tommy'],
  'edward': ['ed', 'eddie', 'ted', 'teddy'],
  'andrew': ['andy', 'drew'],
  'nicholas': ['nick', 'nicky'],
  'joshua': ['josh'],
  'jonathan': ['jon', 'jonny'],
  'timothy': ['tim', 'timmy'],
  'stephen': ['steve', 'stevie'],
  'steven': ['steve', 'stevie'],
  'peter': ['pete', 'petey'],
  'patrick': ['pat', 'paddy'],
  'raymond': ['ray'],
  'gregory': ['greg', 'gregg'],
  'george': ['georgie'],
  'charles': ['charlie', 'chuck', 'chas'],
  'henry': ['hank', 'harry'],
  'frank': ['frankie', 'franky'],
  'walter': ['walt', 'wally'],
  'albert': ['al', 'bert', 'bertie'],
  'arthur': ['art', 'artie'],
  'ralph': ['ralphy'],
  'lawrence': ['larry'],
  'gerald': ['gerry', 'jerry'],
  'eugene': ['gene'],
  'harold': ['hal', 'harry'],
  'leonard': ['leo', 'lenny'],
  'victoria': ['vicky', 'tori'],
  'stephanie': ['steph', 'stevie'],
  'samantha': ['sam', 'sammy'],
  'abigail': ['abby', 'gail'],
  'alexandra': ['alex', 'lexi', 'sandy'],
  'allison': ['ally', 'allie'],
  'amanda': ['mandy'],
  'barbara': ['barb', 'barbie', 'babs'],
  'beatrice': ['bea', 'trixie'],
  'caroline': ['carol', 'carrie'],
  'catherine': ['cathy', 'kate', 'katie', 'cat'],
  'christina': ['chris', 'chrissy', 'tina'],
  'deborah': ['deb', 'debbie'],
  'dorothy': ['dot', 'dotty'],
  'eleanor': ['ellie', 'ella', 'nora'],
  'emily': ['em', 'emmy'],
  'frances': ['fran', 'frannie'],
  'gabrielle': ['gabby', 'gabi'],
  'jacqueline': ['jackie'],
  'jessica': ['jess', 'jessie'],
  'joanna': ['jo', 'joanie'],
  'josephine': ['jo', 'josie'],
  'judith': ['judy', 'judi'],
  'lillian': ['lily', 'lil'],
  'madeleine': ['maddie', 'maddy'],
  'melissa': ['mel', 'missy', 'lissa'],
  'natalie': ['nat', 'nattie'],
  'patricia': ['pat', 'patty', 'trish', 'tricia'],
  'priscilla': ['prissy', 'cilla'],
  'rebecca': ['becky', 'becca'],
  'suzanne': ['sue', 'suzy', 'susie'],
  'theodore': ['ted', 'teddy', 'theo'],
  'veronica': ['ronnie', 'vera'],
  'virginia': ['ginny', 'ginger'],
};

/**
 * Check if two first names could be variants of each other
 */
export function isNameVariant(name1: string, name2: string): boolean {
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();

  if (n1 === n2) return true;

  // Check both directions in nickname map
  for (const [full, nicks] of Object.entries(NICKNAME_MAP)) {
    if (
      (n1 === full && nicks.includes(n2)) ||
      (n2 === full && nicks.includes(n1)) ||
      (nicks.includes(n1) && nicks.includes(n2))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate overall name similarity considering:
 * - Jaro-Winkler base score
 * - Nickname matching bonus
 * - First/last name matching
 */
export function nameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  // Direct Jaro-Winkler
  let score = jaroWinkler(n1, n2);

  // Split into parts for more analysis
  const parts1 = n1.split(' ').filter(Boolean);
  const parts2 = n2.split(' ').filter(Boolean);

  if (parts1.length >= 1 && parts2.length >= 1) {
    // Check first names
    const firstName1 = parts1[0]!;
    const firstName2 = parts2[0]!;

    if (isNameVariant(firstName1, firstName2)) {
      score = Math.max(score, 0.7);

      // If last names also match, even better
      if (parts1.length >= 2 && parts2.length >= 2) {
        const lastName1 = parts1[parts1.length - 1]!;
        const lastName2 = parts2[parts2.length - 1]!;

        if (jaroWinkler(lastName1, lastName2) > 0.9) {
          score = Math.max(score, 0.95);
        }
      }
    }

    // "Jake Miller" vs "J. Miller" - initial match
    if (
      (firstName1.length === 1 && firstName2.startsWith(firstName1)) ||
      (firstName2.length === 1 && firstName1.startsWith(firstName2))
    ) {
      if (parts1.length >= 2 && parts2.length >= 2) {
        const lastName1 = parts1[parts1.length - 1]!;
        const lastName2 = parts2[parts2.length - 1]!;

        if (jaroWinkler(lastName1, lastName2) > 0.9) {
          score = Math.max(score, 0.8);
        }
      }
    }
  }

  return score;
}
