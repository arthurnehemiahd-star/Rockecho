const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { Readable } = require('stream');
const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const database = require('./database');
require('dotenv').config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const EXTENSION_BY_MIME = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/flac': '.flac' };
const saveAudio = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, uploadsDir),
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname || '') || EXTENSION_BY_MIME[file.mimetype] || '.audio';
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, file.mimetype.startsWith('audio/'))
});
function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || `track-${Date.now()}`;
}
function issueRightsId() {
  return `RE-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}
function absoluteUrl(req, audioUrl) {
  if (/^https?:\/\//i.test(audioUrl)) return audioUrl;
  return `${req.protocol}://${req.get('host')}${audioUrl}`;
}
function appBaseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}
let mailer = null;
function getMailer() {
  if (mailer) return mailer;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });
  return mailer;
}
async function sendPasswordResetEmail(toEmail, username, resetLink) {
  const transport = getMailer();
  if (!transport) {
    // No Gmail sender configured — log it so local development still works.
    console.log(`[password reset] GMAIL_USER/GMAIL_APP_PASSWORD not set. Reset link for ${toEmail}: ${resetLink}`);
    return;
  }
  await transport.sendMail({
    from: `Rockecho <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Reset your Rockecho password',
    text: `Hi ${username},\n\nSomeone asked to reset the password on your Rockecho account. If that was you, open this link within 30 minutes:\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Hi ${username},</p><p>Someone asked to reset the password on your Rockecho account. If that was you, click below within 30 minutes:</p><p><a href="${resetLink}">Reset your password</a></p><p>If you didn't request this, you can ignore this email.</p>`
  });
}
async function falRequest(modelId, input) {
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY is missing. Add it to .env to use this feature.');
  const submitResponse = await fetch(`https://queue.fal.run/${modelId}`, {
    method: 'POST',
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  const submitResult = await submitResponse.json();
  if (!submitResponse.ok) throw new Error(submitResult.detail || 'fal.ai request failed to submit.');
  const statusUrl = submitResult.status_url || `https://queue.fal.run/${modelId}/requests/${submitResult.request_id}/status`;
  const responseUrl = submitResult.response_url || `https://queue.fal.run/${modelId}/requests/${submitResult.request_id}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const statusResponse = await fetch(statusUrl, { headers: { Authorization: `Key ${process.env.FAL_KEY}` } });
    const status = await statusResponse.json();
    if (status.status === 'COMPLETED') {
      const resultResponse = await fetch(responseUrl, { headers: { Authorization: `Key ${process.env.FAL_KEY}` } });
      if (!resultResponse.ok) throw new Error('fal.ai did not return a result.');
      return resultResponse.json();
    }
    if (status.status === 'FAILED' || status.status === 'ERROR') throw new Error('fal.ai processing failed.');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Timed out waiting for fal.ai to finish.');
}

// --- Free, local fallbacks: used automatically when FAL_KEY is not set ---
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => {
      if (error.code === 'ENOENT') reject(new Error(`"${command}" was not found on this machine. Install it, or set FAL_KEY to use fal.ai instead.`));
      else reject(error);
    });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-500) || `${command} exited with code ${code}`));
    });
  });
}
async function downloadToFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error('Could not download the source audio.');
  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    Readable.fromWeb(response.body).pipe(fileStream);
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });
}
async function waitForReplicatePrediction(predictionId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${replicateBaseUrl}/predictions/${predictionId}`, { headers: replicateHeaders() });
    const prediction = await response.json();
    if (prediction.status === 'succeeded') return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (prediction.status === 'failed' || prediction.status === 'canceled') throw new Error(prediction.error || 'Generation failed.');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Timed out waiting for the song model to finish.');
}
function localMusicApiUrl() {
  return (process.env.LOCAL_MUSIC_API_URL || 'http://localhost:8001').replace(/\/$/, '');
}
async function localAceStepGenerate({ tags, lyrics, duration }) {
  let submitResponse;
  try {
    submitResponse = await fetch(`${localMusicApiUrl()}/release_task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: tags, lyrics, audio_duration: duration, batch_size: 1, thinking: true })
    });
  } catch (error) {
    throw new Error(`Could not reach the local music server at ${localMusicApiUrl()}. Start it with "uv run acestep-api" (see README), or set REPLICATE_API_TOKEN to use Replicate instead.`);
  }
  const submitResult = await submitResponse.json();
  if (!submitResponse.ok || submitResult.code !== 200) throw new Error((submitResult && submitResult.error) || 'The local music server rejected the request.');
  const taskId = submitResult.data.task_id;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const queryResponse = await fetch(`${localMusicApiUrl()}/query_result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id_list: [taskId] })
    });
    const queryResult = await queryResponse.json();
    const entry = queryResult.data && queryResult.data[0];
    if (entry && Number(entry.status) === 1) {
      const parsed = JSON.parse(entry.result);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!first || !first.file) throw new Error('The local music server did not return an audio file.');
      return first.file.startsWith('http') ? first.file : `${localMusicApiUrl()}${first.file}`;
    }
    if (entry && Number(entry.status) === 2) throw new Error('Local music generation failed.');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Timed out waiting for the local music server to finish.');
}
async function localSeparateStems(sourceUrl, requestedStems) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rockecho-stems-'));
  try {
    const inputFile = path.join(workDir, 'source.audio');
    await downloadToFile(sourceUrl, inputFile);
    await runCommand('demucs', ['-n', 'htdemucs', '-o', workDir, inputFile]);
    const stemDir = path.join(workDir, 'htdemucs', 'source');
    const available = {};
    for (const stemName of requestedStems) {
      const stemPath = path.join(stemDir, `${stemName}.wav`);
      if (fs.existsSync(stemPath)) {
        const savedName = `${crypto.randomUUID()}.wav`;
        fs.copyFileSync(stemPath, path.join(uploadsDir, savedName));
        available[stemName] = `/uploads/${savedName}`;
      }
    }
    return available;
  } finally {
    fs.rm(workDir, { recursive: true, force: true }, () => {});
  }
}
async function localExtend({ sourceUrl, tags, lyrics, extendBefore, extendAfter }) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rockecho-extend-'));
  try {
    const originalFile = path.join(workDir, 'original.audio');
    await downloadToFile(sourceUrl, originalFile);
    const parts = [];
    if (extendBefore > 0) {
      const response = await fetch(`${replicateBaseUrl}/models/${musicModel}/predictions`, {
        method: 'POST', headers: replicateHeaders(),
        body: JSON.stringify({ input: { tags, lyrics: '[instrumental]', duration: extendBefore, seed: -1 } })
      });
      const prediction = await response.json();
      const beforeUrl = await waitForReplicatePrediction(prediction.id);
      const beforeFile = path.join(workDir, 'before.audio');
      await downloadToFile(beforeUrl, beforeFile);
      parts.push(beforeFile);
    }
    parts.push(originalFile);
    if (extendAfter > 0) {
      const response = await fetch(`${replicateBaseUrl}/models/${musicModel}/predictions`, {
        method: 'POST', headers: replicateHeaders(),
        body: JSON.stringify({ input: { tags, lyrics: '[instrumental]', duration: extendAfter, seed: -1 } })
      });
      const prediction = await response.json();
      const afterUrl = await waitForReplicatePrediction(prediction.id);
      const afterFile = path.join(workDir, 'after.audio');
      await downloadToFile(afterUrl, afterFile);
      parts.push(afterFile);
    }
    const concatListPath = path.join(workDir, 'concat.txt');
    fs.writeFileSync(concatListPath, parts.map(filePath => `file '${filePath}'`).join('\n'));
    const outputName = `${crypto.randomUUID()}.mp3`;
    const outputPath = path.join(uploadsDir, outputName);
    await runCommand('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c:a', 'libmp3lame', outputPath]);
    return `/uploads/${outputName}`;
  } finally {
    fs.rm(workDir, { recursive: true, force: true }, () => {});
  }
}

