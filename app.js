// Flappy Rocket — Nebula Edition
// Production-ready PWA game implementation

class FlappyRocket {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.devicePixelRatio = window.devicePixelRatio || 1;
        
        // Game state
        this.gameState = 'splash'; // splash, menu, tutorial, playing, gameOver
        this.score = 0;
        this.bestScore = parseInt(localStorage.getItem('flappyRocketBest') || '0');
        this.selectedSkin = localStorage.getItem('flappyRocketSkin') || 'red';
        this.isMuted = localStorage.getItem('flappyRocketMuted') === 'true';
        
        // Game config from provided data
        this.config = {
            baseSpeed: 2.0,
            baseGap: 0.22,
            difficultyIncrease: 0.08,
            easyDuration: 30000,
            difficultyInterval: 10000,
            bannerFrequency: 0.1,
            maxParticles: 200,
            tutorialDuration: 5000
        };
        
        // Game objects
        this.spaceship = {
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            rotation: 0,
            targetRotation: 0,
            thrusting: false,
            thrustTime: 0
        };
        
        this.obstacles = [];
        this.banners = [];
        this.particles = [];
        this.stars = [];
        
        // Game timing
        this.startTime = 0;
        this.lastTime = 0;
        this.gameRunning = false;
        this.tutorialCountdown = 5;
        this.tutorialStartTime = 0;
        this.animationFrameId = null;
        
        // Current difficulty
        this.currentSpeed = this.config.baseSpeed;
        this.currentGap = this.config.baseGap;
        
        // Input handling
        this.inputEnabled = false;
        this.userGestureReceived = false;
        
        // Colors from provided data
        this.colors = {
            nebulaPrimary: '#9d7bd8',
            nebulaSecondary: '#b794f6',
            starfield: '#ffffff',
            asteroid: '#4a4a4a',
            asteroidGlow: '#ffffff',
            sliceBanner: '#b794f6',
            spaceship: '#e2e8f0'
        };
        
        // Initialize
        this.setupCanvas();
        this.setupAudio();
        this.setupEventListeners();
        this.registerServiceWorker();
        this.generateStarfield();
        this.showSplash();
        
