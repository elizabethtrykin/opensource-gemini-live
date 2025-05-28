'use client';
import React, { useRef, useEffect, useState } from 'react';
import Vapi from '@vapi-ai/web';
import { SecureVisionProcessor } from './secure-vision';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPhone } from '@fortawesome/free-solid-svg-icons';
import { config } from '@fortawesome/fontawesome-svg-core';

config.autoAddCss = false;

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  const message = args.join(' ');
  if (message.includes('Ignoring settings for browser- or platform-unsupported input processor(s): audio')) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

function GeminiLiveMVP() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasCamera, setHasCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [vapi, setVapi] = useState<any>(null);
  const [callActive, setCallActive] = useState(false);
  const [visionProcessor, setVisionProcessor] = useState<SecureVisionProcessor | null>(null);
  const [lastVisionDescription, setLastVisionDescription] = useState<string>('');
  const [visionProcessing, setVisionProcessing] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [visionHistory, setVisionHistory] = useState<string[]>([]);

  // Global rate limiting to prevent conflicts between manual and automatic calls
  const lastApiCallTime = useRef(0);
  const MIN_API_INTERVAL = 4500; // 4.5 seconds to match server + buffer

  // Get Vapi config from env
  const vapiPublicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
  const vapiAssistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

  // Ensure client-side only rendering for video elements
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Camera setup (client-side only)
  useEffect(() => {
    if (!isClient) return;
    
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasCamera(true);
        }
      } catch (err) {
        setHasCamera(false);
      }
    }
    setupCamera();
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [isClient]);

  // Automatic frame capture with Gemini vision analysis - RE-ENABLED with rate limiting
  useEffect(() => {
    if (!isClient || !hasCamera || !callActive || !visionProcessor) return;
    
    const interval = setInterval(async () => {
      // Global rate limiting - ensure at least 4.5 seconds between any API calls
      const now = Date.now();
      if (now - lastApiCallTime.current < MIN_API_INTERVAL) {
        console.log('Skipping automatic frame - too soon since last API call');
        return;
      }
      
      if (videoRef.current && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, 320, 240);
          const dataUrl = canvasRef.current.toDataURL('image/jpeg');
          setCapturedImage(dataUrl);
          
          // Extract base64 data for Gemini
          const base64Data = dataUrl.split(',')[1];
          
          try {
            lastApiCallTime.current = now; // Update global rate limiter
            const description = await visionProcessor.forceAnalysis(base64Data, '');
            
            if (description && callActive && vapi) {
              setLastVisionDescription(description);
              setVisionHistory(prev => {
                const newHistory = [...prev, `${new Date().toLocaleTimeString()}: ${description}`];
                console.log('Vision history updated:', newHistory);
                return newHistory.slice(-5);
              });
              
              // Immediately send vision context as system message
              const contextMessage = `Visual context: ${description}`;
              console.log('Sending immediate system context:', contextMessage);
              vapi.send({
                type: 'add-message',
                message: {
                  role: 'system',
                  content: contextMessage,
                },
              });
            }
          } catch (error) {
            console.error('Automatic vision analysis failed:', error);
          }
        }
      }
    }, 6000);
    
    return () => clearInterval(interval);
  }, [isClient, hasCamera, callActive, vapi, visionProcessor]);

  // Simple frame capture for display only (when call not active)
  useEffect(() => {
    if (!isClient || !hasCamera || callActive) return; // Only when call is NOT active
    
    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, 320, 240);
          const dataUrl = canvasRef.current.toDataURL('image/jpeg');
          setCapturedImage(dataUrl);
        }
      }
    }, 1000); // Just for display, no API calls
    
    return () => clearInterval(interval);
  }, [isClient, hasCamera, callActive]);

  useEffect(() => {
    if (!isClient || !vapiPublicKey) return;
    
    try {
      const v = new Vapi(vapiPublicKey);
      
      v.on('message', (message: any) => {
        console.log('Vapi message:', message);
        
        if (message.type === 'speech-update') {
          console.log('Speech update detected:', message);
        }
      });
      
      v.on('call-start', () => {
        console.log('Vapi call started');
        setCallActive(true);
      });
      
      v.on('call-end', () => {
        console.log('Vapi call ended');
        setCallActive(false);
      });
      
      v.on('error', (error) => {
        console.error('Vapi error:', error);
        // Don't log the audio processor warning as an error
        if (!error.message?.includes('audio processor')) {
          setCallActive(false);
        }
      });
      
      setVapi(v);
    } catch (error) {
      console.error('Failed to initialize Vapi:', error);
    }
    
    return () => {
      if (vapi) {
        try {
          vapi.stop();
        } catch (error) {
          console.error('Error stopping Vapi:', error);
        }
      }
    };
  }, [isClient, vapiPublicKey]);

  useEffect(() => {
    if (!isClient) return;
    
    try {
      const processor = new SecureVisionProcessor({
        onDescriptionUpdate: (description) => {
          setLastVisionDescription(description);
        },
        onProcessingStateChange: (isProcessing) => {
          setVisionProcessing(isProcessing);
        }
      });
      setVisionProcessor(processor);
    } catch (error) {
      console.error('Failed to initialize Streaming Vision Processor:', error);
    }
  }, [isClient]);

  // Vapi call management
  const handleStartCall = () => {
    if (vapi && vapiAssistantId) {
      try {
        vapi.start(vapiAssistantId);
      } catch (error) {
        console.error('Failed to start call:', error);
      }
    }
  };
  
  const handleStopCall = () => {
    if (vapi) {
      try {
        vapi.stop();
      } catch (error) {
        console.error('Failed to stop call:', error);
      }
    }
  };

  // Manual vision analysis trigger
  const analyzeCurrentFrame = async (userPrompt?: string) => {
    if (!visionProcessor || !videoRef.current || !canvasRef.current) return;
    
    const now = Date.now();
    if (now - lastApiCallTime.current < MIN_API_INTERVAL) {
      const waitTime = Math.ceil((MIN_API_INTERVAL - (now - lastApiCallTime.current)) / 1000);
      console.log(`Manual analysis blocked - please wait ${waitTime} more seconds`);
      return;
    }
    
    try {
      setVisionProcessing(true);
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        const base64Data = dataUrl.split(',')[1];
        
        lastApiCallTime.current = now;
        const description = await visionProcessor.forceAnalysis(base64Data, userPrompt || '');
        
        if (description && callActive) {
          setLastVisionDescription(description);
          setVisionHistory(prev => {
            const contextEntry = userPrompt 
              ? `${new Date().toLocaleTimeString()}: ${description} (User asked: "${userPrompt}")`
              : `${new Date().toLocaleTimeString()}: ${description}`;
            const newHistory = [...prev, contextEntry];
            return newHistory.slice(-5);
          });
          
          // Immediately send vision context as system message
          if (vapi) {
            const contextMessage = userPrompt 
              ? `Visual context: ${description} (User asked: "${userPrompt}")`
              : `Visual context: ${description}`;
            console.log('Sending immediate manual system context:', contextMessage);
            vapi.send({
              type: 'add-message',
              message: {
                role: 'system',
                content: contextMessage,
              },
            });
          }
        }
      }
    } catch (error) {
      console.error('Manual vision analysis failed:', error);
    } finally {
      setVisionProcessing(false);
    }
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <div className="relative w-full h-full flex items-center justify-center">
        {isClient ? (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            <canvas ref={canvasRef} width={320} height={240} className="hidden" />
          </>
        ) : (
          <div className="w-full h-full bg-black flex items-center justify-center">
          </div>
        )}

        {/* Status Overlay - Top */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/50 to-transparent">
          <div className="flex items-center justify-between">
            <div className="text-white font-medium text-lg">
              Vapi Live
            </div>
            <div className="flex items-center space-x-2">
              {visionProcessing && (
                <div className="flex items-center space-x-1 text-white/80 text-sm">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span>Analyzing...</span>
                </div>
              )}
              {callActive && (
                <div className="flex items-center space-x-1 text-green-400 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Live</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Vision Description Overlay - Bottom */}
        {lastVisionDescription && (
          <div className="absolute bottom-24 left-4 right-4 md:bottom-32">
            <div className="bg-black/70 backdrop-blur-sm rounded-2xl p-4 text-white text-sm leading-relaxed">
              <div className="text-white/60 text-xs mb-1">Last seen:</div>
              {lastVisionDescription}
            </div>
          </div>
        )}

        {/* Bottom Blur Section with Centered Buttons */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/60 via-black/30 to-transparent backdrop-blur-md flex items-center justify-between px-4">
          <div className="w-16"></div>
          
          <button
            onClick={callActive ? handleStopCall : handleStartCall}
            className={`
              w-20 h-20 rounded-full flex items-center justify-center
              transition-all duration-200 backdrop-blur-sm
              ${callActive 
                ? 'bg-red-500 hover:bg-red-600 border-4 border-red-300 active:scale-95' 
                : 'bg-white hover:bg-gray-100 active:scale-95'
              }
            `}
          >
            {callActive ? (
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h12v12H6z"/>
              </svg>
            ) : (
              <FontAwesomeIcon 
                icon={faPhone} 
                size="lg"
                style={{ fontSize: '24px', color: 'black' }}
              />
            )}
          </button>

          <button
            onClick={() => analyzeCurrentFrame("What do you see?")}
            disabled={!callActive || !visionProcessor || visionProcessing}
            className={`
              w-16 h-16 rounded-full border-4 border-white/30 flex items-center justify-center
              transition-all duration-200 backdrop-blur-sm
              ${(!callActive || !visionProcessor || visionProcessing) 
                ? 'bg-gray-600/50 cursor-not-allowed' 
                : 'bg-white/20 hover:bg-white/30 active:scale-95'
              }
            `}
          >
            <div className={`
              w-8 h-8 rounded-full 
              ${visionProcessing ? 'bg-yellow-400 animate-pulse' : 'bg-white'}
            `} />
          </button>
        </div>

        {/* Error Message */}
        {isClient && (!vapiPublicKey || !vapiAssistantId) && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-500/90 backdrop-blur-sm rounded-2xl p-6 text-white text-center max-w-sm mx-4">
            <div className="font-medium mb-2">Setup Required</div>
            <div className="text-sm opacity-90">
              Please set your Vapi credentials in the environment variables.
            </div>
          </div>
        )}
      </div>

      {/* Desktop Performance Stats - Hidden on Mobile */}
      {visionProcessor && (
        <div className="hidden lg:block absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg p-3 text-white text-xs space-y-1">
          <div>Queue: {visionProcessor.getQueueLength()}</div>
          <div>Avg: {visionProcessor.getPerformanceMetrics().avgProcessingTime}ms</div>
          <div>Success: {visionProcessor.getPerformanceMetrics().successRate}%</div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return <GeminiLiveMVP />;
}