// --- Free, local video fallback: drives a self-hosted ComfyUI + Wan 2.2 workflow ---
function localVideoApiUrl() {
  return (process.env.LOCAL_VIDEO_API_URL || 'http://localhost:8188').replace(/\/$/, '');
}
function findComfyOutput(historyEntry) {
  const outputs = (historyEntry && historyEntry.outputs) || {};
  for (const nodeOutput of Object.values(outputs)) {
    const files = nodeOutput.videos || nodeOutput.gifs || nodeOutput.images;
    if (Array.isArray(files) && files.length) return files[0];
  }
  return null;
}
async function comfyGenerateVideo({ prompt, negativePrompt, frames }) {
  const workflowPath = process.env.LOCAL_VIDEO_WORKFLOW_PATH || path.join(__dirname, 'workflows', 'video-workflow.json');
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`No ComfyUI workflow file found at ${workflowPath}. Export one from your ComfyUI in "API format" and save it there — see README.`);
  }
  let workflowText = fs.readFileSync(workflowPath, 'utf8');
  workflowText = workflowText
    .split('{{PROMPT}}').join(JSON.stringify(prompt).slice(1, -1))
    .split('{{NEGATIVE_PROMPT}}').join(JSON.stringify(negativePrompt || 'blurry, low quality, watermark').slice(1, -1))
    .split('{{FRAMES}}').join(String(frames || 81));
  const workflow = JSON.parse(workflowText);
  const clientId = crypto.randomUUID();
  let submitResponse;
  try {
    submitResponse = await fetch(`${localVideoApiUrl()}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId })
    });
  } catch (error) {
    throw new Error(`Could not reach ComfyUI at ${localVideoApiUrl()}. Make sure it's running, or set REPLICATE_API_TOKEN to use Replicate instead.`);
  }
  const submitResult = await submitResponse.json();
  if (!submitResponse.ok || !submitResult.prompt_id) throw new Error(submitResult.error || 'ComfyUI rejected the workflow. Check the workflow file matches your installed nodes.');
  const promptId = submitResult.prompt_id;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const historyResponse = await fetch(`${localVideoApiUrl()}/history/${promptId}`);
    const historyResult = await historyResponse.json();
    const entry = historyResult[promptId];
    if (entry && entry.status && entry.status.completed) {
      const output = findComfyOutput(entry);
      if (!output) throw new Error('ComfyUI finished but produced no video/image output.');
      const query = new URLSearchParams({ filename: output.filename, subfolder: output.subfolder || '', type: output.type || 'output' });
      return `${localVideoApiUrl()}/view?${query.toString()}`;
    }
    if (entry && entry.status && entry.status.status_str === 'error') throw new Error('ComfyUI workflow failed. Check its console output for details.');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Timed out waiting for ComfyUI to finish.');
}
async function issueTrackCopy(fields) {
  const rightsId = issueRightsId();
  const registeredAt = new Date().toISOString();
  const result = await database.run(
    'INSERT INTO tracks (owner, title, style, description, duration_seconds, prediction_id, audio_url, status, rights_status, tags, source, copyright_owner, rights_id, registered_at, parent_track_id, stem_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [fields.owner, fields.title, fields.tags || '', '', fields.durationSeconds || 0, `${fields.source}-${crypto.randomUUID()}`, fields.audioUrl, 'ready', fields.rightsStatus || 'All rights reserved', fields.tags || '', fields.source, fields.copyrightOwner || fields.owner, rightsId, registeredAt, fields.parentTrackId || null, fields.stemType || null]
  );
  return { id: result.id, rightsId, registeredAt };
}
const port = Number(process.env.PORT || 3000);
const replicateBaseUrl = 'https://api.replicate.com/v1';
const videoModel = process.env.REPLICATE_VIDEO_MODEL || 'minimax/video-01';
// Text-to-song model: takes style tags + lyrics (or [instrumental]) and returns a
// full track with AI vocals and instrumentation, no vocal recording required.
const musicModel = process.env.REPLICATE_MUSIC_MODEL || 'lucataco/ace-step';
// Optional: if set, lyrics are auto-written by Claude from the song description.
// Without it, a simple built-in template is used instead. Check docs.claude.com
// for the current model string if this default ages out.
const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const SONG_VARIATIONS = 2; // Suno-style: always produce two takes to choose from

