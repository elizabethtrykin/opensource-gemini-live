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

  const lastApiCallTime = useRef(0);
  const MIN_API_INTERVAL = 3000;

  const vapiPublicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
  const vapiAssistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

  useEffect(() => {
    setIsClient(true);
  }, []);

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

  useEffect(() => {
    if (!isClient || !hasCamera || !callActive || !visionProcessor || !vapi) return;
    
    const continuousVisionProcessing = async () => {
      if (videoRef.current && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, 320, 240);
          const dataUrl = canvasRef.current.toDataURL('image/jpeg');
          setCapturedImage(dataUrl);
          
          const base64Data = dataUrl.split(',')[1];
          
          try {
            setVisionProcessing(true);
            lastApiCallTime.current = Date.now();
            const description = await visionProcessor.forceAnalysis(base64Data, '');
            
            if (description) {
              setLastVisionDescription(description);
              
              vapi.send({
                type: 'add-message',
                message: {
                  role: 'system',
                  content: `Visual context update: ${description}`,
                },
                triggerResponseEnabled: false,
              });
              
              setVisionHistory(prev => {
                const newEntry = `${new Date().toLocaleTimeString()}: ${description}`;
                const newHistory = [...prev, newEntry];
                return newHistory.slice(-5);
              });
            }
          } catch (error) {
          } finally {
            setVisionProcessing(false);
          }
        }
      }
    };
    
    const initialTimer = setTimeout(continuousVisionProcessing, 1000);
    const interval = setInterval(continuousVisionProcessing, 3000);
    
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isClient, hasCamera, callActive, visionProcessor, vapi]);

  useEffect(() => {
    if (!isClient || !hasCamera || callActive) return;
    
    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, 320, 240);
          const dataUrl = canvasRef.current.toDataURL('image/jpeg');
          setCapturedImage(dataUrl);
        }
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isClient, hasCamera, callActive]);

  useEffect(() => {
    if (!isClient || !vapiPublicKey) return;
    
    try {
      const v = new Vapi(vapiPublicKey);
      
      v.on('message', (message: any) => {
      });
      
      v.on('call-start', () => {
        setCallActive(true);
      });
      
      v.on('call-end', () => {
        setCallActive(false);
      });
      
      v.on('error', (error) => {
        if (!error.message?.includes('audio processor')) {
          setCallActive(false);
        }
      });
      
      setVapi(v);
    } catch (error) {
    }
    
    return () => {
      if (vapi) {
        try {
          vapi.stop();
        } catch (error) {
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
    }
  }, [isClient]);

  const handleStartCall = () => {
    if (vapi && vapiAssistantId) {
      try {
        vapi.start(vapiAssistantId);
      } catch (error) {
      }
    }
  };
  
  const handleStopCall = () => {
    if (vapi) {
      try {
        vapi.stop();
      } catch (error) {
      }
    }
  };

  const analyzeCurrentFrame = async (userPrompt?: string) => {
    if (!visionProcessor || !videoRef.current || !canvasRef.current) return;
    
    const now = Date.now();
    if (now - lastApiCallTime.current < MIN_API_INTERVAL) {
      const waitTime = Math.ceil((MIN_API_INTERVAL - (now - lastApiCallTime.current)) / 1000);
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
        }
      }
    } catch (error) {
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

        <div className="absolute bottom-0 left-0 right-0 pb-safe bg-gradient-to-t from-black/60 via-black/30 to-transparent backdrop-blur-md">
          <div className="flex items-center justify-between px-4 py-12 pb-24 md:py-6 md:pb-8 md:min-h-[120px] min-h-[300px]">
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
        </div>

        {isClient && (!vapiPublicKey || !vapiAssistantId) && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-500/90 backdrop-blur-sm rounded-2xl p-6 text-white text-center max-w-sm mx-4">
            <div className="font-medium mb-2">Setup Required</div>
            <div className="text-sm opacity-90">
              Please set your Vapi credentials in the environment variables.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return <GeminiLiveMVP />;
}
