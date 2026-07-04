// Minimal OpenAI key validation for the Integrations panel's "Connect"
// flow (see lib/apiKeys.js). Plain fetch rather than the `openai` SDK
// already in package.json -- validating a key is a single GET, not worth
// pulling the SDK into this path (it's still used elsewhere for Pinecone
// embeddings via lib/commerce/*).

export async function testOpenAIKey(apiKey) {
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, message: data?.error?.message || `OpenAI rejected this key (${res.status}).` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}
