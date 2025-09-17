// Functional reactive event system for Shape shift

export type AppState = {
  currentSceneIndex: number;
  isAutoMode: boolean;
  isPlaying: boolean;
  totalScenes: number;
  projectLoaded: boolean;
};

export type AppEvent =
  | { type: "PROJECT_LOADED"; totalScenes: number }
  | { type: "SCENE_NAVIGATE"; direction: number }
  | { type: "SCENE_SET"; index: number }
  | { type: "MODE_TOGGLE" }
  | { type: "PLAY_PAUSE" }
  | { type: "AUDIO_STARTED" }
  | { type: "AUDIO_STOPPED" }
  | { type: "AUTO_ADVANCE" };

export type AppEffect =
  | { type: "LOAD_SCENE_AUDIO"; sceneIndex: number }
  | { type: "UPDATE_UI" }
  | { type: "STOP_AUDIO" }
  | { type: "ADVANCE_SCENE" };

type EffectHandler = (effect: AppEffect, state: AppState) => void;
type Subscriber = (state: AppState) => void;

export class EventSystem {
  private state: AppState;
  private subscribers: Set<Subscriber> = new Set();
  private effectHandlers: Map<AppEffect["type"], EffectHandler> = new Map();

  constructor(initialState: AppState) {
    this.state = { ...initialState };
  }

  // Subscribe to state changes
  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  // Register effect handlers
  registerEffectHandler<T extends AppEffect["type"]>(
    type: T,
    handler: EffectHandler,
  ): void {
    this.effectHandlers.set(type, handler);
  }

  // Get current state
  getState(): AppState {
    return { ...this.state };
  }

  // Dispatch events with side effects
  dispatch(event: AppEvent): void {
    console.log("Event dispatched:", event);

    const newState = this.reduce(this.state, event);
    const effects = this.getEffects(this.state, newState, event);

    this.state = newState;

    // Execute effects
    effects.forEach((effect) => {
      const handler = this.effectHandlers.get(effect.type);
      if (handler) {
        handler(effect, this.state);
      }
    });

    // Notify subscribers
    this.subscribers.forEach((subscriber) => subscriber(this.state));
  }

  // Pure state reducer
  private reduce(state: AppState, event: AppEvent): AppState {
    switch (event.type) {
      case "PROJECT_LOADED":
        return {
          ...state,
          projectLoaded: true,
          totalScenes: event.totalScenes,
          currentSceneIndex: 1,
        };

      case "SCENE_NAVIGATE": {
        const newIndex = state.currentSceneIndex + event.direction;
        if (newIndex >= 1 && newIndex <= state.totalScenes) {
          return {
            ...state,
            currentSceneIndex: newIndex,
          };
        }
        return state;
      }

      case "SCENE_SET": {
        if (event.index >= 1 && event.index <= state.totalScenes) {
          return {
            ...state,
            currentSceneIndex: event.index,
          };
        }
        return state;
      }

      case "MODE_TOGGLE":
        return {
          ...state,
          isAutoMode: !state.isAutoMode,
        };

      case "PLAY_PAUSE":
        return {
          ...state,
          isPlaying: !state.isPlaying,
        };

      case "AUDIO_STARTED":
        return {
          ...state,
          isPlaying: true,
        };

      case "AUDIO_STOPPED":
        return {
          ...state,
          isPlaying: false,
        };

      case "AUTO_ADVANCE": {
        if (!state.isAutoMode) return state;

        const nextIndex = state.currentSceneIndex + 1;
        const newIndex = nextIndex <= state.totalScenes ? nextIndex : 1;

        return {
          ...state,
          currentSceneIndex: newIndex,
        };
      }

      default:
        return state;
    }
  }

  // Determine side effects based on state transition
  private getEffects(
    oldState: AppState,
    newState: AppState,
    event: AppEvent,
  ): AppEffect[] {
    const effects: AppEffect[] = [];

    // Always update UI when state changes
    if (oldState !== newState) {
      effects.push({ type: "UPDATE_UI" });
    }

    // Project loaded effects
    if (event.type === "PROJECT_LOADED") {
      effects.push({
        type: "LOAD_SCENE_AUDIO",
        sceneIndex: newState.currentSceneIndex,
      });
    }

    // Scene change effects
    if (oldState.currentSceneIndex !== newState.currentSceneIndex) {
      effects.push({ type: "STOP_AUDIO" });
      effects.push({
        type: "LOAD_SCENE_AUDIO",
        sceneIndex: newState.currentSceneIndex,
      });
    }

    // Mode change effects
    if (oldState.isAutoMode !== newState.isAutoMode) {
      effects.push({ type: "STOP_AUDIO" });
      if (newState.isPlaying || newState.isAutoMode) {
        effects.push({
          type: "LOAD_SCENE_AUDIO",
          sceneIndex: newState.currentSceneIndex,
        });
      }
    }

    // Play/pause effects
    if (event.type === "PLAY_PAUSE") {
      if (oldState.isPlaying) {
        effects.push({ type: "STOP_AUDIO" });
      } else {
        effects.push({
          type: "LOAD_SCENE_AUDIO",
          sceneIndex: newState.currentSceneIndex,
        });
      }
    }

    // Auto advance effects
    if (event.type === "AUTO_ADVANCE") {
      effects.push({ type: "ADVANCE_SCENE" });
    }

    return effects;
  }
}

// Create singleton instance
export const eventSystem = new EventSystem({
  currentSceneIndex: 1,
  isAutoMode: false,
  isPlaying: false,
  totalScenes: 0,
  projectLoaded: false,
});
