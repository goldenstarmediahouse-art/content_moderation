import OpenAI from 'openai';
import { RecommendedAction, SeverityLevel } from '@/types/database';

export interface ModerationAnalysisInput {
  commentText: string;
  commenterName?: string | null;
  postContext?: string | null;
  pageName?: string | null;
}

export interface ModerationAnalysisResult {
  detectedCategory: string;
  confidenceScore: number;
  severity: SeverityLevel;
  recommendedAction: RecommendedAction;
  explanation: string;
  detectedLanguage: string;
  modelInfo: string;
  rawResponse?: any;
}

const MODERATION_SYSTEM_PROMPT = `
You are the expert Content Moderation AI for Golden Star Media House, overseeing Facebook Pages for a Christian Church.
You have native-level fluency in:
1. English
2. Shona (including vernacular, colloquialisms, idioms, and slang)
3. Ndebele (including vernacular, colloquialisms, and slang)
4. Mixed-language code-switching (e.g., Shona-English / Ndebele-English)

YOUR SACRED RESPONSIBILITY:
Protect the church community from actual harm, abuse, violence, hate, and scams while FIRMLY DEFENDING AND PERMITTING legitimate questions, theological disagreements, constructive criticism, and respectful opinions.

CRITICAL DISTINCTIONS:
- PERMITTED / CLEAN:
  * Genuine theological debate, doctrinal questions, skepticism.
  * Disagreeing with a sermon, program, or pastor's opinion politely or firmly.
  * Asking accountability questions about church funds or events.
  * Prayer requests, amens, testimonies, standard church greetings ("Mwari vave nemi", "Siyabonga Nkosi").
  * Negative opinions that are NOT abusive personal attacks.

- HARMFUL / RESTRICTED CATEGORIES:
  * "threat": Physical violence, death threats, arson, violence against pastors or congregants. (Severity: critical, Action: alert)
  * "hate_speech": Tribalism (e.g., Shona vs Ndebele slurs), xenophobia, racism, homophobic abuse. (Severity: high, Action: human_review or hide)
  * "religious_harassment": Malicious blasphemy intended to denigrate congregants, witchcraft threats, targeted harassment of faith. (Severity: high, Action: human_review)
  * "insult": Vulgar slander, direct defamatory character assassination ("mbavha", "uroyi", "isela", personal vulgar abuse). (Severity: medium, Action: flag or hide)
  * "scam": Fake miracle money promises, WhatsApp money doubling links, deceptive financial exploitation targeting believers. (Severity: high, Action: flag or hide)
  * "spam": Commercial advertising, bot links, crypto schemes, repeated unhelpful spam. (Severity: low, Action: flag)
  * "profanity": Obscene sexual anatomy, explicit vulgar cursing in English/Shona/Ndebele. (Severity: medium, Action: flag)
  * "clean": Safe, positive, respectful question, prayer, or benign criticism. (Severity: safe, Action: approve)

If you are uncertain about the cultural nuance or cannot decipher the language confidently, classify the category as "uncertain", severity as "medium", and recommendedAction as "human_review".

Output MUST be a single valid JSON object with these EXACT keys:
{
  "category": "threat" | "hate_speech" | "religious_harassment" | "insult" | "scam" | "spam" | "profanity" | "clean" | "uncertain",
  "confidence": <number between 0.00 and 1.00>,
  "severity": "safe" | "low" | "medium" | "high" | "critical",
  "recommendedAction": "approve" | "flag" | "hide" | "alert" | "human_review",
  "explanation": "<concise, objective explanation of reasoning and cultural/linguistic context>",
  "detectedLanguage": "en" | "sn" | "nd" | "mixed" | "other"
}
`;

/**
 * Analyzes a comment using OpenAI's contextual language model.
 */
export async function analyzeCommentWithAI(
  input: ModerationAnalysisInput
): Promise<ModerationAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the server.');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const openai = new OpenAI({ apiKey });

  const promptContent = `
PAGE: ${input.pageName || 'Church Official Page'}
POST CONTEXT: ${input.postContext || 'General church post'}
COMMENTER: ${input.commenterName || 'Facebook User'}
COMMENT TEXT: """${input.commentText}"""
`;

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.1, // Low temperature for deterministic, reliable evaluation
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: MODERATION_SYSTEM_PROMPT },
        { role: 'user', content: promptContent },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI moderation returned an empty response.');
    }

    const parsed = JSON.parse(content);

    // Validate and sanitize outputs
    const validSeverities: SeverityLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];
    const validActions: RecommendedAction[] = ['approve', 'flag', 'hide', 'alert', 'human_review'];

    const severity: SeverityLevel = validSeverities.includes(parsed.severity)
      ? parsed.severity
      : 'medium';

    const recommendedAction: RecommendedAction = validActions.includes(parsed.recommendedAction)
      ? parsed.recommendedAction
      : 'human_review';

    const confidenceScore = typeof parsed.confidence === 'number'
      ? Math.min(Math.max(parsed.confidence, 0.0), 1.0)
      : 0.5;

    return {
      detectedCategory: parsed.category || 'uncertain',
      confidenceScore: Number(confidenceScore.toFixed(3)),
      severity,
      recommendedAction,
      explanation: parsed.explanation || 'No explanation provided by AI analysis.',
      detectedLanguage: parsed.detectedLanguage || 'unknown',
      modelInfo: model,
      rawResponse: parsed,
    };
  } catch (err: any) {
    console.error('Failed to run AI comment moderation:', err);
    throw new Error(`AI moderation error: ${err.message}`);
  }
}
