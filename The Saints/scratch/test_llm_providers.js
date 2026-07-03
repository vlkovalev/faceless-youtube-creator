/**
 * test_llm_providers.js — Verifies LLM providers implementation.
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Load environment variables from the main .env
const envPath = path.join(__dirname, '..', 'automation', 'credentials', '.env');
require('dotenv').config({ path: envPath });

console.log('Loaded env from:', envPath);
console.log('Available environment variables:');
console.log('  GEMINI_API_KEY  :', process.env.GEMINI_API_KEY ? '***SET***' : 'not set');
console.log('  OPENAI_API_KEY  :', process.env.OPENAI_API_KEY ? '***SET***' : 'not set');
console.log('  ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '***SET***' : 'not set');
console.log('  LLM_PROVIDER    :', process.env.LLM_PROVIDER || 'auto-detect');

const { callLLM } = require('../automation/tools/llm_client');

async function testProvider(providerName) {
  console.log(`\n--- Testing Provider: ${providerName || 'AUTO'} ---`);
  try {
    const systemPrompt = 'You are a helpful assistant. If the user asks for JSON, respond in valid JSON format: {"response": "text"}.';
    const userPrompt = 'Please respond with a single short word: Hello.';
    
    // Override provider via env variable temporarily
    if (providerName) {
      process.env.LLM_PROVIDER = providerName;
    } else {
      delete process.env.LLM_PROVIDER;
    }

    const start = Date.now();
    const result = await callLLM(systemPrompt, userPrompt);
    console.log(`Response time: ${Date.now() - start}ms`);
    console.log('Raw output:');
    console.log(result);
  } catch (err) {
    console.error('❌ Error during test:', err.message);
  }
}

async function run() {
  // Test auto-detect (which will pick the first available provider)
  await testProvider();

  // Test explicit overrides if keys are configured
  if (process.env.GEMINI_API_KEY) {
    await testProvider('gemini');
  }
  if (process.env.OPENAI_API_KEY) {
    await testProvider('openai');
  }
  if (process.env.ANTHROPIC_API_KEY) {
    await testProvider('anthropic');
  }
}

run().catch(err => console.error('Fatal:', err));
