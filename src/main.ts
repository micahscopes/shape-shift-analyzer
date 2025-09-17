import './style.css';
import { DAWProjectParser } from './dawproject-parser';
import { PitchClassSetAnalyzer } from './pitch-class-set';
import { SceneManager } from './scene-manager';
import type { Scene } from './scene-manager';
import { AudioPlayer } from './audio-player';
import { eventSystem } from './event-system';
import type { AppState } from './event-system';
import JSZip from 'jszip';

const parser = new DAWProjectParser();
const audioPlayer = new AudioPlayer();
let sceneManager: SceneManager | null = null;
let projectZip: JSZip | null = null;

// Audio loading state to prevent overlaps
let currentAudioRequestId: string | null = null;
let isAudioLoading: boolean = false;

// Navigation debouncing to prevent double clicks
let navigationInProgress: boolean = false;

// Keyboard octave toggle
let showTwoOctaves: boolean = true;

// Register effect handlers for the event system
eventSystem.registerEffectHandler('UPDATE_UI', (_, state) => {
  updateUI(state);
});

eventSystem.registerEffectHandler('LOAD_SCENE_AUDIO', (effect, state) => {
  if (effect.type === 'LOAD_SCENE_AUDIO') {
    const scene = sceneManager?.getScene(effect.sceneIndex);
  if (scene) {
    // Generate new request ID and cancel previous
    const requestId = Math.random().toString(36).substr(2, 9);
    currentAudioRequestId = requestId;
    console.log(`Starting new audio request ${requestId} for scene ${effect.sceneIndex}`);
    
    // If we're already loading, cancel the current request and start new one
    if (isAudioLoading) {
      console.log('Audio already loading, will be cancelled by new request');
    }
    
    setTimeout(() => {
      if (currentAudioRequestId === requestId) {
        loadSceneAudio(scene, state, requestId);
      } else {
        console.log(`Audio request ${requestId} cancelled before execution`);
      }
    }, 100); // Reduced delay
  }
  }
});

eventSystem.registerEffectHandler('STOP_AUDIO', async (_, _state) => {
  console.log('Stopping audio via effect system');
  await audioPlayer.stop();
  // Don't cancel pending requests here - let them be managed by LOAD_SCENE_AUDIO
  // Don't dispatch AUDIO_STOPPED here - let the loadSceneAudio function handle it
});

eventSystem.registerEffectHandler('ADVANCE_SCENE', (_, state) => {
  // This is already handled by the AUTO_ADVANCE event in the reducer
  // Just update the UI
  updateUI(state);
});

// Subscribe to state changes for debugging
eventSystem.subscribe((state) => {
  console.log('State updated:', state);
});

async function loadDAWProject(file: File) {
  try {
    await parser.loadFile(file);
    projectZip = parser.getZip();
    const project = await parser.parseProject();
    
    // Initialize scene manager with tracks and scenes
    sceneManager = new SceneManager(project.tracks, project.scenes);
    
    // Dispatch project loaded event
    eventSystem.dispatch({ 
      type: 'PROJECT_LOADED', 
      totalScenes: sceneManager.getTotalScenes() 
    });
    
  } catch (error) {
    console.error('Error loading DAWproject:', error);
    alert('Error loading DAWproject file. See console for details.');
  }
}

function updateUI(state: AppState) {
  const container = document.getElementById('scene-container');
  if (!container || !sceneManager || !state.projectLoaded) return;
  
  const scene = sceneManager.getScene(state.currentSceneIndex);
  if (!scene) return;
  
  // Check if we need to completely rebuild the scene view
  const existingHeader = container.querySelector('.scene-header');
  const existingContent = container.querySelector('.scene-content');
  
  if (!existingHeader || !existingContent) {
    // Full rebuild
    displaySceneView(state);
  } else {
    // Update header and content - content contains pitch class analysis
    updateSceneHeader(state);
    updateSceneContent(scene, state);
    updatePlayPauseButton(state);
  }
}

function displaySceneView(state: AppState) {
  const container = document.getElementById('scene-container');
  if (!container || !sceneManager) return;
  
  const scene = sceneManager.getScene(state.currentSceneIndex);
  if (!scene) return;
  
  container.innerHTML = '';
  
  // Create scene header with navigation
  const header = createSceneHeader(scene, state);
  container.appendChild(header);
  
  // Create main scene content
  const content = createSceneContent(scene, state);
  container.appendChild(content);
}

