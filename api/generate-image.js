// Vercel Serverless Function for image generation via nodeBrain
// Environment variable: NODEBRAIN_API_KEY

const NODEBRAIN_BASE_URL = 'https://nodes.ivanovskii.com';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.NODEBRAIN_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { prompt, style } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Build the image generation prompt based on style
    const stylePrompts = {
      photo: 'Editorial photography style, natural lighting, shallow depth of field, magazine quality, atmospheric and evocative.',
      illustration: 'Hand-painted gouache illustration with visible brushstrokes, soft painterly style inspired by Studio Ghibli, warm atmospheric lighting, dreamy and whimsical.',
      '3d': 'Cinema 4D style 3D render, soft lighting, pastel colors, abstract geometric shapes, clean minimalist composition, octane render quality.',
      minimal: 'Minimalist graphic design, solid color blocks, simple geometric shapes, bold typography integration, Bauhaus inspired.'
    };

    const styleContext = stylePrompts[style] || stylePrompts.photo;

    // Use nodeBrain to generate an enhanced image prompt
    const response = await fetch(`${NODEBRAIN_BASE_URL}/api/gateway/llm/chat/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are an expert at creating image generation prompts. Given a topic and style, create a detailed, evocative prompt for generating a beautiful image. Be specific about composition, lighting, mood, and details. Keep the prompt under 200 words. Style context: ${styleContext}`
          },
          {
            role: 'user',
            content: `Create an image prompt for: "${prompt}"`
          }
        ],
        model: 'gemini-3-flash',
        temperature: 0.8,
        maxOutputTokens: 300
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('nodeBrain error:', errorText);
      return res.status(response.status).json({ error: 'Failed to generate prompt', details: errorText });
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      imagePrompt: data.content,
      style: style,
      originalTopic: prompt
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
