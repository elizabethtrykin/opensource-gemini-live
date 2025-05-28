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
  private frameQueue: SecureVisionFrame[] = [];
  private isBackgroundProcessing = false;
  private currentDescription = '';
  private lastSignificantChange = 0;
  private frameCounter = 0;
  private avgProcessingTime = 2000;
  private successRate = 1.0;
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

  addFrame(imageBase64: string, userPrompt?: string): string {
    return this.currentDescription;
  }

  private shouldProcessFrame(): boolean {
    const timeSinceLastChange = Date.now() - this.lastSignificantChange;
    
    if (timeSinceLastChange < 5000) return this.frameCounter % 2 === 0;
    if (timeSinceLastChange < 15000) return this.frameCounter % 4 === 0;
    return this.frameCounter % 8 === 0;
  }

  private enqueueFrame(frame: SecureVisionFrame) {
    this.frameQueue = this.frameQueue.filter(f => 
      f.priority !== 'low' || Date.now() - f.timestamp < 5000
    );

    if (frame.priority === 'high') {
      this.frameQueue.unshift(frame);
    } else {
      this.frameQueue.push(frame);
    }

    if (this.frameQueue.length > 10) {
      this.frameQueue = this.frameQueue.slice(-10);
    }
  }

  private startBackgroundProcessor() {
    const processNext = async () => {
      if (this.frameQueue.length === 0) {
        setTimeout(processNext, 1000);
        return;
      }

      if (this.isBackgroundProcessing) {
        setTimeout(processNext, 500);
        return;
      }

      const frame = this.frameQueue.shift()!;
      await this.processFrameInBackground(frame);
      
      setTimeout(processNext, 2000);
    };

    processNext();
  }

  private async processFrameInBackground(frame: SecureVisionFrame) {
    this.isBackgroundProcessing = true;
    this.onProcessingStateChange?.(true);
    
    const startTime = Date.now();

    try {
      const response = await fetch('/api/vision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: frame.imageData,
          userPrompt: frame.userPrompt
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          const errorData = await response.json();
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

      this.updateMetrics(processingTime, true);

      if (this.isSignificantChange(description)) {
        this.currentDescription = description;
        this.lastSignificantChange = Date.now();
        this.onDescriptionUpdate?.(description);
      }

    } catch (error) {
      this.updateMetrics(Date.now() - startTime, false);
    } finally {
      this.isBackgroundProcessing = false;
      this.onProcessingStateChange?.(false);
    }
  }

  private isSignificantChange(newDescription: string): boolean {
    if (!this.currentDescription) return true;

    const currentWords = new Set(this.currentDescription.toLowerCase().split(' '));
    const newWords = new Set(newDescription.toLowerCase().split(' '));
    
    const intersection = new Set([...currentWords].filter(x => newWords.has(x)));
    const similarity = intersection.size / Math.max(currentWords.size, newWords.size);
    
    return similarity < 0.7;
  }

  private updateMetrics(processingTime: number, success: boolean) {
    this.avgProcessingTime = this.avgProcessingTime * 0.8 + processingTime * 0.2;
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

  async forceAnalysis(imageBase64: string, userPrompt: string): Promise<string> {
    const frame: SecureVisionFrame = {
      id: `force_${Date.now()}`,
      imageData: imageBase64,
      timestamp: Date.now(),
      priority: 'high',
      userPrompt
    };

    await this.processFrameInBackground(frame);
    return this.currentDescription;
  }

  destroy() {
    this.frameQueue = [];
  }
} 