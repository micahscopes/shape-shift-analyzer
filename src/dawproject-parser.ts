import JSZip from 'jszip';

export interface Note {
  time: number;
  duration: number;
  key: number;
  velocity: number;
  channel: number;
}

export interface Clip {
  time: number;
  duration: number;
  playStart: number;
  name?: string;
  notes: Note[];
  audioFile?: string;
  // Audio region timing (from nested audio clip)
  audioRegionStart?: number;    // where in source file this audio region starts
  audioRegionDuration?: number; // how long this audio region is
  // Loop timing (from outer clip)
  loopStart?: number;           // where loop region starts within clip
  loopEnd?: number;             // where loop region ends within clip
  // Calculated playback timing
  finalAudioStart?: number;     // final start position in source file
  finalAudioEnd?: number;       // final end position in source file
}

export interface Track {
  id: string;
  name: string;
  contentType: string;
  clips: Clip[];
}

export interface ClipSlot {
  trackId: string;
  clip?: Clip;
  hasStop: boolean;
}

export interface SceneData {
  id: string;
  name: string;
  clipSlots: ClipSlot[];
}

export interface DAWProject {
  tracks: Track[];
  scenes: SceneData[];
  metadata: any;
  tempo?: number;
  timeSignature?: { numerator: number; denominator: number };
}

export class DAWProjectParser {
  private zip: JSZip | null = null;

  async loadFile(file: File | ArrayBuffer): Promise<void> {
    const zip = new JSZip();
    this.zip = await zip.loadAsync(file);
  }
  
  getZip(): JSZip | null {
    return this.zip;
  }

  async parseProject(): Promise<DAWProject> {
    if (!this.zip) {
      throw new Error('No DAWproject file loaded');
    }

    const projectXml = await this.zip.file('project.xml')?.async('text');
    if (!projectXml) {
      throw new Error('project.xml not found in DAWproject');
    }

    const metadataXml = await this.zip.file('metadata.xml')?.async('text');
    
    const parser = new DOMParser();
    const projectDoc = parser.parseFromString(projectXml, 'text/xml');
    const metadataDoc = metadataXml ? parser.parseFromString(metadataXml, 'text/xml') : null;

    const tracks = this.extractTracks(projectDoc);
    const { tempo, timeSignature } = this.extractTransport(projectDoc);
    const scenes = this.extractScenes(projectDoc, tempo || 120);
    
    return {
      tracks,
      scenes,
      metadata: metadataDoc ? this.extractMetadata(metadataDoc) : null,
      tempo,
      timeSignature
    };
  }

  private extractTracks(doc: Document): Track[] {
    const tracks: Track[] = [];
    const trackElements = doc.querySelectorAll('Track');
    const arrangement = doc.querySelector('Arrangement');
    
    trackElements.forEach(trackEl => {
      const trackId = trackEl.getAttribute('id') || '';
      const trackName = trackEl.getAttribute('name') || 'Unnamed Track';
      const contentType = trackEl.getAttribute('contentType') || '';
      
      // Find clips for this track in the arrangement
      const clips = this.extractClipsForTrack(arrangement, trackId);
      
      tracks.push({
        id: trackId,
        name: trackName,
        contentType,
        clips
      });
    });
    
    return tracks;
  }

  private extractClipsForTrack(arrangement: Element | null, trackId: string): Clip[] {
    if (!arrangement) return [];
    
    const clips: Clip[] = [];
    
    // Find lanes for this track
    const trackLanes = arrangement.querySelector(`Lanes[track="${trackId}"]`);
    if (!trackLanes) return clips;
    
    const clipElements = trackLanes.querySelectorAll('Clip');
    
    clipElements.forEach(clipEl => {
      const time = parseFloat(clipEl.getAttribute('time') || '0');
      const duration = parseFloat(clipEl.getAttribute('duration') || '0');
      const playStart = parseFloat(clipEl.getAttribute('playStart') || '0');
      const name = clipEl.getAttribute('name') || undefined;
      
      const notes = this.extractNotes(clipEl);
      
      // Look for audio file reference
      const fileElement = clipEl.querySelector('File');
      const audioFile = fileElement?.getAttribute('path') || undefined;
      
      clips.push({
        time,
        duration,
        playStart,
        name,
        notes,
        audioFile
      });
    });
    
    return clips;
  }

  private extractNotes(clipEl: Element): Note[] {
    const notes: Note[] = [];
    const noteElements = clipEl.querySelectorAll('Note');
    
    noteElements.forEach(noteEl => {
      notes.push({
        time: parseFloat(noteEl.getAttribute('time') || '0'),
        duration: parseFloat(noteEl.getAttribute('duration') || '0'),
        key: parseInt(noteEl.getAttribute('key') || '0'),
        velocity: parseFloat(noteEl.getAttribute('vel') || '0'),
        channel: parseInt(noteEl.getAttribute('channel') || '0')
      });
    });
    
    return notes;
  }

