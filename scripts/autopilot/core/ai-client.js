import { autopilotConfig, RESULT_STATES } from './config.js';

// Testing mock hook - allows phase2-test.js to test fallback & failover without real network calls
let _mockHandler = null;

/**
 * Set a mock handler for testing without network requests.
 * @param {Function|null} handler
 */
export function setMockHandler(handler) {
  _mockHandler = handler;
}

/**
 * Resolve Google Gemini API key with fallback to alias name
 * @returns {string}
 */
export function getGeminiApiKey() {
  return (process.env.GEMINI_API_KEY || process.env.GENDER_GEMINI_KEY || '').trim();
}

/**
 * Resolve Groq API key with fallback to alias name
 * @returns {string}
 */
export function getGroqApiKey() {
  return (process.env.GROQ_API_KEY || process.env.GENDER_GROQ_API_KEY || '').trim();
}

/**
 * Check provider credentials availability without logging or exposing secrets.
 * @returns {{ geminiAvailable: boolean, groqAvailable: boolean }}
 */
export function getProviderAvailability() {
  const geminiKey = getGeminiApiKey();
  const groqKey = getGroqApiKey();
  return {
    geminiAvailable: Boolean(geminiKey.length > 0),
    groqAvailable: Boolean(groqKey.length > 0),
  };
}

/**
 * Scrub API keys from error messages or URLs to prevent accidental credential leakage.
 * @param {string|Error} error
 * @returns {string}
 */
export function sanitizeErrorMessage(error) {
  const msg = error instanceof Error ? error.message : String(error || '');
  const geminiKey = getGeminiApiKey();
  const groqKey = getGroqApiKey();

  let sanitized = msg;
  if (geminiKey && geminiKey.length > 5) {
    sanitized = sanitized.replaceAll(geminiKey, '[REDACTED_GEMINI_KEY]');
  }
  if (groqKey && groqKey.length > 5) {
    sanitized = sanitized.replaceAll(groqKey, '[REDACTED_GROQ_KEY]');
  }
  // Generic patterns for Google API keys (AIza...) and Groq keys (gsk_...)
  sanitized = sanitized.replace(/AIza[0-9A-Za-z_\-]{30,}/g, '[REDACTED_API_KEY]');
  sanitized = sanitized.replace(/gsk_[a-zA-Z0-9_\-]{20,}/g, '[REDACTED_API_KEY]');
  // Generic pattern for Bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9_\-\.]{15,}/gi, 'Bearer [REDACTED]');
  return sanitized;
}

/**
 * Call Google Gemini API (Primary Provider)
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} params.systemInstruction
 * @param {string} [params.model]
 * @returns {Promise<{ success: boolean, rawText?: string, error?: string, model?: string }>}
 */
