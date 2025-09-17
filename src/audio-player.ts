import JSZip from 'jszip';

export class AudioPlayer {
  private audioContext: AudioContext;
  private currentSource?: AudioBufferSourceNode;
  private currentBuffer?: AudioBuffer;
  private currentGain?: GainNode;
  private isPlaying: boolean = false;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private stopRequested: boolean = false;
  private playerId: string;
  private loopMode: 'loop' | 'once' = 'loop';
  private onSegmentEnd?: () => void;
  
  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.playerId = Math.random().toString(36).substr(2, 9);
    console.log(`AudioPlayer created with ID: ${this.playerId}`);
  }
  
  async loadAudioFromZip(zip: JSZip, audioPath: string): Promise<AudioBuffer | null> {
    // Check if we already have this buffer cached
    if (this.audioBuffers.has(audioPath)) {
      return this.audioBuffers.get(audioPath)!;
    }
    
    const audioFile = zip.file(audioPath);
    if (!audioFile) {
      console.warn(`Audio file not found in DAWproject: ${audioPath}`);
      return null;
    }
    
    try {
      const arrayBuffer = await audioFile.async('arraybuffer');
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Cache the decoded buffer
      this.audioBuffers.set(audioPath, audioBuffer);
      
      return audioBuffer;
    } catch (error) {
      console.error(`Error decoding audio file ${audioPath}:`, error);
      return null;
    }
  }
  
  setLoopMode(mode: 'loop' | 'once', onSegmentEnd?: () => void): void {
    this.loopMode = mode;
    this.onSegmentEnd = onSegmentEnd;
    console.log(`Audio player loop mode set to: ${mode}`);
    
    // Don't restart audio automatically - let the caller handle it
    // This prevents overlapping audio issues
  }

  async playSegment(buffer: AudioBuffer | null, startTime?: number, endTime?: number): Promise<void> {
    if (!buffer) return;
    
    console.log(`=== NEW PLAYBACK REQUEST (Player ${this.playerId}) - Mode: ${this.loopMode} ===`);
    
    // FIRST: Stop everything and wait for cleanup
    this.stop();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // RESET the stop flag since we're starting new playback
    this.stopRequested = false;
    console.log('Reset stopRequested flag for new playback');
    
    // Resume audio context if it's suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    const actualStartTime = startTime || 0;
    const actualEndTime = endTime || buffer.duration;
    
    console.log(`Starting playback: start=${actualStartTime}s, end=${actualEndTime}s, duration=${buffer.duration}s`);
    
    // Validate and clamp times
    const tolerance = 0.1;
    if (actualStartTime >= actualEndTime || 
        actualStartTime < 0 || 
        actualEndTime > (buffer.duration + tolerance) || 
        actualStartTime >= buffer.duration) {
      console.warn('Invalid audio times, playing full buffer');
      this.playSimpleLoop(buffer);
      return;
    }
    
    const clampedEndTime = Math.min(actualEndTime, buffer.duration);
    this.playSegmentWithMode(buffer, actualStartTime, clampedEndTime);
  }
  
  private playSimpleLoop(buffer: AudioBuffer): void {
    console.log('Playing simple full buffer loop');
    
    // Create source
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = buffer;
    this.currentSource.loop = true;
    
    // Create gain for volume control
    this.currentGain = this.audioContext.createGain();
    this.currentSource.connect(this.currentGain);
    this.currentGain.connect(this.audioContext.destination);
    
    // Start immediately
    this.currentSource.start(0);
    this.currentBuffer = buffer;
    this.isPlaying = true;
    this.stopRequested = false;
    
    console.log('Simple loop started');
  }
  

  private playSegmentWithMode(buffer: AudioBuffer, startTime: number, endTime: number): void {
    console.log(`Playing segment with mode ${this.loopMode}: ${startTime}s to ${endTime}s`);
    
    const segmentDuration = endTime - startTime;
    const sampleRate = buffer.sampleRate;
    const segmentLength = Math.floor(segmentDuration * sampleRate);
    const startSample = Math.floor(startTime * sampleRate);
    
    // Create a new buffer containing just the segment
    const segmentBuffer = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      segmentLength,
      sampleRate
    );
    
    // Copy the segment data
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const originalData = buffer.getChannelData(channel);
      const segmentData = segmentBuffer.getChannelData(channel);
      
      for (let i = 0; i < segmentLength; i++) {
        const sourceIndex = startSample + i;
        if (sourceIndex < originalData.length) {
          segmentData[i] = originalData[sourceIndex];
        }
      }
    }
    
    // Create source with appropriate looping behavior
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = segmentBuffer;
    this.currentSource.loop = this.loopMode === 'loop';
    
    // Create gain for volume control
    this.currentGain = this.audioContext.createGain();
    this.currentSource.connect(this.currentGain);
    this.currentGain.connect(this.audioContext.destination);
    
    // If mode is 'once', set up ended event
    if (this.loopMode === 'once' && this.onSegmentEnd) {
      this.currentSource.addEventListener('ended', () => {
        console.log('Audio segment finished - calling onSegmentEnd');
        this.isPlaying = false;
        if (this.onSegmentEnd) {
          this.onSegmentEnd();
        }
      });
    }
    
    // Start immediately
    this.currentSource.start(0);
    this.currentBuffer = buffer;
    this.isPlaying = true;
    this.stopRequested = false;
    
    console.log(`Segment started with mode: ${this.loopMode}`);
  }

  
  async stop(): Promise<void> {
    console.log(`=== STOP REQUESTED (Player ${this.playerId}) ===`);
    
    // Set flags immediately
    this.isPlaying = false;
    this.stopRequested = true;
    
    // AGGRESSIVE CLEANUP: Stop ALL audio sources immediately
    // This handles cases where multiple sources might exist
    try {
      // Stop and cleanup current source
      if (this.currentSource) {
        console.log('Stopping current source...');
        this.currentSource.stop();
        this.currentSource.disconnect();
        this.currentSource = undefined;
        console.log('Current source cleaned up');
      }
      
      // Cleanup gain
      if (this.currentGain) {
        console.log('Disconnecting gain...');
        this.currentGain.disconnect();
        this.currentGain = undefined;
        console.log('Gain cleaned up');
      }
      
      // NUCLEAR OPTION: Suspend and resume audio context to kill any lingering sources
      if (this.audioContext.state !== 'suspended') {
        console.log('Suspending audio context for cleanup...');
        await this.audioContext.suspend();
        console.log('Audio context suspended');
        // Resume immediately so it's ready for next playback
        await new Promise(resolve => setTimeout(resolve, 10));
        await this.audioContext.resume();
        console.log('Audio context resumed after cleanup');
      }
      
    } catch (e) {
      console.error('Error during stop cleanup:', e);
    }
    
    console.log('=== STOP COMPLETE ===');
  }
  
  getIsPlaying(): boolean {
    return this.isPlaying && !this.stopRequested;
  }
  
  async resume(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }
  
  getDuration(): number {
    return this.currentBuffer?.duration || 0;
  }
  
  clearCache(): void {
    this.audioBuffers.clear();
  }
}