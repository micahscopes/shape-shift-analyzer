import './style.css';
import { DAWProjectParser } from './dawproject-parser';
import type { Track } from './dawproject-parser';
import { PitchClassSetAnalyzer } from './pitch-class-set';
import { SceneManager } from './scene-manager';
import type { Scene } from './scene-manager';
import { AudioPlayer } from './audio-player';
import JSZip from 'jszip';

const parser = new DAWProjectParser();
const audioPlayer = new AudioPlayer();
let sceneManager: SceneManager | null = null;
let currentSceneIndex = 1;
let projectZip: JSZip | null = null;

async function loadDAWProject(file: File) {
  try {
    await parser.loadFile(file);
    projectZip = parser.getZip();
    const project = await parser.parseProject();
    
    // Initialize scene manager with tracks and scenes
    sceneManager = new SceneManager(project.tracks, project.scenes);
    
    // Start with first scene
    currentSceneIndex = 1;
    displaySceneView();
    
  } catch (error) {
    console.error('Error loading DAWproject:', error);
    alert('Error loading DAWproject file. See console for details.');
  }
}

function displaySceneView() {
  const container = document.getElementById('scene-container');
  if (!container || !sceneManager) return;
  
  const scene = sceneManager.getScene(currentSceneIndex);
  if (!scene) return;
  
  container.innerHTML = '';
  
  // Create scene header with navigation
  const header = createSceneHeader(scene, sceneManager.getTotalScenes());
  container.appendChild(header);
  
  // Create main scene content
  const content = createSceneContent(scene);
  container.appendChild(content);
  
  // Load and play audio if available
  loadSceneAudio(scene);
}

function createSceneHeader(scene: Scene, totalScenes: number): HTMLElement {
  const header = document.createElement('div');
  header.className = 'scene-header';
  
  header.innerHTML = `
    <button id="prev-scene" class="nav-arrow" ${currentSceneIndex <= 1 ? 'disabled' : ''}>
      ◀
    </button>
    <h2>${scene.name} (${scene.index} of ${totalScenes})</h2>
    <button id="next-scene" class="nav-arrow" ${currentSceneIndex >= totalScenes ? 'disabled' : ''}>
      ▶
    </button>
  `;
  
  // Add navigation event listeners
  const prevBtn = header.querySelector('#prev-scene') as HTMLButtonElement;
  const nextBtn = header.querySelector('#next-scene') as HTMLButtonElement;
  
  prevBtn?.addEventListener('click', () => navigateScene(-1));
  nextBtn?.addEventListener('click', () => navigateScene(1));
  
  return header;
}

