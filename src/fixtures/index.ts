// Test fixtures module
// Provides synthetic data for testing without real user data

export * from './contacts';
export * from './emails';

import {
  generateContacts,
  generateAmbiguousContacts,
  SyntheticContact,
  DEFAULT_CONTACTS,
  AMBIGUOUS_CONTACTS,
} from './contacts';
import {
  generateEmails,
  generateMessages,
  SyntheticEmail,
  SyntheticMessage,
} from './emails';

export interface TestFixtures {
  contacts: SyntheticContact[];
  ambiguousContacts: SyntheticContact[];
  emails: SyntheticEmail[];
  messages: SyntheticMessage[];
  user: {
    name: string;
    email: string;
    phone: string;
  };
}

export interface GenerateFixturesOptions {
  contactCount?: number;
  emailCount?: number;
  messageCount?: number;
  startDate?: Date;
  endDate?: Date;
  seed?: number;
}

/**
 * Generate a complete set of test fixtures
 */
export function generateTestFixtures(options: GenerateFixturesOptions = {}): TestFixtures {
  const {
    contactCount = 100,
    emailCount = 1000,
    messageCount = 500,
    startDate = new Date('2024-01-01'),
    endDate = new Date('2024-12-31'),
    seed = 12345,
  } = options;

  const user = {
    name: 'Test User',
    email: 'testuser@example.com',
    phone: '+14155550000',
  };

  const contacts = generateContacts(contactCount, seed);
  const ambiguousContacts = generateAmbiguousContacts();
  const allContacts = [...contacts, ...ambiguousContacts];

  const emails = generateEmails({
    userEmail: user.email,
    userName: user.name,
    contacts: allContacts,
    count: emailCount,
    startDate,
    endDate,
    seedValue: seed + 1000,
  });

  const messages = generateMessages({
    userPhone: user.phone,
    userName: user.name,
    contacts: allContacts,
    count: messageCount,
    startDate,
    endDate,
    seedValue: seed + 2000,
  });

  return {
    contacts,
    ambiguousContacts,
    emails,
    messages,
    user,
  };
}

/**
 * Get pre-generated default fixtures (for quick tests)
 */
export function getDefaultFixtures(): TestFixtures {
  return generateTestFixtures({
    contactCount: 50,
    emailCount: 200,
    messageCount: 100,
    seed: 42,
  });
}

/**
 * Generate a small fixture set for unit tests
 */
export function getMinimalFixtures(): TestFixtures {
  return generateTestFixtures({
    contactCount: 10,
    emailCount: 20,
    messageCount: 10,
    seed: 99,
  });
}

/**
 * Generate fixtures specifically for entity resolution testing
 */
export function getEntityResolutionFixtures(): {
  contacts: SyntheticContact[];
  expectedMerges: Array<{ id1: string; id2: string; reason: string }>;
} {
  const contacts = generateAmbiguousContacts();

  // Known answer key for entity resolution
  const expectedMerges = [
    {
      id1: 'ambig-sarah-work',
      id2: 'ambig-sarah-personal',
      reason: 'Same person - Sarah Chen with work and personal email',
    },
  ];

  return { contacts, expectedMerges };
}

/**
 * Generate fixtures for engagement testing
 */
