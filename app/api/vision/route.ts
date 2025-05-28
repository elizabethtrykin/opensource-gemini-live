import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash-lite",
  generationConfig: {
    maxOutputTokens: 80,
    temperature: 0.2,
    topP: 0.8,
  }
});

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 5000;

export async function POST(request: NextRequest) {
  try {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      return NextResponse.json(
        { 
          error: "Rate limited", 
          retryAfter: Math.ceil(waitTime / 1000),
          message: `Please wait ${Math.ceil(waitTime / 1000)} seconds before next request`
        },
        { status: 429 }
      );
    }

    const { imageBase64, userPrompt, context } = await request.json();

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Image data is required" },
        { status: 400 }
      );
    }

    lastRequestTime = now;

    let prompt = "Describe what you see briefly for a voice conversation (max 30 words).";
    
    if (userPrompt) {
      prompt = `User asks: "${userPrompt}". Describe what you see in 40 words or less.`;
    } else if (context) {
      if (context.includes('person')) {
        prompt = "What is the person doing now? Focus on actions and objects. 30 words max.";
      } else if (context.includes('document') || context.includes('text')) {
        prompt = "Describe any text or document content visible. 35 words max.";
      }
    }

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg"
        }
      }
    ]);

    const description = result.response.text();

    return NextResponse.json({
      description,
      timestamp: Date.now(),
      success: true
    });

  } catch (error: any) {
    console.error('Vision API error:', error);
    
    if (error.status === 429) {
      return NextResponse.json(
        { 
          error: "API quota exceeded", 
          retryAfter: 60,
          message: "Gemini API quota exceeded. Please wait 60 seconds.",
          details: "Consider upgrading your API plan for higher limits"
        },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to process image", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
} 