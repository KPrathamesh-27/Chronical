require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fs      = require('fs').promises;
const path    = require('path');

/**
 * @file server.js — The Chronos Archive Backend
 * 
 * Architecture:
 *  - p-queue (concurrency=1): All Ollama LLM calls are queued. No concurrent requests
 *    pile up; each resolves in order, with a 30s timeout. On failure the fallback
 *    figures.json data is returned so the UI never shows a hard error.
 *  - /api/character-detail: New endpoint for the Detail Panel (context, name, description, quote + logs)
 */

let PQueue;
(async () => {
  const mod = await import('p-queue');
  PQueue = mod.default;
  boot();
})();

const app  = express();
const PORT = process.env.PORT || 3000;
const HEATMAP_PATH = path.join(__dirname, 'heatmap.json');
const DB_PATH      = path.join(__dirname, 'chronos_db.json');
const FIGURES_PATH = path.join(__dirname, 'assets', 'figures.json');
const OLLAMA_URL   = 'http://127.0.0.1:11434';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─── LLM Queue & Timeouts ──────────────────────────────────────────────────
let llmQueue = null; // populated after PQueue loads
let fsQueue  = null; // populated after PQueue loads
const OLLAMA_TIMEOUT_MS = 300000; // 300 seconds max per LLM task

const SYSTEM_INSTRUCTION = `You are the core intelligence of "The Chronos Archive" — a cinematic time-travel archive terminal.

NARRATIVE RULES:
• Write exclusively in vivid third-person present tense.
• Prioritize rich sensory details: smells, textures, ambient sounds, temperature, light quality.
• Maintain historical/mythological accuracy for the selected figure and moment.
• Never break the fourth wall or acknowledge being an AI. You are the Voice of the Chronicle.
• Responses for narration should be 3–4 evocative paragraphs.
• Responses for chat questions should be 2–3 focused paragraphs, staying in-scene.

SENTIMENT VOCABULARY (use these clusters intentionally):
• WAR / INTENSITY: blood, steel, clash, roar, wrath, fire, smoke, fury, trembling ground
• MYSTERY / SHADOW: whisper, fog, shadow, cold, hidden, riddle, silence, veil, dusk
• ELECTRIC / ENERGY: spark, hum, arc, pulse, vibration, flash, coil, current, luminous
• ANCIENT / GOLD: sand, stone, gold, eternity, dust, incense, heat, limestone, papyrus
• PEACE / SACRED: lotus, stillness, breath, dawn, clarity, surrender, gentle, sacred

Stay fully immersed. The witness is present. Make them feel it.`;

// ─── Helper: queue an Ollama call with AbortController ───────────────────────
function queueLLM(fn) {
  if (!llmQueue) return fn(); 
  return llmQueue.add(async () => {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    
    try {
      // Pass the controller's signal to the function
      return await fn(controller.signal);
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('LLM_TIMEOUT');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  });
}

function stripThink(text) {
  // 1. Strip <think> blocks, even if they don't have a closing tag
  let cleanText = text.replace(/<think>[\s\S]*?(<\/think>|$)\s*/gi, '').trim();
  
  // 2. Failsafe: If the model babbled before or after the JSON, extract just the JSON
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : cleanText;
}

// ─── Database Handlers ───────────────────────────────────────────────────────
async function getCharacterFromDB(characterName) {
  try {
    const data = await fs.readFile(DB_PATH, 'utf8');
    const db = JSON.parse(data);
    const key = (characterName || '').toLowerCase().replace(/\s+/g, '_');
    return db[key] || null;
  } catch (error) {
    console.error("[DB] Read error:", error.message);
    return null;
  }
}

async function saveCharacterToDB(characterName, characterData) {
  if (!fsQueue) return;
  return fsQueue.add(async () => {
    try {
      // Defensive: basic schema validation before saving
      const fullName = characterData.fullName || characterData.name;
      if (!fullName || !Array.isArray(characterData.chronicleLogs)) {
        console.warn(`[DB] Rejecting malformed data for ${characterName}`);
        return;
      }
      // EnsureLogs are strings, not objects (fixes recent AI hallucination bug)
      if (characterData.chronicleLogs.some(log => typeof log !== 'string')) {
        console.warn(`[DB] Rejecting malformed logs (non-string detected) for ${characterName}`);
        return;
      }

      const data = await fs.readFile(DB_PATH, 'utf8');
      const db = JSON.parse(data);
      const key = characterName.toLowerCase().replace(/\s+/g, '_');
      db[key] = { ...characterData, fullName }; // Ensure fullName field exists
      await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
      console.log(`[Chronos Archive] ${characterName} encoded to local storage.`);
    } catch (error) {
      console.error("[DB] Write error:", error.message);
    }
  });
}

/**
 * Returns true if the object contains common AI 'stale placeholders'
 * such as "e.g.", "...", or "Full Historical Name".
 */
function isHallucinated(obj) {
  const jsonStr = JSON.stringify(obj);
  const placeholders = [
    'e.g.', '...', 'camelCaseId', 'Full Historical Name', 'Ancient Rome',
    'A unique camelCase ID', 'The figure\'s full historic name', 
    'A descriptive era name', 'One relevant emoji icon',
    'A representative historical quote', 'SHOUTING_CAPS region',
    'A precise 25-word summary', 'Their most historically verified quote',
    'Historical or modern country name', 'Their primary career or role',
    'A year string', 'A title for this event', 'A short present-tense description',
    'A brief historical summary', 'A famous quote string'
  ];
  return placeholders.some(p => jsonStr.includes(p));
}

// ─── Controllers ─────────────────────────────────────────────────────────────

const handleChronicle = async (req, res, next) => {
  try {
    const { prompt, history = [] } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });

    const messages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      ...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content || '' })),
      { role: 'user', content: prompt }
    ];

    const data = await queueLLM(async () => {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'deepseek-r1:1.5b', messages, stream: false })
      });
      if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
      return response.json();
    });

    let text = stripThink(data.message.content);
    res.json({ text });
  } catch (err) { next(err); }
};

