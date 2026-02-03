// Sentiment Analysis Module
// Strategy Reference: Part 16, Part 10.2
//
// Provides sentiment analysis for engagement tracking and vent mode detection.
// Can use either rule-based analysis or LLM-powered analysis.

// Word lists for basic sentiment (AFINN-inspired)
const POSITIVE_WORDS = new Set([
  'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
  'love', 'loved', 'loving', 'like', 'liked', 'enjoy', 'enjoyed', 'happy',
  'glad', 'pleased', 'delighted', 'thrilled', 'excited', 'exciting',
  'beautiful', 'perfect', 'best', 'better', 'nice', 'fine', 'well',
  'thanks', 'thank', 'grateful', 'appreciate', 'appreciated',
  'helpful', 'useful', 'brilliant', 'superb', 'outstanding',
  'yes', 'yay', 'hurray', 'congrats', 'congratulations',
  'agree', 'agreed', 'correct', 'right', 'exactly', 'absolutely',
  'success', 'successful', 'win', 'won', 'achieve', 'achieved',
  'hope', 'hopeful', 'optimistic', 'positive', 'fortunate', 'lucky',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'horrible', 'awful', 'worst', 'worse', 'poor',
  'hate', 'hated', 'hating', 'dislike', 'disliked', 'angry', 'mad',
  'sad', 'unhappy', 'disappointed', 'disappointing', 'frustrating', 'frustrated',
  'annoyed', 'annoying', 'irritated', 'irritating', 'upset', 'worried',
  'sorry', 'apologize', 'unfortunately', 'regret', 'regretted',
  'wrong', 'mistake', 'error', 'fail', 'failed', 'failure',
  'problem', 'problems', 'issue', 'issues', 'trouble', 'difficult',
  'hard', 'impossible', 'never', 'nothing', 'nobody', 'nowhere',
  'no', 'not', 'don\'t', 'doesn\'t', 'didn\'t', 'won\'t', 'can\'t', 'couldn\'t',
  'shouldn\'t', 'wouldn\'t', 'isn\'t', 'aren\'t', 'wasn\'t', 'weren\'t',
  'hate', 'stupid', 'idiot', 'dumb', 'ridiculous', 'absurd',
  'sucks', 'suck', 'sucky', 'crap', 'crappy', 'damn', 'hell',
  'stress', 'stressed', 'stressful', 'anxious', 'anxiety', 'fear', 'scared',
]);

const INTENSIFIERS = new Set([
  'very', 'really', 'extremely', 'absolutely', 'totally', 'completely',
  'incredibly', 'amazingly', 'especially', 'particularly', 'highly',
  'so', 'such', 'quite', 'truly', 'certainly', 'definitely',
]);

const NEGATORS = new Set([
  'not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere',
  'don\'t', 'doesn\'t', 'didn\'t', 'won\'t', 'wouldn\'t', 'couldn\'t',
  'shouldn\'t', 'can\'t', 'cannot', 'isn\'t', 'aren\'t', 'wasn\'t', 'weren\'t',
  'hardly', 'barely', 'scarcely', 'seldom', 'rarely',
]);

export interface SentimentResult {
  score: number;           // -1 to 1
  magnitude: number;       // 0 to 1 (intensity)
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;      // 0 to 1
  details: {
    positiveWords: string[];
    negativeWords: string[];
    intensifiers: string[];
    negators: string[];
  };
}

export interface VentModeIndicators {
  isVenting: boolean;
  confidence: number;
  signals: {
    negativeSentiment: boolean;
    highEmotionality: boolean;
    frustrationKeywords: boolean;
    allCaps: boolean;
    excessivePunctuation: boolean;
    longMessage: boolean;
  };
}

/**
 * Analyze sentiment of text using rule-based approach
 */
export function analyzeSentiment(text: string): SentimentResult {
  const words = tokenize(text);
  const details = {
    positiveWords: [] as string[],
    negativeWords: [] as string[],
    intensifiers: [] as string[],
    negators: [] as string[],
  };

  let score = 0;
  let wordCount = 0;
  let isNegated = false;
  let intensifierMultiplier = 1;

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!.toLowerCase();

    // Check for negators (affects next sentiment word)
    if (NEGATORS.has(word)) {
      isNegated = true;
      details.negators.push(word);
      continue;
    }

    // Check for intensifiers (affects next sentiment word)
    if (INTENSIFIERS.has(word)) {
      intensifierMultiplier = 1.5;
      details.intensifiers.push(word);
      continue;
    }

    // Check for positive words
    if (POSITIVE_WORDS.has(word)) {
      const value = isNegated ? -1 : 1;
      score += value * intensifierMultiplier;
      wordCount++;
      details.positiveWords.push(word);
      isNegated = false;
      intensifierMultiplier = 1;
      continue;
    }

    // Check for negative words
    if (NEGATIVE_WORDS.has(word)) {
      const value = isNegated ? 1 : -1;  // Negation flips sentiment
      score += value * intensifierMultiplier;
      wordCount++;
      details.negativeWords.push(word);
      isNegated = false;
      intensifierMultiplier = 1;
      continue;
    }

    // Reset negation after non-sentiment word
    if (i > 0) {
      const prevWord = words[i - 1]!.toLowerCase();
      if (!NEGATORS.has(prevWord) && !INTENSIFIERS.has(prevWord)) {
        isNegated = false;
        intensifierMultiplier = 1;
      }
    }
  }

  // Normalize score to -1 to 1
  const normalizedScore = wordCount > 0 ? score / wordCount : 0;
  const clampedScore = Math.max(-1, Math.min(1, normalizedScore));

  // Calculate magnitude (how emotional the text is)
  const emotionalWords = details.positiveWords.length + details.negativeWords.length;
  const magnitude = Math.min(1, emotionalWords / Math.max(1, words.length / 10));

  // Determine label
  let label: 'positive' | 'negative' | 'neutral';
  if (clampedScore > 0.1) {
    label = 'positive';
  } else if (clampedScore < -0.1) {
    label = 'negative';
  } else {
    label = 'neutral';
  }

  // Confidence based on word count and consistency
  const confidence = Math.min(1, (emotionalWords / 5) * (1 - Math.abs(
    details.positiveWords.length - details.negativeWords.length
  ) / Math.max(1, emotionalWords)));

  return {
    score: clampedScore,
    magnitude,
    label,
    confidence: Math.max(0.1, confidence),
    details,
  };
}

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

