// Synthetic contact generator for testing

export interface SyntheticContact {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  emails: string[];
  phones: string[];
  company?: string;
  title?: string;
  relationship: 'family' | 'friend' | 'colleague' | 'boss' | 'client' | 'acquaintance';
  formality: number; // 0-1, how formal communication is with this person
}

// Common first names with their nicknames
const FIRST_NAMES: Array<{ name: string; nicknames: string[]; gender: 'M' | 'F' }> = [
  { name: 'William', nicknames: ['Will', 'Bill', 'Billy', 'Liam'], gender: 'M' },
  { name: 'James', nicknames: ['Jim', 'Jimmy', 'Jamie'], gender: 'M' },
  { name: 'Robert', nicknames: ['Rob', 'Bob', 'Bobby', 'Robbie'], gender: 'M' },
  { name: 'Michael', nicknames: ['Mike', 'Mikey', 'Mick'], gender: 'M' },
  { name: 'David', nicknames: ['Dave', 'Davey'], gender: 'M' },
  { name: 'Richard', nicknames: ['Rich', 'Rick', 'Ricky', 'Dick'], gender: 'M' },
  { name: 'Joseph', nicknames: ['Joe', 'Joey'], gender: 'M' },
  { name: 'Thomas', nicknames: ['Tom', 'Tommy'], gender: 'M' },
  { name: 'Christopher', nicknames: ['Chris', 'Topher'], gender: 'M' },
  { name: 'Daniel', nicknames: ['Dan', 'Danny'], gender: 'M' },
  { name: 'Matthew', nicknames: ['Matt', 'Matty'], gender: 'M' },
  { name: 'Anthony', nicknames: ['Tony', 'Ant'], gender: 'M' },
  { name: 'Andrew', nicknames: ['Andy', 'Drew'], gender: 'M' },
  { name: 'Joshua', nicknames: ['Josh'], gender: 'M' },
  { name: 'Jacob', nicknames: ['Jake', 'Jay'], gender: 'M' },
  { name: 'Nicholas', nicknames: ['Nick', 'Nicky'], gender: 'M' },
  { name: 'Alexander', nicknames: ['Alex', 'Xander', 'Lex'], gender: 'M' },
  { name: 'Benjamin', nicknames: ['Ben', 'Benny', 'Benji'], gender: 'M' },
  { name: 'Samuel', nicknames: ['Sam', 'Sammy'], gender: 'M' },
  { name: 'Jonathan', nicknames: ['Jon', 'Johnny', 'Nathan'], gender: 'M' },
  { name: 'Elizabeth', nicknames: ['Liz', 'Lizzy', 'Beth', 'Betty', 'Eliza'], gender: 'F' },
  { name: 'Jennifer', nicknames: ['Jen', 'Jenny'], gender: 'F' },
  { name: 'Margaret', nicknames: ['Maggie', 'Meg', 'Peggy', 'Marge'], gender: 'F' },
  { name: 'Katherine', nicknames: ['Kate', 'Katie', 'Kathy', 'Kat'], gender: 'F' },
  { name: 'Patricia', nicknames: ['Pat', 'Patty', 'Trish'], gender: 'F' },
  { name: 'Jessica', nicknames: ['Jess', 'Jessie'], gender: 'F' },
  { name: 'Sarah', nicknames: ['Sally'], gender: 'F' },
  { name: 'Rebecca', nicknames: ['Becca', 'Becky'], gender: 'F' },
  { name: 'Samantha', nicknames: ['Sam', 'Sammy'], gender: 'F' },
  { name: 'Alexandra', nicknames: ['Alex', 'Lexi', 'Sandra'], gender: 'F' },
  { name: 'Victoria', nicknames: ['Vicky', 'Tori'], gender: 'F' },
  { name: 'Christina', nicknames: ['Chris', 'Tina', 'Christie'], gender: 'F' },
  { name: 'Stephanie', nicknames: ['Steph', 'Stevie'], gender: 'F' },
  { name: 'Michelle', nicknames: ['Shelly', 'Mitch'], gender: 'F' },
  { name: 'Amanda', nicknames: ['Mandy', 'Amy'], gender: 'F' },
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson',
  'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson',
  'Walker', 'Hall', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Green', 'Baker',
  'Adams', 'Nelson', 'Hill', 'Campbell', 'Mitchell', 'Roberts', 'Carter', 'Phillips',
  'Evans', 'Turner', 'Torres', 'Parker', 'Collins', 'Edwards', 'Stewart', 'Morris',
  'Murphy', 'Rivera', 'Cook', 'Rogers', 'Morgan', 'Peterson', 'Cooper', 'Reed',
  'Bailey', 'Bell', 'Gomez', 'Kelly', 'Howard', 'Ward', 'Cox', 'Diaz', 'Richardson',
  'Wood', 'Watson', 'Brooks', 'Bennett', 'Gray', 'James', 'Reyes', 'Cruz', 'Hughes',
];

