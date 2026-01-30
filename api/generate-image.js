// Vercel Serverless Function for image generation
// Environment variables: GATEWAY_API_KEY, REPLICATE_API_TOKEN

const NODEBRAIN_BASE_URL = 'https://nodes.ivanovskii.com';
const REPLICATE_API_URL = 'https://api.replicate.com/v1';

// Style prompts for different visual styles
const stylePrompts = {
  photo: 'Editorial photography style, natural lighting, shallow depth of field, magazine quality, atmospheric and evocative, 4K, high resolution',
  illustration: 'Hand-painted gouache illustration with visible brushstrokes, soft painterly style inspired by Studio Ghibli, warm atmospheric lighting, dreamy and whimsical, artistic',
  '3d': 'Cinema 4D style 3D render, soft lighting, pastel colors, abstract geometric shapes, clean minimalist composition, octane render quality, isometric view',
  minimal: 'Minimalist graphic design, solid color blocks, simple geometric shapes, clean composition, Bauhaus inspired, modern aesthetic'
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
  const replicateKey = process.env.REPLICATE_API_TOKEN;

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
            content: `You are an expert at creating image generation prompts for Flux AI. Given a topic, create a detailed, evocative prompt. Be specific about composition, lighting, mood, colors, and details. Keep it under 150 words. Do not include any markdown, links, or citations - just the pure prompt text. Style: ${styleContext}`
          },
          {
            role: 'user',
            content: `Create an image prompt for: "${prompt}"`
          }
        ],
        model: 'gemini-3-flash',
        temperature: 0.8,
        maxOutputTokens: 250
      })
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error('nodeBrain error:', errorText);
      return res.status(llmResponse.status).json({ error: 'Failed to generate prompt', details: errorText });
    }

    const llmData = await llmResponse.json();
    const imagePrompt = llmData.content;

    // Step 2: If generateImage is true and we have Replicate key, generate the image
    if (generateImage && replicateKey) {
      try {
        // Start Flux generation
        const fluxResponse = await fetch(`${REPLICATE_API_URL}/models/black-forest-labs/flux-schnell/predictions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${replicateKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait'  // Wait for result (up to 60s)
          },
          body: JSON.stringify({
            input: {
              prompt: imagePrompt,
              go_fast: true,
              num_outputs: 1,
              aspect_ratio: '3:4',
              output_format: 'webp',
              output_quality: 80
            }
          })
        });

        if (fluxResponse.ok) {
          const fluxData = await fluxResponse.json();

          // Check if we got the output directly (with Prefer: wait)
          if (fluxData.output && fluxData.output.length > 0) {
            return res.status(200).json({
              success: true,
              imagePrompt: imagePrompt,
              imageUrl: fluxData.output[0],
              style: style,
              originalTopic: prompt
            });
          }

          // If prediction is still processing, return the prediction ID
          return res.status(200).json({
            success: true,
            imagePrompt: imagePrompt,
            predictionId: fluxData.id,
            status: fluxData.status,
            style: style,
            originalTopic: prompt
          });
        } else {
          const errorText = await fluxResponse.text();
          console.error('Replicate error:', errorText);
          // Fall back to just returning the prompt
          return res.status(200).json({
            success: true,
            imagePrompt: imagePrompt,
            imageError: 'Failed to generate image',
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
      imageGenerationAvailable: !!replicateKey
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
