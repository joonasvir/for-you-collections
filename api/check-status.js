// Health check endpoint to verify API connections

const NODEBRAIN_BASE_URL = 'https://nodes.ivanovskii.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const gatewayKey = process.env.GATEWAY_API_KEY;
  const replicateKey = process.env.REPLICATE_API_TOKEN;

  const status = {
    gatewayKeyConfigured: !!gatewayKey,
    replicateKeyConfigured: !!replicateKey,
    nodeBrainUrl: NODEBRAIN_BASE_URL,
    timestamp: new Date().toISOString()
  };

  // Check nodeBrain connectivity
  if (gatewayKey) {
    try {
      const response = await fetch(`${NODEBRAIN_BASE_URL}/api/gateway/llm/models`, {
        headers: { 'X-API-Key': gatewayKey }
      });
      status.nodeBrainConnected = response.ok;
      if (response.ok) {
        const models = await response.json();
        status.availableModels = models.map(m => m.id);
      }
    } catch (error) {
      status.nodeBrainConnected = false;
      status.nodeBrainError = error.message;
    }
  }

  // Check Replicate connectivity
  if (replicateKey) {
    try {
      const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell', {
        headers: { 'Authorization': `Bearer ${replicateKey}` }
      });
      status.replicateConnected = response.ok;
      if (response.ok) {
        const model = await response.json();
        status.fluxModel = model.latest_version?.id ? 'available' : 'not found';
      }
    } catch (error) {
      status.replicateConnected = false;
      status.replicateError = error.message;
    }
  }

  status.imageGenerationReady = status.nodeBrainConnected && status.replicateConnected;

  return res.status(200).json(status);
}
