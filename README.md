# AI Software Factory

Next.js/Vercel workspace for building software with multiple AI providers.

## Current features
- Build conversation workspace
- AI Providers settings
- OpenAI, Anthropic, Google Gemini and OpenRouter adapters
- Connection test for each provider
- Automatic fallback routing when a configured provider fails
- Model selection per provider
- API keys entered directly in the app
- Live pipeline/router logs
- Responsive dark UI

## Security note
This MVP stores user-supplied API keys in the current browser's localStorage. Keys are not committed to GitHub. The server receives a key only when the browser makes an AI request.

For a multi-user production release, replace browser storage with authenticated server-side encrypted secret storage.

## Local
```bash
npm install
npm run dev
```

## Vercel
Import this repository into Vercel with the Next.js framework auto-detected. No provider API keys need to be placed in Vercel environment variables for this MVP.