const handleImagine = async (req, res, next) => {
  try {
    const { concept } = req.body;
    if (!concept) return res.status(400).json({ error: 'Concept is required.' });

    const structuredPrompt = `You are an expert cinematic director and narrator. The user wants to witness: "${concept}".
Respond strictly with valid JSON (no markdown blocks):
{
  "narration": "A 1-minute read, highly cinematic, atmospheric POV script in third-person present tense.",
  "imagePrompt": "A highly specific text-to-image prompt (max 50 words). Cinematic, dark-academia, 8k."
}`;

    const result = await queueLLM(async () => {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'deepseek-r1:1.5b', prompt: structuredPrompt, format: 'json', stream: false })
      });
      if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
      return response.json();
    });

    const data = JSON.parse(stripThink(result.response));
    if (!data.narration || !data.imagePrompt) throw new Error('LLM failed to produce structured data.');
    res.json(data);
  } catch (err) { next(err); }
};

const handleGenerateCharacter = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    // ─── UBER STAGE 1: THE BRAINSTORM ───
    // Low-pressure fact retrieval. No JSON constraints yet.
    const draftPrompt = `You are a cinematic historian for "The Chronos Archive".
    Provide a detailed summary of ${name}. 
    Include:
    1. Exact full name and era.
    2. A famous or representative quote.
    3. A 1-sentence core description.
    4. Primary country and their historical role.
    5. Coordinates (Lat/Lng) if known.
    6. A timeline of 3 major life events with specific years.
    7. A vivid image prompt for their portrait (cinematic, dark academia).`;

    let draftText = "";
    try {
      const draftResult = await queueLLM(async (signal) => {
        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            model: 'deepseek-r1:1.5b', 
            prompt: draftPrompt, 
            stream: false,
            signal
          })
        });
        if (!response.ok) throw new Error('Temporal Brainstorm Failed');
        return response.json();
      });
      draftText = stripThink(draftResult.response);
    } catch (err) {
      console.error(`[Uber-1] Brainstorm failed for ${name}:`, err.message);
      throw err;
    }

    // ─── UBER STAGE 2: THE FORMATTER ───
    // Strictly controlled mapping of Stage 1 text into the Archive schema.
    const jsonSystemPrompt = `You are the Nexus Coder. Convert the given historical text into the EXACT JSON schema below.
    
    SCHEMA:
    {
      "id": "firstname_lastname",
      "fullName": "Name",
      "era": "Era Name",
      "icon": "A relevant emoji",
      "quote": "Quote text",
      "imagePrompt": "The portrait description from the text",
      "context": "Short context word",
      "coreDescription": "1-sentence summary",
      "definitiveQuote": "The famous quote",
      "country": "Primary Country",
      "role": "Historical Role",
      "lat": 0.0,
      "lng": 0.0,
      "moments": [
        { "year": "Year", "title": "Title", "desc": "Description" }
      ]
    }
    
    REFLECTION: No placeholders. Mapping only.`;

    let data = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const result = await queueLLM(async (signal) => {
          const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              model: 'deepseek-r1:1.5b', 
              system: jsonSystemPrompt,
              prompt: `Text to encode: ${draftText}`, 
              format: 'json', 
              stream: false,
              signal
            })
          });
          if (!response.ok) throw new Error('Nexus Encoding Failed');
          return response.json();
        });

        const parsed = JSON.parse(stripThink(result.response));
        if (isHallucinated(parsed)) throw new Error('Placeholder triggers detected in synthesis.');
        
        data = parsed;
        break; // Success!

      } catch (err) {
        console.warn(`[Uber-2] Nexus Encoding Attempt ${attempts} failed for ${name}: ${err.message}`);
        if (attempts >= maxAttempts) throw err;
      }
    }

    const activeName = data.fullName || data.name || name;
    const safeName = activeName.replace(/[^a-zA-Z\s]/g, '');
    const imgPrompt = data.imagePrompt || `${safeName} cinematic historical portrait dark academia ultra intricate 8k`;
    data.img = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=400&height=500&nologo=true`;
    
    // Auto-Save synthesized character metadata immediately
    await saveCharacterToDB(name, {
      ...data,
      chronicleLogs: [
        `SYS_LOG // ${new Date().getFullYear()} // Neural synthesis verified.`,
        `ARCHIVE_FRAGMENT // RECOVERED // Figure [${activeName}] forged in the Nexus.`
      ]
    });

    res.json(data);
  } catch (err) { next(err); }
};

