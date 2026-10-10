# Lozix

Lozix study app. AI requests are sent through the Vercel Function at `/api/chat` and then to Google Gemini using the `GEMINI_API_KEY` environment variable.

The project intentionally relies on Vercel's standard root `api/` Function detection; no custom `builds` configuration is used.
