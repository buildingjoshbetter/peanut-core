// Synthetic email generator for testing

import { SyntheticContact } from './contacts';

export interface SyntheticEmail {
  id: string;
  threadId: string;
  sender: {
    email: string;
    name: string;
  };
  recipients: Array<{
    email: string;
    name: string;
    type: 'to' | 'cc';
  }>;
  subject: string;
  body: string;
  timestamp: Date;
  isFromUser: boolean;
  inReplyTo?: string;
}

// Email templates by relationship and formality
const GREETINGS = {
  formal: ['Dear', 'Hello', 'Good morning', 'Good afternoon'],
  informal: ['Hey', 'Hi', 'Yo', 'Sup', ''],
  family: ['Hey', 'Hi', 'Love', ''],
};

const SIGNOFFS = {
  formal: ['Best regards,', 'Sincerely,', 'Best,', 'Regards,', 'Thank you,'],
  informal: ['Thanks!', 'Cheers,', 'Later,', 'Talk soon,', '- '],
  family: ['Love,', 'xoxo', 'Miss you!', '<3', ''],
};

const WORK_SUBJECTS = [
  'Re: Q{quarter} Planning',
  'Meeting tomorrow',
  'Quick question about {project}',
  'Follow up on our call',
  'Proposal review',
  'Status update',
  'Need your input',
  'FYI: {topic}',
  'Re: {topic} discussion',
  'Action items from today',
  'Deadline reminder',
  'Project {project} update',
  'Can we sync?',
  'Thoughts on this?',
  'Re: Budget approval',
];

const PERSONAL_SUBJECTS = [
  'Weekend plans?',
  'Check this out!',
  'Long time no talk',
  'Hey!',
  'Quick favor',
  'Dinner next week?',
  'Happy birthday!',
  'Photos from {event}',
  'Miss you!',
  'Re: Vacation ideas',
  'Game tonight?',
  'Coffee soon?',
  "You won't believe this",
  'Thanks again!',
];

const FAMILY_SUBJECTS = [
  'Checking in',
  'Call me when you can',
  'Sunday dinner',
  'Photos',
  "Mom's birthday",
  'Holiday plans',
  'Love you',
  'How are the kids?',
  'Re: Family reunion',
  'Miss you!',
];

const WORK_BODIES = [
  `Just wanted to follow up on our discussion about the {topic}. I think we should move forward with the plan we outlined.

Can you send me the updated numbers by EOD?`,

  `Thanks for the quick turnaround on this. I reviewed the proposal and have a few minor suggestions:

1. Consider adding more detail on timeline
2. Budget looks good
3. Maybe we should include {person} in the next meeting

Let me know your thoughts.`,

  `Hey team,

Quick update on the {project} project:
- We're on track for the {date} deadline
- Still waiting on feedback from the client
- Next steps: finalize the design specs

Holler if you have questions.`,

  `Sounds good to me. Let's sync tomorrow at 2pm if that works for you.`,

  `I'm running a bit behind on this - can we push the deadline to next {day}?`,

  `Perfect, thanks for handling this. I'll loop in {person} as well.`,

  `Just saw this. Let me take a look and get back to you by end of week.`,

  `Wanted to flag something - I noticed a discrepancy in the {topic}. Can we discuss?`,
];

const PERSONAL_BODIES = [
  `Hey! Long time no talk. How have you been?

We should grab coffee soon and catch up. Free this weekend?`,

  `Dude that was hilarious! Thanks for sharing.

By the way, are you coming to {person}'s thing on Saturday?`,

  `I'm in! What time should I come over?`,

  `Sorry for the late reply - been super busy with work stuff. But yes, definitely down for {activity}!`,

  `Omg yes! I was just thinking about that. Those were good times.

We need to plan something soon. Maybe {activity}?`,

  `Thanks again for everything. Really appreciate you helping out with the {thing}. You're the best!`,

  `Haha same here. Let's do it!`,

  `Sounds perfect. See you then!`,
];

const FAMILY_BODIES = [
  `Hi honey,

Just checking in to see how you're doing. Dad and I miss you!

Call when you get a chance. Love you.`,

  `Hey! Mom asked me to remind you about Sunday dinner. Starts at 5.

Also, can you bring that {thing} you mentioned? Thanks!`,

  `Miss you too! Work has been crazy but I'll try to call this weekend.

How's everyone doing?`,

  `Love you! Give my love to everyone there.`,

  `Thanks for sending those photos! The kids look so big now. Can't wait to see everyone at the reunion.`,

  `Sounds good! I'll bring the {food}. Do you need me to pick up anything else?`,
];

