# ShapeShifter

A web application for analyzing pitch class sets in DAWproject files with synchronized audio playback.

## Features

- Parse DAWproject files and extract scene-based clip organization
- Analyze pitch class sets from MIDI clips with music theory calculations
- Synchronized audio playback of reference clips with precise loop boundaries
- Visual keyboard display showing active pitch classes
- Scene navigation with tempo-aware timing conversion

## Development

```bash
npm install
npm run dev
```

Place DAWproject files in the `public/` folder for auto-loading.

## Technical Details

Built with TypeScript, Vite, and Web Audio API. Implements pitch class set theory algorithms including normal form, prime form, interval vectors, and Forte number mapping.

Handles the complexity of DAWproject format including multi-layer timing (beats vs seconds), scene/clip slot organization, and audio region extraction.