// Health check endpoint to verify API connection

const NODEBRAIN_BASE_URL = 'https://nodes.ivanovskii.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.GATEWAY_API_KEY;

  const status = {
    apiKeyConfigured: !!apiKey,
    nodeBrainUrl: NODEBRAIN_BASE_URL,
    timestamp: new Date().toISOString()
  };

  // Optionally check nodeBrain connectivity
  if (apiKey) {
    try {
      const response = await fetch(`${NODEBRAIN_BASE_URL}/api/gateway/llm/models`, {
        headers: { 'X-API-Key': apiKey }
      });
      status.nodeBrainConnected = response.ok;
      if (response.ok) {
        const models = await response.json();
        status.availableModels = models.map(m => m.id);
      }
    } catch (error) {
      status.nodeBrainConnected = false;
      status.error = error.message;
    }
  }

  return res.status(200).json(status);
}