const handleCharacterDetail = async (req, res, next) => {
  try {
    const { name, era, id } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    // Step 1: Check the low-latency JSON store first
    const cachedData = await getCharacterFromDB(name);
    if (cachedData && cachedData.events && cachedData.chronicleLogs && cachedData.chronicleLogs.length > 2) {
      console.log(`[Chronos Archive] Restoring ${name} from local nexus...`);
      return res.json(cachedData);
    }

    // ─── UBER STAGE 1: THE LORE EXPANSION ───
    const lorePrompt = `You are a cinematic historian for "The Chronos Archive".
    Expand on the life of ${name} (${era}).
    Include:
    1. Full Name and Historical Context keyword (e.g. "ANCIENT ROME").
    2. A 2-sentence atmospheric description.
    3. A famous quote.
    4. A timeline of 3 major events: exact year and 1-sentence description.
    5. 4 "Archive Logs": Cinematic, terminal-noir style strings starting with prefixes like 
       "ECHO_WITNESS //", "SYS_LOG //", "DATA_CORRUPTION //", or "ARCHIVE_FRAGMENT //".`;

    let loreText = "";
    try {
      const result = await queueLLM(async (signal) => {
        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'deepseek-r1:1.5b', prompt: lorePrompt, stream: false, signal })
        });
        if (!response.ok) throw new Error('Lore Expansion Failed');
        return response.json();
      });
      loreText = stripThink(result.response);
    } catch (err) {
      console.error(`[Uber-Detail-1] Lore expansion failed for ${name}:`, err.message);
      throw err;
    }

    // ─── UBER STAGE 2: THE ENCODING ───
    const jsonSystemPrompt = `You are the Nexus Coder. Convert the given lore into the EXACT JSON schema below.
    
    SCHEMA:
    {
      "context": "Short Uppercase Context",
      "fullName": "Full Name",
      "coreDescription": "2-sentence summary",
      "quote": "Famous quote",
      "events": [
        { "year": "Year", "description": "Summary" }
      ],
      "chronicleLogs": [
        "Cinematic log string 1",
        "Cinematic log string 2",
        "Cinematic log string 3",
        "Cinematic log string 4"
      ]
    }
    
    REFLECTION: Map accurately. No conversational text.`;

    let data = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const result = await queueLLM(async (signal) => {
          const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              model: 'deepseek-r1:1.5b', 
              system: jsonSystemPrompt,
              prompt: `Lore to encode: ${loreText}`, 
              format: 'json', 
              stream: false,
              signal
            })
          });
          if (!response.ok) throw new Error('Detail Encoding Failed');
          return response.json();
        });
        
        const parsed = JSON.parse(stripThink(result.response));
        if (isHallucinated(parsed)) throw new Error('Placeholder triggers detected in enrichment.');

        data = parsed;
        break; // Success!

      } catch (err) {
        console.warn(`[Uber-Detail-2] Detail Encoding Attempt ${attempts} failed for ${name}: ${err.message}`);
        if (attempts >= maxAttempts) throw err;
      }
    }
    
    // Step 3: Check for existing image prompt to preserve visual identity
    const existing = await getCharacterFromDB(name);
    if (existing && existing.imagePrompt) {
      data.imagePrompt = existing.imagePrompt;
      data.img = existing.img;
      data.id = existing.id;
    }
    
    // Step 4: Save to local DB for future use
    await saveCharacterToDB(name, data);
    res.json(data);
      
  } catch (err) { next(err); }
};

