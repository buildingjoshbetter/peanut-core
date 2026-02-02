// Extraction types

export interface ExtractedEntity {
  name: string;
  type: 'person' | 'org' | 'place' | 'thing';
  attributes: Record<string, string>;  // email, phone, title, company, etc.
  confidence: number;
  mentionText: string;  // The original text that mentioned this entity
}

export interface ExtractedFact {
  subject: string;      // Entity name
  predicate: string;    // Relationship type
  object: string;       // Entity name or literal value
  confidence: number;
  evidenceText: string; // The text that supports this fact
}

export interface ExtractedRelationship {
  fromEntity: string;
  toEntity: string;
  relationshipType: string;  // 'works_with', 'family', 'knows', 'reports_to', etc.
  confidence: number;
  evidenceText: string;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  facts: ExtractedFact[];
  relationships: ExtractedRelationship[];
}

// LLM extraction prompts
export const ENTITY_EXTRACTION_PROMPT = `Extract all people, organizations, and places mentioned in this message.

For each entity, provide:
- name: The canonical name
- type: "person", "org", or "place"
- attributes: Any details like email, phone, title, company
- confidence: 0.0 to 1.0

Respond in JSON format:
{
  "entities": [
    {"name": "...", "type": "...", "attributes": {...}, "confidence": 0.9, "mentionText": "..."}
  ]
}

Message:
`;

export const FACT_EXTRACTION_PROMPT = `Extract factual assertions from this message. Focus on:
- Job/role relationships (X works at Y, X is the CEO of Y)
- Personal relationships (X is married to Y, X is Y's brother)
- Location information (X lives in Y, X is based in Y)
- Events (X is meeting Y on date, X is attending event)

For each fact, provide:
- subject: The entity the fact is about
- predicate: The relationship type (e.g., "works_at", "is_married_to", "lives_in")
- object: The related entity or value
- confidence: 0.0 to 1.0
- evidenceText: The exact text supporting this

Respond in JSON format:
{
  "facts": [
    {"subject": "...", "predicate": "...", "object": "...", "confidence": 0.9, "evidenceText": "..."}
  ]
}

Message:
`;

export const RELATIONSHIP_EXTRACTION_PROMPT = `Identify relationships between people mentioned in or involved with this message.

Consider:
- The sender and recipients (who is writing to whom)
- People mentioned in the text
- Implied relationships (e.g., if someone mentions "my boss Jake")

Relationship types: works_with, reports_to, family, friend, colleague, knows, client

For each relationship, provide:
- fromEntity: First person
- toEntity: Second person
- relationshipType: The type of relationship
- confidence: 0.0 to 1.0
- evidenceText: The text suggesting this relationship

Respond in JSON format:
{
  "relationships": [
    {"fromEntity": "...", "toEntity": "...", "relationshipType": "...", "confidence": 0.9, "evidenceText": "..."}
  ]
}

Message context:
Sender: {sender}
Recipients: {recipients}

Message:
`;
