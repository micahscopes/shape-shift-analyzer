# Shape shift

For learning the chords less frustratingly.
## Development

```bash
npm install
npm run dev
```

Place DAWproject files in the `public/` folder for auto-loading.

## Technical Details

Built with TypeScript, Vite, and Web Audio API. Implements pitch class set theory algorithms including normal form, prime form, interval vectors, and Forte number mapping.

Handles the complexity of DAWproject format including multi-layer timing (beats vs seconds), scene/clip slot organization, and audio region extraction.
