// Fixtures module tests

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, closeDb } from '../db/connection';
import {
  generateContacts,
  generateAmbiguousContacts,
  DEFAULT_CONTACTS,
  AMBIGUOUS_CONTACTS,
} from './contacts';
import {
  generateEmails,
  generateMessages,
} from './emails';
import {
  generateTestFixtures,
  getDefaultFixtures,
  getMinimalFixtures,
  getEntityResolutionFixtures,
  getEngagementFixtures,
  getPersonalityFixtures,
} from './index';

describe('Contact Generator', () => {
  describe('generateContacts', () => {
    it('should generate the requested number of contacts', () => {
      const contacts = generateContacts(50);
      expect(contacts).toHaveLength(50);
    });

    it('should generate contacts with required fields', () => {
      const contacts = generateContacts(10);
      for (const contact of contacts) {
        expect(contact.id).toBeDefined();
        expect(contact.firstName).toBeDefined();
        expect(contact.lastName).toBeDefined();
        expect(contact.emails.length).toBeGreaterThanOrEqual(0);
        expect(contact.relationship).toBeDefined();
        expect(contact.formality).toBeGreaterThanOrEqual(0);
        expect(contact.formality).toBeLessThanOrEqual(1);
      }
    });

    it('should generate reproducible contacts with same seed', () => {
      const contacts1 = generateContacts(20, 12345);
      const contacts2 = generateContacts(20, 12345);
      expect(contacts1).toEqual(contacts2);
    });

    it('should generate different contacts with different seeds', () => {
      const contacts1 = generateContacts(20, 11111);
      const contacts2 = generateContacts(20, 22222);
      expect(contacts1[0]?.firstName).not.toEqual(contacts2[0]?.firstName);
    });

    it('should generate varied relationships', () => {
      const contacts = generateContacts(100);
      const relationships = new Set(contacts.map(c => c.relationship));
      expect(relationships.size).toBeGreaterThan(3);
    });

    it('should generate unique emails', () => {
      const contacts = generateContacts(50);
      const allEmails = contacts.flatMap(c => c.emails);
      const uniqueEmails = new Set(allEmails);
      expect(uniqueEmails.size).toBe(allEmails.length);
    });

    it('should assign companies to work-related contacts', () => {
      const contacts = generateContacts(100);
      const workContacts = contacts.filter(c =>
        ['colleague', 'boss', 'client'].includes(c.relationship)
      );
      const withCompany = workContacts.filter(c => c.company);
      expect(withCompany.length).toBeGreaterThan(workContacts.length * 0.5);
    });
  });

  describe('generateAmbiguousContacts', () => {
    it('should generate ambiguous test cases', () => {
      const contacts = generateAmbiguousContacts();
      expect(contacts.length).toBeGreaterThan(0);
    });

    it('should include duplicate names', () => {
      const contacts = generateAmbiguousContacts();
      const names = contacts.map(c => `${c.firstName} ${c.lastName}`);
      const uniqueNames = new Set(names);
      // Should have fewer unique names than contacts (some duplicates)
      expect(uniqueNames.size).toBeLessThan(contacts.length);
    });

    it('should include same person with different emails', () => {
      const contacts = generateAmbiguousContacts();
      const sarahWork = contacts.find(c => c.id === 'ambig-sarah-work');
      const sarahPersonal = contacts.find(c => c.id === 'ambig-sarah-personal');
      expect(sarahWork).toBeDefined();
      expect(sarahPersonal).toBeDefined();
      if (sarahWork && sarahPersonal) {
        expect(sarahWork.firstName).toBe(sarahPersonal.firstName);
        expect(sarahWork.lastName).toBe(sarahPersonal.lastName);
        expect(sarahWork.emails[0]).not.toBe(sarahPersonal.emails[0]);
      }
    });
  });

  describe('DEFAULT_CONTACTS', () => {
    it('should have 100 pre-generated contacts', () => {
      expect(DEFAULT_CONTACTS).toHaveLength(100);
    });
  });
});

