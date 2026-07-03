/**
 * llm_client.js — Unified LLM API client for automation scripts
 * Supports Gemini, OpenAI, and Anthropic Claude APIs.
 */

'use strict';

const https = require('https');

// Helper to make https POST requests
function makePostRequest(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          data
        });
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Gemini (Google AI Studio) ────────────────────────────────────────────────
async function callGemini(systemPrompt, userPrompt, model, apiKey) {
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY in your env.');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const bodyObj = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {}
  };

  if (systemPrompt) {
    bodyObj.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  // Auto-detect JSON request
  if (systemPrompt && systemPrompt.toLowerCase().includes('json')) {
    bodyObj.generationConfig.responseMimeType = 'application/json';
  }

  const body = JSON.stringify(bodyObj);
  const response = await makePostRequest(url, {}, body);

  let parsed;
  try {
    parsed = JSON.parse(response.data);
  } catch (err) {
    throw new Error(`Failed to parse Gemini response as JSON: ${err.message}\nRaw: ${response.data.slice(0, 300)}`);
  }

  if (response.statusCode !== 200 || parsed.error) {
    const msg = parsed.error ? parsed.error.message : response.statusMessage;
    throw new Error(`Gemini API Error (HTTP ${response.statusCode}): ${msg}`);
  }

  if (!parsed.candidates || parsed.candidates.length === 0) {
    throw new Error(`Gemini returned an empty candidates array: ${JSON.stringify(parsed)}`);
  }

  const text = parsed.candidates[0].content.parts[0].text;
  return text;
}

// ── OpenAI ───────────────────────────────────────────────────────────────────
async function callOpenAI(systemPrompt, userPrompt, model, apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Set OPENAI_API_KEY in your env.');
  }
  const url = 'https://api.openai.com/v1/chat/completions';

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  const bodyObj = {
    model: model,
    messages: messages,
    temperature: 0.7
  };

  // Auto-detect JSON request
  if (systemPrompt && systemPrompt.toLowerCase().includes('json')) {
    bodyObj.response_format = { type: 'json_object' };
  }

  const body = JSON.stringify(bodyObj);
  const headers = {
    'Authorization': `Bearer ${apiKey}`
  };
  const response = await makePostRequest(url, headers, body);

  let parsed;
  try {
    parsed = JSON.parse(response.data);
  } catch (err) {
    throw new Error(`Failed to parse OpenAI response as JSON: ${err.message}\nRaw: ${response.data.slice(0, 300)}`);
  }

  if (response.statusCode !== 200 || parsed.error) {
    const msg = parsed.error ? parsed.error.message : response.statusMessage;
    throw new Error(`OpenAI API Error (HTTP ${response.statusCode}): ${msg}`);
  }

  if (!parsed.choices || parsed.choices.length === 0) {
    throw new Error(`OpenAI returned empty choices array: ${JSON.stringify(parsed)}`);
  }

  const text = parsed.choices[0].message.content;
  return text;
}

// ── Anthropic Claude ──────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userPrompt, model, apiKey) {
  if (!apiKey) {
    throw new Error('Anthropic API key is not configured. Set ANTHROPIC_API_KEY in your env.');
  }
  const url = 'https://api.anthropic.com/v1/messages';

  const bodyObj = {
    model: model,
    max_tokens: 8000,
    messages: [{ role: 'user', content: userPrompt }]
  };

  if (systemPrompt) {
    bodyObj.system = systemPrompt;
  }

  const body = JSON.stringify(bodyObj);
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };
  const response = await makePostRequest(url, headers, body);

  let parsed;
  try {
    parsed = JSON.parse(response.data);
  } catch (err) {
    throw new Error(`Failed to parse Anthropic response as JSON: ${err.message}\nRaw: ${response.data.slice(0, 300)}`);
  }

  if (response.statusCode !== 200 || parsed.error) {
    const msg = parsed.error ? parsed.error.message : response.statusMessage;
    throw new Error(`Anthropic API Error (HTTP ${response.statusCode}): ${msg}`);
  }

  if (!parsed.content || parsed.content.length === 0) {
    throw new Error(`Anthropic returned empty content array: ${JSON.stringify(parsed)}`);
  }

  const text = parsed.content[0].text;
  return text;
}

// ── Unified LLM Entrypoint ────────────────────────────────────────────────────
async function callLLM(systemPrompt, userPrompt, options = {}) {
  // Read config from environment variables
  let provider = process.env.LLM_PROVIDER || options.provider;

  // Auto-detect provider if not explicitly configured
  if (!provider) {
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      provider = 'gemini';
    } else if (process.env.OPENAI_API_KEY) {
      provider = 'openai';
    } else if (process.env.ANTHROPIC_API_KEY) {
      provider = 'anthropic';
    } else {
      throw new Error(
        'No LLM provider keys set in process.env. Please configure GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in your .env file.'
      );
    }
  }

  provider = provider.toLowerCase();

  if (provider === 'gemini') {
    const model = process.env.GEMINI_MODEL || options.geminiModel || 'gemini-2.5-flash';
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    console.log(`🤖 [LLM] Using Gemini API (model: ${model})`);
    return callGemini(systemPrompt, userPrompt, model, key);
  }

  if (provider === 'openai') {
    const model = process.env.OPENAI_MODEL || options.openaiModel || 'gpt-4o';
    const key = process.env.OPENAI_API_KEY;
    console.log(`🤖 [LLM] Using OpenAI API (model: ${model})`);
    return callOpenAI(systemPrompt, userPrompt, model, key);
  }

  if (provider === 'anthropic') {
    const model = process.env.ANTHROPIC_MODEL || options.anthropicModel || 'claude-3-5-sonnet-20241022';
    const key = process.env.ANTHROPIC_API_KEY;
    console.log(`🤖 [LLM] Using Anthropic API (model: ${model})`);
    return callClaude(systemPrompt, userPrompt, model, key);
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}

module.exports = {
  callLLM,
  callGemini,
  callOpenAI,
  callClaude
};