function buildTemplateLyrics(theme, tags) {
  const line = String(theme || 'a feeling I can not name').trim().replace(/\.$/, '') || 'a feeling I can not name';
  const firstTag = String(tags || 'sound').split(',')[0].trim() || 'sound';
  return `[verse]\nStarted with ${line}\nCaught up in the ${firstTag}\nEvery step is finding my way\nThrough the noise, I hear it play\n\n[chorus]\nThis is ${line}\nRunning through my mind again\nThis is ${line}\nI won't let it end\n\n[verse]\nShadows move but I stand still\nChasing down the way I feel\nEvery word a piece of me\nThis is where I want to be\n\n[chorus]\nThis is ${line}\nRunning through my mind again\nThis is ${line}\nI won't let it end`;
}

async function writeLyrics({ theme, tags }) {
  const fallback = buildTemplateLyrics(theme, tags);
  if (!process.env.ANTHROPIC_API_KEY) return fallback;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Write original song lyrics for a track described as: "${theme}" in the style of: ${tags || 'unspecified'}. Structure them with [verse], [chorus], and optionally [bridge] tags on their own lines. Keep the whole thing under 200 words. Return only the lyrics, no preamble or commentary.`
        }]
      })
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    const text = Array.isArray(data.content) ? data.content.map(block => block.text || '').join('\n').trim() : '';
    return text || fallback;
  } catch (error) {
    return fallback;
  }
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

function replicateHeaders() {
  return {
    Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

app.post('/api/produce', async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 120) || 'Untitled';
  const tags = String(req.body.tags || req.body.style || 'pop, catchy melody, upbeat').slice(0, 300);
  const theme = String(req.body.prompt || req.body.description || '').trim().slice(0, 800);
  const mode = req.body.mode === 'custom' ? 'custom' : 'simple';
  const instrumental = Boolean(req.body.instrumental);
  const owner = String(req.body.owner || 'guest').slice(0, 120);
  const rightsBasis = String(req.body.rightsBasis || 'My original recording').slice(0, 120);
  let durationSeconds = Number(req.body.duration || 60);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 5) durationSeconds = 60;
  durationSeconds = Math.min(durationSeconds, 240);

  if (!theme && mode === 'simple' && !instrumental) {
    return res.status(400).json({ error: 'Describe the song you want, or switch on instrumental mode.' });
  }

  let lyrics;
  if (instrumental) {
    lyrics = '[instrumental]';
  } else if (mode === 'custom') {
    lyrics = String(req.body.lyrics || '').trim();
    if (!lyrics) return res.status(400).json({ error: 'Add lyrics, or use Simple mode to have them written for you.' });
  } else {
    lyrics = await writeLyrics({ theme, tags });
  }

  const usingReplicate = Boolean(process.env.REPLICATE_API_TOKEN);
  const groupId = crypto.randomUUID();
  const jobs = [];

  try {
    for (let index = 0; index < SONG_VARIATIONS; index += 1) {
      let audioUrl;
      let predictionId;
      let initialStatus;
      if (usingReplicate) {
        const response = await fetch(`${replicateBaseUrl}/models/${musicModel}/predictions`, {
          method: 'POST',
          headers: replicateHeaders(),
          body: JSON.stringify({ input: { tags, lyrics, duration: durationSeconds, seed: -1 } })
        });
        const prediction = await response.json();
        if (!response.ok) return res.status(response.status).json({ error: prediction.detail || 'Song generation request failed.' });
        predictionId = prediction.id;
        initialStatus = prediction.status;
        audioUrl = null; // resolved later via /api/produce/:id polling, same as before
      } else {
        // Free fallback: a self-hosted ACE-Step server (see README) generates the
        // song directly. Resolved fully before this request responds.
        const generatedUrl = await localAceStepGenerate({ tags, lyrics, duration: durationSeconds });
        const extension = path.extname(generatedUrl.split('?')[0]) || '.mp3';
        const savedName = `${crypto.randomUUID()}${extension}`;
        await downloadToFile(generatedUrl, path.join(uploadsDir, savedName));
        audioUrl = `/uploads/${savedName}`;
        predictionId = `local-${crypto.randomUUID()}`;
        initialStatus = 'succeeded';
      }
      const rightsId = issueRightsId();
      const registeredAt = new Date().toISOString();
      await database.run(
        'INSERT INTO tracks (owner, title, style, description, duration_seconds, prediction_id, audio_url, status, rights_status, lyrics, tags, instrumental, mode, variation_group, source, copyright_owner, rights_id, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [owner, title, tags, theme, durationSeconds, predictionId, audioUrl, audioUrl ? 'ready' : 'processing', rightsBasis, lyrics, tags, instrumental ? 1 : 0, mode, groupId, 'generated', owner, rightsId, registeredAt]
      );
      jobs.push({ id: predictionId, status: initialStatus, variation: index === 0 ? 'A' : 'B' });
    }
    return res.status(202).json({ groupId, title, lyrics, instrumental, jobs });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not reach the song production service.' });
  }
});

app.post('/api/lyrics/generate', async (req, res) => {
  const theme = String(req.body.prompt || req.body.theme || '').trim().slice(0, 800);
  const tags = String(req.body.tags || req.body.style || '').slice(0, 300);
  if (!theme) return res.status(400).json({ error: 'Describe the song first so the lyrics can match it.' });
  try {
    const lyrics = await writeLyrics({ theme, tags });
    return res.json({ lyrics });
  } catch (error) {
    return res.status(500).json({ error: 'Could not write lyrics right now.' });
  }
});

app.get('/api/produce/:id', async (req, res) => {
  try {
    const existing = await database.get('SELECT id, title, status, audio_url AS audioUrl FROM tracks WHERE prediction_id = ?', [req.params.id]);
    if (existing && (existing.status === 'ready' || existing.status === 'failed' || existing.status === 'canceled')) {
      return res.json({
        status: existing.status === 'ready' ? 'succeeded' : existing.status,
        output: existing.audioUrl,
        track: existing.status === 'ready' ? { id: existing.id, title: existing.title, audioUrl: existing.audioUrl } : null
      });
    }
    if (!process.env.REPLICATE_API_TOKEN) {
      // Local generations are resolved synchronously before /api/produce responds,
      // so reaching here with no REPLICATE_API_TOKEN means something went wrong.
      return res.status(500).json({ error: 'This track was not marked ready and there is no Replicate token to check it against.' });
    }
    const response = await fetch(`${replicateBaseUrl}/predictions/${encodeURIComponent(req.params.id)}`, { headers: replicateHeaders() });
    const prediction = await response.json();
    if (prediction.status === 'succeeded') {
      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      await database.run('UPDATE tracks SET status = ?, audio_url = ? WHERE prediction_id = ?', ['ready', outputUrl || null, req.params.id]);
    } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
      await database.run('UPDATE tracks SET status = ? WHERE prediction_id = ?', [prediction.status, req.params.id]);
    }
    const savedTrack = await database.get('SELECT id, title, audio_url AS audioUrl FROM tracks WHERE prediction_id = ?', [req.params.id]);
    return res.status(response.status).json({ status: prediction.status, output: prediction.output, error: prediction.error, track: savedTrack });
  } catch (error) {
    return res.status(500).json({ error: 'Could not check the production job.' });
  }
});

app.get('/api/tracks', async (req, res) => {
  const owner = String(req.query.owner || 'guest').slice(0, 120);
  try {
    const tracks = await database.all('SELECT id, title, style, description, duration_seconds AS durationSeconds, audio_url AS audioUrl, status, rights_status AS rightsStatus, lyrics, tags, instrumental, mode, variation_group AS variationGroup, source, copyright_owner AS copyrightOwner, rights_id AS rightsId, registered_at AS registeredAt, created_at AS createdAt FROM tracks WHERE owner = ? ORDER BY created_at DESC', [owner]);
    return res.json({ tracks });
  } catch (error) {
    return res.status(500).json({ error: 'Could not load saved tracks.' });
  }
});

app.post('/api/tracks/:id/publish', async (req, res) => {
  const slug = String(req.body.slug || `track-${req.params.id}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  try {
    await database.run('UPDATE tracks SET is_public = 1, public_slug = ? WHERE id = ? AND status = ?', [slug, req.params.id, 'ready']);
    const track = await database.get('SELECT id, title, public_slug AS publicSlug, is_public AS isPublic FROM tracks WHERE id = ?', [req.params.id]);
    if (!track || !track.isPublic) return res.status(404).json({ error: 'Only ready tracks can be published.' });
    return res.json({ track, publicUrl: `/public/${track.publicSlug}` });
  } catch (error) {
    return res.status(500).json({ error: 'Could not publish this track.' });
  }
});