function updateSceneHeader(state: AppState) {
  const container = document.getElementById('scene-container');
  if (!container || !sceneManager) return;
  
  const scene = sceneManager.getScene(state.currentSceneIndex);
  if (!scene) return;
  
  // Only update the header, don't touch content or audio
  const existingHeader = container.querySelector('.scene-header');
  if (existingHeader) {
    const newHeader = createSceneHeader(scene, state);
    existingHeader.replaceWith(newHeader);
  }
}

function updateSceneContent(scene: Scene, state: AppState) {
  const container = document.getElementById('scene-container');
  if (!container) return;
  
  // Update the existing scene content with new scene data
  const existingContent = container.querySelector('.scene-content');
  if (existingContent) {
    const newContent = createSceneContent(scene, state);
    existingContent.replaceWith(newContent);
  }
}

function createSceneHeader(scene: Scene, state: AppState): HTMLElement {
  const header = document.createElement('div');
  header.className = 'scene-header';
  
  header.innerHTML = `
    <button id="prev-scene" class="nav-arrow" ${state.currentSceneIndex <= 1 ? 'disabled' : ''}>
      ◀
    </button>
    <div class="scene-info">
      <h2>${scene.name}</h2>
      <p>Scene ${scene.index} of ${state.totalScenes}</p>
    </div>
    <div class="mode-toggle">
      <button id="mode-toggle" class="mode-btn ${state.isAutoMode ? 'auto' : 'scene'}">
        ${state.isAutoMode ? '🔄 Auto Mode' : '🎵 Scene Mode'}
      </button>
    </div>
    <button id="next-scene" class="nav-arrow" ${state.currentSceneIndex >= state.totalScenes ? 'disabled' : ''}>
      ▶
    </button>
  `;
  
  // Add navigation event listeners
  const prevBtn = header.querySelector('#prev-scene') as HTMLButtonElement;
  const nextBtn = header.querySelector('#next-scene') as HTMLButtonElement;
  const modeToggleBtn = header.querySelector('#mode-toggle') as HTMLButtonElement;
  
  prevBtn?.addEventListener('click', () => {
    if (!navigationInProgress) {
      navigationInProgress = true;
      console.log('Manual navigation: previous scene');
      eventSystem.dispatch({ type: 'SCENE_NAVIGATE', direction: -1 });
      setTimeout(() => { navigationInProgress = false; }, 300);
    }
  });
  nextBtn?.addEventListener('click', () => {
    if (!navigationInProgress) {
      navigationInProgress = true;
      console.log('Manual navigation: next scene');
      eventSystem.dispatch({ type: 'SCENE_NAVIGATE', direction: 1 });
      setTimeout(() => { navigationInProgress = false; }, 300);
    }
  });
  modeToggleBtn?.addEventListener('click', () => eventSystem.dispatch({ type: 'MODE_TOGGLE' }));
  
  return header;
}

function createSceneContent(scene: Scene, state: AppState): HTMLElement {
  const content = document.createElement('div');
  content.className = 'scene-content';
  
  // Create two columns
  const leftColumn = document.createElement('div');
  leftColumn.className = 'scene-column';
  
  const rightColumn = document.createElement('div');
  rightColumn.className = 'scene-column';
  
  // Left column: Reference info and audio controls
  if (scene.referenceClip) {
    const referenceSection = document.createElement('div');
    referenceSection.className = 'reference-section';
    referenceSection.innerHTML = `
      <h3>Reference</h3>
      ${scene.referenceClip.name ? `<p class="clip-name">${scene.referenceClip.name}</p>` : ''}
      <p class="clip-timing">Duration: ${scene.referenceClip.finalAudioEnd && scene.referenceClip.finalAudioStart ? (scene.referenceClip.finalAudioEnd - scene.referenceClip.finalAudioStart).toFixed(1) + 's' : scene.referenceClip.duration.toFixed(2) + ' beats'}</p>
      <div id="audio-status" class="audio-status">Loading audio...</div>
      <button id="play-pause-btn" class="play-pause-btn">⏸ Pause</button>
    `;
    leftColumn.appendChild(referenceSection);
    
    // Add play/pause functionality
    setTimeout(() => {
      const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
      if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => eventSystem.dispatch({ type: 'PLAY_PAUSE' }));
        updatePlayPauseButton(state);
      }
    }, 0);
  } else {
    leftColumn.innerHTML = '<div class="no-reference">No reference clip for this scene</div>';
  }
  
  // Right column: Shape analysis
  if (scene.shapeClip && scene.pitchClassSet) {
    const shapeSection = createShapeAnalysis(scene);
    rightColumn.appendChild(shapeSection);
  } else {
    rightColumn.innerHTML = '<div class="no-shape">No shape clip for this scene</div>';
  }
  
  content.appendChild(leftColumn);
  content.appendChild(rightColumn);
  
  return content;
}

