# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShapeShifter is a web application for analyzing pitch class sets in DAWproject files. It provides scene-based navigation through musical analysis with synchronized audio playback and visual pitch class set analysis.

## Key Commands

**Development:**
- `npm run dev` - Start the Vite development server on http://localhost:5173
- `npm run build` - Build for production
- `npm run preview` - Preview production build

**Type checking:**
- `npx tsc --noEmit` - Run TypeScript type checking

## Commit Message Style

When creating commit messages, write like a professional developer:
- Use concise, technical language describing what was done
- Include relevant details without being verbose
- Avoid AI enthusiasm language ("Perfect!", "Excellent!", "Great!")
- **NEVER mention Claude or AI assistance in commit messages**
- Write in imperative mood (Fix, Add, Implement, Update, Remove)
- Be professional and human-like, not promotional

## Project Architecture

### Core Components

1. **DAWproject Parser** (`src/dawproject-parser.ts`)
   - Extracts XML data from .dawproject ZIP files using JSZip
   - Parses Scenes and ClipSlots for proper clip organization
   - Handles multi-layer timing: audio regions, clip boundaries, loop regions
   - Converts beat-based timing to seconds using project tempo
   - Extracts tempo and time signature from Transport section

2. **Scene Manager** (`src/scene-manager.ts`)
   - Organizes clips by DAWproject Scene structure (not timeline position)
   - Maps clips from "shapes" and "references" tracks to each scene
   - Calculates pitch class sets for shape clips
   - Provides scene navigation interface

3. **Audio Player** (`src/audio-player.ts`)
   - Web Audio API implementation with single-source guarantee
   - Handles audio segment extraction and looping
   - Prevents overlapping audio through aggressive cleanup
   - Creates buffer segments for precise loop boundaries
   - Caches decoded audio buffers for performance

4. **Pitch Class Set Analyzer** (`src/pitch-class-set.ts`)
   - Implements pitch class set theory algorithms
   - Calculates normal form, prime form, and interval vectors
   - Maps sets to Forte numbers when available
   - Provides pitch class name utilities

5. **Main UI** (`src/main.ts`)
   - Scene-based navigation with audio synchronization
   - Large keyboard visualizations showing active pitch classes
   - Play/pause controls for audio segments
   - Displays pitch class set analysis with music theory details

### DAWproject Format Understanding

DAWproject files are ZIP archives containing XML that represents:

**Scene Structure:**
- `<Scenes>` contain `<Scene>` elements with clip launcher data
- Each Scene has `<ClipSlot>` elements referencing tracks
- ClipSlots contain the actual `<Clip>` data

**Multi-layer Timing:**
- **Outer Clip:** Timeline position, loop region (in beats), duration
- **Nested Audio Clip:** Source file region (in seconds), audio reference
- **Final Calculation:** `audioRegionStart + beatsToSeconds(loopOffset, tempo)`

**Tempo Conversion:**
- Loop regions use musical time (beats)
- Audio regions use absolute time (seconds)
- Conversion: `seconds = beats × (60 / BPM)`

### Key Implementation Details

**Audio Timing Integration:**
1. Extract tempo from `<Transport><Tempo>` element
2. Parse outer clip's `loopStart`/`loopEnd` (beats)
3. Parse nested clip's `playStart`/`duration` (seconds)
4. Convert beats to seconds and calculate final audio boundaries
5. Create audio buffer segments for seamless looping

**Scene Organization:**
- Uses actual DAWproject Scene/ClipSlot structure
- NOT based on timeline clip positions
- Each scene can have clips from multiple tracks
- Identifies "shapes" and "references" tracks by name matching

**Audio Cleanup:**
- Single AudioBufferSourceNode at a time
- Aggressive cleanup with context suspend/resume
- Delays between stop/start to prevent overlaps
- Buffer-based segmentation instead of setTimeout recursion

## Important Context

- The app specifically looks for tracks with "shape" or "reference" in their names
- Scenes are organized by DAWproject Scene structure, not timeline position
- Audio timing requires tempo conversion from beats to seconds
- Each scene plays a specific loop region of the reference audio
- Pitch class sets are calculated from aggregated notes in shape clips
- Test DAWproject files should be placed in the `public/` folder for auto-loading

## Development History

Built iteratively to handle the complexity of DAWproject format:
1. Initial Vite setup with basic file parsing
2. DAWproject XML extraction and track/clip parsing
3. Pitch class set analysis implementation
4. Scene-based organization (replacing timeline-based approach)
5. Web Audio API integration with segment looping
6. Multi-layer timing resolution (beats vs seconds)
7. Audio overlap elimination through single-source architecture
8. Tempo-aware beat-to-second conversion for accurate loop boundaries

The final implementation successfully integrates DAWproject format parsing, music theory analysis, and synchronized audio playback for interactive harmonic analysis.