app.post('/api/tracks/save', saveAudio.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'An audio file is required.' });
  const title = String(req.body.title || '').trim().slice(0, 120) || 'Untitled';
  const tags = String(req.body.tags || '').slice(0, 300);
  const owner = String(req.body.owner || 'guest').slice(0, 120);
  const rightsBasis = String(req.body.rightsBasis || 'My original recording').slice(0, 120);
  const copyrightOwner = String(req.body.copyrightOwner || '').slice(0, 120);
  const source = req.body.source === 'recorded' ? 'recorded' : 'uploaded';
  const durationSeconds = Math.max(0, Math.min(3600, Number(req.body.durationSeconds) || 0));
  const wantsPublic = req.body.isPublic === 'true' || req.body.isPublic === true;
  const audioUrl = `/uploads/${req.file.filename}`;
  const predictionId = `${source}-${crypto.randomUUID()}`;
  const publicSlug = wantsPublic ? slugify(req.body.slug || title) : null;
  const rightsId = issueRightsId();
  const registeredAt = new Date().toISOString();

  try {
    const result = await database.run(
      'INSERT INTO tracks (owner, title, style, description, duration_seconds, prediction_id, audio_url, status, rights_status, tags, source, copyright_owner, rights_id, registered_at, is_public, public_slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [owner, title, tags, '', durationSeconds, predictionId, audioUrl, 'ready', rightsBasis, tags, source, copyrightOwner || owner, rightsId, registeredAt, wantsPublic ? 1 : 0, publicSlug]
    );
    return res.status(201).json({
      track: { id: result.id, title, audioUrl, source, isPublic: wantsPublic, publicSlug, rightsId },
      publicUrl: wantsPublic ? `/public/${publicSlug}` : null
    });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: 'Could not save this track.' });
  }
});

