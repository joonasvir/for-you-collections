# nodeBrain Public API

**Single reference for LLM generation and prompt fetching.** nodeBrain is a centralized LLM gateway and prompt management system. This document explains how to call the APIs: chat/complete, streaming, models, and fetching prompts from Langfuse.

*This file is the only doc the developer gets. Everything they need is below.*

## Base URL

| API URL |
|---------|
| `https://nodes.ivanovskii.com` |

## API Types

nodeBrain has three types of API endpoints:

| Type | Path | Auth | Use Case |
|------|------|------|----------|
| **Public** | `/api/public/*` | None (CORS only) | Same-origin / browser |
| **Gateway** | `/api/gateway/*` | API Key | External services, scripts |
| **Authenticated** | `/api/*` | Session | nodeBrain frontend |

---

## Quick Start

### For TypeScript / JavaScript

Use a `NodeBrainClient` (see **TypeScript SDK Reference** below) or call the HTTP endpoints directly. Example with client:

```typescript
import { NodeBrainClient } from '@nodebrain/client'; // or your project's path to the client

const client = new NodeBrainClient({
  baseUrl: 'https://nodes.ivanovskii.com',
  apiKey: 'your-key'   // required for gateway; omit for public
});

// Simple completion
const answer = await client.complete('What is 2+2?');

// Streaming
await client.stream('Tell me a joke', (chunk) => {
  console.log(chunk);
});

// Get prompt from Langfuse
const prompt = await client.getPrompt('CHAT_CREATE_PROMPT');
```

### For External Services (Python, etc.)

Use the Gateway API with an API key:

```python
import requests

BASE_URL = "https://nodes.ivanovskii.com"
API_KEY = "your-api-key"

headers = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY
}

# LLM completion
response = requests.post(
    f"{BASE_URL}/api/gateway/llm/chat/complete",
    headers=headers,
    json={
        "messages": [{"role": "user", "content": "Hello!"}],
        "model": "gemini-3-flash"
    }
)
print(response.json()["content"])

# Get prompt
response = requests.get(
    f"{BASE_URL}/api/gateway/llm/prompt/CHAT_CREATE_PROMPT",
    headers=headers
)
print(response.json()["prompt"])
```

---

## LLM Endpoints

### POST `/api/public/llm/chat` (or `/api/gateway/llm/chat`)

Streaming chat completion via SSE.

**Request:**
```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant" },
    { "role": "user", "content": "Hello!" }
  ],
  "model": "gemini-3-flash",
  "temperature": 0.7,
  "maxOutputTokens": 4096,
  "systemPrompt": "Be concise",
  "enableWebSearch": false
}
```

**Response:** Server-Sent Events (SSE) stream

```
data: {"choices":[{"delta":{"content":"Hello"}}]}

data: {"choices":[{"delta":{"content":"!"}}]}

data: [DONE]
```

### POST `/api/public/llm/chat/complete` (or `/api/gateway/llm/chat/complete`)

Non-streaming chat completion.

**Request:** Same as `/chat`

**Response:**
```json
{
  "content": "Hello! How can I help you today?",
  "usage": {
    "promptTokens": 10,
    "completionTokens": 8,
    "totalTokens": 18
  },
  "model": "gemini-3-flash"
}
```

### GET `/api/public/llm/models`

List available models.

**Response:**
```json
[
  {
    "id": "gemini-3-flash",
    "name": "Gemini 3 Flash",
    "provider": "google",
    "supportsVision": true,
    "supportsTools": true,
    "contextWindow": 1000000
  },
  ...
]
```

### GET `/api/public/llm/status`

Get LLM provider status.

**Response:**
```json
{
  "openrouter": true,
  "openai": false,
  "vertexAi": false,
  "primary": "openrouter"
}
```

---

## Prompt Endpoints

Prompts are stored in Langfuse; nodeBrain fetches and serves them via the API.

### How to use prompts

1. **Get the list of available prompts**  
   Call `GET /api/public/llm/catalog` (or `/api/gateway/llm/catalog` with API key).  
   Response: `{ "prompts": [ { "name", "summary" }, ... ] }` — every prompt’s name and a short description.

2. **Request a specific prompt from Langfuse**  
   Call `GET /api/public/llm/prompt/:promptName` (or gateway equivalent).  
   Pass a **prompt identifier** that the server supports. You can discover what’s available from the catalog response; typical identifiers include: `CHAT_INTRO_PROMPT`, `CHAT_CREATE_PROMPT`, `CHAT_EDIT_PROMPT`, `APP_RECOMMENDATIONS_PROMPT`, `HINTS_PROMPT`, `FOR_YOU_PROMPT`, `FOR_YOU_EMPTY_PROMPT`, `POWERUP_SUGGESTIONS_PROMPT`, `POWERUP_EMPTY_PROMPT`, `EDIT_SUGGESTIONS_PROMPT`, `INTEGRATION_DETECTION_PROMPT`. The exact set depends on your deployment.

To fetch several prompts in one request, use `POST /api/public/llm/prompts` with `{ "promptNames": ["...", "..."] }`.

---

### GET `/api/public/llm/catalog` (or `/api/gateway/llm/catalog`)

Returns the full list of Langfuse prompts (name + summary).

