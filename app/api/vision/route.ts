import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const VISION_PROMPT = `You generate clear, detailed descriptions of what's visible in a camera image for a voice agent.
Be specific and descriptive.
Transcribe all visible text, code, or handwritten content exactly as it appears.
Mention notable objects, people, screens, diagrams, product labels, and relevant details.
Use 1–3 sentences.
Do not mention photos, images, or cameras—just describe what is present.

Examples:
"A person holds a book titled 'Clean Code' by Robert Martin. The cover says: 'A Handbook of Agile Software Craftsmanship.'"
"A whiteboard with handwritten text: 'E = mc^2' and a diagram of an atom."
"Three people sit at a table. Two use MacBook laptops; one holds a coffee cup."

No opinions or commentary—only clear, factual, and descriptive summaries.`;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash-lite",
  generationConfig: {
    maxOutputTokens: 150,
    temperature: 0.2,
    topP: 0.8,
  }
});

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 3000;

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

    const { imageBase64, userPrompt } = await request.json();

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Image data is required" },
        { status: 400 }
      );
    }

    lastRequestTime = now;

    const prompt = userPrompt || VISION_PROMPT;

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