export function getEngagementFixtures(): {
  draftScenarios: Array<{
    name: string;
    aiDraftLength: number;
    userFinalLength: number;
    expectedEditRatio: number;
    expectedEngagement: 'high' | 'medium' | 'low';
  }>;
  ventModeScenarios: Array<{
    name: string;
    sentiment: number;
    threadLength: number;
    messageVelocity: number;
    capsRatio: number;
    expectedVenting: boolean;
  }>;
} {
  return {
    draftScenarios: [
      {
        name: 'User accepts draft unchanged',
        aiDraftLength: 150,
        userFinalLength: 150,
        expectedEditRatio: 0,
        expectedEngagement: 'high',
      },
      {
        name: 'User makes minor edits',
        aiDraftLength: 150,
        userFinalLength: 165,
        expectedEditRatio: 0.1,
        expectedEngagement: 'high',
      },
      {
        name: 'User rewrites half',
        aiDraftLength: 200,
        userFinalLength: 300,
        expectedEditRatio: 0.5,
        expectedEngagement: 'medium',
      },
      {
        name: 'User completely rewrites',
        aiDraftLength: 150,
        userFinalLength: 400,
        expectedEditRatio: 1.67,
        expectedEngagement: 'low',
      },
      {
        name: 'User deletes most content',
        aiDraftLength: 200,
        userFinalLength: 50,
        expectedEditRatio: 0.75,
        expectedEngagement: 'low',
      },
    ],
    ventModeScenarios: [
      {
        name: 'Happy normal conversation',
        sentiment: 0.5,
        threadLength: 3,
        messageVelocity: 1,
        capsRatio: 0.05,
        expectedVenting: false,
      },
      {
        name: 'Mild frustration',
        sentiment: -0.3,
        threadLength: 4,
        messageVelocity: 2,
        capsRatio: 0.1,
        expectedVenting: false,
      },
      {
        name: 'Angry rant with caps',
        sentiment: -0.7,
        threadLength: 8,
        messageVelocity: 5,
        capsRatio: 0.4,
        expectedVenting: true,
      },
      {
        name: 'Rapid frustrated messages',
        sentiment: -0.6,
        threadLength: 12,
        messageVelocity: 6,
        capsRatio: 0.2,
        expectedVenting: true,
      },
      {
        name: 'Long negative thread',
        sentiment: -0.5,
        threadLength: 15,
        messageVelocity: 1,
        capsRatio: 0.0,
        expectedVenting: false, // Slow pace = not venting
      },
    ],
  };
}

/**
 * Generate fixtures for personality mirroring tests
 */
export function getPersonalityFixtures(): {
  formalMessages: string[];
  casualMessages: string[];
  emojiHeavyMessages: string[];
  shortMessages: string[];
  longMessages: string[];
} {
  return {
    formalMessages: [
      'Dear Mr. Johnson,\n\nI hope this email finds you well. I wanted to follow up on our discussion from last week regarding the project timeline.\n\nPlease let me know if you have any questions.\n\nBest regards,\nTest User',
      'Good morning,\n\nThank you for your prompt response. I have reviewed the documentation and have a few clarifying questions.\n\nSincerely,\nTest User',
      'Hello,\n\nI am writing to confirm our meeting scheduled for Thursday at 2:00 PM. Please find the agenda attached.\n\nBest,\nTest User',
    ],
    casualMessages: [
      'Hey! Just wanted to check in about the thing we talked about. Lmk what you think!',
      'Yo, you around? Need to run something by you real quick',
      'Thanks for the heads up! I\'ll take a look and get back to you',
      'Haha yeah that was wild. Anyway, catch you later!',
    ],
    emojiHeavyMessages: [
      'Hey! 👋 So excited for tomorrow! 🎉🎊',
      'Omg thank you so much!! 😭💕 You\'re the best!!! 🙏',
      'Haha 😂😂 that\'s hilarious! We should totally do that 🙌',
      'Good morning! ☀️ Hope you have an amazing day! 💪✨',
    ],
    shortMessages: [
      'K', 'Sure', 'Sounds good', 'Thanks!', 'On my way', 'Done',
      'Yep', 'Nope', 'Maybe later', 'Cool', 'Nice!', 'Perfect',
    ],
    longMessages: [
      `Hey there! I hope you're having a great day. I wanted to reach out because I've been thinking about that conversation we had last week about the new project proposal, and I have some additional thoughts I'd like to share with you.

First off, I think the overall direction is really solid. The timeline seems reasonable given the scope, and I appreciate how thorough the planning has been. However, I do have a few concerns about the resource allocation in Q2, particularly around the development team capacity.

I was wondering if we could set up some time to discuss this further? I think a 30-minute call would be helpful to align on expectations and make sure we're all on the same page before moving forward.

Let me know what works for your schedule. I'm pretty flexible this week and next.

Thanks again for including me in this process - I'm really excited about where this is heading!`,
    ],
  };
}
