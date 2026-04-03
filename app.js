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
            // Also normalize 'figId' to 'id' for consistency across the platform
            saved: JSON.parse(localStorage.getItem('chrono_archive') || '[]')
                .map(s => {
                    if (s.figId && !s.id) s.id = s.figId; 
                    return s;
                })
                .filter(s => s.id && s.title && s.title !== 'undefined' && s.img && s.img !== 'undefined'),
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

        /* Load Characters & Archive Sync */
        try {
            const [seedRes, archiveRes] = await Promise.all([
                fetch('assets/figures.json'),
                fetch(`${API}/api/archive`).catch(() => null)
            ]);
            
            const staticFigures = await seedRes.json();
            const archiveFigures = archiveRes ? await archiveRes.json() : [];
            
            /* Merge Archive and Seed data with Fuzzy Identity & Local-First Art Pipeline */
            const HISTORICAL_ALIASES = {
                'joanofarc': 'jeannedarc',
                'jeannedarc': 'joanofarc',
                'gaiusjuliuscaesar': 'juliuscaesar',
                'cleopatraviiphilopator': 'cleopatravii',
                'alexanderiiiofmacedon': 'alexanderthegreat',
                'alexanderthegreat': 'alexanderiiiofmacedon'
            };

            const LOCAL_ASSETS = {
                'cleopatravii': 'assets/cleopatra.png',
                'cleopatraviiphilopator': 'assets/cleopatra.png',
                'juliuscaesar': 'assets/caesar.png',
                'gaiusjuliuscaesar': 'assets/caesar.png',
                'achilles': 'assets/achilles.png',
                'marieantoinette': 'assets/marie-antoinette.png',
                'nikolatesla': 'assets/tesla.png',
                'leonardodavinci': 'assets/da-vinci.png',
                'jeannedarc': 'assets/joan-of-arc.png',
                'joanofarc': 'assets/joan-of-arc.png',
                'alexanderiiiofmacedon': 'assets/alexander.png',
                'alexanderthegreat': 'assets/alexander.png'
            };

            const normalizedArchive = archiveFigures.map(af => {
                 const name = af.name || af.fullName || 'Legacy Figure';
                 const era = af.era || af.context || 'Unknown Era';
                 const norm = name.toLowerCase().replace(/[^a-z]/g, '');
                 
                 /* Priority: 
                    1. Existing af.img if it points to assets/
                    2. Local lookup
                    3. Placeholder
                 */
                 let img = af.img;
                 // If img is missing, points to pollinations, or is a broken placeholder string
                 if (!img || img.includes('pollinations.ai') || img === 'assets/placeholder.png') {
                     // Check if it's one of our known core figures
                     img = LOCAL_ASSETS[norm] || 'assets/hero-bg.png'; // Using hero-bg as a temporary 'template' placeholder
                 }
                 
                 return {
                    ...af,
                    name,
                    era,
                    img,
                    _norm: norm
                 };
            });
            
            const merged = [...normalizedArchive];
            staticFigures.forEach(sf => {
                const sfNorm = (sf.name || '').toLowerCase().replace(/[^a-z]/g, '');
                
                let existing = null;
                const isDuplicate = merged.some(af => {
                    const isMatch = (af.id === sf.id) || 
                                    (af.name.toLowerCase() === sf.name.toLowerCase()) ||
                                    (af._norm === sfNorm) ||
                                    (HISTORICAL_ALIASES[sfNorm] === af._norm || HISTORICAL_ALIASES[af._norm] === sfNorm) ||
                                    (af._norm.includes(sfNorm) || sfNorm.includes(af._norm));
                    
                    if (isMatch) {
                        existing = af;
                        return true;
                    }
                    return false;
                });
                
                if (isDuplicate && existing) {
                    /* Sync ID: ensure the archived version uses the stable static ID for click handlers */
                    existing.id = sf.id;
                    /* Ensure we have a high-fidelity image */
                    if (!existing.img || existing.img.includes('pollinations.ai') || existing.img.includes('placeholder')) {
                        existing.img = sf.img || LOCAL_ASSETS[sfNorm] || 'assets/hero-bg.png';
                    }
                } else if (!isDuplicate) {
                    /* For static figures, ensure we use their assets/ path */
                    merged.push({ ...sf, img: sf.img || LOCAL_ASSETS[sfNorm] || 'assets/hero-bg.png' });
                }
            });
            
            this.figures = merged;
            console.log(`[Nexus Sync] Unified ${this.figures.length} unique nodes. Local assets prioritized.`);
        } catch(e) {
            console.error("[Nexus Sync] Failed to synchronize archive", e);
            this.figures = [];
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
            <div class="chron-card" onclick="openDetailPanel('${f.id}')">
                <img src="${f.img}" class="chron-img" alt="${f.name}" loading="lazy">
                <div class="chron-overlay">
                    <div class="chron-era mono">${f.era}</div>
                    <div class="chron-name">${f.name}</div>
                    <div class="chron-quote">${f.quote?.replace(/"/g,'').slice(0,80)}...</div>
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
            
            // GUARD: Check if we are still on the same figure/moment/page
            if (this.state.currentPage !== 'witness' || !this.state.figure || this.state.figure.id !== fig.id) {
                return;
            }

            this.state.narration = text;
            output.innerHTML = '';
            this._typewriter(output, text, () => {
                /* Show forge actions */
                if (this.el.forgeActions) this.el.forgeActions.style.display = 'flex';
            });
        } catch (e) {
            if (this.state.figure && this.state.figure.id === fig.id) {
                output.innerHTML = `<span class="mono" style="color:#C0392B;">// ${e.message}</span>`;
            }
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
            if (!r.ok) throw new Error(data.error || 'Temporal Synthesis Failed.');

            // Client-side redundant check for stale placeholders
            const isPlaceholder = JSON.stringify(data).includes('A unique camelCase ID') || 
                                  JSON.stringify(data).includes('The figure\'s full historic name') ||
                                  JSON.stringify(data).includes('A year string');

            if (isPlaceholder) throw new Error('Timeline Integrity Failure: AI returned placeholder text.');

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
            if (this.el.forgeActions) this.el.forgeActions.style.display = 'block';
        } finally {
            if (thinkEl) thinkEl.style.display = 'none';
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

        /* --- Add Solar Chariot --- */
        const chariotGroup = new THREE.Group();
        const chariotDiscGeo = new THREE.RingGeometry(0.22, 0.25, 32);
        const chariotDiscMat = new THREE.MeshBasicMaterial({ color: 0xD4AF37, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
        const chariotDisc = new THREE.Mesh(chariotDiscGeo, chariotDiscMat);
        chariotGroup.add(chariotDisc);
        
        const chariotCoreGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const chariotCoreMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const chariotCore = new THREE.Mesh(chariotCoreGeo, chariotCoreMat);
        chariotGroup.add(chariotCore);

        const chariotGlow = new THREE.PointLight(0xD4AF37, 2, 10);
        chariotGroup.add(chariotGlow);
        scene.add(chariotGroup);

        const globeState = isPreview ? this._globeHome : this._globeFull;

        let chariotTime = 0;
        const animate = () => {
            requestAnimationFrame(animate);
            if (controls) controls.update();
            else globeGroup.rotation.y += 0.002;

            /* Animate Solar Chariot */
            chariotTime += 0.008;
            const orbitR = radius * 1.4;
            chariotGroup.position.set(
                Math.cos(chariotTime) * orbitR,
                Math.sin(chariotTime * 0.5) * (orbitR * 0.5),
                Math.sin(chariotTime) * orbitR
            );
            chariotGroup.lookAt(0, 0, 0);

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

    /* ══════════════════════════════════════════════════════════════
       CHARACTER DETAIL PANEL
       ══════════════════════════════════════════════════════════════ */

    /** Open the detail sidebar for a figure */
    openDetailPanel(figId) {
        const fig = this.figures.find(f => f.id === figId);
        if (!fig) return;

        this._detailFigure = fig;

        /* Set initial static data immediately */
        const ctxEl   = document.getElementById('detail-context');
        const nameEl  = document.getElementById('detail-name');
        const descEl  = document.getElementById('detail-description');
        const quoteEl = document.getElementById('detail-quote');
        const lblEl   = document.getElementById('detail-bust-label');
        const logEl   = document.getElementById('detail-chronicle-stream');

        if (ctxEl)   ctxEl.textContent   = (fig.era || 'UNKNOWN').toUpperCase();
        if (nameEl)  nameEl.textContent  = fig.name;
        if (descEl)  descEl.textContent  = fig.role || 'Recovering temporal data fragments...';
        if (quoteEl) quoteEl.innerHTML   = `&ldquo;${(fig.quote || 'The archive speaks...').replace(/"/g,'')}&rdquo;`;
        if (lblEl)   lblEl.textContent   = `3D MODEL // ${fig.name.toUpperCase()}`;

        /* Reset chronicle log */
        if (logEl) logEl.innerHTML = `<div class="chronicle-log-entry"><span class="log-keyword">ECHO_WITNESS</span> // <span class="log-active">ACTIVE</span> // Initializing node [${fig.name}]...</div>`;

        /* Slide in */
        const panel = document.getElementById('detail-panel');
        const backdrop = document.getElementById('detail-panel-backdrop');
        
        console.log(`[Detail] Opening panel for: ${fig.name}`, { panel, backdrop });
        
        if (panel) panel.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
        document.body.style.overflow = 'hidden';

        /* 3D Bust */
        this._initCharacterBust('detail-bust-canvas', fig);

        /* Fetch rich LLM data (non-blocking — panel already shows static data) */
        this._logToken = (this._logToken || 0) + 1; // Increment token to abort previous typewriter loops
        this._fetchDetailData(fig);
    }

    /** Close the detail panel */
    closeDetailPanel() {
        document.getElementById('detail-panel')?.classList.remove('open');
        document.getElementById('detail-panel-backdrop')?.classList.remove('open');
        document.body.style.overflow = '';

        /* Dispose bust renderer */
        if (this._bustRenderer) {
            this._bustRenderer.dispose();
            this._bustRenderer = null;
        }
        this._bustAnimId = null;
    }

    /** Fetch LLM-enriched data and update panel */
    async _fetchDetailData(fig) {
        try {
            const r = await fetch(`${API}/api/character-detail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: fig.name, era: fig.era, id: fig.id })
            });
            if (!r.ok) throw new Error('detail fetch failed');
            const data = await r.json();

            /* Only update if panel is still open for this figure */
            if (!document.getElementById('detail-panel')?.classList.contains('open')) return;
            if (this._detailFigure?.id !== fig.id) return;

            const ctxEl   = document.getElementById('detail-context');
            const nameEl  = document.getElementById('detail-name');
            const descEl  = document.getElementById('detail-description');
            const quoteEl = document.getElementById('detail-quote');

            if (data.context && ctxEl)        ctxEl.textContent  = data.context;
            if (data.fullName && nameEl)      nameEl.textContent = data.fullName;
            if (data.coreDescription && descEl)  descEl.textContent = data.coreDescription;
            if (data.quote && quoteEl) quoteEl.innerHTML = `&ldquo;${data.quote.replace(/"/g,'')}&rdquo;`;

            /* Chronicle log stream — typewriter entries */
            if (data.chronicleLogs?.length) {
                this._typewriterLogs(data.chronicleLogs);
            }
        } catch (e) {
            console.warn('[Detail] LLM enrichment failed, using static data.', e.message);
        }
    }

    /** Typewriter-animate chronicle log entries one by one */
    _typewriterLogs(logs) {
        const container = document.getElementById('detail-chronicle-stream');
        if (!container) return;
        
        const currentToken = this._logToken;
        container.innerHTML = '';

        let logIdx = 0;

        const addNextLog = () => {
            if (logIdx >= logs.length) return;
            if (!document.getElementById('detail-panel')?.classList.contains('open')) return;

            const logText = logs[logIdx];
            const entry = document.createElement('div');
            entry.className = 'chronicle-log-entry';
            entry.style.opacity = '0';
            container.appendChild(entry);

            /* Colorize keywords */
            let ci = 0;
            const tick = () => {
                if (this._logToken !== currentToken) return; // Abort: panel was reused or closed
                if (ci >= logText.length) {
                    /* Finalize — apply keyword colors */
                    entry.innerHTML = logText
                        .replace(/(ECHO_WITNESS|TEMPORAL_ANCHOR|ARCHIVE_FRAGMENT|SIMULATION_STATUS|ECHO_CORE)/g, '<span class="log-keyword">$1</span>')
                        .replace(/(ACTIVE|LOCKED|RECOVERED|RUNNING|PROCESSING)/g, '<span class="log-active">$1</span>');
                    logIdx++;
                    setTimeout(addNextLog, 350);
                    return;
                }
                entry.style.opacity = '1';
                entry.textContent = logText.slice(0, ci + 1);
                ci++;
                setTimeout(tick, 12);
            };

            setTimeout(tick, 200);
            container.scrollTop = container.scrollHeight;
        };

        addNextLog();
    }

    /* ── Procedural 3D Bust ─────────────────────────────────────── */
    _initCharacterBust(canvasId, fig) {
        if (!window.THREE) return;

        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        /* Dispose previous */
        if (this._bustRenderer) {
            this._bustRenderer.dispose();
            this._bustRenderer = null;
        }
        this._bustAnimId = null;

        const parent = canvas.parentElement;
        const W = parent.offsetWidth || 280;
        const H = W; // square aspect

        const scene    = new THREE.Scene();
        const camera   = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
        camera.position.set(0, 1.5, 5.5);
        camera.lookAt(0, 0.8, 0);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this._bustRenderer = renderer;

        /* --- Determine character tint from era --- */
        const eraColors = {
            'Ancient Egypt':       0xD4AF37,
            'Ancient Greece':      0x7CB5D4,
            'Ancient Rome':        0xCC3333,
            '18th Century France': 0xC9A0DC,
            'Medieval France':     0x8899AA,
            'Renaissance':         0xE8A87C,
            '19th Century Science':0x66CCFF,
        };
        const tintHex = eraColors[fig.era] || 0xD4AF37;
        const tintColor = new THREE.Color(tintHex);

        /* --- Build the bust group --- */
        const bustGroup = new THREE.Group();
        scene.add(bustGroup);

        /* Head sphere */
        const headGeo = new THREE.SphereGeometry(0.58, 32, 32);
        const headMat = new THREE.MeshStandardMaterial({
            color: 0x141829,
            emissive: tintColor,
            emissiveIntensity: 0.15,
            metalness: 0.7,
            roughness: 0.35,
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 2.0;
        bustGroup.add(head);

        /* Wireframe shell around head */
        const wireGeo = new THREE.SphereGeometry(0.62, 20, 20);
        const wireMat = new THREE.MeshBasicMaterial({ color: tintHex, wireframe: true, transparent: true, opacity: 0.18 });
        const wireHead = new THREE.Mesh(wireGeo, wireMat);
        wireHead.position.copy(head.position);
        bustGroup.add(wireHead);

        /* Neck cylinder */
        const neckGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.45, 16);
        const neckMat = new THREE.MeshStandardMaterial({ color: 0x141829, emissive: tintColor, emissiveIntensity: 0.1, metalness: 0.6, roughness: 0.4 });
        const neck = new THREE.Mesh(neckGeo, neckMat);
        neck.position.y = 1.35;
        bustGroup.add(neck);

        /* Torso — tapered cylinder */
        const torsoGeo = new THREE.CylinderGeometry(0.55, 0.75, 1.3, 24);
        const torsoMat = new THREE.MeshStandardMaterial({ color: 0x0E1120, emissive: tintColor, emissiveIntensity: 0.08, metalness: 0.5, roughness: 0.5 });
        const torso = new THREE.Mesh(torsoGeo, torsoMat);
        torso.position.y = 0.5;
        bustGroup.add(torso);

        /* Wireframe torso */
        const wireTorsoGeo = new THREE.CylinderGeometry(0.58, 0.78, 1.32, 16);
        const wireTorsoMat = new THREE.MeshBasicMaterial({ color: tintHex, wireframe: true, transparent: true, opacity: 0.08 });
        const wireTorso = new THREE.Mesh(wireTorsoGeo, wireTorsoMat);
        wireTorso.position.y = 0.5;
        bustGroup.add(wireTorso);

        /* Shoulder caps */
        [-1, 1].forEach(side => {
            const shoulderGeo = new THREE.SphereGeometry(0.3, 16, 16);
            const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x0E1120, emissive: tintColor, emissiveIntensity: 0.1, metalness: 0.6, roughness: 0.4 });
            const shoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
            shoulder.position.set(side * 0.65, 1.05, 0);
            bustGroup.add(shoulder);
        });

        /* Base pedestal */
        const baseGeo = new THREE.CylinderGeometry(0.85, 0.9, 0.15, 32);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x090C14, emissive: tintColor, emissiveIntensity: 0.05, metalness: 0.8, roughness: 0.3 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = -0.22;
        bustGroup.add(base);

        /* Orbital ring around bust */
        const orbitGeo = new THREE.TorusGeometry(1.2, 0.015, 8, 64);
        const orbitMat = new THREE.MeshBasicMaterial({ color: tintHex, transparent: true, opacity: 0.3 });
        const orbitRing = new THREE.Mesh(orbitGeo, orbitMat);
        orbitRing.position.y = 1.2;
        orbitRing.rotation.x = Math.PI / 3;
        bustGroup.add(orbitRing);

        /* Small orbiting point light */
        const orbitLight = new THREE.PointLight(tintHex, 0.6, 6);
        bustGroup.add(orbitLight);

        /* Rim light from behind */
        const rimLight = new THREE.PointLight(tintHex, 1.2, 10);
        rimLight.position.set(0, 2.5, -3);
        scene.add(rimLight);

        /* Ambient + key light */
        scene.add(new THREE.AmbientLight(0xffffff, 0.15));
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
        keyLight.position.set(2, 3, 4);
        scene.add(keyLight);

        /* --- Animate --- */
        let t = 0;
        const animId = {};
        this._bustAnimId = animId;

        const animate = () => {
            if (this._bustAnimId !== animId) return; // disposed
            requestAnimationFrame(animate);
            t += 0.016;

            /* Breathing: subtle scale oscillation */
            const breath = 1 + 0.015 * Math.sin(t * 1.6);
            torso.scale.set(1, breath, 1);
            head.position.y = 2.0 + 0.01 * Math.sin(t * 1.6);

            /* Orbit ring rotation */
            orbitRing.rotation.z = t * 0.3;

            /* Orbiting point light */
            orbitLight.position.set(
                Math.cos(t * 0.7) * 2.5,
                1.5 + Math.sin(t * 0.5) * 0.5,
                Math.sin(t * 0.7) * 2.5
            );

            /* Wireframe shimmer */
            wireHead.rotation.y = t * 0.15;
            wireTorso.rotation.y = -t * 0.1;

            /* Slow bust rotation */
            bustGroup.rotation.y = Math.sin(t * 0.2) * 0.15;

            renderer.render(scene, camera);
        };
        animate();
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

/* Detail Panel global handlers (referenced from index.html onclick) */
window.openDetailPanel  = (figId) => echoApp.openDetailPanel(figId);
window.closeDetailPanel = ()      => echoApp.closeDetailPanel();

/* Escape key → close detail panel */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('detail-panel')?.classList.contains('open')) {
        echoApp.closeDetailPanel();
    }
});

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