app.get('/api/tracks/:id/rights', async (req, res) => {
  try {
    const track = await database.get(
      'SELECT id, title, owner, copyright_owner AS copyrightOwner, rights_id AS rightsId, registered_at AS registeredAt, rights_status AS rightsStatus, source, is_public AS isPublic, public_slug AS publicSlug FROM tracks WHERE id = ?',
      [req.params.id]
    );
    if (!track) return res.status(404).json({ error: 'Track not found.' });
    if (!track.rightsId) {
      const rightsId = issueRightsId();
      const registeredAt = new Date().toISOString();
      await database.run('UPDATE tracks SET rights_id = ?, registered_at = ?, copyright_owner = COALESCE(copyright_owner, ?) WHERE id = ?', [rightsId, registeredAt, track.owner, req.params.id]);
      track.rightsId = rightsId;
      track.registeredAt = registeredAt;
      track.copyrightOwner = track.copyrightOwner || track.owner;
    }
    return res.json({ track });
  } catch (error) {
    return res.status(500).json({ error: 'Could not load the rights record.' });
  }
});

app.post('/api/tracks/:id/stems', async (req, res) => {
  try {
    const track = await database.get('SELECT id, title, owner, tags, style, audio_url AS audioUrl, copyright_owner AS copyrightOwner, rights_status AS rightsStatus, duration_seconds AS durationSeconds FROM tracks WHERE id = ?', [req.params.id]);
    if (!track || !track.audioUrl) return res.status(404).json({ error: 'Track not found or has no audio yet.' });
    const requestedStems = Array.isArray(req.body.stems) && req.body.stems.length ? req.body.stems : ['vocals', 'drums', 'bass', 'other'];
    const sourceUrl = absoluteUrl(req, track.audioUrl);
    let stemFiles;
    if (process.env.FAL_KEY) {
      const result = await falRequest(process.env.FAL_STEMS_MODEL || 'fal-ai/demucs', { audio_url: sourceUrl, stems: requestedStems });
      const rawStems = (result.data && result.data.stems) || result.stems || result.data || {};
      stemFiles = {};
      requestedStems.forEach(name => { const file = rawStems[name]; if (file) stemFiles[name] = file.url || file; });
    } else {
      stemFiles = await localSeparateStems(sourceUrl, requestedStems);
    }
    const created = [];
    for (const stemName of requestedStems) {
      const stemUrl = stemFiles[stemName];
      if (!stemUrl) continue;
      const saved = await issueTrackCopy({
        owner: track.owner,
        title: `${track.title} (${stemName})`,
        tags: track.tags || track.style,
        durationSeconds: track.durationSeconds,
        audioUrl: stemUrl,
        rightsStatus: track.rightsStatus,
        copyrightOwner: track.copyrightOwner,
        source: 'stem',
        parentTrackId: track.id,
        stemType: stemName
      });
      created.push({ id: saved.id, stemType: stemName, audioUrl: stemUrl, title: `${track.title} (${stemName})` });
    }
    if (!created.length) return res.status(502).json({ error: 'No separated stems came back. If running locally, make sure "pip install demucs" worked and ffmpeg is installed.' });
    return res.status(201).json({ stems: created });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Stem separation failed.' });
  }
});

