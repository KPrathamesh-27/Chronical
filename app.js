/**
 * @file app.js
 * @description ECHO — Cinematic AI Time-Travel Platform
 * Core application logic. Manages routing, character rendering,
 * AI narration, heatmap, forge, and voice synthesis.
 */

const API = '';

/* ─────────────────────────────────────────────────────────────
   Audio Engine (Web Audio API)
   ───────────────────────────────────────────────────────────── */
class AudioEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.droneOsc = null;
        this.droneGain = null;
        this.droneFilter = null;
        this.isPlayingDrone = false;
        this.unlocked = false;
        
        const unlock = () => {
            if(!this.unlocked) {
                this.ctx.resume().then(() => { this.unlocked = true; });
                document.removeEventListener('click', unlock);
            }
        };
        document.addEventListener('click', unlock);
    }

    startDrone() {
        if (!this.unlocked || this.isPlayingDrone) return;
        this.isPlayingDrone = true;
        
        this.droneGain = this.ctx.createGain();
        this.droneGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.droneGain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 4);
        this.droneGain.connect(this.ctx.destination);

        this.droneFilter = this.ctx.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.frequency.value = 150;
        this.droneFilter.connect(this.droneGain);

        this.droneOsc = this.ctx.createOscillator();
        this.droneOsc.type = 'sine';
        this.droneOsc.frequency.value = 55;
        
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.15;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 10;
        lfo.connect(lfoGain);
        lfoGain.connect(this.droneOsc.frequency);
        lfo.start();

        this.droneOsc.connect(this.droneFilter);
        this.droneOsc.start();
    }

    playTypewriterTick() {
        if (!this.unlocked) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const f = this.ctx.createBiquadFilter();

        o.type = 'square';
        o.frequency.setValueAtTime(400 + Math.random() * 200, this.ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.04);

        f.type = 'highpass';
        f.frequency.value = 1000;

        g.gain.setValueAtTime(0.05, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

        o.connect(f);
        f.connect(g);
        g.connect(this.ctx.destination);

        o.start();
        o.stop(this.ctx.currentTime + 0.04);
    }
}
const audioEngine = new AudioEngine();

/* ─────────────────────────────────────────────────────────────
   ECHO Application Class
   ───────────────────────────────────────────────────────────── */
class EchoApp {
    constructor() {

        /* Application State */
        this.state = {
            currentPage: 'home',
            figure: null,
            momentIdx: 0,
            narration: '',
            chatHistory: [],
            // Migrate/clean any stale saved items from previous versions that have undefined fields
            saved: JSON.parse(localStorage.getItem('chrono_archive') || '[]')
                .filter(s => s.figId && s.title && s.title !== 'undefined' && s.img && s.img !== 'undefined'),
            narrating: false,
            heatmapData: {},
            hmActiveEra: 'All Time',
            isLoading: false,
        };

        /* Historical Figures Data */
        this.figures = [];

        this.synth       = window.speechSynthesis;
        this.utterance   = null;
        this.el          = {};
    }

