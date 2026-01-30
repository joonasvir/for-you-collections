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
            content: `You are an expert at creating image generation prompts for Imagen 3. Given a topic, create a detailed, evocative prompt. Be specific about composition, lighting, mood, colors, and details. Keep it under 100 words. Do not include any markdown, links, citations, or explanations - output ONLY the pure prompt text. Style: ${styleContext}`
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

    // Step 2: If generateImage is true and we have Google AI key, generate the image
    if (generateImage && googleKey) {
      try {
        // Use Imagen 4 via Gemini API
        const imagenResponse = await fetch(
          `${GOOGLE_AI_URL}/models/imagen-4.0-generate-001:predict?key=${googleKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              instances: [
                {
                  prompt: imagePrompt
                }
              ],
              parameters: {
                sampleCount: 1,
                aspectRatio: '3:4',
                personGeneration: 'allow_adult'
              }
            })
          }
        );

        if (imagenResponse.ok) {
          const imagenData = await imagenResponse.json();

          if (imagenData.predictions && imagenData.predictions.length > 0) {
            // Imagen returns base64 encoded images
            const base64Image = imagenData.predictions[0].bytesBase64Encoded;
            const mimeType = imagenData.predictions[0].mimeType || 'image/png';

            return res.status(200).json({
              success: true,
              imagePrompt: imagePrompt,
              imageData: `data:${mimeType};base64,${base64Image}`,
              style: style,
              originalTopic: prompt
            });
          }
        } else {
          const errorData = await imagenResponse.json().catch(() => ({}));
          console.error('Imagen error:', JSON.stringify(errorData));

          // Fall back to just returning the prompt
          return res.status(200).json({
            success: true,
            imagePrompt: imagePrompt,
            imageError: errorData.error?.message || 'Failed to generate image',
            style: style,
            originalTopic: prompt
          });
        }
      } catch (imgError) {
        console.error('Image generation error:', imgError);
        return res.status(200).json({
          success: true,
          imagePrompt: imagePrompt,
          imageError: imgError.message,
          style: style,
          originalTopic: prompt
        });
      }
    }

    // Return just the prompt if not generating image
    return res.status(200).json({
      success: true,
      imagePrompt: imagePrompt,
      style: style,
      originalTopic: prompt,
      imageGenerationAvailable: !!googleKey
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
