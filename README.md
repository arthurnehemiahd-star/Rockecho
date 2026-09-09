# Rockecho | Songs & Beats

A Suno-style AI song generator: describe a song (or write your own lyrics), and Rockecho generates two full takes with AI vocals and instrumentation — no recording or vocal upload required.

## Features

- 🎵 **Text-to-Song Generation** – Describe a vibe or write your own lyrics; Rockecho generates two AI takes with full vocals and instrumentation, in one request — via Replicate (paid) or a completely free self-hosted model server, your choice
- ✍️ **AI Lyrics Writer** – Simple mode auto-writes structured lyrics ([verse]/[chorus]/[bridge]) from your description; edit them before generating, or write your own in Custom mode
- 🎤 **Record over a beat** – Pick a track from your library as a backing beat, sing along, and Rockecho mixes your mic and the beat into one take client-side
- 🎚️ **Stem Separation** – Split any of your tracks into vocals, drums, bass, and other, each saved as its own downloadable track
- ↔️ **Extend** – Add seconds to the beginning or end of a track, matching its original style
- 🪪 **Personas** – Save a style-tag combo by name and reapply it to new songs in one click
- ©️ **Automatic Copyright Record** – Every song you generate or record is auto-stamped with a copyright owner, a unique rights ID, and a registration timestamp the moment it's created — no forms to fill in
- 🔐 **Gmail-only accounts with real password reset** – Sign up with a Gmail address and a password you choose; a forgotten password sends an actual reset link to that Gmail inbox
- 🔇 **Instrumental Mode** – Skip vocals entirely for a pure instrumental track
- 📊 **Analytics Dashboard** – Track views, likes, downloads, and audience engagement
- 🎼 **Track Management** – Organize songs and beats into collections
- 🛡️ **Rights Management** – Maintain verified ownership and rights records for all content
- 🎨 **Professional UI** – Clean, modern interface for music creators
- 💾 **Persistent Storage** – SQLite database for all track and metadata storage

## Tech Stack

- **Backend:** Node.js with Express.js
- **Frontend:** HTML5, CSS3, vanilla JavaScript
- **Database:** SQLite3
- **File Upload:** Multer
- **API Integration:** Replicate (AI music generation)
- **Utilities:** CORS, dotenv for environment configuration

## Project Structure

The app is split into two independent pieces that talk to each other over HTTP:

```
rockecho/
├── backend/     # Express API — database, song/video generation, auth, email
│   ├── server.js
│   ├── database.js
│   ├── package.json
│   ├── .env.example
│   └── workflows/       # (you create this) ComfyUI workflow JSON for free video generation
└── frontend/    # Static site — just talks to the backend's API
    ├── index.html
    ├── app.js
    ├── config.js        # sets which backend URL the frontend calls
    ├── style.css
    ├── server.js         # tiny static file server (optional — any static host works)
    └── package.json
```

They can run on different machines, ports, or even domains — the frontend only needs to know the backend's URL (set in `frontend/config.js`), and the backend allows cross-origin requests (via CORS) so the frontend can call it from anywhere.

## Installation

1. Clone or download this repository

2. Set up the backend:
   ```bash
   cd backend
   npm install
   ```