/**
 * Detect if user is venting/frustrated
 * Used for engagement adaptation (Strategy Part 16)
 */
export function detectVentMode(text: string, messageLengthThreshold: number = 500): VentModeIndicators {
  const sentiment = analyzeSentiment(text);

  // Signal 1: Negative sentiment
  const negativeSentiment = sentiment.score < -0.3;

  // Signal 2: High emotionality (lots of sentiment words)
  const highEmotionality = sentiment.magnitude > 0.5;

  // Signal 3: Frustration keywords
  const frustrationKeywords = /\b(frustrat|annoy|upset|stress|overwhelm|exhaust|tire|sick of|fed up|can't believe|ridiculous|unbelievable)\w*/i.test(text);

  // Signal 4: Excessive caps (yelling)
  const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(1, text.length);
  const allCaps = capsRatio > 0.3 && text.length > 10;

  // Signal 5: Excessive punctuation (!!!, ???)
  const excessivePunctuation = /[!?]{2,}/.test(text);

  // Signal 6: Long message (venting often involves long explanations)
  const longMessage = text.length > messageLengthThreshold;

  // Count signals
  const signals = {
    negativeSentiment,
    highEmotionality,
    frustrationKeywords,
    allCaps,
    excessivePunctuation,
    longMessage,
  };

  const signalCount = Object.values(signals).filter(Boolean).length;

  // Is venting if 2+ signals present
  const isVenting = signalCount >= 2;

  // Confidence based on number of signals
  const confidence = Math.min(1, signalCount / 4);

  return {
    isVenting,
    confidence,
    signals,
  };
}

/**
 * Get sentiment for multiple texts (batch analysis)
 */
export function analyzeSentimentBatch(texts: string[]): SentimentResult[] {
  return texts.map(analyzeSentiment);
}

/**
 * Calculate average sentiment across texts
 */
export function averageSentiment(texts: string[]): SentimentResult {
  if (texts.length === 0) {
    return {
      score: 0,
      magnitude: 0,
      label: 'neutral',
      confidence: 0,
      details: {
        positiveWords: [],
        negativeWords: [],
        intensifiers: [],
        negators: [],
      },
    };
  }

  const results = analyzeSentimentBatch(texts);

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const avgMagnitude = results.reduce((sum, r) => sum + r.magnitude, 0) / results.length;
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

  // Aggregate details
  const allPositive = new Set<string>();
  const allNegative = new Set<string>();
  for (const r of results) {
    r.details.positiveWords.forEach(w => allPositive.add(w));
    r.details.negativeWords.forEach(w => allNegative.add(w));
  }

  let label: 'positive' | 'negative' | 'neutral';
  if (avgScore > 0.1) label = 'positive';
  else if (avgScore < -0.1) label = 'negative';
  else label = 'neutral';

  return {
    score: avgScore,
    magnitude: avgMagnitude,
    label,
    confidence: avgConfidence,
    details: {
      positiveWords: Array.from(allPositive),
      negativeWords: Array.from(allNegative),
      intensifiers: [],
      negators: [],
    },
  };
}

/**
 * Get sentiment trend over time
 */
export function sentimentTrend(
  texts: string[],
  windowSize: number = 5
): Array<{ index: number; movingAverage: number }> {
  const sentiments = texts.map(t => analyzeSentiment(t).score);
  const trend: Array<{ index: number; movingAverage: number }> = [];

  for (let i = windowSize - 1; i < sentiments.length; i++) {
    const window = sentiments.slice(i - windowSize + 1, i + 1);
    const avg = window.reduce((sum, s) => sum + s, 0) / windowSize;
    trend.push({ index: i, movingAverage: avg });
  }

  return trend;
}

/**
 * Compare sentiment between two texts
 */
export function compareSentiment(text1: string, text2: string): {
  text1: SentimentResult;
  text2: SentimentResult;
  difference: number;
  morePositive: 1 | 2 | 0;
} {
  const result1 = analyzeSentiment(text1);
  const result2 = analyzeSentiment(text2);

  const difference = result1.score - result2.score;

  let morePositive: 1 | 2 | 0;
  if (Math.abs(difference) < 0.1) morePositive = 0;
  else if (difference > 0) morePositive = 1;
  else morePositive = 2;

  return {
    text1: result1,
    text2: result2,
    difference,
    morePositive,
  };
}
