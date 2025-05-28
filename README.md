This is a **Gemini Live Clone** - a [Next.js](https://nextjs.org) project that combines real-time voice AI with computer vision capabilities, similar to Google's Gemini Live feature.

## Features

- 🎥 **Real-time camera capture** from user's webcam
- 🗣️ **Voice conversations** using Vapi AI
- 👁️ **Computer vision analysis** using Google Gemini 2.0 Flash
- 🔄 **Multimodal AI interaction** - the AI can see what you're showing and talk about it

## Setup

### 1. Environment Variables

Create a `.env.local` file in the root directory with:

```env
# Vapi AI Configuration
NEXT_PUBLIC_VAPI_PUBLIC_KEY=your_vapi_public_key_here
NEXT_PUBLIC_VAPI_ASSISTANT_ID=your_vapi_assistant_id_here

# Google Gemini API Configuration (server-side only for security)
GOOGLE_API_KEY=your_google_gemini_api_key_here
```

### 2. Get API Keys

- **Vapi AI**: Sign up at [vapi.ai](https://vapi.ai) and get your public key and assistant ID
- **Google Gemini**: Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### 3. Install Dependencies

```bash
npm install
```

## Getting Started

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## How to Use

1. **Allow camera access** when prompted by your browser
2. **Click "Start Voice"** to begin the voice conversation with the AI
3. **Click "Analyze Frame"** to manually ask the AI what it sees in your camera
4. **Talk naturally** - the AI will automatically see what you're showing and can discuss it

The AI will automatically analyze your camera feed every few seconds and use that visual context in your conversation.

## Technical Details

- **Camera capture**: 320x240 resolution at ~1 FPS for vision analysis
- **Vision processing**: Google Gemini 2.0 Flash with smart throttling to avoid rate limits
- **Voice AI**: Vapi.ai for real-time voice conversations
- **Integration**: Vision descriptions are injected into the conversation context using Vapi's add-message feature

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
