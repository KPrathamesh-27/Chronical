/**
 * @file app.js
 * @description ECHO — Cinematic AI Time-Travel Platform
 * Core application logic. Manages routing, character rendering,
 * AI narration, heatmap, forge, and voice synthesis.
 */

const API = '';

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
        this.figures = [
            {
                id: 'cleopatra', name: 'Cleopatra VII', era: 'Ancient Egypt', icon: '𓂀',
                img: 'assets/cleopatra.png',
                quote: '"She is more than a queen. She is Egypt itself."',
                moments: [
                    { year: '51 BCE', title: 'Ascension to the Throne', desc: 'At 18, Cleopatra becomes pharaoh. The priests bow. The Nile flows full.' },
                    { year: '48 BCE', title: 'The Meeting with Caesar', desc: 'Rolled inside a carpet, revealed to the most powerful man on Earth.' },
                    { year: '30 BCE', title: 'The Last Morning', desc: 'Alexandria has fallen. The asp waits, coiled among figs. Her final choice.' }
                ]
            },
            {
                id: 'achilles', name: 'Achilles', era: 'Ancient Greece', icon: '⚔',
                img: 'assets/achilles.png',
                quote: '"I carry two sorts of destiny toward the day of my death."',
                moments: [
                    { year: '~1194 BCE', title: 'Wrath Begins', desc: 'Agamemnon takes Briseis. Achilles withdraws from battle, and Troy breathes again.' },
                    { year: '~1194 BCE', title: 'Patroclus Falls', desc: 'Hector slays Patroclus wearing Achilles\'s armor. The sea echoes his grief.' },
                    { year: '~1194 BCE', title: 'The Arrow\'s Arc', desc: 'Paris, guided by Apollo, looses the arrow that finds Achilles\'s heel.' }
                ]
            },
            {
                id: 'marie', name: 'Marie Antoinette', era: '18th Century France', icon: '👑',
                img: 'assets/marie-antoinette.png',
                quote: '"Let them eat cake."',
                moments: [
                    { year: '1770', title: 'Arrival at Versailles', desc: 'A young archduchess enters the most magnificent court in Europe.' },
                    { year: '1789', title: 'The Women\'s March', desc: 'The crowd surrounds Versailles. The queen steps onto the balcony alone.' },
                    { year: '1793', title: 'The Conciergerie', desc: 'A cold cell. Her hair is cut. The tumbrel waits outside.' }
                ]
            },
            {
                id: 'caesar', name: 'Julius Caesar', era: 'Ancient Rome', icon: '🏛',
                img: 'assets/caesar.png',
                quote: '"Veni, vidi, vici — I came, I saw, I conquered."',
                moments: [
                    { year: '49 BCE', title: 'Crossing the Rubicon', desc: 'Caesar pauses at the river\'s edge, then steps forward. The die is cast.' },
                    { year: '44 BCE', title: 'The Ides of March', desc: 'Twenty-three senators surround him. Et tu, Brute?' }
                ]
            },
            {
                id: 'tesla', name: 'Nikola Tesla', era: '19th Century Science', icon: '⚡',
                img: 'assets/tesla.png',
                quote: '"The present is theirs; the future, for which I really worked, is mine."',
                moments: [
                    { year: '1893', title: 'Chicago World\'s Fair', desc: 'Tesla illuminates the White City with AC. A million bulbs glow. Edison watches.' },
                    { year: '1899', title: 'Colorado Springs', desc: 'In his laboratory, Tesla conjures artificial lightning 130 feet long.' }
                ]
            },
            {
                id: 'davinci', name: 'Leonardo da Vinci', era: 'Renaissance', icon: '🎨',
                img: 'assets/da-vinci.png',
                quote: '"Learning never exhausts the mind."',
                moments: [
                    { year: '1503', title: 'The Mona Lisa', desc: 'He mixes layers of glaze, blending light and shadow into an enigmatic smile.' },
                    { year: '1482', title: 'The Flying Machine', desc: 'Sketching wings modeled on bats in his Florentine workshop.' }
                ]
            },
            {
                id: 'joan', name: 'Joan of Arc', era: 'Medieval France', icon: '🛡',
                img: 'assets/joan-of-arc.png',
                quote: '"I am not afraid; I was born to do this."',
                moments: [
                    { year: '1429', title: 'Siege of Orléans', desc: 'Bearing her white standard, she leads the charge. The English army breaks.' },
                    { year: '1431', title: 'The Pyre at Rouen', desc: 'Bound to the stake in the old marketplace. She asks for a cross to hold.' }
                ]
            },
            {
                id: 'alexander', name: 'Alexander the Great', era: 'Ancient Greece', icon: '🦁',
                img: 'assets/alexander.png',
                quote: '"There is nothing impossible to him who will try."',
                moments: [
                    { year: '333 BCE', title: 'Battle of Issus', desc: 'Charging directly at Darius III, breaking the Persian line and changing the world.' },
                    { year: '323 BCE', title: 'The Final Fever', desc: 'In Babylon, his generals ask to whom he leaves his empire. "To the strongest," he whispers.' }
                ]
            }
        ];

        this.synth       = window.speechSynthesis;
        this.utterance   = null;
        this.el          = {};
    }

    /* ── Init ────────────────────────────────────────────────────── */
    init() {
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
            'narration-text', 'imagine-input', 'btn-imagine', 'forge-actions',
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

    /* ── Forge / Imagine Feature ────────────────────────────────── */
    async handleImagine() {
        const input  = this.el.imagineInput;
        const output = this.el.narrationText;
        if (!input || !output) return;

        const concept = input.value.trim();
        if (!concept) return;

        input.value = '';
        this.state.narration = '';

        output.innerHTML = '<span class="mono" style="color:var(--muted-dark)">// SYNTHESIZING REALITY...</span>';
        if (this.el.forgeActions) this.el.forgeActions.style.display = 'none';

        try {
            const r = await fetch(`${API}/api/imagine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ concept })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Forge error');

            this.state.narration = data.narration;

            /* Build cinematic image + typewriter */
            output.innerHTML = '';

            /* Simulated Video Container */
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

    /* ── Heatmap (Home) ─────────────────────────────────────────── */
    _renderHeatmapHome() {
        const canvas = this.el.heatmapCanvas;
        if (!canvas) return;
        canvas.width  = canvas.parentElement.offsetWidth;
        canvas.height = 200;
        this._drawHeatmapOnCanvas(canvas);
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

        const canvas = this.el.heatmapCanvasFull;
        if (!canvas) return;
        setTimeout(() => {
            canvas.width  = canvas.parentElement.offsetWidth;
            canvas.height = canvas.parentElement.offsetHeight;
            this._drawHeatmapOnCanvas(canvas);
        }, 60);
    }

    filterHeatmap(era) {
        this.state.hmActiveEra = era;
        document.querySelectorAll('.era-pill-dark').forEach(p => {
            p.classList.toggle('active', p.textContent === era);
        });
        const canvas = this.el.heatmapCanvasFull;
        if (canvas) this._drawHeatmapOnCanvas(canvas);
    }

    _drawHeatmapOnCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        /* World Map Background */
        if (!this._worldMapImg) {
            this._worldMapImg = new Image();
            this._worldMapImg.src = 'assets/world.svg';
            this._worldMapImg.onload = () => this._drawHeatmapOnCanvas(canvas);
        }
        if (this._worldMapImg.complete) {
            const mw = canvas.width * 0.85;
            const mh = (mw / 1008) * 650; // SVG aspect ratio is 1008x650
            const mx = (canvas.width - mw) / 2;
            const my = (canvas.height - mh) / 2;
            ctx.globalAlpha = 0.3; // faint elegant map
            ctx.drawImage(this._worldMapImg, mx, my, mw, mh);
            ctx.globalAlpha = 1.0;
        }

        /* Starfield background */
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        for (let i = 0; i < 120; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        const data     = this.state.heatmapData;
        let maxCount   = 1, total = 0;
        Object.values(data).forEach(v => { if (v > maxCount) maxCount = v; total += v; });

        /* Build nodes */
        const nodes = [];
        Object.keys(data).forEach(era => {
            if (this.state.hmActiveEra !== 'All Time' && era !== this.state.hmActiveEra) return;
            const count     = data[era];
            const intensity = count / maxCount;
            const hash      = era.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
            const x         = Math.abs(hash % (canvas.width  * 0.8)) + canvas.width  * 0.1;
            const y         = Math.abs((hash >> 4) % (canvas.height * 0.8)) + canvas.height * 0.1;
            nodes.push({ x, y, radius: 4 + intensity * 14, label: era, count });
        });

        /* Connection lines */
        if (nodes.length > 1) {
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    if (Math.random() > 0.4) {
                        ctx.moveTo(nodes[i].x, nodes[i].y);
                        ctx.lineTo(nodes[j].x, nodes[j].y);
                    }
                }
            }
            ctx.stroke();
        }

        /* Glow nodes */
        nodes.forEach(n => {
            const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * 3);
            g.addColorStop(0, 'rgba(255,255,255,0.35)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius * 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius * 0.4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle   = 'rgba(255,255,255,0.55)';
            ctx.font        = '9px Space Mono';
            ctx.textAlign   = 'center';
            ctx.fillText(n.label, n.x, n.y + n.radius + 14);
        });

        /* Update counter */
        const countEl = this.el.heatmapTotal;
        if (countEl) countEl.textContent = `TOTAL VIEWINGS: ${total}`;
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
