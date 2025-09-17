import type { Track, Clip, SceneData } from './dawproject-parser';
import { PitchClassSetAnalyzer } from './pitch-class-set';
import type { PitchClassSet } from './pitch-class-set';

export interface Scene {
  index: number;
  name: string;
  referenceClip?: Clip;
  shapeClip?: Clip;
  pitchClassSet?: PitchClassSet;
}

export class SceneManager {
  private scenes: Scene[] = [];
  private tracks: Map<string, Track> = new Map();
  private referencesTrackId?: string;
  private shapesTrackId?: string;
  
  constructor(tracks: Track[], sceneData: SceneData[]) {
    // Build track map
    tracks.forEach(track => {
      this.tracks.set(track.id, track);
      
      // Identify special tracks
      if (track.name.toLowerCase().includes('reference')) {
        this.referencesTrackId = track.id;
        console.log(`Found references track: ${track.name} (${track.id})`);
      }
      if (track.name.toLowerCase().includes('shape')) {
        this.shapesTrackId = track.id;
        console.log(`Found shapes track: ${track.name} (${track.id})`);
      }
    });
    
    console.log('All tracks:', tracks.map(t => `${t.name} (${t.id})`));
    
    this.buildScenes(sceneData);
  }
  
  private buildScenes(sceneData: SceneData[]): void {
    this.scenes = sceneData.map((scene, index) => {
      let referenceClip: Clip | undefined;
      let shapeClip: Clip | undefined;
      
      // Find clips for reference and shape tracks in this scene
      scene.clipSlots.forEach(slot => {
        if (slot.clip) {
          if (slot.trackId === this.referencesTrackId) {
            referenceClip = slot.clip;
            console.log(`Found reference clip in scene ${index + 1}:`, slot.clip);
          } else if (slot.trackId === this.shapesTrackId) {
            shapeClip = slot.clip;
            console.log(`Found shape clip in scene ${index + 1}:`, slot.clip);
          }
        }
      });
      
      // Calculate pitch class set if shape clip exists
      const pitchClassSet = shapeClip && shapeClip.notes.length > 0
        ? PitchClassSetAnalyzer.extractPitchClassSet(shapeClip)
        : undefined;
      
      return {
        index: index + 1,
        name: scene.name || `Scene ${index + 1}`,
        referenceClip,
        shapeClip,
        pitchClassSet
      };
    });
  }
  
  getScenes(): Scene[] {
    return this.scenes;
  }
  
  getScene(index: number): Scene | undefined {
    return this.scenes[index - 1];
  }
  
  getTotalScenes(): number {
    return this.scenes.length;
  }
  
  getTrack(trackId: string): Track | undefined {
    return this.tracks.get(trackId);
  }
}