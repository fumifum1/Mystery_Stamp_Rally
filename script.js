/**
 * Mystery Stamp Rally - Participant Interface
 * Optimized and Refactored Version with Confetti
 */

// === 1. Constants & Assets ===
const NOT_STAMPED_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='48' fill='%2334495e' stroke='%237f8c8d' stroke-width='3'/%3E%3Ctext x='50' y='58' font-family='sans-serif' font-size='36' font-weight='bold' fill='%237f8c8d' text-anchor='middle'%3E%3F%3C/text%3E%3C/svg%3E";
const STAMPED_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='44' fill='none' stroke='%23e74c3c' stroke-width='4'/%3E%3Ccircle cx='50' cy='50' r='38' fill='none' stroke='%23e74c3c' stroke-width='1.5'/%3E%3Ctext x='50' y='53' font-family='sans-serif' font-size='14' font-weight='bold' fill='%23e74c3c' text-anchor='middle' transform='rotate(-15, 50, 53)'%3EComplete!!%3C/text%3E%3C/svg%3E";

const STAMP_THRESHOLD_METERS = 20;
let stampedDataStorageKey = 'stampedData_default';

// === 2. Application State ===
const state = {
    rallyConfig: { title: "Mystery Stamp Rally", completionMessage: "" },
    stampPoints: [],
    stampedDataCache: {}, 
    userPosition: null,
    html5QrCode: null,
    confetti: { animationId: null, intervalId: null, timeoutId: null }
};

// DOM References
const dom = {};

// === 3. Utility Functions ===

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function decodeBase64(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return atob(base64);
}

// === 4. UI Rendering Functions ===

function createStampCards() {
    if (!dom.stampCardsContainer) return;
    dom.stampCardsContainer.innerHTML = '';
    
    state.stampPoints.forEach(point => {
        const card = document.createElement('div');
        card.className = 'stamp-card';
        card.id = `card-${point.id}`;
        card.innerHTML = `
            <div class="stamp-card-content">
                <h2 class="card-title">${point.name}</h2>
                <div class="stamp-image-container">
                    <img src="${NOT_STAMPED_IMG}" alt="Stamp" class="stamp-icon">
                </div>
                <div class="hint-container">
                    ${point.hint ? `<p class="hint-text">${point.hint}</p>` : ''}
                    ${point.hintImageSrc ? `
                        <div class="hint-image-wrapper">
                            <img src="${point.hintImageSrc}" alt="Hint" class="hint-image" 
                                 onerror="this.parentElement.style.display='none'; console.warn('Hint img load fail');">
                        </div>` : ''}
                </div>
                <p class="distance-info" id="distance-${point.id}">距離: ---</p>
                <button class="btn btn-primary stamp-btn" id="btn-${point.id}" data-id="${point.id}" disabled>
                    ${point.qrRequired !== false ? 'QRコードをスキャン' : (point.acquisitionButtonLabel || 'スタンプゲット！')}
                </button>
            </div>
        `;
        dom.stampCardsContainer.appendChild(card);
    });
}

function updateAllUI() {
    const stampedCount = Object.values(state.stampedDataCache).filter(Boolean).length;
    if (dom.stampCountSpan) dom.stampCountSpan.textContent = `${stampedCount}/${state.stampPoints.length}`;

    state.stampPoints.forEach(point => {
        const card = document.getElementById(`card-${point.id}`);
        if (!card) return;
        
        const stampIcon = card.querySelector('.stamp-icon');
        const stampBtn = card.querySelector('.stamp-btn');
        const stampedImageData = state.stampedDataCache[point.id];

        if (stampedImageData) {
            card.classList.add('stamped');
            stampIcon.src = stampedImageData === 'default_stamped' ? STAMPED_IMG : stampedImageData;
            stampIcon.onerror = () => { stampIcon.src = STAMPED_IMG; };
            stampBtn.disabled = true;
            stampBtn.textContent = 'スタンプ済み';
        } else {
            card.classList.remove('stamped');
            stampIcon.src = NOT_STAMPED_IMG;
        }
    });

    const allStamped = state.stampPoints.length > 0 && state.stampPoints.every(p => state.stampedDataCache[p.id]);
    dom.completionTriggerBtn.style.display = allStamped ? 'block' : 'none';
}

function updateDistances() {
    if (!state.userPosition) return;
    state.stampPoints.forEach(point => {
        const distance = getDistance(state.userPosition.latitude, state.userPosition.longitude, point.latitude, point.longitude);
        const distEl = document.getElementById(`distance-${point.id}`);
        if (distEl) distEl.textContent = `距離: ${distance.toFixed(1)} m`;
        const btn = document.getElementById(`btn-${point.id}`);
        if (btn && !state.stampedDataCache[point.id]) btn.disabled = distance > STAMP_THRESHOLD_METERS;
    });
}

// === 5. Confetti Animation ===

function startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    stopConfetti();
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const pieces = [];
    const colors = ['#f1c40f', '#e67e22', '#e74c3c', '#3498db', '#2ecc71'];

    function launch() {
        for (let i = 0; i < 50; i++) {
            pieces.push({
                x: canvas.width / 2, y: canvas.height,
                vx: (Math.random() - 0.5) * 15, vy: (Math.random() * -12) - 6,
                size: Math.random() * 8 + 4, rotation: Math.random() * 360,
                color: colors[Math.floor(Math.random() * colors.length)], opacity: 1
            });
        }
    }

    function animate() {
        state.confetti.animationId = requestAnimationFrame(animate);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = pieces.length - 1; i >= 0; i--) {
            const p = pieces[i];
            p.vy += 0.15; p.x += p.vx; p.y += p.vy; p.opacity -= 0.005;
            if (p.y > canvas.height || p.opacity <= 0) { pieces.splice(i, 1); continue; }
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rotation * Math.PI / 180);
            ctx.globalAlpha = p.opacity; ctx.fillStyle = p.color;
            ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size * 0.6);
            ctx.restore();
        }
    }

    animate();
    launch();
    state.confetti.intervalId = setInterval(launch, 600);
    state.confetti.timeoutId = setTimeout(() => {
        clearInterval(state.confetti.intervalId);
        setTimeout(stopConfetti, 2000);
    }, 5000);
}

function stopConfetti() {
    if (state.confetti.animationId) cancelAnimationFrame(state.confetti.animationId);
    if (state.confetti.intervalId) clearInterval(state.confetti.intervalId);
    if (state.confetti.timeoutId) clearTimeout(state.confetti.timeoutId);
    state.confetti = { animationId: null, intervalId: null, timeoutId: null };
    const canvas = document.getElementById('confetti-canvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

// === 6. Core Game Logic ===

function handleStamp(pointId, imageData) {
    const point = state.stampPoints.find(p => p.id === pointId);
    if (!point) return;
    state.stampedDataCache[pointId] = imageData || 'default_stamped';
    localStorage.setItem(stampedDataStorageKey, JSON.stringify(state.stampedDataCache));
    updateAllUI();
    alert(`おめでとう！「${point.name}」を取得しました！`);
}

async function loadConfig() {
    const params = new URLSearchParams(window.location.search);
    const dataParam = params.get('data');
    const isPreview = params.get('preview') === 'true';
    let config = null;

    if (isPreview) {
        config = JSON.parse(localStorage.getItem('rallyPreviewData'));
    } else if (dataParam) {
        stampedDataStorageKey = `stampedData_${dataParam.substring(0, 10)}`;
        try {
            const json = decodeBase64(dataParam);
            const bytes = Uint8Array.from(json, c => c.charCodeAt(0));
            config = JSON.parse(pako.inflate(bytes, { to: 'string' }));
        } catch (e) { console.error(e); }
    }

    if (config) {
        state.rallyConfig = config;
        state.stampPoints = config.points || [];
        if (config.title) document.title = dom.titleElement.textContent = config.title;
    }
}

function startScanner(pointId) {
    dom.qrScannerPage.classList.add('show');
    state.html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => {
        if (text === pointId) {
            stopScanner();
            handleStamp(pointId, state.stampPoints.find(p => p.id === pointId).stampedImageSrc);
        } else dom.qrMessageSpan.textContent = "違う場所のコードです。";
    }, () => {}).catch(() => dom.qrMessageSpan.textContent = "カメラ起動失敗");
}

function stopScanner() {
    state.html5QrCode.stop().catch(() => {});
    dom.qrScannerPage.classList.remove('show');
}

// === 7. Initialization ===

document.addEventListener('DOMContentLoaded', () => {
    dom.titleElement = document.querySelector('.title');
    dom.stampCardsContainer = document.getElementById('stamp-cards-container');
    dom.currentLocationSpan = document.getElementById('current-location');
    dom.stampCountSpan = document.getElementById('stamp-count');
    dom.clearButton = document.getElementById('clear-button');
    dom.completionTriggerBtn = document.getElementById('completion-trigger-btn');
    dom.qrScannerPage = document.getElementById('qr-scanner-page');
    dom.qrMessageSpan = document.getElementById('qr-message');
    
    state.html5QrCode = new Html5Qrcode("qr-reader");

    dom.stampCardsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.stamp-btn');
        if (!btn || btn.disabled) return;
        const pt = state.stampPoints.find(p => p.id === btn.dataset.id);
        if (pt.qrRequired === false) handleStamp(pt.id, pt.stampedImageSrc);
        else startScanner(pt.id);
    });

    dom.clearButton.addEventListener('click', () => {
        if (confirm('リセットしますか？')) {
            localStorage.removeItem(stampedDataStorageKey);
            state.stampedDataCache = {};
            updateAllUI();
        }
    });

    dom.completionTriggerBtn.addEventListener('click', () => {
        document.getElementById('completion-message').textContent = state.rallyConfig.completionMessage || "コンプリート！";
        document.getElementById('completion-overlay').classList.add('show');
        startConfetti();
    });
    
    document.getElementById('completion-back-btn').addEventListener('click', () => {
        document.getElementById('completion-overlay').classList.remove('show');
        stopConfetti();
    });

    dom.qrScannerPage.querySelector('.close-btn').addEventListener('click', stopScanner);

    (async () => {
        await loadConfig();
        createStampCards();
        state.stampedDataCache = JSON.parse(localStorage.getItem(stampedDataStorageKey)) || {};
        updateAllUI();
        if ("geolocation" in navigator) {
            navigator.geolocation.watchPosition((pos) => {
                state.userPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                if (dom.currentLocationSpan) dom.currentLocationSpan.textContent = `緯度: ${pos.coords.latitude.toFixed(4)}, 経度: ${pos.coords.longitude.toFixed(4)}`;
                updateDistances();
            }, null, { enableHighAccuracy: true });
        }
    })();
});