app.post('/api/tracks/:id/extend', async (req, res) => {
  try {
    const track = await database.get('SELECT id, title, owner, tags, style, lyrics, audio_url AS audioUrl, copyright_owner AS copyrightOwner, rights_status AS rightsStatus, duration_seconds AS durationSeconds FROM tracks WHERE id = ?', [req.params.id]);
    if (!track || !track.audioUrl) return res.status(404).json({ error: 'Track not found or has no audio yet.' });
    const extendBefore = Math.max(0, Math.min(60, Number(req.body.extendBefore) || 0));
    const extendAfter = Math.max(0, Math.min(120, Number(req.body.extendAfter) || 30));
    if (extendBefore === 0 && extendAfter === 0) return res.status(400).json({ error: 'Add seconds to extend before or after the track.' });
    const sourceUrl = absoluteUrl(req, track.audioUrl);
    let extendedUrl;
    if (process.env.FAL_KEY) {
      const result = await falRequest(process.env.FAL_EXTEND_MODEL || 'fal-ai/ace-step/audio-outpaint', {
        audio_url: sourceUrl,
        tags: track.tags || track.style || 'match the original style',
        extend_before_duration: extendBefore,
        extend_after_duration: extendAfter
      });
      extendedUrl = (result.data && result.data.audio && result.data.audio.url) || (result.audio && result.audio.url);
    } else {
      // Free fallback: generates fresh instrumental padding with the same style tags and
      // stitches it onto the original with ffmpeg. This is an approximation, not a true
      // model-based continuation — it won't seamlessly carry the melody through like
      // fal.ai's audio-outpaint does, but it costs nothing beyond your existing Replicate usage.
      extendedUrl = await localExtend({
        sourceUrl,
        tags: track.tags || track.style || 'match the original style',
        lyrics: track.lyrics,
        extendBefore,
        extendAfter
      });
    }
    if (!extendedUrl) return res.status(502).json({ error: 'Could not produce an extended track.' });
    const saved = await issueTrackCopy({
      owner: track.owner,
      title: `${track.title} (extended)`,
      tags: track.tags || track.style,
      durationSeconds: (track.durationSeconds || 0) + extendBefore + extendAfter,
      audioUrl: extendedUrl,
      rightsStatus: track.rightsStatus,
      copyrightOwner: track.copyrightOwner,
      source: 'extended',
      parentTrackId: track.id
    });
    return res.status(201).json({ track: { id: saved.id, title: `${track.title} (extended)`, audioUrl: extendedUrl } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Extending this track failed.' });
  }
});

app.get('/api/personas', async (req, res) => {
  const owner = String(req.query.owner || 'guest').slice(0, 120);
  try {
    const personas = await database.all('SELECT id, name, tags FROM personas WHERE owner = ? ORDER BY created_at DESC', [owner]);
    return res.json({ personas });
  } catch (error) {
    return res.status(500).json({ error: 'Could not load personas.' });
  }
});

app.post('/api/personas', async (req, res) => {
  const owner = String(req.body.owner || 'guest').slice(0, 120);
  const name = String(req.body.name || '').trim().slice(0, 80);
  const tags = String(req.body.tags || '').trim().slice(0, 300);
  if (!name || !tags) return res.status(400).json({ error: 'Give the persona a name and some style tags.' });
  try {
    const result = await database.run('INSERT INTO personas (owner, name, tags) VALUES (?, ?, ?)', [owner, name, tags]);
    return res.status(201).json({ persona: { id: result.id, name, tags } });
  } catch (error) {
    return res.status(500).json({ error: 'Could not save this persona.' });
  }
});

app.delete('/api/personas/:id', async (req, res) => {
  try {
    await database.run('DELETE FROM personas WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Could not delete this persona.' });
  }
});

app.get('/api/tracks/:id/download', async (req, res) => {
  try {
    const track = await database.get('SELECT title, audio_url AS audioUrl FROM tracks WHERE id = ?', [req.params.id]);
    if (!track || !track.audioUrl) return res.status(404).json({ error: 'No downloadable audio for this track.' });
    const safeName = (String(track.title || 'track').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'track');
    if (track.audioUrl.startsWith('/uploads/')) {
      return res.download(path.join(__dirname, track.audioUrl), `${safeName}${path.extname(track.audioUrl)}`);
    }
    const upstream = await fetch(track.audioUrl);
    if (!upstream.ok || !upstream.body) return res.status(502).json({ error: 'Could not fetch the audio to download.' });
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.mp3"`);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Download failed.' });
  }
});

app.get('/api/public/tracks', async (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  try {
    const tracks = await database.all(
      "SELECT id, title, style, tags, audio_url AS audioUrl, rights_status AS rightsStatus, copyright_owner AS copyrightOwner, rights_id AS rightsId, registered_at AS registeredAt, owner, source, public_slug AS publicSlug, created_at AS createdAt FROM tracks WHERE is_public = 1 AND status = 'ready' ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [limit + 1, offset]
    );
    const hasMore = tracks.length > limit;
    return res.json({ tracks: tracks.slice(0, limit), hasMore });
  } catch (error) {
    return res.status(500).json({ error: 'Could not load public releases.' });
  }
});

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

app.get('/public/:slug', async (req, res) => {
  const track = await database.get('SELECT id, title, audio_url AS audioUrl, rights_status AS rightsStatus, copyright_owner AS copyrightOwner, rights_id AS rightsId, registered_at AS registeredAt FROM tracks WHERE public_slug = ? AND is_public = 1', [req.params.slug]);
  if (!track) return res.status(404).send('This release is not public.');
  const registeredDate = track.registeredAt ? new Date(track.registeredAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(track.title)} | Launchpad</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#283c50;color:#fff;font:16px Arial,sans-serif}.release{width:min(620px,calc(100% - 40px));background:#f8f9f5;color:#1d2825;border-radius:12px;overflow:hidden}.cover{height:250px;background:#f47d67;padding:28px;display:flex;align-items:end;font-size:42px;font-weight:700}.info{padding:28px}.eyebrow{color:#78817b;font-size:10px;letter-spacing:2px}.status{color:#59803a;font-size:11px}.info h1{font-size:30px;margin:14px 0 8px}.info p{color:#78817b;font-size:13px}.info audio{width:100%;margin:22px 0}.rights{border-top:1px solid #e5e8e2;padding-top:16px;color:#59803a;font-size:11px;line-height:1.7}.download-link{display:inline-block;margin-top:14px;background:#1d2825;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:12px;font-weight:700}</style></head><body><main class="release"><div class="cover">LAUNCHPAD</div><div class="info"><span class="status">● PUBLIC RELEASE</span><h1>${escapeHtml(track.title)}</h1><p>Shared from Launchpad.</p>${track.audioUrl ? `<audio controls src="${escapeHtml(track.audioUrl)}"></audio><a class="download-link" href="/api/tracks/${track.id}/download">Download</a>` : ''}<div class="rights">© ${escapeHtml(track.copyrightOwner || 'Unattributed')} · ${escapeHtml(track.rightsStatus)}${track.rightsId ? `<br>Rights ID ${escapeHtml(track.rightsId)}${registeredDate ? ` · registered ${escapeHtml(registeredDate)}` : ''}` : ''}</div></div></main></body></html>`);
});

app.get('/api/health', (req, res) => res.json({ ok: true, provider: 'replicate' }));

app.post('/api/auth/signup', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!username || username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be 3-30 characters.' });
  }
  if (!/^[a-z0-9][a-z0-9.]*@gmail\.com$/.test(email)) {
    return res.status(400).json({ error: 'Please sign up with a Gmail address (name@gmail.com).' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const existingUser = await database.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existingUser) {
      return res.status(409).json({ error: 'Username or Gmail address already in use.' });
    }

    const passwordHash = database.hashPassword(password);
    await database.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, passwordHash]);
    return res.status(201).json({ success: true, message: 'Account created! You can now sign in.' });
  } catch (error) {
    return res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const identifier = String(req.body.identifier || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Username/Gmail address and password required.' });
  }

  try {
    const user = await database.get(
      'SELECT id, username, email FROM users WHERE (username = ? OR email = ?) AND password_hash = ?',
      [identifier, identifier, database.hashPassword(password)]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid username/Gmail address or password.' });
    }

    return res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    return res.status(500).json({ error: 'Could not sign in.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out.' });
});