    /* ── Init ────────────────────────────────────────────────────── */
    async init() {
        /* Cache frequently accessed DOM nodes */
        const ids = [
            'app', 'main-nav',
            'page-home', 'page-chronicles', 'page-witness',
            'page-forge', 'page-heatmap', 'page-saved',
            /* Chronicles page */
            'chronicles-grid', 'character-carousel',
            /* Witness page */
            'witness-figure-img', 'witness-title', 'witness-coords',
            'narration-text-witness', 'btn-voice-witness', 'btn-save',
            'moment-selector', 'chat-messages', 'chat-input',
            /* Forge page */
            'narration-text', 'imagine-input', 'summon-input', 'btn-imagine', 'btn-summon', 'forge-actions',
            /* Heatmap page */
            'heatmap-canvas', 'heatmap-canvas-full', 'era-filters', 'heatmap-total',
            /* Archive page */
            'saved-grid',
            /* Stats */
            'stat-accuracy', 'stat-archive',
            /* API */
            'api-overlay',
        ];
        ids.forEach(id => {
            const prop = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            this.el[prop] = document.getElementById(id);
        });

        /* Wire up chat input enter key */
        this.el.chatInput?.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendChat(); }
        });

        this.el.imagineInput?.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); this.handleImagine(); }
        });

        /* Resize handler for canvases */
        window.addEventListener('resize', () => this._onResize());

        /* Fetch heatmap data from server */
        this.fetchHeatmapData();

        /* Load Characters Async */
        try {
            const res = await fetch('assets/figures.json');
            this.figures = await res.json();
            console.log(`Loaded ${this.figures.length} figures asynchronously.`);
        } catch(e) {
            console.error("Failed to load figures.json", e);
        }

        /* Render home chronicles preview */
        this._renderChroniclesPreview();

        /* Navigate */
        const hash = window.location.hash.replace('#', '');
        this.go(hash || 'home');
    }

    /* ── Routing ─────────────────────────────────────────────────── */
    go(page) {
        const pages = ['home', 'chronicles', 'witness', 'forge', 'heatmap', 'saved'];
        const navMap = {
            'chronicles': 'nav-chronicles',
            'forge':      'nav-nexus',
            'heatmap':    'nav-cartography',
            'saved':      'nav-archive',
        };

        /* Hide all pages */
        pages.forEach(p => {
            const el = document.getElementById(`page-${p}`);
            if (el) el.classList.remove('active');
        });

        /* Deactivate nav links */
        document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));

        /* Show target page */
        const target = document.getElementById(`page-${page}`);
        if (target) target.classList.add('active');
        else { /* Fallback to home */ document.getElementById('page-home')?.classList.add('active'); page = 'home'; }

        /* Activate nav link */
        if (navMap[page]) {
            document.getElementById(navMap[page])?.classList.add('active');
        }

        this.state.currentPage = page;

        /* Page-specific init */
        if (page === 'chronicles')   { this._renderChroniclesFull(); window.initChroniclesVortex?.(); }
        if (page === 'heatmap')      this._renderHeatmapPage();
        if (page === 'saved')        this.renderSaved();
    }

    /* ── Chronicles Preview → hands off to Carousel Engine ────── */
    _renderChroniclesPreview() {
        /* Hand figures to the interactions carousel engine */
        if (window.initCarousel) {
            window.initCarousel(this.figures);
        }
    }

    /* ── Chronicles Full Page ───────────────────────────────────── */
    _renderChroniclesFull() {
        const grid = this.el.characterCarousel;
        if (!grid) return;
        grid.innerHTML = this.figures.map(f => `
            <div class="chron-card" onclick="echoApp.goWitness('${f.id}')">
                <img src="${f.img}" class="chron-img" alt="${f.name}" loading="lazy">
                <div class="chron-overlay">
                    <div class="chron-era mono">${f.era}</div>
                    <div class="chron-name">${f.name}</div>
                    <div class="chron-quote">${f.quote}</div>
                    <button class="chron-witness-btn mono">WITNESS →</button>
                </div>
            </div>
        `).join('');
    }

    /* ── Navigate to Witness Page ───────────────────────────────── */
    goWitness(figId) {
        const fig = this.figures.find(f => f.id === figId);
        if (!fig) return;

        audioEngine.startDrone();

        this.state.figure   = fig;
        this.state.momentIdx = 0;
        this.state.chatHistory  = [];
        this.state.narration    = '';

        this.go('witness');
        this._populateWitnessPage();
        this._loadNarration();
    }

    /* ── Populate Witness page static elements ──────────────────── */
    _populateWitnessPage() {
        const { figure: fig, momentIdx: idx } = this.state;
        const moment = fig.moments[idx];

        if (this.el.witnessFigureImg) {
            this.el.witnessFigureImg.src  = fig.img;
            this.el.witnessFigureImg.alt  = fig.name;
        }
        if (this.el.witnessTitle)  this.el.witnessTitle.textContent  = fig.name;
        if (this.el.witnessCoords) this.el.witnessCoords.textContent = `${moment.year} :: COORDINATES LOCKED`;
        if (this.el.chatMessages)  this.el.chatMessages.innerHTML    = '';

        /* Render moment selector */
        if (this.el.momentSelector) {
            this.el.momentSelector.innerHTML = fig.moments.map((m, i) => `
                <div class="moment-item ${i === idx ? 'active' : ''}" onclick="echoApp.selectMoment(${i})">
                    <span class="moment-year mono">${m.year}</span>
                    <div>
                        <div class="moment-title">${m.title}</div>
                        <div class="moment-desc">${m.desc}</div>
                    </div>
                </div>
            `).join('');
        }
        this.updateSaveBtn();
    }

    /* ── Select a Different Moment ──────────────────────────────── */
    selectMoment(idx) {
        if (!this.state.figure) return;
        this.state.momentIdx = idx;
        this.state.narration = '';
        this._populateWitnessPage();
        this._loadNarration();
    }

    /* ── Load AI Narration ──────────────────────────────────────── */
    async _loadNarration() {
        if (this.state.isLoading) return;
        this.state.isLoading = true;

        const { figure: fig, momentIdx: idx } = this.state;
        const moment = fig.moments[idx];

        const output = this.el.narrationTextWitness;
        if (!output) { this.state.isLoading = false; return; }

        output.innerHTML = '<span class="mono" style="color:var(--muted-dark)">// TUNING TO TEMPORAL FREQUENCY...</span>';

        this.trackEra(fig.era);

        const prompt = `You are witnessing: ${fig.name} — "${moment.title}" (${moment.year}).\nContext: ${moment.desc}\nEra: ${fig.era}\nGenerate a vivid cinematic narration of this exact moment. Third-person present tense. 3-4 paragraphs. Rich sensory detail. Elegant, slightly philosophical tone.`;

        try {
            const text = await this._fetchChronicle(prompt);
            this.state.narration = text;
            output.innerHTML = '';
            this._typewriter(output, text, () => {
                /* Show forge actions */
                if (this.el.forgeActions) this.el.forgeActions.style.display = 'flex';
            });
        } catch (e) {
            output.innerHTML = `<span class="mono" style="color:#C0392B;">// ${e.message}</span>`;
        } finally {
            this.state.isLoading = false;
        }
    }

    /* ── Forge / Imagine Feature ─────────────────────────────────────── */
    async handleImagine() {
        const input  = this.el.imagineInput;
        const output = this.el.narrationText;
        if (!input || !output) return;

        /* Support both <input> and <textarea> */
        const concept = (input.value ?? '').trim();
        if (!concept) return;

        input.value = '';
        if (input.style) input.style.height = '';
        this.state.narration = '';

        output.innerHTML = '<span class="mono" style="color:var(--muted-dark)">// SYNTHESIZING REALITY...</span>';
        if (this.el.forgeActions) this.el.forgeActions.style.display = 'none';

        /* Show thinking indicator */
        const thinkEl = document.getElementById('forge-thinking');
        if (thinkEl) thinkEl.style.display = 'flex';

        try {
            const r = await fetch(`${API}/api/imagine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ concept })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Forge error');

            this.state.narration = data.narration;

            output.innerHTML = '';

            const videoWrap = document.createElement('div');
            videoWrap.className = 'simulated-video-container';

            const bg = document.createElement('div');
            bg.className = 'simulated-video-bg';
            const encoded = encodeURIComponent(data.imagePrompt);
            const imgUrl  = `https://image.pollinations.ai/prompt/${encoded}?width=900&height=450&nologo=true`;
            bg.style.backgroundImage = `url('${imgUrl}')`;

            const preload   = new Image();
            preload.src     = imgUrl;
            preload.onload  = () => bg.classList.add('loaded');

            videoWrap.appendChild(bg);
            output.appendChild(videoWrap);

            /* Narration typewriter below the video */
            this._typewriter(output, data.narration, () => {
                if (this.el.forgeActions) this.el.forgeActions.style.display = 'flex';
            });

        } catch (e) {
            output.innerHTML = `<span class="mono" style="color:#C0392B;">// ${e.message}</span>`;
        } finally {
            if (thinkEl) thinkEl.style.display = 'none';
        }
    }

    /* ── Summon New Historical Figure via LLM ──────────────────────────── */
    async handleSummon() {
        const input  = this.el.summonInput;
        const output = this.el.narrationText;
        if (!input || !output) return;

        const name = (input.value ?? '').trim();
        if (!name) return;

        input.value = '';
        if (input.style) input.style.height = '';
        output.innerHTML = '<span class="mono" style="color:var(--muted-dark)">// EXCAVATING HISTORICAL RECORD...</span>';
        if (this.el.forgeActions) this.el.forgeActions.style.display = 'none';

        const thinkEl = document.getElementById('forge-thinking');
        if (thinkEl) thinkEl.style.display = 'flex';
        
        try {
            const r = await fetch(`${API}/api/character`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Summon error');

            this.figures.unshift(data);
            this._renderChroniclesFull();
            this._renderChroniclesPreview();

            output.innerHTML = '';
            const msg = `ENTITY ACQUIRED: ${data.name}.\nEra: ${data.era}\nAnalysis Complete. Witness available in Chronicles.`;
            this._typewriter(output, msg, () => {
                setTimeout(() => this.goWitness(data.id), 2000);
            });

        } catch (e) {
            output.innerHTML = `<span class="mono" style="color:#C0392B;">// ${e.message}</span>`;
        }
    }

    /* ── AI Chat ─────────────────────────────────────────────────── */
    async sendChat() {
        const input   = this.el.chatInput;
        const msgs    = this.el.chatMessages;
        if (!input || !msgs || !this.state.figure) return;

        const q = input.value.trim();
        if (!q) return;
        input.value = '';

        const safeQ = q.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        msgs.innerHTML += `<div class="chat-bubble-dark bubble-user-dark">${safeQ}</div>`;
        msgs.innerHTML += `<div class="chat-bubble-dark bubble-ai-dark" id="ai-typing">...</div>`;
        msgs.scrollTop  = msgs.scrollHeight;

        this.state.chatHistory.push({ role: 'user', content: q });

        const fig    = this.state.figure;
        const moment = fig.moments[this.state.momentIdx];
        const p      = `Figure: ${fig.name}, Moment: ${moment.title}\nThe witness asks: "${q}"\nRespond in-scene, 2-3 short paragraphs, elegant cinematic voice.`;

        try {
            const answer = await this._fetchChronicle(p, this.state.chatHistory.slice(0, -1));
            this.state.chatHistory.push({ role: 'assistant', content: answer });

            document.getElementById('ai-typing')?.remove();
            const formatted = answer.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
            msgs.innerHTML += `<div class="chat-bubble-dark bubble-ai-dark">${formatted}</div>`;
        } catch (e) {
            document.getElementById('ai-typing')?.remove();
            msgs.innerHTML += `<div class="chat-bubble-dark bubble-ai-dark" style="color:#C0392B;">${e.message}</div>`;
        }
        msgs.scrollTop = msgs.scrollHeight;
    }

    /* ── Typewriter Effect ──────────────────────────────────────── */
    _typewriter(container, text, onDone) {
        const paras = text.split('\n').filter(l => l.trim());
        let pi = 0, ci = 0;

        const tick = () => {
            if (pi >= paras.length) { onDone?.(); return; }

            let pEl = container.querySelector(`[data-para="${pi}"]`);
            if (!pEl) {
                pEl = document.createElement('p');
                pEl.dataset.para = pi;
                container.appendChild(pEl);
            }

            const para = paras[pi];
            if (ci < para.length) {
                audioEngine.playTypewriterTick();
                pEl.innerHTML = para.slice(0, ci + 1) + '<span class="typewriter-cursor"></span>';
                ci++;
                setTimeout(tick, 18);
            } else {
                pEl.innerHTML = para;
                pi++; ci = 0;
                setTimeout(tick, 120);
            }
        };
        tick();
    }

    /* ── Voice Narration ────────────────────────────────────────── */
    toggleVoice() {
        if (this.synth.speaking) {
            this.synth.cancel();
            this.state.narrating = false;
            this._updateVoiceBtns(false);
            return;
        }
        if (!this.state.narration) return;

        this.state.narrating = true;
        this._updateVoiceBtns(true);

        this.utterance       = new SpeechSynthesisUtterance(this.state.narration);
        this.utterance.rate  = 0.88;
        this.utterance.pitch = 0.9;

        const voices  = this.synth.getVoices();
        const pref    = voices.find(v =>
            v.name.includes('UK English Male') || v.name.includes('Daniel') ||
            v.name.includes('Google UK')        || v.lang === 'en-GB'
        );
        if (pref) this.utterance.voice = pref;

        this.utterance.onend = () => {
            this.state.narrating = false;
            this._updateVoiceBtns(false);
        };
        this.synth.speak(this.utterance);
    }

    _updateVoiceBtns(speaking) {
        const label = speaking ? '⏹ STOP' : '▶ NARRATE';
        [this.el.btnVoiceWitness, document.getElementById('btn-voice')].forEach(b => {
            if (b) b.textContent = label;
        });
    }

    /* ── Save / Archive ─────────────────────────────────────────── */
    toggleSave() {
        if (!this.state.figure) return;
        const key     = `${this.state.figure.id}_${this.state.momentIdx}`;
        const isSaved = this.state.saved.some(s => s.key === key);

        if (isSaved) {
            this.state.saved = this.state.saved.filter(s => s.key !== key);
        } else {
            const fig    = this.state.figure;
            const moment = fig.moments[this.state.momentIdx];
            this.state.saved.push({
                key,
                figId:     fig.id,
                momentIdx: this.state.momentIdx,
                title:     moment?.title || 'Forged Vision',
                era:       fig.era,
                img:       fig.img,
                date:      new Date().toLocaleDateString()
            });
        }
        localStorage.setItem('chrono_archive', JSON.stringify(this.state.saved));
        this.updateSaveBtn();
        if (this.state.currentPage === 'saved') this.renderSaved();
    }

    updateSaveBtn() {
        const btn = document.getElementById('btn-save');
        if (!btn || !this.state.figure) return;
        const key     = `${this.state.figure.id}_${this.state.momentIdx}`;
        const isSaved = this.state.saved.some(s => s.key === key);
        btn.textContent = isSaved ? '✓ SAVED' : '⊕ SAVE MOMENT';
    }

    renderSaved() {
        const grid = this.el.savedGrid;
        if (!grid) return;

        if (!this.state.saved.length) {
            grid.innerHTML = '<div class="empty-archive mono">// NO ARCHIVED MOMENTS YET</div>';
            return;
        }

        grid.innerHTML = this.state.saved.map(s => `
            <div class="saved-card-dark" onclick="echoApp.goWitness('${s.figId}')">
                <img src="${s.img}" class="saved-card-img" alt="${s.title}" loading="lazy">
                <div class="saved-card-info">
                    <div class="saved-card-title">${s.title}</div>
                    <div class="saved-card-meta mono">${s.era} // ${s.date}</div>
                </div>
            </div>
        `).join('');
    }

    /* ── Heatmap (Home Preview) ─────────────────────────────────────────── */
    _renderHeatmapHome() {
        if (!document.getElementById('globe-container-home')) return;
        if (!this._globeHome) this._initWebGLGlobe('globe-container-home', true);
        else this._updateWebGLMarkers(true);
    }

    /* ── Heatmap (Full Page) ────────────────────────────────────── */
    _renderHeatmapPage() {
        /* Setup pills */
        const pillsEl = this.el.eraFilters;
        if (pillsEl && !pillsEl.innerHTML.trim()) {
            const eras = ['All Time', ...new Set(this.figures.map(f => f.era))];
            pillsEl.innerHTML = eras.map(e => `
                <button class="era-pill-dark ${e === 'All Time' ? 'active' : ''}"
                    onclick="echoApp.filterHeatmap('${e}')">${e}</button>
            `).join('');
        }

        if (!document.getElementById('globe-container-full')) return;
        
        // Use timeout to ensure DOM layout is painted before getting dimensions
        setTimeout(() => {
            if (!this._globeFull) this._initWebGLGlobe('globe-container-full', false);
            else this._updateWebGLMarkers(false);

            /* Auto-pause rotation when entering Cartography tab */
            if (this._globeFull && this._globeFull.controls) {
                this._globeFull.controls.autoRotate = false;
                this._globeFull.isRotating = false;
                document.getElementById('btn-globe-rotate')?.classList.remove('active');
            }
        }, 60);
    }

    filterHeatmap(era) {
        this.state.hmActiveEra = era;
        document.querySelectorAll('.era-pill-dark').forEach(p => {
            p.classList.toggle('active', p.textContent === era);
        });
        if (this._globeFull) this._updateWebGLMarkers(false);
    }

    /* ── WebGL 3D Globe Implementation ────────────────────────────── */
    _initWebGLGlobe(containerId, isPreview) {
        if (!window.THREE) return; // Ensure Three.js loaded
        
        const container = document.getElementById(containerId);
        if (!container || container.dataset.initialized) return;
        
        container.dataset.initialized = "true";
        container.innerHTML = ""; 
        
        let width = container.offsetWidth || 500;
        let height = container.offsetHeight || 500;
        
        const scene = new THREE.Scene();
        // Transparent background so it blends with our dark theme CSS
        
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.z = isPreview ? 35 : 28;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio ? Math.min(window.devicePixelRatio, 2) : 1);
        container.appendChild(renderer.domElement);

        let controls;
        if (window.THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.enablePan = false;
            if (isPreview) {
                controls.enableZoom = false;
                controls.autoRotate = true;
                controls.autoRotateSpeed = 1.0;
            } else {
                controls.minDistance = 15;
                controls.maxDistance = 60;
                controls.autoRotate = true;
                controls.autoRotateSpeed = 0.5;
            }
        }

        const globeGroup = new THREE.Group();
        scene.add(globeGroup);

        const radius = 10;
        const sphereGeo = new THREE.SphereGeometry(radius, 64, 64);
        
        const textureLoader = new THREE.TextureLoader();
        const earthTexture = textureLoader.load('assets/earth-dark.svg');
        
        // Base dark sphere
        const baseMat = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            map: earthTexture,
            emissive: 0x0a0e27,
            emissiveIntensity: 0.1,
            transparent: true,
            opacity: 0.95
        });
        const globeMesh = new THREE.Mesh(sphereGeo, baseMat);
        // No manual rotation — coordinate math already handles alignment
        globeGroup.add(globeMesh);

        // Wireframe overlay
        const wireMat = new THREE.MeshBasicMaterial({
            color: 0x4a5568,
            wireframe: true,
            transparent: true,
            opacity: 0.15
        });
        const wireMesh = new THREE.Mesh(sphereGeo, wireMat);
        globeGroup.add(wireMesh);

        // Atmosphere glow
        const atmosGeo = new THREE.SphereGeometry(radius * 1.05, 32, 32);
        const atmosMat = new THREE.MeshBasicMaterial({
            color: 0x3182ce,
            transparent: true,
            opacity: 0.1,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });
        const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
        globeGroup.add(atmosMesh);

        // Stars
        const starsGeo = new THREE.BufferGeometry();
        const starsCount = isPreview ? 200 : 800;
        const posArray = new Float32Array(starsCount * 3);
        const colorsArray = new Float32Array(starsCount * 3);
        for(let i=0; i < starsCount * 3; i+=3) {
            posArray[i] = (Math.random() - 0.5) * 200;
            posArray[i+1] = (Math.random() - 0.5) * 200;
            posArray[i+2] = -Math.random() * 200; // Keep mostly behind
            
            const intensity = Math.random();
            colorsArray[i] = intensity;
            colorsArray[i+1] = intensity;
            colorsArray[i+2] = intensity;
        }
        starsGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        starsGeo.setAttribute('color', new THREE.BufferAttribute(colorsArray, 3));
        const starsMat = new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, opacity: 0.8 });
        const starsMesh = new THREE.Points(starsGeo, starsMat);
        scene.add(starsMesh);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(20, 10, 20);
        scene.add(directionalLight);

        if (isPreview) {
            this._globeHome = { scene, globeGroup, renderer, camera, controls, markers: [], radius };
        } else {
            this._globeFull = { scene, globeGroup, renderer, camera, controls, markers: [], radius, isRotating: true };
        }

        const raycaster = new THREE.Raycaster();
        const mouse     = new THREE.Vector2(-9999, -9999);
        const tooltip   = document.getElementById('globe-tooltip');
        const tCountry  = document.getElementById('tooltip-country');
        const tName     = document.getElementById('tooltip-name');
        const tRole     = document.getElementById('tooltip-role');
        let   lastX = 0, lastY = 0;

        if (!isPreview && tooltip) {
            renderer.domElement.addEventListener('mousemove', (e) => {
                const rect = renderer.domElement.getBoundingClientRect();
                mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
                mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
                lastX = e.clientX; lastY = e.clientY;
            });
            renderer.domElement.addEventListener('mouseleave', () => {
                mouse.set(-9999, -9999);
                if (tooltip) tooltip.classList.add('hidden');
            });
        }

        const globeState = isPreview ? this._globeHome : this._globeFull;

        const animate = () => {
            requestAnimationFrame(animate);
            if (controls) controls.update();
            else globeGroup.rotation.y += 0.002;

            /* Raycasting for hover tooltips (full globe only) */
            if (!isPreview && tooltip) {
                raycaster.setFromCamera(mouse, camera);
                const interactables = (globeState.markers || []).filter(m => m.userData?.figure);
                const hits = raycaster.intersectObjects(interactables);
                if (hits.length > 0) {
                    const fig = hits[0].object.userData.figure;
                    tCountry.textContent = fig.country || fig.era;
                    tName.textContent    = fig.name;
                    tRole.textContent    = fig.role || '';
                    tooltip.style.left   = (lastX + 16) + 'px';
                    tooltip.style.top    = (lastY + 16) + 'px';
                    /* Clamp to viewport */
                    const tw = 296, th = 110;
                    if (lastX + 16 + tw > window.innerWidth)  tooltip.style.left = (lastX - tw - 8) + 'px';
                    if (lastY + 16 + th > window.innerHeight)  tooltip.style.top  = (lastY - th - 8) + 'px';
                    tooltip.classList.remove('hidden');
                } else {
                    tooltip.classList.add('hidden');
                }
            }

            renderer.render(scene, camera);
        };
        animate();

        window.addEventListener('resize', () => {
            if(!container || !container.parentElement) return;
            width = container.offsetWidth || 500;
            height = container.offsetHeight || 500;
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        });
        
        this._updateWebGLMarkers(isPreview);
    }

    _updateWebGLMarkers(isPreview) {
        const globeState = isPreview ? this._globeHome : this._globeFull;
        if (!globeState) return;

        const { globeGroup, markers, radius } = globeState;

        markers.forEach(m => globeGroup.remove(m));
        markers.length = 0;

        const data = this.state.heatmapData;
        let maxCount = 1, total = 0;
        Object.values(data).forEach(v => { if (v > maxCount) maxCount = v; total += v; });

        Object.keys(data).forEach(era => {
            if (!isPreview && this.state.hmActiveEra !== 'All Time' && era !== this.state.hmActiveEra) return;
            
            const count = data[era];
            const intensity = count / maxCount;
            const figure = this.figures.find(f => f.era === era);
            
            if (figure && figure.lat !== undefined && figure.lng !== undefined) {
                const lat = Number(figure.lat);
                const lng = Number(figure.lng);
                
                const phi   = (90 - lat) * (Math.PI / 180);
                const theta = (lng + 180) * (Math.PI / 180);

                const x = -(radius * Math.sin(phi) * Math.cos(theta));
                const z =  (radius * Math.sin(phi) * Math.sin(theta));
                const y =  (radius * Math.cos(phi));

                let colorHex = 0xffa500;
                if (intensity > 0.8) colorHex = 0xff0000;
                else if (intensity > 0.4) colorHex = 0xff4500;
                
                // Solid core — stores figure data for raycaster
                const markerGeo  = new THREE.SphereGeometry(0.2 + (intensity * 0.3), 16, 16);
                const markerMat  = new THREE.MeshBasicMaterial({ color: colorHex });
                const markerMesh = new THREE.Mesh(markerGeo, markerMat);
                markerMesh.position.set(x, y, z);
                markerMesh.userData = { figure };
                
                // Glow Halo
                const haloGeo = new THREE.SphereGeometry(0.4 + (intensity * 0.8), 32, 32);
                const haloMat = new THREE.MeshBasicMaterial({
                    color: colorHex,
                    transparent: true,
                    opacity: 0.3,
                    blending: THREE.AdditiveBlending,
                    side: THREE.BackSide
                });
                const haloMesh = new THREE.Mesh(haloGeo, haloMat);
                haloMesh.position.set(x, y, z);
                /* halos don't participate in raycasting */
                haloMesh.userData = {};
                
                globeGroup.add(markerMesh);
                globeGroup.add(haloMesh);
                markers.push(markerMesh, haloMesh);
            }
        });

        const countEl = document.getElementById('heatmap-total');
        if (countEl && !isPreview) countEl.textContent = `TOTAL VIEWINGS: ${total}`;
    }

    async fetchHeatmapData() {
        try {
            const r = await fetch(`${API}/api/heatmap`);
            if (r.ok) this.state.heatmapData = await r.json();
        } catch (e) { console.warn('[Heatmap] Failed to fetch server data.'); }

        /* Merge local tracking data */
        const local = JSON.parse(localStorage.getItem('chrono_heatmap_local') || '{}');
        Object.entries(local).forEach(([k, v]) => {
            this.state.heatmapData[k] = (this.state.heatmapData[k] || 0) + v;
        });

        /* Render on whichever canvas is active */
        this._renderHeatmapHome();
        if (this.state.currentPage === 'heatmap') this._renderHeatmapPage();
    }

    trackEra(era) {
        const local = JSON.parse(localStorage.getItem('chrono_heatmap_local') || '{}');
        local[era] = (local[era] || 0) + 1;
        localStorage.setItem('chrono_heatmap_local', JSON.stringify(local));

        fetch(`${API}/api/heatmap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ era })
        }).catch(() => {});

        this.fetchHeatmapData();
    }

    /* ── Internal: Fetch Chronicle from Server ───────────────────── */
    async _fetchChronicle(prompt, history = []) {
        const r   = await fetch(`${API}/api/chronicle`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ prompt, history })
        });
        const txt = await r.json();
        if (!r.ok) throw new Error(txt.error || 'Chronicle API Error');
        return txt.text;
    }

    /* ── Resize Handler ─────────────────────────────────────────── */
    _onResize() {
        this._renderHeatmapHome();
        if (this.state.currentPage === 'heatmap') this._renderHeatmapPage();
    }
}

/* ─────────────────────────────────────────────────────────────
   Bootstrap
   ───────────────────────────────────────────────────────────── */
const echoApp = new EchoApp();

/* Global shims for inline onclick handlers in HTML */
window.toggleSave   = () => echoApp.toggleSave();
window.toggleVoice  = () => echoApp.toggleVoice();
window.toggleAPI    = () => {
    const overlay = document.getElementById('api-overlay');
    overlay?.classList.toggle('open');
};
window.sendChat     = () => echoApp.sendChat();

window.addEventListener('DOMContentLoaded', () => echoApp.init());
window.addEventListener('beforeunload',     () => window.speechSynthesis?.cancel());

/* ─────────────────────────────────────────────────────────────
   FORGE V2 — UI Controller
   ───────────────────────────────────────────────────────────── */
let _forgeMode = 'forge'; // 'forge' | 'summon'

function forgeSetMode(mode) {
    _forgeMode = mode;
    /* Swap tab active state */
    document.getElementById('tab-forge')?.classList.toggle('active', mode === 'forge');
    document.getElementById('tab-summon')?.classList.toggle('active', mode === 'summon');

    /* Swap textarea visibility */
    const imagineTA = document.getElementById('imagine-input');
    const summonTA  = document.getElementById('summon-input');
    if (imagineTA) imagineTA.style.display = mode === 'forge'  ? '' : 'none';
    if (summonTA)  summonTA.style.display  = mode === 'summon' ? '' : 'none';

    /* Update send button label */
    const label = document.getElementById('forge-send-label');
    if (label) label.textContent = mode === 'forge' ? 'FORGE' : 'SUMMON';
}

function forgeSubmit() {
    if (_forgeMode === 'forge') {
        echoApp.handleImagine();
    } else {
        echoApp.handleSummon();
    }
}

function forgeToggleCmds() {
    const palette = document.getElementById('forge-cmd-palette');
    const btn     = document.querySelector('.forge-cmd-toggle');
    if (!palette) return;
    const isOpen = palette.classList.toggle('open');
    btn?.classList.toggle('active', isOpen);
}

function forgeSelectCmd(text) {
    const ta = document.getElementById('imagine-input');
    if (ta) {
        ta.value = text;
        ta.focus();
        ta.dispatchEvent(new Event('input'));
    }
    /* Close palette */
    document.getElementById('forge-cmd-palette')?.classList.remove('open');
    document.querySelector('.forge-cmd-toggle')?.classList.remove('active');
}

function forgeChip(text) {
    /* Auto-fill the textarea with the chip text and switch to forge mode */
    forgeSetMode('forge');
    const ta = document.getElementById('imagine-input');
    if (ta) { ta.value = text; ta.focus(); }
}

function forgeAttach() {
    const names = ['reference.pdf', 'era-notes.txt', 'timeline.csv'];
    const name  = names[Math.floor(Math.random() * names.length)];
    const strip = document.getElementById('forge-attachments');
    if (!strip) return;
    const tag = document.createElement('div');
    tag.className = 'forge-attachment-tag';
    tag.innerHTML = `<span>${name}</span><button onclick="this.parentElement.remove()">&times;</button>`;
    strip.appendChild(tag);
}

/* Auto-resize forge textareas */
document.addEventListener('DOMContentLoaded', () => {
    ['imagine-input', 'summon-input'].forEach(id => {
        const ta = document.getElementById(id);
        if (!ta) return;
        ta.addEventListener('input', () => {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';

            /* Show/hide command palette on "/" trigger */
            if (id === 'imagine-input') {
                const val = ta.value;
                const palette = document.getElementById('forge-cmd-palette');
                if (palette) {
                    const startsWithSlash = val.startsWith('/') && !val.includes(' ');
                    palette.classList.toggle('open', startsWithSlash);
                    document.querySelector('.forge-cmd-toggle')?.classList.toggle('active', startsWithSlash);
                }
            }
        });
        ta.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                forgeSubmit();
            }
        });
    });

    /* Close cmd palette on click outside */
    document.addEventListener('mousedown', e => {
        const palette = document.getElementById('forge-cmd-palette');
        const toggle  = document.querySelector('.forge-cmd-toggle');
        if (palette && !palette.contains(e.target) && !toggle?.contains(e.target)) {
            palette.classList.remove('open');
            toggle?.classList.remove('active');
        }
    });
});

/* ─────────────────────────────────────────────────────────────
   GLOBE CONTROLS
   ───────────────────────────────────────────────────────────── */
function globeZoom(direction) {
    const gs = echoApp._globeFull;
    if (!gs) return;
    const { camera } = gs;
    const step = direction > 0 ? 0.85 : 1.18; // zoom in = pull camera closer
    camera.position.z = Math.max(14, Math.min(60, camera.position.z * step));
    // NOTE: updateProjectionMatrix not needed — position changes don't affect the projection matrix
}

function globeToggleRotate() {
    const gs  = echoApp._globeFull;
    const btn = document.getElementById('btn-globe-rotate');
    const lbl = document.getElementById('rotate-label');
    if (!gs) return;
    if (gs.controls) {
        gs.isRotating = !gs.isRotating;
        gs.controls.autoRotate = gs.isRotating;
        btn?.classList.toggle('active', gs.isRotating);
        if (lbl) lbl.textContent = gs.isRotating ? 'LIVE' : 'PAUSED';
    }
}

function globeReset() {
    const gs = echoApp._globeFull;
    if (!gs) return;
    const { camera, controls } = gs;
    camera.position.set(0, 0, 28);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    if (controls) {
        controls.reset();
        controls.autoRotate = true;
        gs.isRotating = true;
        document.getElementById('btn-globe-rotate')?.classList.add('active');
        const lbl = document.getElementById('rotate-label');
        if (lbl) lbl.textContent = 'LIVE';
    }
}