  private extractScenes(doc: Document, tempo: number): SceneData[] {
    const scenes: SceneData[] = [];
    const sceneElements = doc.querySelectorAll('Scenes > Scene');
    
    sceneElements.forEach(sceneEl => {
      const sceneId = sceneEl.getAttribute('id') || '';
      const sceneName = sceneEl.getAttribute('name') || '';
      
      const clipSlots: ClipSlot[] = [];
      const clipSlotElements = sceneEl.querySelectorAll('ClipSlot');
      
      clipSlotElements.forEach(slotEl => {
        const trackId = slotEl.getAttribute('track') || '';
        const hasStop = slotEl.getAttribute('hasStop') === 'true';
        
        // Check if there's a clip in this slot
        const clipEl = slotEl.querySelector('Clip');
        let clip: Clip | undefined;
        
        if (clipEl) {
          const time = parseFloat(clipEl.getAttribute('time') || '0');
          const duration = parseFloat(clipEl.getAttribute('duration') || '0');
          const playStart = parseFloat(clipEl.getAttribute('playStart') || '0');
          const loopStart = parseFloat(clipEl.getAttribute('loopStart') || '0');
          const loopEnd = parseFloat(clipEl.getAttribute('loopEnd') || duration);
          
          // Extract notes if present
          const notes = this.extractNotes(clipEl);
          
          // Look for nested audio clips
          const nestedClipEl = clipEl.querySelector('Clips > Clip');
          let audioFile: string | undefined;
          let audioRegionStart: number | undefined;
          let audioRegionDuration: number | undefined;
          let finalAudioStart: number | undefined;
          let finalAudioEnd: number | undefined;
          
          if (nestedClipEl) {
            const fileElement = nestedClipEl.querySelector('File');
            audioFile = fileElement?.getAttribute('path') || undefined;
            
            // Get the audio region timing from nested clip
            const contentTimeUnit = nestedClipEl.getAttribute('contentTimeUnit');
            if (contentTimeUnit === 'seconds') {
              audioRegionStart = parseFloat(nestedClipEl.getAttribute('playStart') || '0');
              audioRegionDuration = parseFloat(nestedClipEl.getAttribute('duration') || '0');
              
              // Calculate final playback timing
              // IMPORTANT: Convert beat-based loop times to seconds using tempo
              const outerLoopDuration = loopEnd - loopStart;
              
              if (outerLoopDuration > 0) {
                // Convert loop region from beats to seconds
                const loopStartSeconds = this.beatsToSeconds(loopStart, tempo);
                const loopEndSeconds = this.beatsToSeconds(loopEnd, tempo);
                
                // Use the loop region from the outer clip (converted to seconds)
                finalAudioStart = audioRegionStart + loopStartSeconds;
                finalAudioEnd = audioRegionStart + loopEndSeconds;
                
                console.log(`Audio timing calculation (tempo: ${tempo} BPM):
                  - Audio region: ${audioRegionStart}s + ${audioRegionDuration}s in source file
                  - Outer loop: ${loopStart} to ${loopEnd} beats (${loopStartSeconds.toFixed(3)}s to ${loopEndSeconds.toFixed(3)}s)
                  - Final playback: ${finalAudioStart.toFixed(3)}s to ${finalAudioEnd.toFixed(3)}s`);
              } else {
                // Fallback: use the entire audio region
                finalAudioStart = audioRegionStart;
                finalAudioEnd = audioRegionStart + audioRegionDuration;
                
                console.log(`Audio timing calculation (fallback):
                  - Using entire audio region: ${finalAudioStart}s to ${finalAudioEnd}s`);
              }
            }
          }
          
          clip = {
            time,
            duration,
            playStart,
            notes,
            audioFile,
            audioRegionStart,
            audioRegionDuration,
            loopStart,
            loopEnd,
            finalAudioStart,
            finalAudioEnd
          };
        }
        
        clipSlots.push({
          trackId,
          clip,
          hasStop
        });
      });
      
      scenes.push({
        id: sceneId,
        name: sceneName,
        clipSlots
      });
    });
    
    return scenes;
  }
  
  private extractTransport(doc: Document): { tempo?: number; timeSignature?: { numerator: number; denominator: number } } {
    const tempoEl = doc.querySelector('Tempo');
    const timeSignatureEl = doc.querySelector('TimeSignature');
    
    const tempo = tempoEl ? parseFloat(tempoEl.getAttribute('value') || '120') : undefined;
    
    let timeSignature: { numerator: number; denominator: number } | undefined;
    if (timeSignatureEl) {
      timeSignature = {
        numerator: parseInt(timeSignatureEl.getAttribute('numerator') || '4'),
        denominator: parseInt(timeSignatureEl.getAttribute('denominator') || '4')
      };
    }
    
    console.log(`Project tempo: ${tempo} BPM, time signature: ${timeSignature?.numerator}/${timeSignature?.denominator}`);
    
    return { tempo, timeSignature };
  }
  
  private beatsToSeconds(beats: number, tempo: number): number {
    // Convert beats to seconds using BPM
    // At 110 BPM: 1 beat = 60/110 seconds ≈ 0.545 seconds
    return beats * (60 / tempo);
  }
  
  private extractMetadata(doc: Document): any {
    const metadata: any = {};
    const root = doc.documentElement;
    
    for (const child of root.children) {
      metadata[child.tagName] = child.textContent;
    }
    
    return metadata;
  }
}