// Placeholder values
const PROJECTS = ['Phoenix', 'Aurora', 'Titan', 'Neptune', 'Atlas', 'Horizon', 'Summit'];
const TOPICS = ['budget', 'timeline', 'design', 'marketing', 'sales', 'strategy', 'roadmap'];
const EVENTS = ['the wedding', 'the party', 'the trip', 'last weekend', 'the concert'];
const ACTIVITIES = ['hiking', 'dinner', 'drinks', 'a movie', 'game night', 'the beach'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const FOODS = ['wine', 'dessert', 'appetizers', 'salad', 'drinks'];
const THINGS = ['recipe', 'book', 'photo', 'gift', 'charger'];

let emailSeed = 54321;
function seededRandom(): number {
  emailSeed = (emailSeed * 1103515245 + 12345) & 0x7fffffff;
  return emailSeed / 0x7fffffff;
}

function pick<T>(arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('Cannot pick from empty array');
  return arr[Math.floor(seededRandom() * arr.length)]!;
}

function fillTemplate(template: string, personNames: string[]): string {
  return template
    .replace(/{project}/g, pick(PROJECTS))
    .replace(/{topic}/g, pick(TOPICS))
    .replace(/{event}/g, pick(EVENTS))
    .replace(/{activity}/g, pick(ACTIVITIES))
    .replace(/{day}/g, pick(DAYS))
    .replace(/{food}/g, pick(FOODS))
    .replace(/{thing}/g, pick(THINGS))
    .replace(/{quarter}/g, String(1 + Math.floor(seededRandom() * 4)))
    .replace(/{date}/g, `${pick(['January', 'February', 'March'])} ${10 + Math.floor(seededRandom() * 20)}`)
    .replace(/{person}/g, personNames.length > 0 ? pick(personNames) : 'Alex');
}

function generateEmailBody(
  relationship: SyntheticContact['relationship'],
  formality: number,
  senderName: string,
  personNames: string[]
): string {
  let bodies: string[];
  let greetings: string[];
  let signoffs: string[];

  if (['colleague', 'boss', 'client'].includes(relationship)) {
    bodies = WORK_BODIES;
    greetings = formality > 0.6 ? GREETINGS.formal : GREETINGS.informal;
    signoffs = formality > 0.6 ? SIGNOFFS.formal : SIGNOFFS.informal;
  } else if (relationship === 'family') {
    bodies = FAMILY_BODIES;
    greetings = GREETINGS.family;
    signoffs = SIGNOFFS.family;
  } else {
    bodies = PERSONAL_BODIES;
    greetings = GREETINGS.informal;
    signoffs = SIGNOFFS.informal;
  }

  const greeting = pick(greetings);
  const body = fillTemplate(pick(bodies), personNames);
  const signoff = pick(signoffs);
  const firstName = senderName.split(' ')[0];

  let result = '';
  if (greeting) {
    result += greeting + (greeting.endsWith(',') ? '' : ',') + '\n\n';
  }
  result += body;
  if (signoff) {
    result += '\n\n' + signoff + '\n' + firstName;
  }

  return result;
}

function generateSubject(relationship: SyntheticContact['relationship'], personNames: string[]): string {
  let subjects: string[];

  if (['colleague', 'boss', 'client'].includes(relationship)) {
    subjects = WORK_SUBJECTS;
  } else if (relationship === 'family') {
    subjects = FAMILY_SUBJECTS;
  } else {
    subjects = PERSONAL_SUBJECTS;
  }

  return fillTemplate(pick(subjects), personNames);
}

export interface GenerateEmailsOptions {
  userEmail: string;
  userName: string;
  contacts: SyntheticContact[];
  count: number;
  startDate: Date;
  endDate: Date;
  seedValue?: number;
}

export function generateEmails(options: GenerateEmailsOptions): SyntheticEmail[] {
  const { userEmail, userName, contacts, count, startDate, endDate, seedValue } = options;

  if (seedValue !== undefined) {
    emailSeed = seedValue;
  }

  const emails: SyntheticEmail[] = [];
  const threads: Map<string, { subject: string; participants: SyntheticContact[]; lastEmail?: SyntheticEmail }> = new Map();

  const timeRange = endDate.getTime() - startDate.getTime();
  const personNames = contacts.map(c => c.nickname || c.firstName);

  for (let i = 0; i < count; i++) {
    const contact = pick(contacts);
    const isFromUser = seededRandom() > 0.4; // User sends ~60% of emails

    // Decide if this is a new thread or reply
    const existingThreads = Array.from(threads.entries()).filter(
      ([_, t]) => t.participants.some(p => p.id === contact.id)
    );
    const isReply = existingThreads.length > 0 && seededRandom() > 0.4;

    let threadId: string;
    let subject: string;
    let inReplyTo: string | undefined;

    if (isReply) {
      const [tid, thread] = pick(existingThreads);
      threadId = tid;
      subject = thread.subject.startsWith('Re: ') ? thread.subject : `Re: ${thread.subject}`;
      inReplyTo = thread.lastEmail?.id;
    } else {
      threadId = `thread-${i.toString().padStart(5, '0')}`;
      subject = generateSubject(contact.relationship, personNames);
      threads.set(threadId, { subject, participants: [contact] });
    }

    // Generate timestamp
    const timestamp = new Date(startDate.getTime() + seededRandom() * timeRange);

    // Build sender/recipient
    const senderEmail = isFromUser ? userEmail : (contact.emails[0] || `${contact.firstName.toLowerCase()}@example.com`);
    const senderName = isFromUser ? userName : `${contact.firstName} ${contact.lastName}`;

    const recipientEmail = isFromUser ? (contact.emails[0] || `${contact.firstName.toLowerCase()}@example.com`) : userEmail;
    const recipientName = isFromUser ? `${contact.firstName} ${contact.lastName}` : userName;

    // Sometimes add CC recipients (for work emails)
    const ccRecipients: SyntheticEmail['recipients'] = [];
    if (['colleague', 'boss', 'client'].includes(contact.relationship) && seededRandom() > 0.7) {
      const workContacts = contacts.filter(c => c.id !== contact.id && ['colleague', 'boss', 'client'].includes(c.relationship) && c.emails.length > 0);
      if (workContacts.length > 0) {
        const ccContact = pick(workContacts);
        const ccEmail = ccContact.emails[0];
        if (ccEmail) {
          ccRecipients.push({
            email: ccEmail,
            name: `${ccContact.firstName} ${ccContact.lastName}`,
            type: 'cc',
          });
        }
      }
    }

    // Generate body
    const body = generateEmailBody(
      contact.relationship,
      contact.formality,
      senderName,
      personNames
    );

    const email: SyntheticEmail = {
      id: `email-${i.toString().padStart(5, '0')}`,
      threadId,
      sender: { email: senderEmail, name: senderName },
      recipients: [
        { email: recipientEmail, name: recipientName, type: 'to' },
        ...ccRecipients,
      ],
      subject,
      body,
      timestamp,
      isFromUser,
      inReplyTo,
    };

    emails.push(email);

    // Update thread
    const thread = threads.get(threadId);
    if (thread) {
      thread.lastEmail = email;
      if (!thread.participants.some(p => p.id === contact.id)) {
        thread.participants.push(contact);
      }
    }
  }

  // Sort by timestamp
  emails.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return emails;
}

// Generate iMessage-style conversations
export interface SyntheticMessage {
  id: string;
  threadId: string;
  sender: {
    phone?: string;
    email?: string;
    name: string;
  };
  recipient: {
    phone?: string;
    email?: string;
    name: string;
  };
  body: string;
  timestamp: Date;
  isFromUser: boolean;
}

const MESSAGE_BODIES = {
  casual: [
    'Hey!', 'What\'s up?', 'You around?', 'Yo', 'Hi!', 'Hey there',
    'Lol', 'Haha', 'Yeah for sure', 'Sounds good', 'K', 'Ok!', 'Cool',
    'Omg', 'Nice!', 'Awesome', 'Perfect', 'Sure thing', 'No worries',
    'Thanks!', 'Ty!', 'Np', 'Ofc', 'Yep', 'Nope', 'Maybe', 'Idk',
    'Wanna hang?', 'Down for dinner?', 'Free tonight?', 'Running late',
    'Be there in 10', 'Just left', 'On my way', 'Here!', 'Outside',
    'Miss you!', 'See you soon', 'Later!', 'Bye!', 'Night!', 'Gn!',
  ],
  responses: [
    'Yeah definitely!', 'For sure', 'Sounds good to me', 'I\'m down',
    'Let me check', 'Give me a sec', 'One min', 'Brb', 'Hold on',
    'What time?', 'Where?', 'Who else is coming?', 'Is {person} going?',
    'Can\'t today, sorry!', 'Rain check?', 'Next time!', 'How about tomorrow?',
    'Same lol', 'Right?!', 'Literally me', 'Mood', 'Facts', 'True true',
  ],
  longer: [
    'Hey! Just saw your message. Yeah I\'m free this weekend, what did you have in mind?',
    'Omg that\'s hilarious. We should totally do that again sometime!',
    'Sorry for the late reply, been super busy. But yes I\'m definitely in!',
    'Just got home. Such a long day. How was yours?',
    'Can you pick up some milk on the way home? Thanks!',
    'Running about 15 mins late, traffic is crazy. Start without me!',
    'Happy birthday!!! Hope you have an amazing day! We need to celebrate soon!',
    'Thanks so much for dinner last night. We had such a great time!',
  ],
};

export function generateMessages(options: {
  userPhone: string;
  userName: string;
  contacts: SyntheticContact[];
  count: number;
  startDate: Date;
  endDate: Date;
  seedValue?: number;
}): SyntheticMessage[] {
  const { userPhone, userName, contacts, count, startDate, endDate, seedValue } = options;

  if (seedValue !== undefined) {
    emailSeed = seedValue;
  }

  const messages: SyntheticMessage[] = [];
  const threads: Map<string, { contact: SyntheticContact; lastTimestamp: Date }> = new Map();

  const timeRange = endDate.getTime() - startDate.getTime();
  const personNames = contacts.map(c => c.nickname || c.firstName);

  for (let i = 0; i < count; i++) {
    // More likely to continue existing threads
    const existingThreadIds = Array.from(threads.keys());
    const continueThread = existingThreadIds.length > 0 && seededRandom() > 0.3;

    let threadId: string;
    let contact: SyntheticContact;

    if (continueThread) {
      threadId = pick(existingThreadIds);
      contact = threads.get(threadId)!.contact;
    } else {
      // Pick contacts that have phones
      const phoneContacts = contacts.filter(c => c.phones.length > 0);
      contact = phoneContacts.length > 0 ? pick(phoneContacts) : pick(contacts);
      threadId = `msg-thread-${contact.id}`;
      threads.set(threadId, { contact, lastTimestamp: startDate });
    }

    const isFromUser = seededRandom() > 0.45; // User sends ~55%

    // Timestamp - either continue recent thread or random
    const lastTimestamp = threads.get(threadId)!.lastTimestamp;
    const minTime = Math.max(lastTimestamp.getTime(), startDate.getTime());
    const maxTime = endDate.getTime();
    const timestamp = new Date(minTime + seededRandom() * Math.min(maxTime - minTime, 24 * 60 * 60 * 1000));

    // Pick message body
    const bodyType = seededRandom() > 0.7 ? 'longer' : seededRandom() > 0.5 ? 'responses' : 'casual';
    let body = pick(MESSAGE_BODIES[bodyType]);
    body = fillTemplate(body, personNames);

    const userIdentifier = userPhone;
    const contactIdentifier = contact.phones[0] || contact.emails[0] || `${contact.firstName.toLowerCase()}@example.com`;

    const message: SyntheticMessage = {
      id: `msg-${i.toString().padStart(5, '0')}`,
      threadId,
      sender: {
        phone: isFromUser ? userPhone : contact.phones[0],
        email: isFromUser ? undefined : (contact.phones.length === 0 ? contact.emails[0] : undefined),
        name: isFromUser ? userName : `${contact.firstName} ${contact.lastName}`,
      },
      recipient: {
        phone: isFromUser ? contact.phones[0] : userPhone,
        email: isFromUser ? (contact.phones.length === 0 ? contact.emails[0] : undefined) : undefined,
        name: isFromUser ? `${contact.firstName} ${contact.lastName}` : userName,
      },
      body,
      timestamp,
      isFromUser,
    };

    messages.push(message);
    threads.set(threadId, { contact, lastTimestamp: timestamp });
  }

  // Sort by timestamp
  messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return messages;
}