const COMPANIES = [
  'Acme Corp', 'TechFlow', 'InnovateTech', 'GlobalSoft', 'DataDrive', 'CloudNine',
  'FutureWorks', 'NexGen Solutions', 'Pinnacle Systems', 'Vertex Labs', 'Horizon Inc',
  'Stellar Analytics', 'Quantum Dynamics', 'Apex Consulting', 'Summit Partners',
  'BlueWave Technologies', 'RedRock Ventures', 'GreenField Capital', 'SilverLine',
  'GoldStar Industries', 'PrimePath', 'CoreLogic', 'MetaStream', 'SynergyOne',
];

const TITLES = [
  'Software Engineer', 'Senior Developer', 'Product Manager', 'Designer',
  'Marketing Manager', 'Sales Director', 'CEO', 'CTO', 'VP Engineering',
  'Data Scientist', 'DevOps Engineer', 'QA Lead', 'Architect', 'Consultant',
  'Account Executive', 'Project Manager', 'HR Manager', 'CFO', 'COO',
  'Business Analyst', 'Team Lead', 'Director', 'Manager', 'Associate',
];

const EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'hotmail.com',
  'protonmail.com', 'fastmail.com', 'aol.com', 'mail.com', 'zoho.com',
];

// Seeded random for reproducibility
let seed = 12345;
function seededRandom(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function pick<T>(arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('Cannot pick from empty array');
  return arr[Math.floor(seededRandom() * arr.length)]!;
}

function pickWeighted<T>(arr: readonly T[], weights: readonly number[]): T {
  if (arr.length === 0) throw new Error('Cannot pick from empty array');
  const total = weights.reduce((a, b) => a + b, 0);
  let r = seededRandom() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return arr[i]!;
  }
  return arr[arr.length - 1]!;
}