function createShapeAnalysis(scene: Scene): HTMLElement {
  const section = document.createElement('div');
  section.className = 'shape-section';
  
  if (!scene.pitchClassSet) return section;
  
  const pitchClasses = Array.from(scene.pitchClassSet.pitchClasses).sort((a, b) => a - b);
  const pcNames = pitchClasses.map(pc => PitchClassSetAnalyzer.getPitchClassName(pc));
  
  section.innerHTML = `
    <h3>Shape Analysis</h3>
    ${scene.shapeClip?.name ? `<p class="clip-name">${scene.shapeClip.name}</p>` : ''}
    <button id="octave-toggle" class="toggle-notes">
      ${showTwoOctaves ? '2 Octaves' : '1 Octave'}
    </button>
  `;
  
  // Create large keyboard visualization
  const keyboardContainer = document.createElement('div');
  keyboardContainer.className = 'keyboard-container';
  keyboardContainer.id = 'keyboard-container'; // Give it an ID for updates
  
  const keyboard = createLargeKeyboard(pitchClasses);
  keyboardContainer.appendChild(keyboard);
  section.appendChild(keyboardContainer);
  
  // Add octave toggle functionality
  setTimeout(() => {
    const octaveToggle = document.getElementById('octave-toggle') as HTMLButtonElement;
    if (octaveToggle) {
      octaveToggle.addEventListener('click', () => {
        showTwoOctaves = !showTwoOctaves;
        octaveToggle.textContent = showTwoOctaves ? '2 Octaves' : '1 Octave';
        
        // Recreate the keyboard with new octave setting
        const container = document.getElementById('keyboard-container');
        if (container) {
          container.innerHTML = '';
          const newKeyboard = createLargeKeyboard(pitchClasses);
          container.appendChild(newKeyboard);
        }
      });
    }
  }, 0);
  
  // Add pitch class set details
  const analysisDetails = document.createElement('div');
  analysisDetails.className = 'analysis-details';
  analysisDetails.innerHTML = `
    <div class="analysis-row">
      <span class="label">Pitch Classes:</span>
      <span class="value">{${pcNames.join(', ')}}</span>
    </div>
    <div class="analysis-row">
      <span class="label">Normal Form:</span>
      <span class="value">[${scene.pitchClassSet.normalForm.join(', ')}]</span>
    </div>
    <div class="analysis-row">
      <span class="label">Prime Form:</span>
      <span class="value">(${scene.pitchClassSet.primeForm.join(', ')})</span>
    </div>
    ${scene.pitchClassSet.name ? `
    <div class="analysis-row">
      <span class="label">Forte Number:</span>
      <span class="value">${scene.pitchClassSet.name}</span>
    </div>
    ` : ''}
    <div class="analysis-row">
      <span class="label">Interval Vector:</span>
      <span class="value">&lt;${scene.pitchClassSet.interval.join('')}&gt;</span>
    </div>
  `;
  section.appendChild(analysisDetails);
  
  return section;
}