export async function callGemini({ prompt, systemInstruction, model = null, jsonMode = false }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { success: false, error: 'GEMINI_API_KEY environment variable is not configured' };
  }

  const selectedModel = model || autopilotConfig.ai.gemini.model;
  const apiVersion = autopilotConfig.ai.gemini.apiVersion || 'v1beta';
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${selectedModel}:generateContent`;

  try {
    const generationConfig = {
      temperature: 0.7,
      maxOutputTokens: 8192,
    };
    if (jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return {
        success: false,
        error: `Gemini API returned HTTP ${res.status}: ${sanitizeErrorMessage(errBody)}`,
        model: selectedModel,
      };
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text;

    if (!rawText) {
      // Surface the exact reason so the retry loop can log something actionable
      const finishReason = candidate?.finishReason || data.promptFeedback?.blockReason || 'UNKNOWN';
      const safetyInfo = candidate?.safetyRatings
        ? ` Safety ratings: ${candidate.safetyRatings.map((r) => `${r.category}=${r.probability}`).join(', ')}`
        : '';
      const blockReason = data.promptFeedback?.blockReason
        ? ` Prompt blocked: ${data.promptFeedback.blockReason}`
        : '';
      return {
        success: false,
        error: `Gemini returned no output text (finishReason: ${finishReason}).${blockReason}${safetyInfo} Prompt may be too long or violate safety filters.`,
        model: selectedModel,
        finishReason,
      };
    }

    return {
      success: true,
      rawText,
      model: selectedModel,
      usage: data.usageMetadata || null,
    };
  } catch (err) {
    return {
      success: false,
      error: `Gemini network/runtime error: ${sanitizeErrorMessage(err)}`,
      model: selectedModel,
    };
  }
}

/**
 * Call Groq API (Fallback Provider)
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} params.systemInstruction
 * @param {string} [params.model]
 * @returns {Promise<{ success: boolean, rawText?: string, error?: string, model?: string }>}
 */
export async function callGroq({ prompt, systemInstruction, model = null, jsonMode = false }) {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    return { success: false, error: 'GROQ_API_KEY environment variable is not configured' };
  }

  const selectedModel = model || autopilotConfig.ai.groq.model;
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  try {
    const payload = {
      model: selectedModel,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_completion_tokens: 8192,
    };
    if (jsonMode) {
      payload.response_format = { type: 'json_object' };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return {
        success: false,
        error: `Groq API returned HTTP ${res.status}: ${sanitizeErrorMessage(errBody)}`,
        model: selectedModel,
      };
    }

    const data = await res.json();
    const rawText = data.choices?.[0]?.message?.content;

    if (!rawText) {
      return {
        success: false,
        error: 'Groq API response did not contain message content',
        model: selectedModel,
      };
    }

    return {
      success: true,
      rawText,
      model: selectedModel,
      usage: data.usage || null,
    };
  } catch (err) {
    return {
      success: false,
      error: `Groq network/runtime error: ${sanitizeErrorMessage(err)}`,
      model: selectedModel,
    };
  }
}

/**
 * Generate article content with primary (Gemini) and fallback (Groq) failover.
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} params.systemInstruction
 * @param {boolean} [params.dryRun]
 * @returns {Promise<{
 *   success: boolean,
 *   rawText?: string,
 *   provider?: string,
 *   model?: string,
 *   errorState?: string,
 *   error?: string,
 *   fallbackUsed?: boolean
 * }>}
 */
export async function generateArticleContent({ prompt, systemInstruction, dryRun = false, jsonMode = false }) {
  // Safety rule: Dry-run must NEVER make API calls
  if (dryRun) {
    return {
      success: false,
      errorState: RESULT_STATES.DRY_RUN_COMPLETE,
      error: 'Dry-run mode active. No API calls permitted.',
    };
  }

  // If mock handler is registered (for automated unit testing), delegate to mock
  if (typeof _mockHandler === 'function') {
    const mockRes = await _mockHandler({ prompt, systemInstruction });
    return {
      provider: 'mock',
      model: 'test-model',
      ...mockRes,
    };
  }

  const { geminiAvailable, groqAvailable } = getProviderAvailability();

  if (!geminiAvailable && !groqAvailable) {
    return {
      success: false,
      errorState: RESULT_STATES.GENERATION_FAILED,
      error: 'Neither GEMINI_API_KEY nor GROQ_API_KEY is configured in environment variables.',
    };
  }

  // 1. Attempt Primary Provider: Google Gemini
  if (geminiAvailable) {
    const geminiResult = await callGemini({ prompt, systemInstruction, jsonMode });
    if (geminiResult.success && geminiResult.rawText) {
      return {
        success: true,
        rawText: geminiResult.rawText,
        provider: 'gemini',
        model: geminiResult.model,
        fallbackUsed: false,
      };
    }

    // Gemini failed; report and prepare fallback
    const geminiErr = geminiResult.error || 'Unknown Gemini error';

    // 2. Attempt Fallback Provider: Groq
    if (groqAvailable) {
      const groqResult = await callGroq({ prompt, systemInstruction, jsonMode });
      if (groqResult.success && groqResult.rawText) {
        return {
          success: true,
          rawText: groqResult.rawText,
          provider: 'groq',
          model: groqResult.model,
          fallbackUsed: true,
          primaryFailureReason: geminiErr,
        };
      }

      return {
        success: false,
        errorState: RESULT_STATES.GENERATION_FAILED,
        error: `Primary provider (Gemini) failed: ${geminiErr}. Fallback provider (Groq) also failed: ${groqResult.error}`,
      };
    }

    return {
      success: false,
      errorState: RESULT_STATES.GENERATION_FAILED,
      error: `Primary provider (Gemini) failed: ${geminiErr}. Groq fallback is not configured.`,
    };
  }

  // Gemini not available, but Groq is available
  if (groqAvailable) {
    const groqResult = await callGroq({ prompt, systemInstruction, jsonMode });
    if (groqResult.success && groqResult.rawText) {
      return {
        success: true,
        rawText: groqResult.rawText,
        provider: 'groq',
        model: groqResult.model,
        fallbackUsed: false,
      };
    }

    return {
      success: false,
      errorState: RESULT_STATES.GENERATION_FAILED,
      error: `Groq provider failed: ${groqResult.error}`,
    };
  }

  return {
    success: false,
    errorState: RESULT_STATES.GENERATION_FAILED,
    error: 'All configured AI providers failed.',
  };
}

export default {
  generateArticleContent,
  callGemini,
  callGroq,
  getProviderAvailability,
  sanitizeErrorMessage,
  setMockHandler,
};
