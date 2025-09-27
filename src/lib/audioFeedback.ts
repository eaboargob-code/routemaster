/**
 * Audio Feedback Utility for QR Scanner
 * Provides audio confirmation for successful and failed QR scans
 */

export interface AudioFeedbackOptions {
  enabled: boolean;
  volume: number; // 0.0 to 1.0
  successTone: 'beep' | 'chime' | 'ding';
  errorTone: 'buzz' | 'error' | 'alert';
}

class AudioFeedbackService {
  private audioContext: AudioContext | null = null;
  private options: AudioFeedbackOptions = {
    enabled: true,
    volume: 0.5,
    successTone: 'beep',
    errorTone: 'buzz'
  };

  constructor() {
    this.initializeAudioContext();
  }

  private initializeAudioContext() {
    try {
      // Create AudioContext on user interaction to avoid browser restrictions
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        this.audioContext = new AudioContext();
      }
    } catch (error) {
      console.warn('AudioContext not supported:', error);
    }
  }

  /**
   * Update audio feedback settings
   */
  updateSettings(options: Partial<AudioFeedbackOptions>) {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current audio settings
   */
  getSettings(): AudioFeedbackOptions {
    return { ...this.options };
  }

  /**
   * Play success sound for successful QR scan
   */
  async playSuccessSound(): Promise<void> {
    if (!this.options.enabled || !this.audioContext) return;

    try {
      await this.ensureAudioContextRunning();
      
      switch (this.options.successTone) {
        case 'beep':
          await this.playBeep(800, 200); // High pitch, short duration
          break;
        case 'chime':
          await this.playChime();
          break;
        case 'ding':
          await this.playDing();
          break;
      }
    } catch (error) {
      console.warn('Failed to play success sound:', error);
    }
  }

  /**
   * Play error sound for failed QR scan
   */
  async playErrorSound(): Promise<void> {
    if (!this.options.enabled || !this.audioContext) return;

    try {
      await this.ensureAudioContextRunning();
      
      switch (this.options.errorTone) {
        case 'buzz':
          await this.playBuzz();
          break;
        case 'error':
          await this.playErrorTone();
          break;
        case 'alert':
          await this.playAlert();
          break;
      }
    } catch (error) {
      console.warn('Failed to play error sound:', error);
    }
  }

  /**
   * Play boarding confirmation sound (double beep)
   */
  async playBoardingSound(): Promise<void> {
    if (!this.options.enabled || !this.audioContext) return;

    try {
      await this.ensureAudioContextRunning();
      await this.playBeep(600, 150);
      await this.delay(100);
      await this.playBeep(800, 150);
    } catch (error) {
      console.warn('Failed to play boarding sound:', error);
    }
  }

  /**
   * Play dropping confirmation sound (single long beep)
   */
  async playDroppingSound(): Promise<void> {
    if (!this.options.enabled || !this.audioContext) return;

    try {
      await this.ensureAudioContextRunning();
      await this.playBeep(500, 400);
    } catch (error) {
      console.warn('Failed to play dropping sound:', error);
    }
  }

  /**
   * Test audio functionality
   */
  async testAudio(): Promise<boolean> {
    try {
      await this.playSuccessSound();
      return true;
    } catch (error) {
      console.error('Audio test failed:', error);
      return false;
    }
  }

  private async ensureAudioContextRunning(): Promise<void> {
    if (!this.audioContext) {
      this.initializeAudioContext();
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  private async playBeep(frequency: number, duration: number): Promise<void> {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(this.options.volume, this.audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration / 1000);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration / 1000);

    return new Promise(resolve => {
      oscillator.onended = () => resolve();
    });
  }

  private async playChime(): Promise<void> {
    // Play a pleasant chime sequence
    await this.playBeep(523, 150); // C5
    await this.delay(50);
    await this.playBeep(659, 150); // E5
    await this.delay(50);
    await this.playBeep(784, 200); // G5
  }

  private async playDing(): Promise<void> {
    // Play a single ding sound
    await this.playBeep(1000, 300);
  }

  private async playBuzz(): Promise<void> {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
    oscillator.type = 'sawtooth'; // Harsh sound for errors

    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(this.options.volume, this.audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.5);

    return new Promise(resolve => {
      oscillator.onended = () => resolve();
    });
  }

  private async playErrorTone(): Promise<void> {
    // Play descending error tone
    await this.playBeep(400, 200);
    await this.delay(50);
    await this.playBeep(300, 200);
  }

  private async playAlert(): Promise<void> {
    // Play alternating alert tone
    for (let i = 0; i < 3; i++) {
      await this.playBeep(800, 100);
      await this.delay(100);
      await this.playBeep(600, 100);
      await this.delay(100);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enable audio feedback
   */
  enable(): void {
    this.options.enabled = true;
  }

  /**
   * Disable audio feedback
   */
  disable(): void {
    this.options.enabled = false;
  }

  /**
   * Check if audio is supported
   */
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'AudioContext' in window;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// Export singleton instance
export const audioFeedbackService = new AudioFeedbackService();

// Export types
export type { AudioFeedbackOptions };