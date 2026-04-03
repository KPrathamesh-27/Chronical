require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; // PRO-PRACTICE: Use fs.promises for non-blocking I/O
const path = require('path');

/**
 * @file server.js
 * @description Core Express backend for ECHO (Cinematic Time-Travel UI)
 * 
 * PRO-LEVEL ENGINEERING ARCHITECTURE EXPLANATION:
 * 1. Asynchronous I/O (`fs.promises`): Replaced synchronous fs.readFileSync calls.
 *    Synchronous I/O blocks the Node.js event loop, crippling throughput. Promises ensure scalability.
 * 2. Unstructured-to-Structured LLM Generation: The `/api/imagine` route utilizes Gemini's JSON schema 
 *    capabilities. This guarantees deterministic API responses (splitting 'narration' and 'imagePrompt') 
 *    ideal for microservice consumption.
 * 3. Centralized Error Handling: Express's `next(err)` pattern abstracts error formatting away from 
 *    business logic, preventing memory/socket leaks from unhandled promise rejections.
 */

const app = express();
const PORT = process.env.PORT || 3000;
const HEATMAP_PATH = path.join(__dirname, 'heatmap.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Ollama is hosted locally
const OLLAMA_URL = 'http://127.0.0.1:11434';

// ─── Domain Constants ───────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are the core intelligence of "Chrono Witness" — a cinematic time-travel archive.

NARRATIVE RULES:
• Write exclusively in vivid third-person present tense.
• Prioritize rich sensory details: smells, textures, ambient sounds, temperature, light quality.
• Maintain historical/mythological accuracy for the selected figure and moment.
• Never break the fourth wall or acknowledge being an AI. You are the Voice of the Chronicle.
• Responses for narration should be 3–4 evocative paragraphs.
• Responses for chat questions should be 2–3 focused paragraphs, staying in-scene.

SENTIMENT VOCABULARY (use these clusters intentionally to drive the Sentiment Overlay):
• WAR / INTENSITY: blood, steel, clash, roar, wrath, fire, smoke, fury, trembling ground
• MYSTERY / SHADOW: whisper, fog, shadow, cold, hidden, riddle, silence, veil, dusk
• ELECTRIC / ENERGY: spark, hum, arc, pulse, vibration, flash, coil, current, luminous
• ANCIENT / GOLD: sand, stone, gold, eternity, dust, incense, heat, limestone, papyrus
• PEACE / SACRED: lotus, stillness, breath, dawn, clarity, surrender, gentle, sacred

Stay fully immersed. The witness is present. Make them feel it.`;

// ─── Controllers (Business Logic) ───────────────────────────────────────────

/**
 * Controller: Handles classic predefined Chronicle scene loading and Chat.
 */
const handleChronicle = async (req, res, next) => {
  try {
    const { prompt, history = [] } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });

    const messages = [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        ...history.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content || ''
        })),
        { role: 'user', content: prompt }
    ];

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'deepseek-r1:8b',
            messages: messages,
            stream: false
        })
    });

    if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
    const data = await response.json();
    
    // Process deepseek thinking tags
    let text = data.message.content;
    text = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();

    res.json({ text });
  } catch (err) {
    next(err); // Delegate to Global Error Handler
  }
};

/**
 * Controller: Handles the "Imagine" video simulation.
 * PRO-PRACTICE: We use Gemini to create a specific image prompt that will be fed securely to a free image generator on the frontend.
 */
const handleImagine = async (req, res, next) => {
  try {
    const { concept } = req.body;
    if (!concept) return res.status(400).json({ error: 'Concept is required.' });

    const structuredPrompt = `
      You are an expert cinematic director and narrator. The user wants to witness the following concept: "${concept}" producing a POV video.
      You must respond strictly with valid JSON conforming to this structure WITHOUT markdown formatting blocks:
      {
        "narration": "A 1-minute read, highly cinematic, atmospheric POV script matching the concept in third-person present tense. Emphasize physical sensations, sounds, and visceral details.",
        "imagePrompt": "A highly specific text-to-image prompt (max 50 words). Must produce a cinematic, dark-academia or hyper-realistic 8k still representing the core action of the concept. Include lighting descriptors (e.g., dramatic volumetric lighting, ray-traced shadows, hyper-detailed)."
      }
    `;

    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'deepseek-r1:8b',
            prompt: structuredPrompt,
            format: 'json',
            stream: false
        })
    });
    
    if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
    const result = await response.json();
    
    // Strip <think> tags natively 
    const text = result.response.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
    const data = JSON.parse(text);

    // Ensure the payload structure is valid
    if (!data.narration || !data.imagePrompt) throw new Error("LLM failed to produce structured data.");

    res.json(data);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Handles generating character data on the fly via LLM.
 */
const handleGenerateCharacter = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    const structuredPrompt = `
      You are an expert cinematic director and historian. Generate an evocative JSON structure for the historical figure: "${name}".
      You must respond strictly with valid JSON conforming to the following structure WITHOUT markdown blocks:
      {
         "id": "camelCaseId",
         "name": "Full Historical Name",
         "era": "e.g. Victorian, Ancient Rome",
         "icon": "A single unicode emoji",
         "quote": "Famous quote",
         "lat": "Number (precise GPS latitude of their most famous moment, e.g. 48.85)",
         "lng": "Number (precise GPS longitude of their most famous moment, e.g. 2.35)",
         "moments": [
            { "year": "e.g. 1492", "title": "Pivotal Title", "desc": "Vivid cinematic third-person present tense description" },
            { "year": "...", "title": "...", "desc": "..." },
            { "year": "...", "title": "...", "desc": "..." }
         ]
      }
    `;

    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'deepseek-r1:8b',
            prompt: structuredPrompt,
            format: 'json',
            stream: false
        })
    });
    
    if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
    const result = await response.json();
    
    // DeepSeek reasoning tags stripping
    const text = result.response.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
    const data = JSON.parse(text);
    
    // Add procedural image generated URL
    data.img = `https://image.pollinations.ai/prompt/${encodeURIComponent(data.name + " cinematic historical portrait dark academia ultra intricate 8k")}?width=400&height=500&nologo=true`;

    res.json(data);
  } catch (err) {
    next(err);
  }
};