function createLargeKeyboard(activePitchClasses: number[]): HTMLElement {
  const keyboard = document.createElement('div');
  keyboard.className = 'large-keyboard';
  
  let whiteKeys: number[];
  let blackKeys: number[];
  let totalWhiteKeys: number;
  let blackKeyPositions: number[];
  let blackKeyWidth: number;

  if (showTwoOctaves) {
    // Two octaves starting on F: F G A B C D E | F G A B C D E
    whiteKeys = [5, 7, 9, 11, 0, 2, 4, 5, 7, 9, 11, 0, 2, 4]; // 14 white keys
    blackKeys = [6, 8, 10, 1, 3, 6, 8, 10, 1, 3]; // 10 black keys (F# G# A# C# D# repeated)
    totalWhiteKeys = 14;
    blackKeyWidth = 35;

    const keyUnit = 700 / totalWhiteKeys; // ~50px per white key
    
    // Position black keys carefully between white keys
    blackKeyPositions = [
      keyUnit * 1.0 - blackKeyWidth/2,   // F# (between F-G, 1st octave)
      keyUnit * 2.0 - blackKeyWidth/2,   // G# (between G-A, 1st octave)
      keyUnit * 3.0 - blackKeyWidth/2,   // A# (between A-B, 1st octave)
      keyUnit * 5.0 - blackKeyWidth/2,   // C# (between C-D, 1st octave)
      keyUnit * 6.0 - blackKeyWidth/2,   // D# (between D-E, 1st octave)
      keyUnit * 8.0 - blackKeyWidth/2,   // F# (between F-G, 2nd octave)
      keyUnit * 9.0 - blackKeyWidth/2,   // G# (between G-A, 2nd octave)
      keyUnit * 10.0 - blackKeyWidth/2,  // A# (between A-B, 2nd octave)
      keyUnit * 12.0 - blackKeyWidth/2,  // C# (between C-D, 2nd octave)
      keyUnit * 13.0 - blackKeyWidth/2   // D# (between D-E, 2nd octave)
    ];
  } else {
    // Single octave starting on C: C D E F G A B
    whiteKeys = [0, 2, 4, 5, 7, 9, 11]; // 7 white keys
    blackKeys = [1, 3, 6, 8, 10]; // 5 black keys (C# D# F# G# A#)
    totalWhiteKeys = 7;
    blackKeyWidth = 60;

    const keyUnit = 700 / totalWhiteKeys; // ~100px per white key
    
    // Position black keys carefully between white keys for single octave
    blackKeyPositions = [
      keyUnit * 1.0 - blackKeyWidth/2,   // C# (between C-D)
      keyUnit * 2.0 - blackKeyWidth/2,   // D# (between D-E)
      keyUnit * 4.0 - blackKeyWidth/2,   // F# (between F-G)
      keyUnit * 5.0 - blackKeyWidth/2,   // G# (between G-A)
      keyUnit * 6.0 - blackKeyWidth/2    // A# (between A-B)
    ];
  }
  
  // Create white keys first
  const whiteKeysContainer = document.createElement('div');
  whiteKeysContainer.className = 'white-keys';
  
  whiteKeys.forEach(pc => {
    const key = document.createElement('div');
    key.className = `key white-key ${activePitchClasses.includes(pc) ? 'active' : ''}`;
    key.dataset.pitch = pc.toString();
    
    // No labels needed - clean visual
    
    whiteKeysContainer.appendChild(key);
  });
  
  // Create black keys
  const blackKeysContainer = document.createElement('div');
  blackKeysContainer.className = 'black-keys';
  
  blackKeys.forEach((pc, index) => {
    const key = document.createElement('div');
    key.className = `key black-key ${activePitchClasses.includes(pc) ? 'active' : ''}`;
    key.dataset.pitch = pc.toString();
    key.style.left = `${blackKeyPositions[index]}px`;
    key.style.top = '-3px'; // Shift black keys up slightly
    key.style.width = `${showTwoOctaves ? 35 : 60}px`; // Dynamic width based on octave mode

    // No labels needed - clean visual

    blackKeysContainer.appendChild(key);
  });
  
  keyboard.appendChild(whiteKeysContainer);
  keyboard.appendChild(blackKeysContainer);
  
  return keyboard;
}

