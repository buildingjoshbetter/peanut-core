// LLM utilities for extraction

export interface LLMConfig {
  endpoint: string;       // e.g., "http://localhost:11434/api/generate" for Ollama
  model: string;          // e.g., "llama3" or "mistral"
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * Call an Ollama-compatible LLM endpoint
 */
export async function callOllama(
  prompt: string,
  config: LLMConfig
): Promise<LLMResponse> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt,
      stream: false,
      options: {
        temperature: config.temperature ?? 0.1,
        num_predict: config.maxTokens ?? 2000,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    response: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };

  return {
    text: data.response,
    usage: data.prompt_eval_count ? {
      promptTokens: data.prompt_eval_count,
      completionTokens: data.eval_count ?? 0,
    } : undefined,
  };
}

/**
 * Call an OpenAI-compatible LLM endpoint
 */
export async function callOpenAI(
  prompt: string,
  config: LLMConfig & { apiKey?: string }
): Promise<LLMResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature ?? 0.1,
      max_tokens: config.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    text: data.choices[0]?.message.content ?? '',
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    } : undefined,
  };
}

/**
 * Generic LLM call that auto-detects endpoint type
 */
export async function callLLM(
  prompt: string,
  config: LLMConfig & { apiKey?: string }
): Promise<LLMResponse> {
  // Detect Ollama vs OpenAI style endpoint
  if (config.endpoint.includes('/api/generate') || config.endpoint.includes('ollama')) {
    return callOllama(prompt, config);
  } else {
    return callOpenAI(prompt, config);
  }
}

/**
 * Extract JSON from LLM response (handles markdown code blocks)
 */
export function extractJSON<T>(text: string): T | null {
  // Try direct parse first
  try {
    return JSON.parse(text) as T;
  } catch {
    // Try to extract from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as T;
      } catch {
        // Fall through
      }
    }

    // Try to find JSON object/array in the text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as T;
      } catch {
        // Fall through
      }
    }

    return null;
  }
}