app.post('/api/auth/forgot', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.]*@gmail\.com$/.test(email)) {
    return res.status(400).json({ error: 'Enter the Gmail address on your account.' });
  }
  try {
    const user = await database.get('SELECT id, username FROM users WHERE email = ?', [email]);
    // Always respond the same way whether or not the account exists, so this
    // endpoint can't be used to check which Gmail addresses have accounts.
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await database.run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expiresAt, user.id]);
      const resetLink = `${appBaseUrl(req)}/#reset?token=${token}`;
      await sendPasswordResetEmail(email, user.username, resetLink);
    }
    return res.json({ success: true, message: 'If that Gmail address has an account, a reset link is on its way.' });
  } catch (error) {
    return res.status(500).json({ error: 'Could not start the password reset. Please try again.' });
  }
});

app.post('/api/auth/reset', async (req, res) => {
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');
  if (!token) return res.status(400).json({ error: 'This reset link is missing its token.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  try {
    const user = await database.get('SELECT id, reset_expires AS resetExpires FROM users WHERE reset_token = ?', [token]);
    if (!user || !user.resetExpires || new Date(user.resetExpires).getTime() < Date.now()) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
    }
    await database.run('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [database.hashPassword(password), user.id]);
    return res.json({ success: true, message: 'Password updated. You can sign in now.' });
  } catch (error) {
    return res.status(500).json({ error: 'Could not reset the password. Please try again.' });
  }
});


app.post('/api/video/generate', upload.fields([{ name: 'image', maxCount: 1 }]), async (req, res) => {
  const imageFile = req.files && req.files.image && req.files.image[0];
  const prompt = String(req.body.prompt || 'Anime short with smooth motion and expressive lighting.').slice(0, 800);
  const negativePrompt = String(req.body.negativePrompt || '').slice(0, 400);
  let duration = Number(req.body.duration || 6);
  if (!Number.isFinite(duration) || duration < 1 || duration > 30) duration = 6;
  const owner = String(req.body.owner || 'guest').slice(0, 120);

  try {
    let videoUrl;
    if (process.env.REPLICATE_API_TOKEN) {
      const input = { prompt, prompt_optimizer: true };
      if (imageFile) input.first_frame_image = `data:${imageFile.mimetype};base64,${imageFile.buffer.toString('base64')}`;
      const response = await fetch(`${replicateBaseUrl}/models/${videoModel}/predictions`, {
        method: 'POST', headers: replicateHeaders(),
        body: JSON.stringify({ input })
      });
      const prediction = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: prediction.detail || 'Video generation request failed.' });
      const predictionId = `video-${prediction.id}`;
      await database.run(
        'INSERT INTO tracks (owner, title, style, description, duration_seconds, prediction_id, status, rights_status, source, copyright_owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [owner, 'Anime short (generating)', '', prompt, duration, prediction.id, 'processing', 'All rights reserved', 'video', owner]
      );
      return res.status(202).json({ id: prediction.id, status: prediction.status });
    }
    // Free fallback: a self-hosted ComfyUI + Wan 2.2 workflow (see README). Resolved
    // fully before this request responds, same pattern as local song generation.
    videoUrl = await comfyGenerateVideo({ prompt, negativePrompt, frames: Math.round(duration * 16) });
    const extension = path.extname(videoUrl.split('?')[0]) || '.mp4';
    const savedName = `${crypto.randomUUID()}${extension}`;
    await downloadToFile(videoUrl, path.join(uploadsDir, savedName));
    return res.status(200).json({ id: `local-${crypto.randomUUID()}`, status: 'succeeded', output: `/uploads/${savedName}` });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not reach the video production service.' });
  }
});

app.get('/api/video/:id', async (req, res) => {
  if (!process.env.REPLICATE_API_TOKEN) {
    return res.status(404).json({ error: 'Nothing to poll — local video generation resolves immediately.' });
  }
  try {
    const response = await fetch(`${replicateBaseUrl}/predictions/${encodeURIComponent(req.params.id)}`, { headers: replicateHeaders() });
    const prediction = await response.json();
    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
      await database.run('UPDATE tracks SET status = ?, audio_url = ? WHERE prediction_id = ?', [prediction.status === 'succeeded' ? 'ready' : prediction.status, outputUrl || null, `video-${req.params.id}`]);
    }
    return res.status(response.status).json({ status: prediction.status, output: prediction.output, error: prediction.error });
  } catch (error) {
    return res.status(500).json({ error: 'Could not check the video job.' });
  }
});

app.listen(port, () => {
  console.log(`Rockecho is running at http://localhost:${port}`);
});