**Response:**
```json
{
  "prompts": [
    { "name": "chat/create", "summary": "System prompt for \"create new app\" flow." },
    { "name": "chat/capability_taxonomy", "summary": "Defines taxonomy of app capabilities for classification." }
  ]
}
```

- **name** – Langfuse name (path or display name).
- **summary** – Short description of what the prompt does.

### GET `/api/public/llm/prompt/:promptName` (or `/api/gateway/llm/prompt/:promptName`)

Returns the prompt text for one prompt. `promptName` must be a prompt identifier supported by your deployment (see **How to use prompts** above for examples).

**Example:** `GET /api/public/llm/prompt/CHAT_CREATE_PROMPT`

**Response:**
```json
{
  "prompt": "You are a helpful assistant that creates apps...",
  "name": "CHAT_CREATE_PROMPT"
}
```

**Errors:** `404` – prompt not found; `503` – Langfuse not configured.

### POST `/api/public/llm/prompts` (or `/api/gateway/llm/prompts`)

Get multiple prompts at once (batched).

**Request:**
```json
{
  "promptNames": ["CHAT_CREATE_PROMPT", "HINTS_PROMPT"]
}
```

**Response:**
```json
{
  "prompts": {
    "CHAT_CREATE_PROMPT": "You are a helpful assistant...",
    "HINTS_PROMPT": "Generate suggestions for..."
  }
}
```

---

## Available Models

Common models available via nodeBrain:

| Model ID | Provider | Best For |
|----------|----------|----------|
| `gemini-3-flash` | Google | Fast, cheap, general use |
| `gemini-3-pro` | Google | Complex reasoning |
| `claude-sonnet-4` | Anthropic | Coding, analysis |
| `claude-opus-4` | Anthropic | Complex tasks |
| `gpt-4o` | OpenAI | General purpose |
| `gpt-4o-mini` | OpenAI | Fast, cheap |
| `deepseek-chat` | DeepSeek | Coding |
| `llama-3.3-70b` | Meta | Open source |

Use `GET /api/public/llm/models` for the full list.

---

## Gateway Authentication

For `/api/gateway/*` you need an API key (provided by the service operator). Send it as follows:

### Sending the API Key

Three methods (in order of preference):

1. **Header (recommended):**
   ```
   X-API-Key: your-api-key
   ```

2. **Bearer token:**
   ```
   Authorization: Bearer your-api-key
   ```

3. **Query parameter (testing only):**
   ```
   /api/gateway/llm/chat?api_key=your-api-key
   ```

---

## TypeScript SDK Reference

If your project includes a nodeBrain client package, `import { NodeBrainClient } from '@nodebrain/client'`. Otherwise call the HTTP endpoints in this doc with `fetch`.

### NodeBrainClient Class

```typescript
import { NodeBrainClient } from '@nodebrain/client';

const client = new NodeBrainClient({
  baseUrl: 'https://nodes.ivanovskii.com',
  apiKey: 'your-key',           // for gateway; omit for public
  promptReloadMode: 'never',    // 'never' | 'always' | 'time-based'
  promptCacheTimeout: 3600000,  // 1 hour
});

// LLM methods
await client.complete(prompt, config?);
await client.stream(prompt, onChunk, config?);
await client.chat(messages, config?);
await client.chatStream(messages, onChunk, config?);
await client.getModels();
await client.getProviderStatus();

// Prompt methods
await client.getPrompt(name);
await client.getPrompts(names);
client.registerPromptFallbacks({ NAME: 'fallback text' });
client.clearPromptCache();
```

### Standalone Functions

```typescript
import { 
  stream, 
  complete, 
  streamChat, 
  completeChat,
  getPrompt,
  parseJsonFromResponse 
} from '@nodebrain/client';

// Simple streaming
const text = await stream(
  'Hello!',
  { model: 'gemini-3-flash' },
  (chunk) => process.stdout.write(chunk)
);

// Parse JSON from LLM response
const data = parseJsonFromResponse<MyType>(response);
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request (missing/invalid params) |
| `401` | Unauthorized (missing API key) |
| `403` | Forbidden (invalid API key) |
| `404` | Not found (prompt not found) |
| `500` | Server error |
| `503` | Service unavailable (Langfuse not configured) |

---

## Example: Full Integration

```typescript
import { NodeBrainClient, parseJsonFromResponse } from '@nodebrain/client';

const client = new NodeBrainClient({
  baseUrl: 'https://nodes.ivanovskii.com',
  apiKey: 'your-key'
});

// Optional: fallbacks if the prompt service is unavailable
client.registerPromptFallbacks({
  CHAT_CREATE_PROMPT: 'You are a helpful assistant...',
});

async function generateSuggestions(userInput: string): Promise<string[]> {
  // Get prompt from Langfuse
  const systemPrompt = await client.getPrompt('HINTS_PROMPT');
  
  // Stream response
  let response = '';
  await client.chatStream(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput }
    ],
    (chunk) => {
      response += chunk;
      console.log(chunk); // Live output
    },
    { model: 'gemini-3-flash', temperature: 0.8 }
  );
  
  // Parse JSON from response
  return parseJsonFromResponse<string[]>(response) || [];
}
```