3. Create `backend/.env` (copy from `backend/.env.example`) and configure:
   ```
   PORT=3000
   # Song generation — pick ONE:
   REPLICATE_API_TOKEN=
   REPLICATE_MUSIC_MODEL=lucataco/ace-step
   REPLICATE_VIDEO_MODEL=minimax/video-01
   LOCAL_MUSIC_API_URL=http://localhost:8001
   # Optional — enables AI-written lyrics in Simple mode
   ANTHROPIC_API_KEY=
   ANTHROPIC_MODEL=claude-sonnet-5
   # Optional — powers Stem Separation and Extend
   FAL_KEY=
   FAL_STEMS_MODEL=fal-ai/demucs
   FAL_EXTEND_MODEL=fal-ai/ace-step/audio-outpaint
   # Required for real password-reset emails
   GMAIL_USER=
   GMAIL_APP_PASSWORD=
   APP_BASE_URL=
   ```

   **Song generation — no paid API key is required.** Pick one:

   - **Paid, easiest:** get a Replicate token at replicate.com/account/api-tokens and set `REPLICATE_API_TOKEN`. Pay-per-use, no local hardware needed.
   - **Completely free, self-hosted:** leave `REPLICATE_API_TOKEN` blank and run the open-source [ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5) server yourself instead — no account, no card, ever:
     ```bash
     curl -LsSf https://astral.sh/uv/install.sh | sh   # installs "uv", a Python package runner
     git clone https://github.com/ace-step/ACE-Step-1.5.git
     cd ACE-Step-1.5
     uv sync
     uv run acestep-api   # starts a local server on http://localhost:8001
     ```
     Model weights download automatically on first run (a few GB). Leave that server running, keep `LOCAL_MUSIC_API_URL=http://localhost:8001` in your `.env`, and Rockecho will use it automatically whenever `REPLICATE_API_TOKEN` is empty. Honest trade-off: this needs a real GPU to run at a usable speed (the project recommends 8GB+ VRAM; it does run on CPU or Apple Silicon, just much slower — expect minutes rather than seconds per song).
   - **Anime Video Studio** now works the same way as song generation — pick one:
     - **Paid:** reuses `REPLICATE_API_TOKEN`/`REPLICATE_VIDEO_MODEL` above. Note this was fixed from an earlier bug: the video model (`minimax/video-01`) never actually accepted a video+audio upload the way the feature originally implied — it only takes a text prompt and an optional starting image. The studio now reflects that honestly instead of promising something the model couldn't do.
     - **Free, self-hosted:** run [ComfyUI](https://github.com/comfyanonymous/ComfyUI) with the open-source [Wan 2.2](https://docs.comfy.org/tutorials/video/wan/wan2_2) model installed, on your own GPU:
       1. Install ComfyUI and the Wan 2.2 text-to-video model files per its official docs (link above) — this includes downloading multi-GB model weights.
       2. In ComfyUI, load (or build) a Wan 2.2 text-to-video workflow, then use **"Save (API Format)"** to export it as JSON.
       3. Open that JSON and find the positive-prompt `CLIPTextEncode` node's `"text"` field. Replace its value with the literal placeholder `{{PROMPT}}`. Do the same for a negative-prompt node with `{{NEGATIVE_PROMPT}}` if you have one, and for a frame-count field with `{{FRAMES}}` if you want duration to be adjustable.
       4. Save that file to the path in `LOCAL_VIDEO_WORKFLOW_PATH` (default `./workflows/video-workflow.json` — create the `workflows` folder).
       5. Start ComfyUI (`python main.py`, default `http://localhost:8188`) and leave it running.
       Rockecho substitutes your prompt into the placeholders and drives ComfyUI's own API (`/prompt`, `/history`, `/view`) automatically. This step is more manual than the music fallback because ComfyUI workflows depend entirely on which nodes and checkpoints you have installed — I can't hand you one guaranteed-working file the way I could for ACE-Step's simpler REST API.
       Honest trade-off: video models are heavier than audio ones — expect to need a real GPU (8GB+ VRAM at minimum) for this to be usable at all.

   `ANTHROPIC_API_KEY` and `FAL_KEY` are optional too — the app still works without them, just without AI-written lyrics / stems & extend respectively (both have their own free fallbacks, see below).

   **Setting up `GMAIL_USER` / `GMAIL_APP_PASSWORD`** (needed for "forgot password" emails to actually send):
   1. Turn on 2-Step Verification on the Gmail account you want to send from, at myaccount.google.com/security.
   2. Go to myaccount.google.com/apppasswords, create an app password (any name), and copy the 16-character code it gives you.
   3. Set `GMAIL_USER` to that Gmail address, and `GMAIL_APP_PASSWORD` to the 16-character code (not your normal Gmail password — Google blocks that for app logins). This is a free Gmail feature, no billing involved.
   4. If you leave these blank, the app still works — password reset links are just logged to the server console instead of emailed, so you can still test the flow locally.

   Set `APP_BASE_URL` to your real deployed URL (e.g. `https://yourapp.com`) once you're live, so reset-password links in emails point to the right place instead of `localhost`.

## Getting Started

### Start the backend
```bash
cd backend
npm start
```
The API will be running at `http://localhost:3000`.

### Start the frontend (in a separate terminal)
```bash
cd frontend
npm install
npm start
```
Open `http://localhost:5173` in your browser. It talks to the backend URL set in `frontend/config.js` (defaults to `http://localhost:3000`) — change that one line if your backend runs somewhere else.

You need both running at the same time for the app to work.

### Development mode
```bash
npm run dev   # from either backend/ or frontend/
```

## API Endpoints

### Auth
- `POST /api/auth/signup` — `{ "username", "email", "password" }`. `email` must be a Gmail address (`name@gmail.com`).
- `POST /api/auth/login` — `{ "identifier", "password" }`. `identifier` can be the username or Gmail address.
- `POST /api/auth/forgot` — `{ "email" }`. Always responds success (so it can't be used to check which Gmail addresses have accounts); if that address has an account, emails a one-time reset link valid for 30 minutes.
- `POST /api/auth/reset` — `{ "token", "password" }`. Sets the new password if the token is valid and unexpired.

### POST `/api/produce`
Generates two full song takes (AI vocals + instrumentation) from a text description, or from your own lyrics in Custom mode. JSON body:

- `title` (string, optional) – Song title
- `prompt` (string) – Description of the song (used as the theme; required in Simple mode unless `instrumental` is true)
- `tags` (string) – Style tags, e.g. `"lo-fi, chill, female vocals"`
- `lyrics` (string, optional) – Your own lyrics (Custom mode); ignored in Simple mode, where lyrics are auto-written
- `mode` (`"simple"` | `"custom"`)
- `instrumental` (boolean) – Skip vocals entirely
- `duration` (number) – Seconds, 15–240
- `owner` (string), `rightsBasis` (string)

**Response:**
```json
{
  "groupId": "uuid",
  "title": "My Song",
  "lyrics": "[verse]\n...",
  "instrumental": false,
  "jobs": [
    { "id": "prediction-id-a", "status": "starting", "variation": "A" },
    { "id": "prediction-id-b", "status": "starting", "variation": "B" }
  ]
}
```
Poll each job with `GET /api/produce/:id` as before. No API key is required to use this endpoint at all if `LOCAL_MUSIC_API_URL` points at a running self-hosted ACE-Step-1.5 server instead of using `REPLICATE_API_TOKEN` — in that case generation happens synchronously and the returned jobs are already `"status": "succeeded"`.

### POST `/api/lyrics/generate`
Previews AI-written lyrics for a description without generating audio. Body: `{ "prompt": "...", "tags": "..." }` → `{ "lyrics": "..." }`.

### GET `/api/tracks/:id/rights`
Returns the auto-issued copyright record for a track: copyright owner (defaults to the account name), a unique rights ID, and a registration timestamp. If a track predates this field, one is generated on first request. This is an internal ownership record for your own catalog — it doesn't file anything with a government copyright office.

### POST `/api/tracks/:id/stems`
Splits a track into stems. If `FAL_KEY` is set, uses fal.ai's Demucs (paid, pay-per-use). If not, falls back to running **Demucs locally for free** — no account, no card. Body: `{ "stems": ["vocals", "drums", "bass", "other"] }` (optional; defaults to all four). Each resulting stem is saved as its own track (playable, downloadable, with its own copyright record).

**Free local setup:** `pip install demucs` (needs Python 3.9+ and, ideally, a few GB of free disk for model weights it downloads on first use) and make sure `ffmpeg` is installed and on your PATH. First run will be slow while it downloads the Demucs model; runs on CPU if you don't have a GPU, just slower (a 3-minute song can take a few minutes on CPU).

### POST `/api/tracks/:id/extend`
Extends a track's start and/or end, matching the original style. Body: `{ "extendBefore": 0, "extendAfter": 30 }` (seconds; max 60 before / 120 after). If `FAL_KEY` is set, uses fal.ai's ACE-Step audio-outpaint (a true model-based continuation). If not, uses a **free local fallback**: it generates fresh instrumental padding with your existing Replicate account using the same style tags, then stitches it onto the original with `ffmpeg`. This is an approximation — it won't carry the exact melody through the seam the way a real outpainting model does, but it costs nothing beyond the Replicate usage you already have. Needs `ffmpeg` installed.

Whichever path is used (fal.ai or local), stems/extend both need a publicly reachable `audio_url` for the source track — this won't work against a `localhost` server, only a deployed one.

### Personas
`GET /api/personas?owner=...` lists saved style-tag presets. `POST /api/personas` with `{ "owner", "name", "tags" }` saves one. `DELETE /api/personas/:id` removes one. Selecting a persona in Song Studio fills in the style tags field.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `REPLICATE_API_TOKEN` | API token for Replicate | Required |
| `REPLICATE_VIDEO_MODEL` | AI model for generation | `minimax/video-01` |

## Database Schema

The application uses SQLite with tables for:
- **tracks** – Song and beat metadata
- **rights** – Rights ownership and verification records
- **analytics** – View, engagement, and download metrics

## Usage

1. **Create a Song** – Click "Make a song" to start the production process
2. **Upload Vocals** – Select an audio file as your vocal track
3. **Set Details** – Configure song title, style, duration, and rights information
4. **Generate** – The AI will process and generate the complete track
5. **Manage** – Organize tracks into collections and monitor analytics

## License

This project is part of the Rockecho platform. All rights reserved.

## Support

For help, questions, or issues:
- Check the Help center in the app
- Visit the Rockecho community
- Review the Terms & conditions for rights and usage

---

**Rockecho** – Your sound, ready to launch.