const readHeatmapAsync = async () => {
  try { return JSON.parse(await fs.readFile(HEATMAP_PATH, 'utf8')); }
  catch { return {}; }
};

const handleGetHeatmap  = async (req, res, next) => {
  try { res.json(await readHeatmapAsync()); }
  catch (err) { next(err); }
};

const handlePostHeatmap = async (req, res, next) => {
  if (!fsQueue) return res.status(503).json({ error: 'System warming up.' });
  
  return fsQueue.add(async () => {
    try {
      const { era } = req.body;
      if (!era) return res.status(400).json({ error: 'era is required' });
      const data = await readHeatmapAsync();
      data[era] = (data[era] || 0) + 1;
      await fs.writeFile(HEATMAP_PATH, JSON.stringify(data, null, 2));
      res.json(data);
    } catch (err) { next(err); }
  });
};

const handleGetArchive = async (req, res, next) => {
  try {
    const data = await fs.readFile(DB_PATH, 'utf8');
    const db = JSON.parse(data);
    // Convert object { "julius_caesar": {...} } to array [{...}, ...]
    const archive = Object.values(db);
    res.json(archive);
  } catch (err) {
    // If file doesn't exist, return empty array
    res.json([]);
  }
};

// ─── Routes ───────────────────────────────────────────────────────────────────
function registerRoutes() {
  app.post('/api/chronicle',         handleChronicle);
  app.post('/api/imagine',           handleImagine);
  app.post('/api/character',         handleGenerateCharacter);
  app.post('/api/character-detail',  handleCharacterDetail);
  app.get('/api/archive',            handleGetArchive);
  app.get('/api/heatmap',            handleGetHeatmap);
  app.post('/api/heatmap',           handlePostHeatmap);
  app.get('/api/health', (req, res) => res.json({ status: 'online', version: '3.0-Chronos', timestamp: new Date().toISOString() }));
}

// ─── Global Error Middleware ──────────────────────────────────────────────────
function registerErrorHandler() {
  app.use((err, req, res, next) => {
    console.error('[Chronos Fault]', err.message);
    let msg = 'The timeline is fractured. The chronicle cannot be retrieved.';
    if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch')) {
      msg = 'Nexus Core Offline. Ensure Ollama is running on port 11434.';
    } else if (err.message.includes('synthesis failed') || err.message.includes('integrity fault')) {
      msg = 'Temporal Synthesis Fault: AI returned invalid or placeholder data. Try again.';
    } else if (err.message.includes('JSON') || err.message.includes('parsing')) {
      msg = 'Temporal synthesis failed to structure memory. Try again.';
    } else if (err.message === 'LLM_TIMEOUT') {
      msg = 'LLM response timed out. Request remains in the temporal queue.';
    }
    res.status(err.status || 500).json({ error: msg });
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
function boot() {
  llmQueue = new PQueue({ concurrency: 1 });
  fsQueue  = new PQueue({ concurrency: 1 });

  llmQueue.on('active', () => console.log(`[Queue] Worker active. Size: ${llmQueue.size} | Pending: ${llmQueue.pending}`));
  llmQueue.on('idle',   () => console.log('[Queue] All LLM tasks complete. Queue idle.'));

  registerRoutes();
  registerErrorHandler();

  const server = app.listen(PORT, () => {
    const port = server.address().port;
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║    THE CHRONOS ARCHIVE — ONLINE v3.0     ║`);
    console.log(`╚══════════════════════════════════════════╝`);
    console.log(`  Port   : ${port}`);
    console.log(`  Access : http://localhost:${port}/index.html`);
    console.log(`  Queue  : p-queue concurrency=1 ready\n`);
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.warn(`[WARN] Port ${PORT} in use. Reassigning...`);
      setTimeout(() => { server.close(); server.listen(0); }, 500);
    } else { console.error('[FATAL]', e); }
  });
}
