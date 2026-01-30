// Health check endpoint to verify API connections

const NODEBRAIN_BASE_URL = 'https://nodes.ivanovskii.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const gatewayKey = process.env.GATEWAY_API_KEY;
  const googleKey = process.env.GOOGLE_AI_API_KEY;

  const status = {
    gatewayKeyConfigured: !!gatewayKey,
    googleAIKeyConfigured: !!googleKey,
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
        status.availableTextModels = models.slice(0, 5).map(m => m.id);
      }
    } catch (error) {
      status.nodeBrainConnected = false;
      status.nodeBrainError = error.message;
    }
  }

  // Check Google AI connectivity
  if (googleKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${googleKey}`
      );
      status.googleAIConnected = response.ok;
      if (response.ok) {
        const data = await response.json();
        const imageModels = data.models?.filter(m => m.name.includes('imagen')) || [];
        status.imagenAvailable = imageModels.length > 0;
        status.imageModels = imageModels.map(m => m.name);
      }
    } catch (error) {
      status.googleAIConnected = false;
      status.googleAIError = error.message;
    }
  }

  status.imageGenerationReady = status.nodeBrainConnected && status.googleAIConnected && status.imagenAvailable;

  return res.status(200).json(status);
}
