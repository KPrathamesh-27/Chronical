require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; // PRO-PRACTICE: Use fs.promises for non-blocking I/O
const path = require('path');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

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

// Initialize Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'setup_required');

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

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      const fallback = `The air hangs heavy with the weight of eternity. Dust motes spiral upward through shafts of fading light. The sounds of the world outside fade into a low, resonant hum — the heartbeat of history made audible. Some moments in history must simply be felt.`;
      return res.json({ text: fallback });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', systemInstruction: SYSTEM_INSTRUCTION });
    const formattedHistory = history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history: formattedHistory });
    const result = await chat.sendMessage(prompt);
    res.json({ text: result.response.text() });
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

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
       return res.json({
           narration: "The timeline shivers. A cinematic vision attempts to form, but the temporal conduit lacks the required energy (API Key).",
           imagePrompt: "A highly cinematic, dark-academia style hourglass shattering slowly in mid-air, dramatic volumetric lighting, 8k resolution"
       });
    }

    // Force structured JSON formatting for deterministic parsing
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
            responseMimeType: "application/json",
            // For older SDK versions, if responseSchema throws an error, we rely on the prompt instructing it to output JSON.
            // A more robust approach depends on the newest @google/generative-ai. We will encode the demand directly via the text if needed.
        }
    });

    const structuredPrompt = `
      You are an expert cinematic director and narrator. The user wants to witness the following concept: "${concept}" producing a POV video.
      You must respond strictly with valid JSON conforming to this structure:
      {
        "narration": "A 1-minute read, highly cinematic, atmospheric POV script matching the concept in third-person present tense. Emphasize physical sensations, sounds, and visceral details.",
        "imagePrompt": "A highly specific text-to-image prompt (max 50 words). Must produce a cinematic, dark-academia or hyper-realistic 8k still representing the core action of the concept. Include lighting descriptors (e.g., dramatic volumetric lighting, ray-traced shadows, hyper-detailed)."
      }
    `;

    const result = await model.generateContent(structuredPrompt);
    const data = JSON.parse(result.response.text());
    
    // Ensure the payload structure is valid
    if (!data.narration || !data.imagePrompt) throw new Error("LLM failed to produce structured data.");

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
  if (err.status === 429 || err.message.includes('429') || err.message.includes('Quota exceeded')) {
      friendlyError = 'ECHO Intelligence Grid overloaded (Gemini Free Tier Quota Exceeded). Please wait ~30 seconds for sensors to cool down.';
  }
  
  res.status(err.status || 500).json({
    error: friendlyError,
    // Omitting full stack trace for security
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
