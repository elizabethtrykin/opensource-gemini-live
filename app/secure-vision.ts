interface SecureVisionFrame {
  id: string;
  imageData: string;
  timestamp: number;
  priority: 'low' | 'medium' | 'high';
  userPrompt?: string;
}

interface VisionResponse {
  description: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

export class SecureVisionProcessor {
  // Background processing
  private frameQueue: SecureVisionFrame[] = [];
  private isBackgroundProcessing = false;
  
  // Real-time state
  private currentDescription = '';
  private lastSignificantChange = 0;
  private frameCounter = 0;
  
  // Performance metrics
  private avgProcessingTime = 2000;
  private successRate = 1.0;
  
  // Event callbacks
  private onDescriptionUpdate?: (description: string) => void;
  private onProcessingStateChange?: (isProcessing: boolean) => void;

  constructor(callbacks?: {
    onDescriptionUpdate?: (description: string) => void;
    onProcessingStateChange?: (isProcessing: boolean) => void;
  }) {
    this.onDescriptionUpdate = callbacks?.onDescriptionUpdate;
    this.onProcessingStateChange = callbacks?.onProcessingStateChange;

    // DISABLED: Background processor - using direct calls for automatic processing
    // this.startBackgroundProcessor();
  }

  // Main public interface - manual only mode
  addFrame(imageBase64: string, userPrompt?: string): string {
    // Background processing disabled - using direct forceAnalysis() calls
    return this.currentDescription;
  }

  private shouldProcessFrame(): boolean {
    const timeSinceLastChange = Date.now() - this.lastSignificantChange;
    
    // Process more frequently if scene is changing rapidly
    if (timeSinceLastChange < 5000) return this.frameCounter % 2 === 0; // Every 2nd frame
    if (timeSinceLastChange < 15000) return this.frameCounter % 4 === 0; // Every 4th frame
    return this.frameCounter % 8 === 0; // Every 8th frame for static scenes
  }

  private enqueueFrame(frame: SecureVisionFrame) {
    // Remove old low-priority frames to prevent queue buildup
    this.frameQueue = this.frameQueue.filter(f => 
      f.priority !== 'low' || Date.now() - f.timestamp < 5000
    );

    // Insert based on priority
    if (frame.priority === 'high') {
      this.frameQueue.unshift(frame); // High priority to front
    } else {
      this.frameQueue.push(frame);
    }

    // Limit queue size
    if (this.frameQueue.length > 10) {
      this.frameQueue = this.frameQueue.slice(-10);
    }
  }

  private startBackgroundProcessor() {
    // Background processing loop with rate limiting
    const processNext = async () => {
      if (this.frameQueue.length === 0) {
        setTimeout(processNext, 1000); // Wait 1 second when queue is empty
        return;
      }

      if (this.isBackgroundProcessing) {
        setTimeout(processNext, 500); // Wait 500ms if already processing
        return;
      }

      const frame = this.frameQueue.shift()!;
      await this.processFrameInBackground(frame);
      
      // Continue processing with longer delay to respect rate limits
      setTimeout(processNext, 2000); // Wait 2 seconds between processing
    };

    processNext();
  }

  private async processFrameInBackground(frame: SecureVisionFrame) {
    this.isBackgroundProcessing = true;
    this.onProcessingStateChange?.(true);
    
    const startTime = Date.now();

    try {
      // Call our secure API route instead of Gemini directly
      const response = await fetch('/api/vision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: frame.imageData,
          userPrompt: frame.userPrompt,
          context: this.currentDescription
        })
      });

      if (!response.ok) {
        // Handle rate limiting specifically
        if (response.status === 429) {
          const errorData = await response.json();
          console.warn(`Rate limited: ${errorData.message}`);
          // Don't treat rate limiting as a failure - just skip this frame
          return;
        }
        throw new Error(`API call failed: ${response.status}`);
      }

      const result: VisionResponse = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Vision processing failed');
      }

      const description = result.description;
      const processingTime = Date.now() - startTime;

      // Update metrics
      this.updateMetrics(processingTime, true);

      // Check if this is a significant change
      if (this.isSignificantChange(description)) {
        this.currentDescription = description;
        this.lastSignificantChange = Date.now();
        this.onDescriptionUpdate?.(description);
      }

    } catch (error) {
      console.error('Secure vision processing error:', error);
      this.updateMetrics(Date.now() - startTime, false);
    } finally {
      this.isBackgroundProcessing = false;
      this.onProcessingStateChange?.(false);
    }
  }

  private isSignificantChange(newDescription: string): boolean {
    if (!this.currentDescription) return true;

    // Simple similarity check
    const currentWords = new Set(this.currentDescription.toLowerCase().split(' '));
    const newWords = new Set(newDescription.toLowerCase().split(' '));
    
    const intersection = new Set([...currentWords].filter(x => newWords.has(x)));
    const similarity = intersection.size / Math.max(currentWords.size, newWords.size);
    
    return similarity < 0.7; // 70% similarity threshold
  }

  private updateMetrics(processingTime: number, success: boolean) {
    // Exponential moving average for processing time
    this.avgProcessingTime = this.avgProcessingTime * 0.8 + processingTime * 0.2;
    
    // Update success rate
    this.successRate = this.successRate * 0.9 + (success ? 1 : 0) * 0.1;
  }

  // Public interface methods
  getCurrentDescription(): string {
    return this.currentDescription;
  }

  isProcessing(): boolean {
    return this.isBackgroundProcessing;
  }

  getQueueLength(): number {
    return this.frameQueue.length;
  }

  getPerformanceMetrics() {
    return {
      avgProcessingTime: Math.round(this.avgProcessingTime),
      successRate: Math.round(this.successRate * 100),
      queueLength: this.frameQueue.length,
      lastUpdate: this.lastSignificantChange
    };
  }

  // Force immediate high-priority processing
  async forceAnalysis(imageBase64: string, userPrompt: string): Promise<string> {
    const frame: SecureVisionFrame = {
      id: `force_${Date.now()}`,
      imageData: imageBase64,
      timestamp: Date.now(),
      priority: 'high',
      userPrompt
    };

    // Process immediately, bypassing queue
    await this.processFrameInBackground(frame);
    return this.currentDescription;
  }

  destroy() {
    this.frameQueue = [];
  }
} 