import type { Clip } from './dawproject-parser';

export interface PitchClassSet {
  pitchClasses: Set<number>;
  normalForm: number[];
  primeForm: number[];
  interval: number[];
  name?: string;
}

export class PitchClassSetAnalyzer {
  /**
   * Extract pitch classes from a clip's notes
   */
  static extractPitchClassSet(clip: Clip): PitchClassSet {
    const pitchClasses = new Set<number>();
    
    // Extract unique pitch classes (mod 12)
    clip.notes.forEach(note => {
      const pc = note.key % 12;
      pitchClasses.add(pc);
    });
    
    const normalForm = this.getNormalForm(Array.from(pitchClasses));
    const primeForm = this.getPrimeForm(normalForm);
    const interval = this.getIntervalVector(Array.from(pitchClasses));
    
    return {
      pitchClasses,
      normalForm,
      primeForm,
      interval,
      name: this.getSetName(primeForm)
    };
  }
  
  /**
   * Get the normal form of a pitch class set
   */
  static getNormalForm(pcs: number[]): number[] {
    if (pcs.length === 0) return [];
    
    // Sort the pitch classes
    const sorted = [...pcs].sort((a, b) => a - b);
    
    let bestRotation = sorted;
    let minSpan = 12;
    
    // Try all rotations
    for (let i = 0; i < sorted.length; i++) {
      const rotation = this.rotate(sorted, i);
      const span = (rotation[rotation.length - 1] - rotation[0] + 12) % 12;
      
      if (span < minSpan) {
        minSpan = span;
        bestRotation = rotation;
      } else if (span === minSpan) {
        // If spans are equal, choose the one that's most packed to the left
        if (this.isMorePackedLeft(rotation, bestRotation)) {
          bestRotation = rotation;
        }
      }
    }
    
    // Transpose to start from 0
    const first = bestRotation[0];
    return bestRotation.map(pc => (pc - first + 12) % 12);
  }
  
  /**
   * Get the prime form (most compact normal or inverted form)
   */
  static getPrimeForm(normalForm: number[]): number[] {
    if (normalForm.length === 0) return [];
    
    // Get inversion
    const inverted = [0, ...normalForm.slice(1).reverse().map(pc => (12 - pc) % 12)];
    const invertedNormal = this.getNormalForm(inverted);
    
    // Compare and return the more compact form
    if (this.isMoreCompact(invertedNormal, normalForm)) {
      return invertedNormal;
    }
    return normalForm;
  }
  
  /**
   * Get the interval vector
   */
  static getIntervalVector(pcs: number[]): number[] {
    const vector = [0, 0, 0, 0, 0, 0];
    
    for (let i = 0; i < pcs.length; i++) {
      for (let j = i + 1; j < pcs.length; j++) {
        const interval = Math.abs(pcs[i] - pcs[j]);
        const ic = Math.min(interval, 12 - interval); // interval class
        if (ic > 0 && ic <= 6) {
          vector[ic - 1]++;
        }
      }
    }
    
    return vector;
  }
  
  /**
   * Helper: Rotate array
   */
  private static rotate(arr: number[], positions: number): number[] {
    const n = arr.length;
    positions = positions % n;
    return [...arr.slice(positions), ...arr.slice(0, positions)];
  }
  
  /**
   * Helper: Check if first array is more packed to the left
   */
  private static isMorePackedLeft(a: number[], b: number[]): boolean {
    for (let i = 1; i < Math.min(a.length, b.length); i++) {
      const aInterval = (a[i] - a[0] + 12) % 12;
      const bInterval = (b[i] - b[0] + 12) % 12;
      if (aInterval < bInterval) return true;
      if (aInterval > bInterval) return false;
    }
    return false;
  }
  
  /**
   * Helper: Check if first form is more compact
   */
  private static isMoreCompact(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return a.length < b.length;
    
    const aSpan = a[a.length - 1];
    const bSpan = b[b.length - 1];
    
    if (aSpan !== bSpan) return aSpan < bSpan;
    
    return this.isMorePackedLeft(a, b);
  }
  
  /**
   * Get common name for pitch class sets (Forte numbers)
   */
  private static getSetName(primeForm: number[]): string | undefined {
    const primeString = primeForm.join(',');
    
    // Common pitch class sets (Forte numbers)
    const setNames: { [key: string]: string } = {
      // Trichords
      '0,1,2': '3-1',
      '0,1,3': '3-2',
      '0,1,4': '3-3',
      '0,1,5': '3-4',
      '0,1,6': '3-5',
      '0,2,4': '3-6',
      '0,2,5': '3-7',
      '0,2,6': '3-8',
      '0,2,7': '3-9',
      '0,3,6': '3-10',
      '0,3,7': '3-11',
      '0,4,8': '3-12',
      // Tetrachords
      '0,1,2,3': '4-1',
      '0,1,2,4': '4-2',
      '0,1,3,4': '4-3',
      '0,1,2,5': '4-4',
      '0,1,2,6': '4-5',
      '0,1,2,7': '4-6',
      '0,1,4,5': '4-7',
      '0,1,5,6': '4-8',
      '0,1,6,7': '4-9',
      '0,2,3,5': '4-10',
      '0,1,3,5': '4-11',
      '0,2,3,6': '4-12',
      '0,1,3,6': '4-13',
      '0,2,3,7': '4-14',
      '0,1,4,6': '4-15',
      '0,1,5,7': '4-16',
      '0,3,4,7': '4-17',
      '0,1,4,7': '4-18',
      '0,1,4,8': '4-19',
      '0,1,5,8': '4-20',
      '0,2,4,6': '4-21',
      '0,2,4,7': '4-22',
      '0,2,5,7': '4-23',
      '0,2,4,8': '4-24',
      '0,2,6,8': '4-25',
      '0,3,5,8': '4-26',
      '0,2,5,8': '4-27',
      '0,3,6,9': '4-28',
      // Add more as needed
    };
    
    return setNames[primeString];
  }
  
  /**
   * Get pitch class name
   */
  static getPitchClassName(pc: number): string {
    const names = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
    return names[pc % 12];
  }
  
  /**
   * Format pitch class set for display
   */
  static formatPitchClassSet(pcs: PitchClassSet): string {
    const pcNames = Array.from(pcs.pitchClasses)
      .sort((a, b) => a - b)
      .map(pc => this.getPitchClassName(pc))
      .join(', ');
    
    const normalFormStr = `[${pcs.normalForm.join(',')}]`;
    const primeFormStr = `(${pcs.primeForm.join(',')})`;
    const intervalStr = `<${pcs.interval.join('')}>`;
    
    let result = `{${pcNames}}\\nNormal: ${normalFormStr}\\nPrime: ${primeFormStr}`;
    if (pcs.name) {
      result += `\\nForte: ${pcs.name}`;
    }
    result += `\\nInterval: ${intervalStr}`;
    
    return result;
  }
}