        // Start background animation loop
        this.backgroundLoop();
    }

    setupCanvas() {
        const resizeCanvas = () => {
            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width * this.devicePixelRatio;
            this.canvas.height = rect.height * this.devicePixelRatio;
            this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);
            this.canvas.style.width = rect.width + 'px';
            this.canvas.style.height = rect.height + 'px';
            
            // Update game dimensions
            this.width = rect.width;
            this.height = rect.height;
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    setupAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.audioContext = null;
        }
    }

    playSound(type) {
        if (!this.audioContext || this.isMuted || !this.userGestureReceived) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            switch (type) {
                case 'thrust':
                    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
                    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
                    oscillator.start();
                    oscillator.stop(this.audioContext.currentTime + 0.1);
                    break;
                case 'score':
                    oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);
                    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
                    oscillator.start();
                    oscillator.stop(this.audioContext.currentTime + 0.2);
                    break;
                case 'crash':
                    oscillator.type = 'sawtooth';
                    oscillator.frequency.setValueAtTime(220, this.audioContext.currentTime);
                    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                    oscillator.start();
                    oscillator.stop(this.audioContext.currentTime + 0.3);
                    
                    // Vibration on supported devices
                    if (navigator.vibrate) {
                        navigator.vibrate([100, 50, 100]);
                    }
                    break;
            }
        } catch (e) {
            console.warn('Audio error:', e);
        }
    }

    setupEventListeners() {
        // Skin selection
        document.querySelectorAll('.skin-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.skin-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedSkin = btn.dataset.skin;
                localStorage.setItem('flappyRocketSkin', this.selectedSkin);
            });
        });
        
        // Menu buttons
        document.getElementById('playBtn').addEventListener('click', () => {
            this.startTutorial();
        });
        
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.resetGame();
        });
        
        document.getElementById('menuBtn').addEventListener('click', () => {
            this.showMenu();
        });
        
        // Mute button
        document.getElementById('muteBtn').addEventListener('click', () => {
            this.toggleMute();
        });
        
        // Input handling
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleInput();
        }, { passive: false });
        
        this.canvas.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleInput();
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.handleInput();
            }
        });
        
        // Tutorial overlay click
        document.getElementById('tutorial').addEventListener('click', () => {
            if (this.gameState === 'tutorial') {
                this.startGame();
            }
        });
        
        // Prevent context menu on touch devices
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // Handle visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.gameState === 'playing') {
                this.gameRunning = false;
            }
        });
    }

    handleInput() {
        if (!this.userGestureReceived) {
            this.userGestureReceived = true;
            // Resume audio context on first user gesture (iOS requirement)
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        }
        
        if (this.gameState === 'tutorial') {
            this.startGame();
        } else if (this.gameState === 'playing' && this.inputEnabled) {
            this.thrust();
        }
    }

    thrust() {
        this.spaceship.vy = -8;
        this.spaceship.thrusting = true;
        this.spaceship.thrustTime = Date.now();
        this.playSound('thrust');
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem('flappyRocketMuted', this.isMuted.toString());
        document.getElementById('muteBtn').textContent = this.isMuted ? '🔇' : '🔊';
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            // Inline service worker for self-contained deployment
            const swCode = `
                const CACHE_NAME = 'flappy-rocket-v1';
                const urlsToCache = [
                    './',
                    './index.html',
                    './style.css', 
                    './app.js'
                ];
                
                self.addEventListener('install', event => {
                    event.waitUntil(
                        caches.open(CACHE_NAME)
                            .then(cache => cache.addAll(urlsToCache))
                    );
                });
                
                self.addEventListener('fetch', event => {
                    event.respondWith(
                        caches.match(event.request)
                            .then(response => response || fetch(event.request))
                    );
                });
            `;
            
            const blob = new Blob([swCode], { type: 'application/javascript' });
            const swUrl = URL.createObjectURL(blob);
            
            navigator.serviceWorker.register(swUrl)
                .then(reg => console.log('SW registered', reg))
                .catch(err => console.log('SW registration failed', err));
        }
    }

    generateStarfield() {
        this.stars = [];
        const starCount = Math.min(100, Math.floor((this.width * this.height) / 5000));
        
        for (let i = 0; i < starCount; i++) {
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: Math.random() * 2 + 0.5,
                speed: Math.random() * 0.5 + 0.1,
                opacity: Math.random() * 0.8 + 0.2
            });
        }
    }

    showSplash() {
        this.gameState = 'splash';
        document.getElementById('splash').classList.remove('hidden');
        
        setTimeout(() => {
            this.showMenu();
        }, 1000);
    }

    showMenu() {
        this.gameState = 'menu';
        this.gameRunning = false;
        this.inputEnabled = false;
        
        // Cancel any running animation frame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        this.hideAllOverlays();
        document.getElementById('menu').classList.remove('hidden');
        
        // Update best score display
        document.getElementById('best').textContent = this.bestScore;
        
        // Set active skin
        document.querySelectorAll('.skin-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.skin === this.selectedSkin);
        });
        
        // Update mute button
        document.getElementById('muteBtn').textContent = this.isMuted ? '🔇' : '🔊';
    }

    startTutorial() {
        this.gameState = 'tutorial';
        this.hideAllOverlays();
        document.getElementById('tutorial').classList.remove('hidden');
        
        this.tutorialCountdown = 5;
        this.tutorialStartTime = Date.now();
        this.updateTutorialDisplay();
        
        this.runTutorialCountdown();
    }

    updateTutorialDisplay() {
        document.getElementById('countdown').textContent = this.tutorialCountdown;
    }

    runTutorialCountdown() {
        if (this.gameState !== 'tutorial') return;
        
        const elapsed = Date.now() - this.tutorialStartTime;
        const remaining = Math.ceil((this.config.tutorialDuration - elapsed) / 1000);
        
        if (remaining > 0 && remaining !== this.tutorialCountdown) {
            this.tutorialCountdown = remaining;
            this.updateTutorialDisplay();
        }
        
        if (elapsed >= this.config.tutorialDuration) {
            this.startGame();
        } else {
            setTimeout(() => this.runTutorialCountdown(), 100);
        }
    }

    startGame() {
        this.gameState = 'playing';
        this.hideAllOverlays();
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('controls').classList.remove('hidden');
        
        // Initialize game state
        this.score = 0;
        this.obstacles = [];
        this.banners = [];
        this.particles = [];
        this.startTime = Date.now();
        this.lastTime = Date.now();
        this.gameRunning = true;
        this.inputEnabled = true;
        
        // Reset difficulty
        this.currentSpeed = this.config.baseSpeed;
        this.currentGap = this.config.baseGap;
        
        // Initialize spaceship at proper position
        this.spaceship = {
            x: this.width * 0.2,
            y: this.height * 0.5,
            vx: 0,
            vy: 0,
            rotation: 0,
            targetRotation: 0,
            thrusting: false,
            thrustTime: 0
        };
        
        console.log('Game started - Spaceship position:', this.spaceship.x, this.spaceship.y);
        
        this.updateScore();
        this.gameLoop();
        
        // Hide controls after a delay
        setTimeout(() => {
            if (this.gameState === 'playing') {
                document.getElementById('controls').classList.add('hidden');
            }
        }, 3000);
    }

    resetGame() {
        console.log('Resetting game...');
        
        // Cancel any running animation frame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // Reset game state
        this.gameRunning = false;
        this.inputEnabled = false;
        
        // Clear all arrays
        this.obstacles.length = 0;
        this.banners.length = 0;
        this.particles.length = 0;
        
        // Reset spaceship
        this.spaceship = {
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            rotation: 0,
            targetRotation: 0,
            thrusting: false,
            thrustTime: 0
        };
        
        // Hide HUD and controls
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('controls').classList.add('hidden');
        
        // Start tutorial again
        this.startTutorial();
    }

    updateDifficulty() {
        const elapsed = Date.now() - this.startTime;
        
        if (elapsed > this.config.easyDuration) {
            const difficultyLevel = Math.floor((elapsed - this.config.easyDuration) / this.config.difficultyInterval);
            const multiplier = Math.pow(1 + this.config.difficultyIncrease, difficultyLevel);
            
            this.currentSpeed = this.config.baseSpeed * multiplier;
            this.currentGap = Math.max(0.15, this.config.baseGap / multiplier);
        }
    }

    spawnObstacle() {
        const gapHeight = this.height * this.currentGap;
        const gapY = Math.random() * (this.height - gapHeight - 100) + 50;
        
        // Spawn slice banner occasionally
        if (Math.random() < this.config.bannerFrequency) {
            this.spawnBanner(gapY + gapHeight / 2);
        }
        
        this.obstacles.push({
            x: this.width,
            topHeight: gapY,
            bottomY: gapY + gapHeight,
            bottomHeight: this.height - (gapY + gapHeight),
            scored: false,
            rotation: Math.random() * Math.PI * 2
        });
    }

    spawnBanner(y) {
        this.banners.push({
            x: this.width + 50,
            y: y,
            width: 200,
            height: 40,
            glow: 0,
            glowDirection: 1
        });
    }

    checkCollisions() {
        // Check obstacle collisions only (banners are decorative)
        for (let obstacle of this.obstacles) {
            if (this.spaceship.x + 15 > obstacle.x && 
                this.spaceship.x - 15 < obstacle.x + 50) {
                
                if (this.spaceship.y - 15 < obstacle.topHeight || 
                    this.spaceship.y + 15 > obstacle.bottomY) {
                    return true;
                }
            }
        }
        
        // Check boundary collisions
        if (this.spaceship.y - 15 < 0 || this.spaceship.y + 15 > this.height) {
            return true;
        }
        
        return false;
    }

    updateScore() {
        document.getElementById('score').textContent = this.score;
        
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('flappyRocketBest', this.bestScore.toString());
            document.getElementById('best').textContent = this.bestScore;
        }
    }

    gameOver() {
        console.log('Game over!');
        this.gameState = 'gameOver';
        this.gameRunning = false;
        this.inputEnabled = false;
        
        // Cancel animation frame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        this.playSound('crash');
        
        // Add crash particles
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: this.spaceship.x,
                y: this.spaceship.y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 60,
                maxLife: 60,
                color: `hsl(${Math.random() * 60 + 10}, 100%, 50%)`
            });
        }
        
        setTimeout(() => {
            document.getElementById('hud').classList.add('hidden');
            document.getElementById('gameOver').classList.remove('hidden');
            document.getElementById('finalScore').textContent = this.score;
            
            const newRecord = this.score === this.bestScore && this.score > 0;
            document.getElementById('newRecord').classList.toggle('hidden', !newRecord);
        }, 1000);
    }

    hideAllOverlays() {
        document.querySelectorAll('.overlay').forEach(overlay => {
            overlay.classList.add('hidden');
        });
    }

    drawNebula() {
        const time = Date.now() * 0.001;
        
        // Create background gradient
        const gradient = this.ctx.createLinearGradient(0, 0, this.width, this.height);
        gradient.addColorStop(0, '#1f2121');
        gradient.addColorStop(0.3, this.colors.nebulaPrimary + '40');
        gradient.addColorStop(0.7, this.colors.nebulaSecondary + '60');
        gradient.addColorStop(1, '#2d1b69');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw moving stars
        this.ctx.fillStyle = this.colors.starfield;
        for (let star of this.stars) {
            if (this.gameState === 'playing') {
                star.x -= star.speed * this.currentSpeed;
                if (star.x < -5) {
                    star.x = this.width + 5;
                    star.y = Math.random() * this.height;
                }
            }
            
            this.ctx.globalAlpha = star.opacity;
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;
    }

    drawSpaceship() {
        if (this.spaceship.x === 0 || this.spaceship.y === 0) {
            console.warn('Spaceship position not initialized');
            return;
        }
        
        this.ctx.save();
        this.ctx.translate(this.spaceship.x, this.spaceship.y);
        
        // Smooth rotation based on velocity
        this.spaceship.targetRotation = Math.max(-0.5, Math.min(0.5, this.spaceship.vy * 0.05));
        this.spaceship.rotation += (this.spaceship.targetRotation - this.spaceship.rotation) * 0.1;
        this.ctx.rotate(this.spaceship.rotation);
        
        // Draw thruster flames
        if (this.spaceship.thrusting && Date.now() - this.spaceship.thrustTime < 200) {
            const flameIntensity = Math.max(0, 1 - (Date.now() - this.spaceship.thrustTime) / 200);
            this.drawThrusterFlames(flameIntensity);
        }
        
        // Draw spaceship body
        this.drawSpaceshipBody();
        
        this.ctx.restore();
    }

    drawSpaceshipBody() {
        const skinColors = {
            red: '#ff6b6b',
            blue: '#4ecdc4',
            gold: '#ffd93d',
            mystery: `hsl(${Date.now() * 0.1 % 360}, 70%, 60%)`
        };
        
        const color = skinColors[this.selectedSkin] || skinColors.red;
        
        // Main body
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Cockpit
        this.ctx.fillStyle = '#87ceeb';
        this.ctx.beginPath();
        this.ctx.ellipse(5, -2, 6, 4, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Side fins
        this.ctx.fillStyle = color;
        this.ctx.fillRect(-12, -8, 8, 3);
        this.ctx.fillRect(-12, 5, 8, 3);
        
        // Outline for visibility
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2);
        this.ctx.stroke();
    }

    drawThrusterFlames(intensity) {
        const time = Date.now() * 0.01;
        
        for (let i = 0; i < 3; i++) {
            const flameX = -15 - Math.random() * 5;
            const flameY = (Math.random() - 0.5) * 6;
            const flameSize = (Math.random() * 8 + 4) * intensity;
            
            const hue = 15 + Math.sin(time + i) * 15;
            this.ctx.fillStyle = `hsl(${hue}, 100%, ${60 * intensity}%)`;
            
            this.ctx.beginPath();
            this.ctx.ellipse(flameX, flameY, flameSize, flameSize * 0.6, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    drawObstacles() {
        for (let obstacle of this.obstacles) {
            this.ctx.save();
            
            // Draw top asteroid
            this.ctx.fillStyle = this.colors.asteroid;
            this.ctx.fillRect(obstacle.x, 0, 50, obstacle.topHeight);
            
            // Draw bottom asteroid
            this.ctx.fillRect(obstacle.x, obstacle.bottomY, 50, obstacle.bottomHeight);
            
            // Add bright white outline for visibility
            this.ctx.strokeStyle = this.colors.asteroidGlow;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(obstacle.x, 0, 50, obstacle.topHeight);
            this.ctx.strokeRect(obstacle.x, obstacle.bottomY, 50, obstacle.bottomHeight);
            
            // Add inner shadow for depth
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.fillRect(obstacle.x + 2, 2, 46, obstacle.topHeight - 4);
            this.ctx.fillRect(obstacle.x + 2, obstacle.bottomY + 2, 46, obstacle.bottomHeight - 4);
            
            this.ctx.restore();
        }
    }

    drawBanners() {
        for (let banner of this.banners) {
            this.ctx.save();
            this.ctx.translate(banner.x, banner.y);
            
            // Animate glow
            banner.glow += banner.glowDirection * 2;
            if (banner.glow > 20 || banner.glow < 0) {
                banner.glowDirection *= -1;
            }
            
            // Draw banner background with glow
            const gradient = this.ctx.createLinearGradient(-100, -20, 100, 20);
            gradient.addColorStop(0, this.colors.sliceBanner + '80');
            gradient.addColorStop(0.5, this.colors.sliceBanner + 'ff');
            gradient.addColorStop(1, this.colors.sliceBanner + '80');
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(-100, -20, 200, 40);
            
            // Glow effect
            this.ctx.shadowColor = this.colors.sliceBanner;
            this.ctx.shadowBlur = banner.glow;
            this.ctx.fillRect(-100, -20, 200, 40);
            
            // Reset shadow
            this.ctx.shadowBlur = 0;
            
            // Draw text
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 16px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('slice Credit Card', 0, 0);
            
            this.ctx.restore();
        }
    }

    drawParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vy += 0.2; // gravity
            particle.life--;
            
            if (particle.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            
            const alpha = particle.life / particle.maxLife;
            this.ctx.fillStyle = particle.color.replace(')', `, ${alpha})`).replace('hsl', 'hsla');
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    update() {
        if (!this.gameRunning || this.gameState !== 'playing') return;
        
        const now = Date.now();
        const deltaTime = Math.min(20, now - this.lastTime);
        this.lastTime = now;
        
        // Update difficulty
        this.updateDifficulty();
        
        // Update spaceship physics
        this.spaceship.vy += 0.5; // gravity
        this.spaceship.vy = Math.max(-12, Math.min(12, this.spaceship.vy));
        this.spaceship.y += this.spaceship.vy;
        
        this.spaceship.thrusting = false;
        
        // Update obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            obstacle.x -= this.currentSpeed;
            obstacle.rotation += 0.02;
            
            // Score when passing obstacle
            if (!obstacle.scored && obstacle.x + 50 < this.spaceship.x) {
                obstacle.scored = true;
                this.score++;
                this.updateScore();
                this.playSound('score');
            }
            
            // Remove off-screen obstacles
            if (obstacle.x < -100) {
                this.obstacles.splice(i, 1);
            }
        }
        
        // Update banners (decorative only)
        for (let i = this.banners.length - 1; i >= 0; i--) {
            const banner = this.banners[i];
            banner.x -= this.currentSpeed * 0.8; // Slightly slower than obstacles
            
            if (banner.x < -250) {
                this.banners.splice(i, 1);
            }
        }
        
        // Spawn new obstacles
        if (this.obstacles.length === 0 || this.obstacles[this.obstacles.length - 1].x < this.width - 200) {
            this.spawnObstacle();
        }
        
        // Check collisions
        if (this.checkCollisions()) {
            this.gameOver();
            return;
        }
        
        // Limit particles
        if (this.particles.length > this.config.maxParticles) {
            this.particles.splice(0, this.particles.length - this.config.maxParticles);
        }
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Draw background
        this.drawNebula();
        
        if (this.gameState === 'playing') {
            // Draw game objects
            this.drawObstacles();
            this.drawBanners();
            this.drawSpaceship();
            this.drawParticles();
        }
    }

    backgroundLoop() {
        // Always draw the background
        this.draw();
        requestAnimationFrame(() => this.backgroundLoop());
    }

    gameLoop() {
        if (this.gameState === 'playing' && this.gameRunning) {
            this.update();
            
            this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
        }
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new FlappyRocket();
});