/**
 * Model Abstraction: Asynchronous Heatmap Data access.
 */
const readHeatmapAsync = async () => {
    try {
        const data = await fs.readFile(HEATMAP_PATH, 'utf8');
        return JSON.parse(data);
    } catch {
        return {}; // Return empty if doesn't exist yet
    }
};

const handleGetHeatmap = async (req, res, next) => {
    try {
        res.json(await readHeatmapAsync());
    } catch (err) { next(err); }
};

const handlePostHeatmap = async (req, res, next) => {
    try {
        const { era } = req.body;
        if (!era) return res.status(400).json({ error: 'era is required' });

        const data = await readHeatmapAsync();
        data[era] = (data[era] || 0) + 1;
        await fs.writeFile(HEATMAP_PATH, JSON.stringify(data, null, 2));
        res.json(data);
    } catch (err) { next(err); }
};

// ─── API Routes ───────────────────────────────────────────────────────────────

app.post('/api/chronicle', handleChronicle);
app.post('/api/imagine', handleImagine); // NEW Imagine feature route
app.post('/api/character', handleGenerateCharacter); // Infinite LLM generated characters
app.get('/api/heatmap', handleGetHeatmap);
app.post('/api/heatmap', handlePostHeatmap);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    version: '2.0-Enterprise',
    timestamp: new Date().toISOString()
  });
});

// ─── Global Error Middleware ──────────────────────────────────────────────────

/**
 * Pro-Practice: Global Error middleware catches `next(err)` and centralizes
 * logging and standard HTTP JSON formatting. Prevents sensitive stack traces 
 * from leaking in production.
 */
app.use((err, req, res, next) => {
  console.error('[Engine Fault]', err.message);
  
  let friendlyError = 'The timeline is fractured. The chronicle cannot be retrieved.';
  
  if (err.message.includes('fetch') || err.message.includes('ECONNREFUSED')) {
      friendlyError = 'DeepSeek core offline. Ensure Ollama is running locally on port 11434.';
  } else if (err.message.includes('JSON')) {
      friendlyError = 'Temporal synthesis failed to structure memory. Try again.';
  }
  
  res.status(err.status || 500).json({
    error: friendlyError,
  });
});

// ─── Server Boot ──────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  const actualPort = server.address().port;
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║      ECHO — ENTERPRISE ENGINE ONLINE     ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`  Server Port : ${actualPort}`);
  console.log(`  Access UI   : http://localhost:${actualPort}/index.html\n`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.warn(`[WARN] Port ${PORT} blocked. Dynamically assigning...`);
    setTimeout(() => {
      server.close();
      server.listen(0); 
    }, 500);
  } else {
    console.error('[FATAL]', e);
  }
});