describe('Email Generator', () => {
  const testContacts = generateContacts(20, 999);

  describe('generateEmails', () => {
    it('should generate the requested number of emails', () => {
      const emails = generateEmails({
        userEmail: 'user@example.com',
        userName: 'Test User',
        contacts: testContacts,
        count: 50,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });
      expect(emails).toHaveLength(50);
    });

    it('should generate emails with required fields', () => {
      const emails = generateEmails({
        userEmail: 'user@example.com',
        userName: 'Test User',
        contacts: testContacts,
        count: 10,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      for (const email of emails) {
        expect(email.id).toBeDefined();
        expect(email.threadId).toBeDefined();
        expect(email.sender.email).toBeDefined();
        expect(email.sender.name).toBeDefined();
        expect(email.recipients.length).toBeGreaterThan(0);
        expect(email.subject).toBeDefined();
        expect(email.body).toBeDefined();
        expect(email.timestamp).toBeInstanceOf(Date);
        expect(typeof email.isFromUser).toBe('boolean');
      }
    });

    it('should generate both sent and received emails', () => {
      const emails = generateEmails({
        userEmail: 'user@example.com',
        userName: 'Test User',
        contacts: testContacts,
        count: 50,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      const sentByUser = emails.filter(e => e.isFromUser);
      const receivedByUser = emails.filter(e => !e.isFromUser);

      expect(sentByUser.length).toBeGreaterThan(0);
      expect(receivedByUser.length).toBeGreaterThan(0);
    });

    it('should create threaded conversations', () => {
      const emails = generateEmails({
        userEmail: 'user@example.com',
        userName: 'Test User',
        contacts: testContacts,
        count: 100,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      // Count emails with Re: in subject (replies)
      const replies = emails.filter(e => e.subject.startsWith('Re: '));
      expect(replies.length).toBeGreaterThan(0);

      // Check inReplyTo references
      const withReplyTo = emails.filter(e => e.inReplyTo);
      expect(withReplyTo.length).toBeGreaterThan(0);
    });

    it('should sort emails by timestamp', () => {
      const emails = generateEmails({
        userEmail: 'user@example.com',
        userName: 'Test User',
        contacts: testContacts,
        count: 20,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      for (let i = 1; i < emails.length; i++) {
        const current = emails[i];
        const previous = emails[i - 1];
        if (current && previous) {
          expect(current.timestamp.getTime()).toBeGreaterThanOrEqual(
            previous.timestamp.getTime()
          );
        }
      }
    });

    it('should generate reproducible emails with same seed', () => {
      const emails1 = generateEmails({
        userEmail: 'user@example.com',
        userName: 'Test User',
        contacts: testContacts,
        count: 10,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        seedValue: 55555,
      });
      const emails2 = generateEmails({
        userEmail: 'user@example.com',
        userName: 'Test User',
        contacts: testContacts,
        count: 10,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        seedValue: 55555,
      });

      expect(emails1[0]?.subject).toBe(emails2[0]?.subject);
    });
  });

  describe('generateMessages', () => {
    it('should generate iMessage-style short messages', () => {
      const messages = generateMessages({
        userPhone: '+14155550000',
        userName: 'Test User',
        contacts: testContacts,
        count: 50,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      expect(messages).toHaveLength(50);

      // iMessages are typically shorter than emails
      const avgLength = messages.reduce((sum, m) => sum + m.body.length, 0) / messages.length;
      expect(avgLength).toBeLessThan(200);
    });

    it('should include phone numbers for senders/recipients', () => {
      const messages = generateMessages({
        userPhone: '+14155550000',
        userName: 'Test User',
        contacts: testContacts,
        count: 20,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      const withPhones = messages.filter(m => m.sender.phone || m.recipient.phone);
      expect(withPhones.length).toBeGreaterThan(0);
    });
  });
});

describe('Fixture Generators', () => {
  describe('generateTestFixtures', () => {
    it('should generate a complete fixture set', () => {
      const fixtures = generateTestFixtures({
        contactCount: 20,
        emailCount: 50,
        messageCount: 30,
      });

      expect(fixtures.contacts).toHaveLength(20);
      expect(fixtures.emails).toHaveLength(50);
      expect(fixtures.messages).toHaveLength(30);
      expect(fixtures.ambiguousContacts.length).toBeGreaterThan(0);
      expect(fixtures.user).toBeDefined();
      expect(fixtures.user.email).toBeDefined();
      expect(fixtures.user.phone).toBeDefined();
    });
  });

  describe('getDefaultFixtures', () => {
    it('should return pre-configured fixtures', () => {
      const fixtures = getDefaultFixtures();
      expect(fixtures.contacts.length).toBeGreaterThan(0);
      expect(fixtures.emails.length).toBeGreaterThan(0);
      expect(fixtures.messages.length).toBeGreaterThan(0);
    });
  });

  describe('getMinimalFixtures', () => {
    it('should return small fixture set for unit tests', () => {
      const fixtures = getMinimalFixtures();
      expect(fixtures.contacts.length).toBeLessThanOrEqual(20);
      expect(fixtures.emails.length).toBeLessThanOrEqual(30);
    });
  });

  describe('getEntityResolutionFixtures', () => {
    it('should return contacts with expected merge hints', () => {
      const { contacts, expectedMerges } = getEntityResolutionFixtures();
      expect(contacts.length).toBeGreaterThan(0);
      expect(expectedMerges.length).toBeGreaterThan(0);

      // Verify expected merge targets exist
      for (const merge of expectedMerges) {
        const c1 = contacts.find(c => c.id === merge.id1);
        const c2 = contacts.find(c => c.id === merge.id2);
        expect(c1).toBeDefined();
        expect(c2).toBeDefined();
      }
    });
  });

  describe('getEngagementFixtures', () => {
    it('should return draft and vent mode scenarios', () => {
      const fixtures = getEngagementFixtures();

      expect(fixtures.draftScenarios.length).toBeGreaterThan(0);
      expect(fixtures.ventModeScenarios.length).toBeGreaterThan(0);

      // Verify scenario structure
      for (const scenario of fixtures.draftScenarios) {
        expect(scenario.name).toBeDefined();
        expect(scenario.aiDraftLength).toBeGreaterThan(0);
        expect(scenario.userFinalLength).toBeGreaterThan(0);
        expect(['high', 'medium', 'low']).toContain(scenario.expectedEngagement);
      }

      for (const scenario of fixtures.ventModeScenarios) {
        expect(scenario.name).toBeDefined();
        expect(typeof scenario.expectedVenting).toBe('boolean');
      }
    });
  });

  describe('getPersonalityFixtures', () => {
    it('should return categorized message examples', () => {
      const fixtures = getPersonalityFixtures();

      expect(fixtures.formalMessages.length).toBeGreaterThan(0);
      expect(fixtures.casualMessages.length).toBeGreaterThan(0);
      expect(fixtures.emojiHeavyMessages.length).toBeGreaterThan(0);
      expect(fixtures.shortMessages.length).toBeGreaterThan(0);
      expect(fixtures.longMessages.length).toBeGreaterThan(0);
    });

    it('should have formal messages with proper structure', () => {
      const { formalMessages } = getPersonalityFixtures();

      for (const msg of formalMessages) {
        // Formal messages should have greetings or signoffs
        const hasGreeting = /^(Dear|Hello|Good morning|Good afternoon)/i.test(msg);
        const hasSignoff = /(Best regards|Sincerely|Best,|Regards)/i.test(msg);
        expect(hasGreeting || hasSignoff).toBe(true);
      }
    });

    it('should have emoji messages with actual emojis', () => {
      const { emojiHeavyMessages } = getPersonalityFixtures();
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u;

      for (const msg of emojiHeavyMessages) {
        expect(emojiRegex.test(msg)).toBe(true);
      }
    });

    it('should have short messages under 20 chars', () => {
      const { shortMessages } = getPersonalityFixtures();

      for (const msg of shortMessages) {
        expect(msg.length).toBeLessThan(20);
      }
    });
  });
});

describe('Integration: Fixtures with Database', () => {
  beforeAll(() => {
    initDb(':memory:');
  });

  afterAll(() => {
    closeDb();
  });

  it('should be usable for ingestion testing', async () => {
    const fixtures = getMinimalFixtures();
    const { ingestNormalizedMessages } = await import('../ingestion/pipeline');

    // Convert synthetic emails to normalized format
    const normalizedMessages = fixtures.emails.slice(0, 5).map(email => ({
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

    const result = await ingestNormalizedMessages(normalizedMessages);
    expect(result.messagesIngested).toBeGreaterThan(0);
  });
});
