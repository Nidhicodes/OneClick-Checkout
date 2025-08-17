import { NextRequest, NextResponse } from 'next/server';
import { AIImageGenerator } from '@/lib/ai-image-generator';

const imageGenerator = new AIImageGenerator(process.env.STABILITY_API_KEY!);

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log('[GENERATE-NFT-IMAGE] 🚀 Request received');

  try {
    // Check if API key is configured
    if (!process.env.STABILITY_API_KEY) {
      console.error('[GENERATE-NFT-IMAGE] ❌ STABILITY_API_KEY not configured');
      return NextResponse.json(
        { error: 'Stability AI API key not configured' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await req.json();
    console.log('[GENERATE-NFT-IMAGE] 📦 Request body:', body);
    
    const { productName, style, mood, signature } = body;

    // Validate required fields
    if (!productName) {
      console.error('[GENERATE-NFT-IMAGE] ❌ Missing productName in request');
      return NextResponse.json(
        { error: 'Product name is required' },
        { status: 400 }
      );
    }

    console.log('[GENERATE-NFT-IMAGE] 🎨 Generating image for:', {
      productName,
      style: style || 'futuristic',
      mood: mood || 'dark',
      signature: signature || 'none'
    });

    // Generate the image
    const generatedImage = await imageGenerator.generateImage({
      productName,
      style: style || 'futuristic',
      mood: mood || 'dark'
    });

    const processingTime = Date.now() - startTime;

    console.log(`[GENERATE-NFT-IMAGE] ✅ Image generated successfully in ${processingTime}ms`);
    console.log('[GENERATE-NFT-IMAGE] 🖼️ Generated image data:', {
      hasBase64: !!generatedImage.base64,
      hasDataUrl: !!generatedImage.dataUrl,
      promptLength: generatedImage.prompt?.length || 0,
      timestamp: generatedImage.timestamp
    });

    const response = {
      success: true,
      image: generatedImage,
      processingTimeMs: processingTime,
      metadata: {
        productName,
        style: style || 'futuristic',
        mood: mood || 'dark',
        signature: signature || null
      }
    };

    console.log('[GENERATE-NFT-IMAGE] 📤 Sending response:', {
      success: response.success,
      hasImage: !!response.image,
      processingTimeMs: response.processingTimeMs
    });

    return NextResponse.json(response);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('[GENERATE-NFT-IMAGE] 💥 Error:', error);
    
    // Log more details about the error
    if (error instanceof Error) {
      console.error('[GENERATE-NFT-IMAGE] 💥 Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.slice(0, 500) // First 500 chars of stack trace
      });
    }

    return NextResponse.json({
      error: 'Failed to generate image',
      message: (error as Error).message,
      processingTimeMs: processingTime
    }, { status: 500 });
  }
}