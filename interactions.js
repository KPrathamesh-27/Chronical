/**
 * @file interactions.js
 * @description ECHO — Complete Interaction & Animation Layer v2
 *
 * Systems:
 *  1.  Custom magnetic cursor
 *  2.  Chronosphere canvas — animated 3D temporal artifact (replaces rock image)
 *  3.  Scroll reveal (IntersectionObserver)
 *  4.  Parallax watermarks
 *  5.  Coverflow infinite carousel (3D rotateY, circular doubly-linked)
 *  6.  Chronicles temporal vortex canvas background
 *  7.  Chronicles HUD scanner animation
 *  8.  Stat counter animation
 *  9.  Chron-card hover tilt
 *  10. Temporal card entry animation observer
 *  11. Scroll progress bar + page transition overlay
 */

(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════════════
       1. CUSTOM MAGNETIC CURSOR
       ═══════════════════════════════════════════════════════════ */
    const cursorRing = document.getElementById('echo-cursor');
    const cursorDot  = document.getElementById('echo-cursor-dot');

    let mouseX = -100, mouseY = -100, ringX = -100, ringY = -100;

    document.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        if (cursorDot) { cursorDot.style.left = mouseX + 'px'; cursorDot.style.top = mouseY + 'px'; }
    });

    (function animateCursor() {
        ringX += (mouseX - ringX) * 0.12;
        ringY += (mouseY - ringY) * 0.12;
        if (cursorRing) { cursorRing.style.left = ringX + 'px'; cursorRing.style.top = ringY + 'px'; }
        requestAnimationFrame(animateCursor);
    })();

    document.addEventListener('mousedown', () => cursorRing?.classList.add('cursor-click'));
    document.addEventListener('mouseup',   () => cursorRing?.classList.remove('cursor-click'));

    /* ═══════════════════════════════════════════════════════════
       2. CHRONOSPHERE CANVAS — 3D TEMPORAL ARTIFACT
       ═══════════════════════════════════════════════════════════ */
    function initChronosphere() {
        const canvas = document.getElementById('chronosphere-canvas');
        if (!canvas) return;

        // High-DPI canvas setup
        const dpr  = window.devicePixelRatio || 1;
        const W    = 480;
        const H    = 560;
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width  = W + 'px';
        canvas.style.height = H + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const CX = W / 2;
        const CY = H / 2 + 20; // slightly below center for visual weight

        /* -- Mouse tilt state -- */
        let tiltX = 0, tiltY = 0, targetTiltX = 0, targetTiltY = 0;

        const wrap = document.getElementById('crystal-wrap');
        wrap?.addEventListener('mousemove', e => {
            const rect = wrap.getBoundingClientRect();
            targetTiltX = ((e.clientY - rect.top)  / rect.height - 0.5) * 0.3; // pitch
            targetTiltY = ((e.clientX - rect.left) / rect.width  - 0.5) * 0.5; // yaw
        });
        wrap?.addEventListener('mouseleave', () => { targetTiltX = 0; targetTiltY = 0; });

        /* -- 3D ring definitions (normal vectors define tilt plane) --
           Each ring: a & b are the semi-axis lengths, nx/ny tilt the ellipse, speed = orbital speed */
        const rings = [
            { a: 166, b: 58,  tilt: 0.35,  rotOff: 0,      speed:  0.0012, color: [210, 185, 130], sphereR: 5, phase: 0    },
            { a: 138, b: 48,  tilt: 1.05,  rotOff: 1.2,    speed: -0.0018, color: [180, 155, 100], sphereR: 4, phase: 2.1  },
            { a: 108, b: 36,  tilt: -0.7,  rotOff: 2.4,    speed:  0.0025, color: [150, 120,  80], sphereR: 3, phase: 4.4  },
        ];

        /* -- Particle field drifting around the artifact -- */
        const particles = Array.from({ length: 150 }, () => ({
            angle:   Math.random() * Math.PI * 2,
            dist:    Math.random() * 210 + 20,
            flattenY: Math.random() * 0.4 + 0.15,  // how flat the orbit is
            speed:   (Math.random() - 0.5) * 0.004,
            size:    Math.random() * 1.4 + 0.3,
            opacity: Math.random() * 0.35 + 0.04,
        }));

        /* -- Ancient symbol positions on outer ring -- */
        const SYMBOLS = ['𓂀', '𓆣', '⊕', '∞', '☽', '✦', 'Ω', 'Δ'];

        let time = 0;

        /* Draws one orbital ring with its sphere */
        function drawRing(ring, t) {
            ctx.save();
            ctx.translate(CX, CY);

            // Apply tilt perspective: rotate, squash y for 3D look
            const rotationAngle = ring.rotOff + tiltY * 0.4 + t * 0.0003;
            ctx.rotate(rotationAngle);
            ctx.scale(1, ring.b / ring.a + tiltX * 0.15); // squash = depth illusion

            const [r, g, b] = ring.color;

            // Ring stroke
            ctx.beginPath();
            ctx.ellipse(0, 0, ring.a, ring.a, 0, 0, Math.PI * 2);
            ctx.setLineDash([4, 10]);
            ctx.strokeStyle = `rgba(${r},${g},${b},0.4)`;
            ctx.lineWidth   = 0.9;
            ctx.stroke();
            ctx.setLineDash([]);

            // Orbiting sphere — moves along the ring
            const sphereAngle = ring.phase + t * ring.speed;
            const sx = Math.cos(sphereAngle) * ring.a;
            const sy = Math.sin(sphereAngle) * ring.a;

            // Sphere glow
            const sg = ctx.createRadialGradient(sx - 1.5, sy - 1.5, 0, sx, sy, ring.sphereR * 2.5);
            sg.addColorStop(0,   `rgba(255,248,230,0.95)`);
            sg.addColorStop(0.3, `rgba(${r},${g},${b},0.7)`);
            sg.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = sg;
            ctx.beginPath();
            ctx.arc(sx, sy, ring.sphereR * 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Core sphere dot
            ctx.beginPath();
            ctx.arc(sx, sy, ring.sphereR, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,250,240,0.95)`;
            ctx.fill();

            ctx.restore();
        }

        function draw() {
            ctx.clearRect(0, 0, W, H);
            time++;

            // Lerp tilt for smooth mouse response
            tiltX += (targetTiltX - tiltX) * 0.06;
            tiltY += (targetTiltY - tiltY) * 0.06;

            /* ── Background ambient haze ── */
            const bgG = ctx.createRadialGradient(CX, CY, 0, CX, CY, 220);
            bgG.addColorStop(0, 'rgba(30, 22, 10, 0.5)');
            bgG.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = bgG;
            ctx.fillRect(0, 0, W, H);

            /* ── Outer slow-rotating tick ring ── */
            ctx.save();
            ctx.translate(CX, CY);
            ctx.rotate(time * 0.0002);
            for (let i = 0; i < 48; i++) {
                const a   = (i / 48) * Math.PI * 2;
                const R1  = 195;
                const R2  = i % 6 === 0 ? 180 : i % 3 === 0 ? 186 : 191;
                const wt  = i % 6 === 0 ? 1.5 : i % 3 === 0 ? 1.0 : 0.6;
                const op  = i % 6 === 0 ? 0.45 : i % 3 === 0 ? 0.25 : 0.12;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * R1, Math.sin(a) * R1);
                ctx.lineTo(Math.cos(a) * R2, Math.sin(a) * R2);
                ctx.strokeStyle = `rgba(210,185,130,${op})`;
                ctx.lineWidth   = wt;
                ctx.stroke();
            }
            // Outer circle
            ctx.beginPath();
            ctx.arc(0, 0, 197, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(210,185,130,0.09)';
            ctx.lineWidth   = 0.5;
            ctx.stroke();
            ctx.restore();

            /* ── Ancient symbols on outer ring ── */
            ctx.save();
            ctx.translate(CX, CY);
            ctx.rotate(time * -0.0003);
            SYMBOLS.forEach((sym, i) => {
                const a  = (i / SYMBOLS.length) * Math.PI * 2;
                const sx = Math.cos(a) * 205;
                const sy = Math.sin(a) * 205;
                ctx.fillStyle   = `rgba(200,175,120,0.25)`;
                ctx.font        = '11px serif';
                ctx.textAlign   = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(sym, sx, sy);
            });
            ctx.restore();

            /* ── Radial energy pulses from center ── */
            for (let i = 0; i < 10; i++) {
                const a   = (i / 10) * Math.PI * 2 + time * 0.0008;
                const len = 95 + 18 * Math.sin(time * 0.03 + i * 0.8);
                const op  = 0.04 + 0.025 * Math.sin(time * 0.06 + i * 1.2);
                ctx.beginPath();
                ctx.moveTo(CX, CY);
                ctx.lineTo(CX + Math.cos(a) * len, CY + Math.sin(a) * len);
                ctx.strokeStyle = `rgba(255,255,240,${op})`;
                ctx.lineWidth   = 0.8;
                ctx.stroke();
            }

            /* ── Orbital rings (drawn back-to-front for depth) ── */
            rings.forEach(ring => drawRing(ring, time));

            /* ── Particle field ── */
            particles.forEach(p => {
                p.angle += p.speed;
                const px = CX + Math.cos(p.angle) * p.dist;
                const py = CY + Math.sin(p.angle) * p.dist * p.flattenY + tiltX * 50;
                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(215,195,155,${p.opacity})`;
                ctx.fill();
            });

            /* ── Core glow ── */
            const pulse = 1 + 0.12 * Math.sin(time * 0.04);
            const coreG = ctx.createRadialGradient(CX, CY, 0, CX, CY, 75 * pulse);
            coreG.addColorStop(0,    'rgba(255,252,235,1)');
            coreG.addColorStop(0.12, 'rgba(225,195,130,0.9)');
            coreG.addColorStop(0.4,  'rgba(180,140,70,0.4)');
            coreG.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.fillStyle = coreG;
            ctx.beginPath();
            ctx.arc(CX, CY, 75 * pulse, 0, Math.PI * 2);
            ctx.fill();

            // Inner bright point
            const innerR = 11 + 3 * Math.sin(time * 0.05);
            const innerG = ctx.createRadialGradient(CX - 2, CY - 2, 0, CX, CY, innerR);
            innerG.addColorStop(0, 'rgba(255,255,255,1)');
            innerG.addColorStop(1, 'rgba(255,240,200,0)');
            ctx.fillStyle = innerG;
            ctx.beginPath();
            ctx.arc(CX, CY, innerR, 0, Math.PI * 2);
            ctx.fill();

            requestAnimationFrame(draw);
        }
        draw();
    }

    /* ═══════════════════════════════════════════════════════════
       3. SCROLL REVEAL — INTERSECTION OBSERVER
       ═══════════════════════════════════════════════════════════ */
    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('revealed');
            revealObserver.unobserve(entry.target);
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

    document.querySelectorAll('.reveal, .data-section, [data-reveal]')
        .forEach(el => revealObserver.observe(el));

    /* ═══════════════════════════════════════════════════════════
       4. PARALLAX WATERMARKS & SCROLL PROGRESS BAR
       ═══════════════════════════════════════════════════════════ */
    const scrollProgress = document.getElementById('scroll-progress');

    window.addEventListener('scroll', () => {
        const st  = window.scrollY;
        const max = document.body.scrollHeight - window.innerHeight;
        if (scrollProgress) scrollProgress.style.transform = `scaleX(${max > 0 ? st / max : 0})`;

        document.querySelectorAll('.hero-watermark')
            .forEach(el => el.style.setProperty('--parallax-offset', `${st * 0.35}px`));

        document.querySelectorAll('.archive-watermark').forEach(el => {
            const rect = el.parentElement?.getBoundingClientRect();
            if (rect) el.style.setProperty('--parallax-offset', `${-(window.innerHeight - rect.top) * 0.2}px`);
        });
    }, { passive: true });

    /* ═══════════════════════════════════════════════════════════
       5. COVERFLOW INFINITE CAROUSEL
          — Circular doubly-linked list semantics via modulo math
       ═══════════════════════════════════════════════════════════ */

    /* Slot widths used only for centering logic */
    const SLOT_W = 280; // px between card centers

    let carouselFigures = null;
    let carouselTotal   = 0;
    let carouselIndex   = 0;
    let carouselBusy    = false;
    const carouselTrack = document.getElementById('carousel-track');
    const carouselDots  = document.getElementById('carousel-dots');

    /**
     * Called by app.js once figures are ready.
     * Builds card DOM and initialises the coverflow.
     */
    window.initCarousel = function (figures) {
        carouselFigures = figures;
        carouselTotal   = figures.length;
        carouselIndex   = 0;

        if (!carouselTrack || !carouselDots) return;

        // Cards are absolutely positioned inside the stage — track is just a container
        carouselTrack.innerHTML = figures.map((f, i) => `
            <div class="carousel-card" data-index="${i}">
                <img src="${f.img}" alt="${f.name}" class="carousel-card-img" loading="lazy">
                <div class="carousel-card-overlay">
                    <div class="carousel-card-era mono">${f.era}</div>
                    <div class="carousel-card-name">${f.name}</div>
                    <div class="carousel-card-quote">"${f.quote?.replace(/"/g,'').slice(0,60)}..."</div>
                </div>
                <div class="carousel-card-bar"></div>
                <div class="carousel-card-witness mono">WITNESS →</div>
            </div>
        `).join('');

        // Dots
        carouselDots.innerHTML = figures.map((_, i) =>
            `<div class="carousel-dot ${i === 0 ? 'active' : ''}" onclick="window.carouselSelect(${i})"></div>`
        ).join('');

        // Wire card clicks — on active card → go to witness; on others → focus
        carouselTrack.addEventListener('click', e => {
            const card = e.target.closest('.carousel-card');
            if (!card) return;
            const idx = parseInt(card.dataset.index);
            if (idx === carouselIndex) {
                if (window.echoApp) echoApp.goWitness(carouselFigures[idx].id);
            } else {
                window.carouselSelect(idx);
            }
        });

        // Wire arrows
        document.getElementById('arrow-prev')?.addEventListener('click', () => carouselStep(-1));
        document.getElementById('arrow-next')?.addEventListener('click', () => carouselStep(1));

        // Keyboard
        document.addEventListener('keydown', e => {
            const activePage = document.querySelector('#page-home.active, #page-dashboard.active');
            if (!activePage) return;
            if (e.key === 'ArrowLeft')  carouselStep(-1);
            if (e.key === 'ArrowRight') carouselStep(1);
        });

        // Touch swipe
        let tsx = 0;
        const stage = document.getElementById('carousel-stage');
        stage?.addEventListener('touchstart', e => { tsx = e.touches[0].clientX; }, { passive: true });
        stage?.addEventListener('touchend',   e => {
            const dx = e.changedTouches[0].clientX - tsx;
            if (Math.abs(dx) > 48) carouselStep(dx > 0 ? -1 : 1);
        });

        _updateCoverflow(false);
    };

    window.carouselStep = function (dir) {
        if (carouselBusy || !carouselFigures) return;
        carouselIndex = (carouselIndex + dir + carouselTotal) % carouselTotal;
        _updateCoverflow(true);
    };

    window.carouselSelect = function (idx) {
        if (carouselBusy || !carouselFigures) return;
        carouselIndex = idx;
        _updateCoverflow(true);
    };

    /**
     * Applies coverflow 3D transforms to each card based on its distance from active index.
     * Uses circular modulo wrapping for infinite feel.
     *
     *  dist = 0  → active: front, full size, no blur
     *  dist = ±1 → adjacent: behind, rotated 38°, dimmed
     *  dist = ±2 → further: rotated 56°, heavy blur
     *  dist ≥ ±3 → hidden
     */
    function _updateCoverflow(animate) {
        if (!carouselTrack) return;
        const cards = [...carouselTrack.querySelectorAll('.carousel-card')];
        const n     = cards.length;

        /* Disable transitions briefly when jumping without animation */
        if (!animate) {
            cards.forEach(c => { c.style.transition = 'none'; });
        }

        cards.forEach((card, i) => {
            // Circular distance
            const raw = i - carouselIndex;
            const mod = ((raw % n) + n) % n;
            let dist = mod;
            if (dist > Math.floor(n / 2)) {
                dist -= n; // wrap distances over half length to negative adjacent
            }

            const abs  = Math.abs(dist);
            const sign = Math.sign(dist) || 1;

            card.classList.remove('is-active', 'is-adjacent');

            let tx, ry, scale, filterVal, opacityVal, zIdx;

            if (abs === 0) {
                // CENTER — hero focus
                card.classList.add('is-active');
                tx = 0; ry = 0; scale = 1;
                filterVal = 'none'; opacityVal = 1; zIdx = 10;
            } else if (abs === 1) {
                // ADJACENT — visible, angled back
                card.classList.add('is-adjacent');
                tx = sign * 260; ry = -sign * 40; scale = 0.8;
                filterVal = 'blur(2.5px) brightness(0.55)'; opacityVal = 0.7; zIdx = 6;
            } else if (abs === 2) {
                // FAR — barely visible
                tx = sign * 480; ry = -sign * 60; scale = 0.65;
                filterVal = 'blur(6px) brightness(0.35)'; opacityVal = 0.4; zIdx = 3;
            } else {
                // HIDDEN — off stage
                tx = sign * 680; ry = -sign * 75; scale = 0.5;
                filterVal = 'blur(12px) brightness(0.2)'; opacityVal = 0; zIdx = 1;
            }

            // Apply — using exact sequential absolute translations to guarantee centering
            card.style.transform = `translateX(-50%) translateY(-50%) translateX(${tx}px) rotateY(${ry}deg) scale(${scale})`;
            card.style.filter    = filterVal;
            card.style.opacity   = opacityVal;
            card.style.zIndex    = zIdx;
        });

        // Re-enable transitions next frame
        if (!animate) {
            requestAnimationFrame(() => {
                cards.forEach(c => { c.style.transition = ''; });
            });
        }

        // Sync dots
        document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === carouselIndex);
        });

        carouselBusy = true;
        setTimeout(() => { carouselBusy = false; }, 700);
    }

    /* ═══════════════════════════════════════════════════════════
       6. CHRONICLES TEMPORAL VORTEX CANVAS
       ═══════════════════════════════════════════════════════════ */
    function initChroniclesVortex() {
        const canvas = document.getElementById('chronicles-vortex');
        const page   = document.getElementById('page-chronicles');
        if (!canvas || !page) return;

        // Prevent re-init
        if (canvas.dataset.init) return;
        canvas.dataset.init = '1';

        function resize() {
            canvas.width  = page.offsetWidth  || window.innerWidth;
            canvas.height = page.offsetHeight || window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        const ctx = canvas.getContext('2d');

        /* Time warp tunnel rings — concentric rings that shrink inward */
        const RING_COUNT = 28;

        /* Floating historical data — years + coordinates */
        const datums = [
            '48 BCE',  '333 BCE',  '1429 CE',  '1793 CE',  '1503 CE',
            '1893 CE', '44 BCE',   '51 BCE',   '1194 BCE', '1770 CE',
            '1899 CE', '29°N 31°E','41°N 29°E','32°E 36°N','2°E 48°N',
        ];

        const floaters = datums.map(label => ({
            label,
            x: Math.random() * 1600,
            y: Math.random() * 900,
            vx: (Math.random() - 0.5) * 0.25,
            vy: -Math.random() * 0.4 - 0.08,
            opacity: Math.random() * 0.18 + 0.03,
            size:    Math.random() * 5 + 8,
        }));

        /* Vortex orbital particles */
        const vortexParticles = Array.from({ length: 100 }, () => ({
            angle:   Math.random() * Math.PI * 2,
            radius:  Math.random() * 400 + 50,
            speed:   (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 0.003 + 0.001),
            size:    Math.random() * 1.8 + 0.3,
            opacity: Math.random() * 0.25 + 0.05,
            flatY:   Math.random() * 0.25 + 0.08, // how flat (3D depth illusion)
        }));

        let time = 0;

        function draw() {
            const W  = canvas.width;
            const H  = canvas.height;
            const CX = W * 0.5;
            const CY = H * 0.38; // Vortex eye sits above mid-page

            ctx.clearRect(0, 0, W, H);
            time += 0.003;

            /* ── Vortex tunnel rings ── */
            for (let r = 0; r < RING_COUNT; r++) {
                const t         = r / RING_COUNT;              // 0 = innermost, 1 = outermost
                const maxR      = Math.max(W, H) * 0.72;
                const radius    = maxR * (1 - t) * 0.5;
                const opacity   = t * t * 0.2;
                const rotation  = time * (r % 2 === 0 ? 1 : -0.7) + r * 0.15;
                const wobble    = 1 + 0.04 * Math.sin(time * 2 + r * 0.5);

                ctx.save();
                ctx.translate(CX, CY);
                ctx.rotate(rotation);

                // Elliptical ring for 3D depth illusion (flatten Y axis)
                ctx.beginPath();
                ctx.ellipse(0, 0, radius * wobble, radius * 0.32 * wobble, 0, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(190, 165, 115, ${opacity})`;
                ctx.lineWidth   = 0.6;
                ctx.stroke();
                ctx.restore();
            }

            /* ── Radial light spokes ── */
            for (let i = 0; i < 16; i++) {
                const a  = (i / 16) * Math.PI * 2 + time * 0.05;
                const l  = 220 + 40 * Math.sin(time + i * 0.6);
                const op = 0.025 + 0.02 * Math.sin(time * 1.5 + i);
                ctx.beginPath();
                ctx.moveTo(CX, CY);
                ctx.lineTo(CX + Math.cos(a) * l, CY + Math.sin(a) * l * 0.35);
                ctx.strokeStyle = `rgba(255,250,230,${op})`;
                ctx.lineWidth   = 0.8;
                ctx.stroke();
            }

            /* ── Orbital vortex particles ── */
            vortexParticles.forEach(p => {
                p.angle += p.speed;
                const px = CX + Math.cos(p.angle) * p.radius;
                const py = CY + Math.sin(p.angle) * p.radius * p.flatY;
                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(210,190,140,${p.opacity})`;
                ctx.fill();
            });

            /* ── Central vortex eye glow ── */
            const eyeG = ctx.createRadialGradient(CX, CY, 0, CX, CY, 80);
            eyeG.addColorStop(0, 'rgba(50, 38, 18, 0.7)');
            eyeG.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = eyeG;
            ctx.fillRect(0, 0, W, H);

            /* ── Drifting temporal data labels ── */
            ctx.font = `10px 'Space Mono', monospace`;
            floaters.forEach(f => {
                f.x += f.vx;
                f.y += f.vy;
                if (f.y < -30) { f.y = (H + 20); f.x = Math.random() * W; }
                if (f.x < -120) f.x = W + 60;
                if (f.x > W + 120) f.x = -60;
                ctx.fillStyle = `rgba(200,180,130,${f.opacity})`;
                ctx.textAlign = 'left';
                ctx.fillText(f.label, f.x, f.y);
            });

            requestAnimationFrame(draw);
        }
        draw();
    }

    /* Public hook so app.js can call this when navigating to chronicles */
    window.initChroniclesVortex = initChroniclesVortex;

    /* ═══════════════════════════════════════════════════════════
       7. CHRONICLES HUD SCANNER ANIMATION
       ═══════════════════════════════════════════════════════════ */
    const ERA_LABELS = [
        'Ancient Egypt', 'Ancient Greece', 'Ancient Rome',
        '18th Century France', 'Medieval France', 'Renaissance',
        '19th Century Science', 'Mythological India'
    ];
    const COORDS = [
        '29.9°N 31.1°E',  '37.9°N 23.7°E', '41.9°N 12.5°E',
        '48.8°N 2.3°E',   '47.9°N 2.1°E',  '43.7°N 11.2°E',
        '40.7°N 74.0°W',  '28.6°N 77.2°E',
    ];
    let hudIdx = 0;

    function tickHUD() {
        const eraEl   = document.getElementById('hud-era');
        const coordEl = document.getElementById('hud-coord');
        if (eraEl && coordEl) {
            eraEl.style.opacity   = '0';
            coordEl.style.opacity = '0';
            setTimeout(() => {
                hudIdx = (hudIdx + 1) % ERA_LABELS.length;
                if (eraEl)   { eraEl.textContent   = `ERA: ${ERA_LABELS[hudIdx]}`;  eraEl.style.opacity = '1'; }
                if (coordEl) { coordEl.textContent = `LOC: ${COORDS[hudIdx]}`;      coordEl.style.opacity = '1'; }
            }, 400);
        }
    }
    setInterval(tickHUD, 2800);

    /* ═══════════════════════════════════════════════════════════
       8. STAT COUNTER ANIMATION
       ═══════════════════════════════════════════════════════════ */
    function animateCounter(el, target, suffix, decimals, duration) {
        const start = performance.now();
        (function update(ts) {
            const progress = Math.min((ts - start) / duration, 1);
            const eased    = 1 - Math.pow(1 - progress, 4);
            el.textContent = (target * eased).toFixed(decimals) + suffix;
            if (progress < 1) requestAnimationFrame(update);
        })(performance.now());
    }

    const statObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el  = entry.target;
            const raw = el.dataset.target || '';
            const m   = raw.match(/^([\d.]+)([^\d]*)$/);
            if (m) animateCounter(el, parseFloat(m[1]), m[2], m[1].includes('.') ? 1 : 0, 2000);
            statObserver.unobserve(el);
        });
    }, { threshold: 0.5 });

    /* ═══════════════════════════════════════════════════════════
       9. CHRON-CARD HOVER TILT (Chronicles full page)
       ═══════════════════════════════════════════════════════════ */
    function enableCardTilt(card) {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const dx   = (e.clientX - rect.left) / rect.width  - 0.5;
            const dy   = (e.clientY - rect.top)  / rect.height - 0.5;
            card.style.transform = `perspective(700px) rotateX(${-dy * 7}deg) rotateY(${dx * 10}deg) scale(1.025)`;
        });
        card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    }

    new MutationObserver(muts => {
        muts.forEach(m => m.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            if (node.classList?.contains('chron-card')) enableCardTilt(node);
            node.querySelectorAll?.('.chron-card').forEach(enableCardTilt);
            // Also wire cursor expand
            node.querySelectorAll?.('.chron-card, .carousel-card').forEach(el => {
                el.addEventListener('mouseenter', () => cursorRing?.classList.add('cursor-hover'));
                el.addEventListener('mouseleave', () => cursorRing?.classList.remove('cursor-hover'));
            });
        }));
    }).observe(document.body, { childList: true, subtree: true });

    /* ═══════════════════════════════════════════════════════════
       10. TEMPORAL CARD ENTRY STAGGER (Chronicles full page)
       ═══════════════════════════════════════════════════════════ */
    const cardStaggerObs = new IntersectionObserver(entries => {
        entries.forEach((entry, i) => {
            if (!entry.isIntersecting) return;
            setTimeout(() => entry.target.classList.add('card-visible'), i * 70);
            cardStaggerObs.unobserve(entry.target);
        });
    }, { threshold: 0.04, rootMargin: '0px 0px -20px 0px' });

    new MutationObserver(() => {
        document.querySelectorAll('.chronicles-full-grid .chron-card:not(.card-visible)')
            .forEach(c => cardStaggerObs.observe(c));
    }).observe(document.body, { childList: true, subtree: true });

    /* ═══════════════════════════════════════════════════════════
       11. PAGE TRANSITION OVERLAY + SCROLL PROGRESS
       ═══════════════════════════════════════════════════════════ */
    window.pageTransition = function (callback) {
        const ov = document.getElementById('page-transition');
        if (!ov) { callback?.(); return; }
        ov.classList.add('fade-in');
        setTimeout(() => { callback?.(); ov.classList.remove('fade-in'); }, 280);
    };

    /* ═══════════════════════════════════════════════════════════
       BOOTSTRAP — called after DOM is ready
       ═══════════════════════════════════════════════════════════ */
    window.addEventListener('DOMContentLoaded', () => {

        // Scroll progress bar
        const bar = document.createElement('div');
        bar.id = 'scroll-progress';
        document.body.appendChild(bar);

        // Page transition overlay
        const ov = document.createElement('div');
        ov.id = 'page-transition';
        document.body.appendChild(ov);

        // Wire stat counters
        document.querySelectorAll('.stat-value, .stat-value-sm').forEach(el => {
            el.dataset.target = el.textContent;
            el.textContent    = '0';
            statObserver.observe(el);
        });

        // Start chronosphere
        initChronosphere();

        // Kick off vortex if chronicles is the initial page
        if (document.getElementById('page-chronicles')?.classList.contains('active')) {
            initChroniclesVortex();
        }
    });

    /* Expose vortex init so app.js routing can trigger it */
    const _origInitChroniclesVortex = window.initChroniclesVortex;
    window.initChroniclesVortex = function () { _origInitChroniclesVortex(); tickHUD(); };

})();