function generateEmail(firstName: string, lastName: string, isWork: boolean, company?: string): string {
  const firstInitial = firstName[0] ?? 'x';
  const patterns = [
    () => `${firstName.toLowerCase()}@${pick(EMAIL_DOMAINS)}`,
    () => `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${pick(EMAIL_DOMAINS)}`,
    () => `${firstName.toLowerCase()}${lastName.toLowerCase()}@${pick(EMAIL_DOMAINS)}`,
    () => `${firstInitial.toLowerCase()}${lastName.toLowerCase()}@${pick(EMAIL_DOMAINS)}`,
    () => `${firstName.toLowerCase()}${Math.floor(seededRandom() * 100)}@${pick(EMAIL_DOMAINS)}`,
  ];

  if (isWork && company) {
    const domain = company.toLowerCase().replace(/\s+/g, '') + '.com';
    const workPatterns = [
      () => `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
      () => `${firstInitial.toLowerCase()}${lastName.toLowerCase()}@${domain}`,
      () => `${firstName.toLowerCase()}@${domain}`,
    ];
    return pick(workPatterns)();
  }

  return pick(patterns)();
}

function generatePhone(): string {
  const areaCode = 200 + Math.floor(seededRandom() * 800);
  const exchange = 200 + Math.floor(seededRandom() * 800);
  const subscriber = 1000 + Math.floor(seededRandom() * 9000);
  return `+1${areaCode}${exchange}${subscriber}`;
}

export function generateContacts(count: number, seedValue?: number): SyntheticContact[] {
  if (seedValue !== undefined) {
    seed = seedValue;
  }

  const contacts: SyntheticContact[] = [];
  const usedEmails = new Set<string>();

  // Relationship distribution
  const relationships: Array<SyntheticContact['relationship']> = [
    'family', 'friend', 'colleague', 'boss', 'client', 'acquaintance'
  ];
  const relationshipWeights = [10, 20, 35, 5, 15, 15];

  for (let i = 0; i < count; i++) {
    const firstNameData = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const relationship = pickWeighted(relationships, relationshipWeights);

    // Sometimes use nickname instead of full name
    const useNickname = seededRandom() > 0.6 && firstNameData.nicknames.length > 0;
    const nickname = useNickname ? pick(firstNameData.nicknames) : undefined;

    // Work-related contacts get company info
    const isWorkRelated = ['colleague', 'boss', 'client'].includes(relationship);
    const company = isWorkRelated ? pick(COMPANIES) : undefined;
    const title = isWorkRelated && seededRandom() > 0.3 ? pick(TITLES) : undefined;

    // Generate emails (1-3)
    const emailCount = 1 + Math.floor(seededRandom() * 2);
    const emails: string[] = [];
    for (let e = 0; e < emailCount; e++) {
      const email = generateEmail(firstNameData.name, lastName, e === 0 && isWorkRelated, company);
      if (!usedEmails.has(email)) {
        usedEmails.add(email);
        emails.push(email);
      }
    }

    // Generate phones (0-2)
    const phoneCount = Math.floor(seededRandom() * 2);
    const phones: string[] = [];
    for (let p = 0; p < phoneCount; p++) {
      phones.push(generatePhone());
    }

    // Formality based on relationship
    const formalityBase: Record<SyntheticContact['relationship'], number> = {
      family: 0.1,
      friend: 0.2,
      colleague: 0.5,
      boss: 0.7,
      client: 0.8,
      acquaintance: 0.6,
    };
    const formality = Math.max(0, Math.min(1, formalityBase[relationship] + (seededRandom() - 0.5) * 0.3));

    contacts.push({
      id: `contact-${i.toString().padStart(4, '0')}`,
      firstName: firstNameData.name,
      lastName,
      nickname,
      emails,
      phones,
      company,
      title,
      relationship,
      formality,
    });
  }

  return contacts;
}

// Create some intentionally ambiguous contacts for testing entity resolution
export function generateAmbiguousContacts(): SyntheticContact[] {
  return [
    // Two different "Jake"s
    {
      id: 'ambig-jake-1',
      firstName: 'Jacob',
      lastName: 'Miller',
      nickname: 'Jake',
      emails: ['jake.miller@techflow.com'],
      phones: ['+14155551234'],
      company: 'TechFlow',
      title: 'Software Engineer',
      relationship: 'colleague',
      formality: 0.5,
    },
    {
      id: 'ambig-jake-2',
      firstName: 'Jacob',
      lastName: 'Thompson',
      nickname: 'Jake',
      emails: ['jakethompson@gmail.com'],
      phones: ['+14155555678'],
      relationship: 'friend',
      formality: 0.2,
    },
    // Same person, different contexts
    {
      id: 'ambig-sarah-work',
      firstName: 'Sarah',
      lastName: 'Chen',
      emails: ['sarah.chen@acmecorp.com'],
      phones: [],
      company: 'Acme Corp',
      title: 'Product Manager',
      relationship: 'colleague',
      formality: 0.6,
    },
    {
      id: 'ambig-sarah-personal',
      firstName: 'Sarah',
      lastName: 'Chen',
      nickname: 'Sally',
      emails: ['sallychen@gmail.com'],
      phones: ['+14085551111'],
      relationship: 'friend',
      formality: 0.2,
    },
    // Similar names
    {
      id: 'ambig-mike-1',
      firstName: 'Michael',
      lastName: 'Johnson',
      nickname: 'Mike',
      emails: ['mjohnson@nexgen.com'],
      phones: [],
      company: 'NexGen Solutions',
      title: 'Director',
      relationship: 'client',
      formality: 0.7,
    },
    {
      id: 'ambig-mike-2',
      firstName: 'Michael',
      lastName: 'Johnston',
      nickname: 'Mike',
      emails: ['mike.johnston@outlook.com'],
      phones: ['+15105552222'],
      relationship: 'acquaintance',
      formality: 0.5,
    },
  ];
}

// Export default test set
export const DEFAULT_CONTACTS = generateContacts(100, 42);
export const AMBIGUOUS_CONTACTS = generateAmbiguousContacts();
