// Raw input types from different sources

// Gmail API message format (simplified)
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload: {
    headers: Array<{
      name: string;
      value: string;
    }>;
    mimeType?: string;
    body?: {
      data?: string;  // Base64 encoded
      size?: number;
    };
    parts?: Array<{
      mimeType?: string;
      body?: {
        data?: string;
        size?: number;
      };
    }>;
  };
  internalDate?: string;  // Unix timestamp in ms
}

// iMessage format (from SQLite chat.db)
export interface IMessageMessage {
  guid: string;
  text: string;
  handle_id: number;
  service: string;  // 'iMessage' or 'SMS'
  date: number;     // Core Data timestamp
  is_from_me: boolean;
  chat_id: string;

  // Resolved from handle
  sender_phone?: string;
  sender_email?: string;

  // Chat participants
  participants?: Array<{
    phone?: string;
    email?: string;
  }>;
}

// Slack message format (simplified)
export interface SlackMessage {
  ts: string;  // Timestamp ID
  channel: string;
  user: string;
  text: string;
  thread_ts?: string;

  // Resolved user info
  user_email?: string;
  user_name?: string;
}

// Ingestion batch result
export interface BatchIngestResult {
  sourceType: 'gmail' | 'imessage' | 'slack';
  totalReceived: number;
  successCount: number;
  skipCount: number;  // Duplicates
  errorCount: number;
  errors: Array<{
    sourceId: string;
    error: string;
  }>;
  entitiesCreated: number;
  entitiesMerged: number;
}
