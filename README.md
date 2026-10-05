# NTalk Advanced

Mobile-first NTalk chat app with:
- Supabase Authentication
- Supabase profiles
- Supabase database messaging
- Realtime incoming messages
- Typing indicator
- Online presence
- Delivered/seen timestamps
- Image/file upload through Supabase Storage
- WebRTC voice/video calls
- PWA install support
- Dark/light theme

## Root files
All required app files are in the repository root:
`index.html`, `app.js`, `style.css`, `config.js`, `supabase.sql`, `manifest.json`, `sw.js`, `icon.svg`.

## Supabase setup
1. Create/open your Supabase project.
2. Open SQL Editor.
3. Run `supabase.sql`.
4. Open Settings → API.
5. Put Project URL and Publishable/Anon key into `config.js`.
6. In Authentication, configure email confirmation as you prefer.
7. Deploy with HTTPS (GitHub Pages works for the browser app).

## Important
Never put a Supabase service_role/secret key in `config.js`. Only use the browser-safe publishable/anon key.

## Two-user test
Create two accounts on two browsers/phones. Give each a unique username. Open Chats and use + to select/start a conversation. Messages should persist in Supabase and arrive through Realtime.

## Calls
Voice/video calls use WebRTC with Google STUN. Some mobile carrier/Wi-Fi networks may require a TURN server. Add TURN credentials in `config.js` if needed.

## PWA install
The app includes `manifest.json`, `sw.js`, and an install action in Profile. Production deployment must use HTTPS for service workers/install support.

## Current scope
This version advances the original demo into Supabase-backed 1-to-1 messaging and media plus the existing WebRTC calling path. Full WhatsApp-scale features such as end-to-end encryption, push notification infrastructure, multi-device sync, and production-grade abuse/security controls require additional backend infrastructure and testing.