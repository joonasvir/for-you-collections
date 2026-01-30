// Vercel Serverless Function for image generation
// Environment variables: GATEWAY_API_KEY, GOOGLE_AI_API_KEY

const NODEBRAIN_BASE_URL = 'https://nodes.ivanovskii.com';
const GOOGLE_AI_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Style prompts for different visual styles
const stylePrompts = {
  photo: 'Editorial photography style, natural lighting, shallow depth of field, magazine quality, atmospheric and evocative, 4K, high resolution, professional photograph',
  illustration: 'Hand-painted gouache illustration with visible brushstrokes, soft painterly style inspired by Studio Ghibli, warm atmospheric lighting, dreamy and whimsical, artistic illustration',
  '3d': 'Cinema 4D style 3D render, soft lighting, pastel colors, abstract geometric shapes, clean minimalist composition, octane render quality, isometric 3D art',
  minimal: 'Minimalist graphic design, solid color blocks, simple geometric shapes, clean composition, Bauhaus inspired, modern flat design aesthetic'
};

// Generate image using ByteDance Seedream 4.5 via nodeBrain
async function generateByteDanceImage(prompt, gatewayKey) {
  try {
    const response = await fetch(`${NODEBRAIN_BASE_URL}/api/gateway/image/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': gatewayKey
      },
      body: JSON.stringify({
        prompt: prompt,
        model: 'bytedance_v4_5_create',
        ratio: 'portrait',
        size: 'M',
        num_images: 1
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.images && data.images.length > 0) {
        return { success: true, imageUrl: data.images[0].url };
      }
    }
    const errorData = await response.json().catch(() => ({}));
    return { success: false, error: errorData.error || 'ByteDance generation failed' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Generate image using Google Imagen 4
async function generateGeminiImage(prompt, googleKey) {
  try {
    const response = await fetch(
      `${GOOGLE_AI_URL}/models/imagen-4.0-generate-001:predict?key=${googleKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instances: [{ prompt: prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '3:4',
            personGeneration: 'allow_adult'
          }
        })
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.predictions && data.predictions.length > 0) {
        const base64Image = data.predictions[0].bytesBase64Encoded;
        const mimeType = data.predictions[0].mimeType || 'image/png';
        return { success: true, imageData: `data:${mimeType};base64,${base64Image}` };
      }
    }
    const errorData = await response.json().catch(() => ({}));
    return { success: false, error: errorData.error?.message || 'Gemini generation failed' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

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

  const gatewayKey = process.env.GATEWAY_API_KEY;
  const googleKey = process.env.GOOGLE_AI_API_KEY;

  if (!gatewayKey) {
    return res.status(500).json({ error: 'Gateway API key not configured' });
  }

  try {
    const { prompt, style, generateImage = false } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const styleContext = stylePrompts[style] || stylePrompts.photo;

    // Step 1: Use nodeBrain to generate an enhanced image prompt
    const llmResponse = await fetch(`${NODEBRAIN_BASE_URL}/api/gateway/llm/chat/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': gatewayKey
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are an expert at creating image generation prompts. Given a topic, create a detailed, evocative prompt. Be specific about composition, lighting, mood, colors, and details. Keep it under 100 words. Do not include any markdown, links, citations, or explanations - output ONLY the pure prompt text. Style: ${styleContext}`
          },
          {
            role: 'user',
            content: `Create an image prompt for: "${prompt}"`
          }
        ],
        model: 'gemini-3-flash',
        temperature: 0.8,
        maxOutputTokens: 200
      })
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error('nodeBrain error:', errorText);
      return res.status(llmResponse.status).json({ error: 'Failed to generate prompt', details: errorText });
    }

    const llmData = await llmResponse.json();
    const imagePrompt = llmData.content;

    // Step 2: If generateImage is true, generate from BOTH models simultaneously
    if (generateImage) {
      const results = {
        success: true,
        imagePrompt: imagePrompt,
        style: style,
        originalTopic: prompt,
        gemini: null,
        bytedance: null
      };

      // Run both image generations in parallel
      const [geminiResult, bytedanceResult] = await Promise.all([
        googleKey ? generateGeminiImage(imagePrompt, googleKey) : Promise.resolve({ success: false, error: 'No Google API key' }),
        generateByteDanceImage(imagePrompt, gatewayKey)
      ]);

      // Store Gemini result
      if (geminiResult.success) {
        results.gemini = { imageData: geminiResult.imageData };
      } else {
        results.gemini = { error: geminiResult.error };
      }

      // Store ByteDance result
      if (bytedanceResult.success) {
        results.bytedance = { imageUrl: bytedanceResult.imageUrl };
      } else {
        results.bytedance = { error: bytedanceResult.error };
      }

      // For backwards compatibility, set imageData to Gemini if available
      if (geminiResult.success) {
        results.imageData = geminiResult.imageData;
      } else if (bytedanceResult.success) {
        results.imageData = bytedanceResult.imageUrl;
      }

      return res.status(200).json(results);
    }

    // Return just the prompt if not generating image
    return res.status(200).json({
      success: true,
      imagePrompt: imagePrompt,
      style: style,
      originalTopic: prompt,
      imageGenerationAvailable: !!googleKey || !!gatewayKey
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
