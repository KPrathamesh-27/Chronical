# ECHO — Cinematic AI Time-Travel UI

ECHO is an immersive, high-fidelity editorial web application that blends rich 3D interactions, aesthetic cinematic design ("Dark Academia"), and generative historical AI. It simulates a futuristic "timeline archive" where users can visualize historical data, inspect interactive character chronicles, and forge new temporal memories using Google Gemini AI.

## ✨ Features Available

- **Chronosphere Canvas (Nexus Hero):** An interactive 3D-tilt temporal artifact featuring golden orbital rings, particle physics, and responsive hover-tracking entirely driven by optimized HTML5 Canvas.
- **The Archives (Infinite Coverflow Carousel):** A smooth, 3D perspectival infinite-scroll carousel implemented via a custom circular doubly-linked structure. Features dynamic blur-scaling, keyboard navigation, touch-swiping, and CSS3 3D transforms.
- **Cartography (Global Heatmap):** Visualizes timeline activity asynchronously. Utilizes SVG world map ingestion under a starfield canvas layered with data-driven radiant nodes.
- **Temporal Vortex & HUD Analyzer:** Exploring the chronicles triggers an immersive temporal "tunnel ring" background vortex and a scanning HUD overlay that rotates exact historical coordinates to deepen the immersion.
- **Nexus Forge (Integration):** An interface bridging the frontend and a Node.js/Express backend, allowing the generative construction of "forged historical memories" powered by the Google Gemini API.
- **Magnetic Cursor & Micro-Animations:** Replaces the stock OS cursor with a fluid, magnetic interaction ring. Elements like glowing typewriter effects, chromatic aberration glitch text, CRT scanlines, and card hover-tilts complete the cinematic experience.
- **Persistent State:** Uses browser `localStorage` to save user-generated "Witness" scenarios securely.

## 🚀 How To Use

### 1. Prerequisites
Ensure you have Node.js installed. Access to the Gemini API requires an API key.

### 2. Setup Background Environment
1. Clone the repository and navigate into the folder.
2. Install the necessary server packages by running:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory and append your Google Generative AI key:
   ```
   GEMINI_API_KEY=your_google_api_key_here
   PORT=3000
   ```

### 3. Start the Server
Start the backend Express engine which handles the Gemini structured schema parsing, fallback routing, and static file serving.
```bash
node server.js
```
*(If port 3000 is occupied, ECHO dynamically hunts for the nearest available port. Look at the terminal startup box to see exactly where it booted!)*

### 4. Navigation
- Visit the designated `localhost` URL provided in the terminal (usually `http://localhost:3000/index.html`).
- **NEXUS:** The landing dashboard. 
- **CHRONICLES:** Use your mouse wheel, arrow keys, or trackpad swipes to cycle through the infinite 3D carousel. Clicking an active card drills down into the Witness interface.
- **CARTOGRAPHY:** View the world-map data points rendered locally.
- **NEXUS FORGE:** Command the Gemini API backend by submitting a scenario (e.g., "The library of Alexandria burning from a scholar's POV"). The AI will parse it and narrate it synchronously.

## 🛠️ Architecture Stack
- **Frontend Stack:** Vanilla JS (`app.js`, `interactions.js`), raw CSS3 variables & 3D matrices (`styles.css`), HTML5 Canvas API.
- **Backend Stack:** Node.js, Express, Cors.
- **Integrations:** `@google/generative-ai` SDK (SchemaType structured outputs).