function createSceneContent(scene: Scene): HTMLElement {
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
      <p class="clip-name">${scene.referenceClip.name || 'Untitled'}</p>
      <p class="clip-timing">Duration: ${scene.referenceClip.duration.toFixed(2)} beats</p>
      <div id="audio-status" class="audio-status">Loading audio...</div>
      <button id="play-pause-btn" class="play-pause-btn">⏸ Pause</button>
    `;
    leftColumn.appendChild(referenceSection);
    
    // Add play/pause functionality
    setTimeout(() => {
      const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
      if (playPauseBtn) {
        playPauseBtn.addEventListener('click', togglePlayPause);
        updatePlayPauseButton();
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
    <p class="clip-name">${scene.shapeClip?.name || 'Untitled Shape'}</p>
  `;
  
  // Create large keyboard visualization
  const keyboardContainer = document.createElement('div');
  keyboardContainer.className = 'keyboard-container';
  
  const keyboard = createLargeKeyboard(pitchClasses);
  keyboardContainer.appendChild(keyboard);
  section.appendChild(keyboardContainer);
  
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
  
  const whiteKeys = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B
  const blackKeys = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#
  
  // Create white keys first
  const whiteKeysContainer = document.createElement('div');
  whiteKeysContainer.className = 'white-keys';
  
  whiteKeys.forEach(pc => {
    const key = document.createElement('div');
    key.className = `key white-key ${activePitchClasses.includes(pc) ? 'active' : ''}`;
    key.dataset.pitch = pc.toString();
    
    const label = document.createElement('span');
    label.className = 'key-label';
    label.textContent = PitchClassSetAnalyzer.getPitchClassName(pc).replace(/[#/].*/, '');
    key.appendChild(label);
    
    whiteKeysContainer.appendChild(key);
  });
  
  // Create black keys
  const blackKeysContainer = document.createElement('div');
  blackKeysContainer.className = 'black-keys';
  
  // Position black keys appropriately
  const blackKeyPositions = [0.5, 1.5, 3.5, 4.5, 5.5]; // Positions between white keys
  
  blackKeys.forEach((pc, index) => {
    const key = document.createElement('div');
    key.className = `key black-key ${activePitchClasses.includes(pc) ? 'active' : ''}`;
    key.dataset.pitch = pc.toString();
    key.style.left = `${blackKeyPositions[index] * 60}px`; // 60px is white key width
    
    const label = document.createElement('span');
    label.className = 'key-label';
    label.textContent = PitchClassSetAnalyzer.getPitchClassName(pc).split('/')[0].replace(/[CD]/, '');
    key.appendChild(label);
    
    blackKeysContainer.appendChild(key);
  });
  
  keyboard.appendChild(whiteKeysContainer);
  keyboard.appendChild(blackKeysContainer);
  
  return keyboard;
}

async function loadSceneAudio(scene: Scene) {
  const audioStatus = document.getElementById('audio-status');
  
  if (!scene.referenceClip || !scene.referenceClip.audioFile || !projectZip) {
    if (audioStatus) {
      audioStatus.textContent = 'No audio available';
      audioStatus.className = 'audio-status no-audio';
    }
    audioPlayer.stop();
    return;
  }
  
  if (audioStatus) {
    audioStatus.textContent = 'Loading audio...';
    audioStatus.className = 'audio-status loading';
  }
  
  try {
    const audioBuffer = await audioPlayer.loadAudioFromZip(
      projectZip,
      scene.referenceClip.audioFile
    );
    
    if (audioBuffer) {
      // Use the calculated final timing
      const startTime = scene.referenceClip.finalAudioStart;
      const endTime = scene.referenceClip.finalAudioEnd;
      
      console.log(`Scene ${scene.index}: Using calculated timing:`);
      console.log(`  - finalAudioStart=${startTime}s`);
      console.log(`  - finalAudioEnd=${endTime}s`);
      console.log(`  - audioRegionStart=${scene.referenceClip.audioRegionStart}s`);
      console.log(`  - loopStart=${scene.referenceClip.loopStart}, loopEnd=${scene.referenceClip.loopEnd}`);
      
      await audioPlayer.playLoop(audioBuffer, startTime, endTime);
      
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
    }
  } catch (error) {
    console.error('Error loading audio:', error);
    if (audioStatus) {
      audioStatus.textContent = 'Audio error';
      audioStatus.className = 'audio-status error';
    }
  }
}

function navigateScene(direction: number) {
  if (!sceneManager) return;
  
  const newIndex = currentSceneIndex + direction;
  const totalScenes = sceneManager.getTotalScenes();
  
  if (newIndex >= 1 && newIndex <= totalScenes) {
    console.log(`Navigating from scene ${currentSceneIndex} to scene ${newIndex} - STOPPING ALL AUDIO`);
    
    // CRITICAL: Stop audio first and wait longer for cleanup
    audioPlayer.stop();
    
    // Longer delay to ensure complete cleanup before starting new audio
    setTimeout(() => {
      console.log(`Starting scene ${newIndex} after cleanup delay`);
      currentSceneIndex = newIndex;
      displaySceneView();
    }, 200);
  }
}

function togglePlayPause() {
  console.log('Toggle play/pause clicked, current state:', audioPlayer.getIsPlaying());
  
  if (audioPlayer.getIsPlaying()) {
    audioPlayer.stop();
    updatePlayPauseButton();
  } else {
    // Small delay to ensure stop() cleanup is complete
    setTimeout(() => {
      // Reload the current scene's audio
      const scene = sceneManager?.getScene(currentSceneIndex);
      if (scene) {
        loadSceneAudio(scene);
      }
      updatePlayPauseButton();
    }, 50);
  }
}

function updatePlayPauseButton() {
  const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
  if (playPauseBtn) {
    if (audioPlayer.getIsPlaying()) {
      playPauseBtn.textContent = '⏸ Pause';
      playPauseBtn.classList.add('playing');
    } else {
      playPauseBtn.textContent = '▶ Play';
      playPauseBtn.classList.remove('playing');
    }
  }
}

// Keyboard navigation
document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') {
    navigateScene(-1);
  } else if (event.key === 'ArrowRight') {
    navigateScene(1);
  }
});

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  const app = document.querySelector<HTMLDivElement>('#app');
  
  if (app) {
    app.innerHTML = `
      <div class="container">
        <h1>ShapeShifter</h1>
        
        <div class="file-input-container">
          <input type="file" id="file-input" accept=".dawproject">
          <label for="file-input" class="file-label">Choose DAWproject file</label>
          <span id="file-name">No file selected</span>
        </div>
        
        <div id="scene-container"></div>
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
    
    // Check if there's a dawproject file in the current directory we can load
    checkForLocalFile();
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