async function loadSceneAudio(scene: Scene, state: AppState, requestId?: string) {
  const audioStatus = document.getElementById('audio-status');
  
  // Check if this request is still current
  if (requestId && currentAudioRequestId !== requestId) {
    console.log(`Audio request ${requestId} cancelled - newer request started`);
    return;
  }
  
  isAudioLoading = true;
  console.log(`Loading audio for scene ${scene.index} with request ${requestId}`);
  
  if (!scene.referenceClip || !scene.referenceClip.audioFile || !projectZip) {
    if (audioStatus) {
      audioStatus.textContent = 'No audio available';
      audioStatus.className = 'audio-status no-audio';
    }
    eventSystem.dispatch({ type: 'AUDIO_STOPPED' });
    isAudioLoading = false;
    return;
  }
  
  if (audioStatus) {
    audioStatus.textContent = 'Loading audio...';
    audioStatus.className = 'audio-status loading';
  }
  
  try {
    // Check if cancelled before starting audio loading
    if (requestId && currentAudioRequestId !== requestId) {
      console.log(`Audio request ${requestId} cancelled before loading`);
      return;
    }
    
    const audioBuffer = await audioPlayer.loadAudioFromZip(
      projectZip,
      scene.referenceClip.audioFile
    );
    
    // Check if cancelled after loading but before playing
    if (requestId && currentAudioRequestId !== requestId) {
      console.log(`Audio request ${requestId} cancelled after loading`);
      return;
    }
    
    if (audioBuffer) {
      // Use the calculated final timing
      const startTime = scene.referenceClip.finalAudioStart;
      const endTime = scene.referenceClip.finalAudioEnd;
      
      console.log(`Scene ${scene.index}: Using calculated timing:`);
      console.log(`  - finalAudioStart=${startTime}s`);
      console.log(`  - finalAudioEnd=${endTime}s`);
      
      // Set the audio player mode based on current app mode
      if (state.isAutoMode) {
        audioPlayer.setLoopMode('once', () => {
          // Double-check we're still in auto mode when callback fires
          const currentState = eventSystem.getState();
          if (currentState.isAutoMode && currentState.isPlaying && !navigationInProgress) {
            console.log('Auto-advancing due to audio end');
            navigationInProgress = true;
            eventSystem.dispatch({ type: 'AUTO_ADVANCE' });
            setTimeout(() => { navigationInProgress = false; }, 300);
          } else {
            console.log('Skipping auto-advance - mode changed, not playing, or navigation in progress');
          }
        });
      } else {
        audioPlayer.setLoopMode('loop');
      }
      
      await audioPlayer.playSegment(audioBuffer, startTime, endTime);
      eventSystem.dispatch({ type: 'AUDIO_STARTED' });
      
      if (audioStatus) {
        const regionText = startTime !== undefined && endTime !== undefined 
          ? ` (${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s)`
          : '';
        audioStatus.textContent = `🔊 Playing (looped)${regionText}`;
        audioStatus.className = 'audio-status playing';
      }
    } else {
      if (audioStatus) {
        audioStatus.textContent = 'Failed to load audio';
        audioStatus.className = 'audio-status error';
      }
      eventSystem.dispatch({ type: 'AUDIO_STOPPED' });
    }
  } catch (error) {
    console.error('Error loading audio:', error);
    if (audioStatus) {
      audioStatus.textContent = 'Audio error';
      audioStatus.className = 'audio-status error';
    }
    eventSystem.dispatch({ type: 'AUDIO_STOPPED' });
  } finally {
    isAudioLoading = false;
    console.log(`Audio loading completed for request ${requestId}`);
  }
}

function updatePlayPauseButton(state: AppState) {
  const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
  if (playPauseBtn) {
    if (state.isPlaying) {
      playPauseBtn.textContent = '⏸ Pause';
      playPauseBtn.classList.add('playing');
    } else {
      playPauseBtn.textContent = '▶ Play';
      playPauseBtn.classList.remove('playing');
    }
  }
}

// Keyboard navigation using event system
document.addEventListener('keydown', (event) => {
  if (!navigationInProgress) {
    if (event.key === 'ArrowLeft') {
      navigationInProgress = true;
      console.log('Keyboard navigation: previous scene');
      eventSystem.dispatch({ type: 'SCENE_NAVIGATE', direction: -1 });
      setTimeout(() => { navigationInProgress = false; }, 300);
    } else if (event.key === 'ArrowRight') {
      navigationInProgress = true;
      console.log('Keyboard navigation: next scene');
      eventSystem.dispatch({ type: 'SCENE_NAVIGATE', direction: 1 });
      setTimeout(() => { navigationInProgress = false; }, 300);
    }
  }
});

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  const app = document.querySelector<HTMLDivElement>('#app');
  
  if (app) {
    app.innerHTML = `
      <div class="container">
        <div id="scene-container"></div>

        <div class="file-input-container">
          <input type="file" id="file-input" accept=".dawproject">
          <label for="file-input" class="file-label">Choose DAWproject file</label>
          <span id="file-name">No file selected</span>
        </div>
      </div>
    `;
    
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const fileName = document.getElementById('file-name');
    
    fileInput?.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      
      if (file) {
        if (fileName) {
          fileName.textContent = file.name;
        }
        loadDAWProject(file);
      }
    });
    
    // Auto-load local file only in development
    if (import.meta.env.DEV) {
      checkForLocalFile();
    }
  }
});

async function checkForLocalFile() {
  try {
    const response = await fetch("/Joanna's Theme analysis.dawproject");
    if (response.ok) {
      const blob = await response.blob();
      const file = new File([blob], "Joanna's Theme analysis.dawproject");
      
      const fileName = document.getElementById('file-name');
      if (fileName) {
        fileName.textContent = "Joanna's Theme analysis.dawproject (auto-loaded)";
      }
      
      loadDAWProject(file);
    }
  } catch (error) {
    console.log('No local DAWproject file found, waiting for user to select one.');
  }
}