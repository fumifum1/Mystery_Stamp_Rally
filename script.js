// スタンプポイントのデータ（クイズ情報を含む）
const defaultStampPoints = [
    {
        id: 'dev_point_1',
        name: '開発用テストポイント１',
        latitude: 35.681236, // 東京駅
        longitude: 139.767125,
        stampedImageSrc: '', // 画像は空でもOK
        hint: 'これは開発用のヒントです。'
    },
    {
        id: 'dev_point_2',
        name: 'テストポイント２（画像あり）',
        latitude: 35.658581, // 東京タワー
        longitude: 139.745433,
        // テスト用にローカルの画像を直接指定することもできます
        stampedImageSrc: 'stamp_jpg/Apoint.jpg', 
        hint: 'ヒント２'
    }
];

const stampThreshold = 20; // 20メートルを範囲とします。GPSの誤差を考慮して少し広めに設定。
const STAMPED_DATA_STORAGE_KEY = 'stampedData';

// アプリケーションの状態を管理するオブジェクト
const state = {
    stampPoints: [],
    stampedDataCache: {},
    userPosition: null,
    html5QrCode: null,
};

// DOM要素への参照を保持するオブジェクト
const dom = {};

// 2つの座標間の距離をメートルで計算（Haversineの公式）
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // 地球の半径（メートル）
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
}

// スタンプカードを動的に生成
function createStampCards() {
    if (!dom.stampCardsContainer) {
        console.error('Error: stamp-cards-container element not found in HTML.');
        return;
    }
    dom.stampCardsContainer.innerHTML = ''; // 一旦クリア
    state.stampPoints.forEach(point => {
        const card = document.createElement('div');
        card.className = 'stamp-card';
        card.id = `card-${point.id}`;
        card.innerHTML = `
            <div class="stamp-card-header">
                <h2 class="card-title">${point.name}</h2>
                <img src="stamp_jpg/not_stamp.jpg" alt="スタンプ" class="stamp-icon">
            </div>
            <p class="hint-text">${point.hint || ''}</p>
            <p class="distance-info" id="distance-${point.id}">距離: ---</p>
            <button class="btn btn-primary stamp-btn" id="btn-${point.id}" data-id="${point.id}" disabled>QRコードをスキャン</button>
        `;
        dom.stampCardsContainer.appendChild(card);
    });
}

// localStorageからスタンプポイントの座標データを読み込む
async function loadStampPoints() {
    const urlParams = new URLSearchParams(window.location.search);
    const binId = urlParams.get('bin');
    let pointsData = null;

    // 1. URLに 'bin' パラメータがあれば、jsonblob.comから設定を読み込む
    if (binId) {
        try {
            console.log(`jsonblob.comから設定を読み込みます (Bin ID: ${binId})`);
            const response = await fetch(`https://jsonblob.com/api/jsonBlob/${binId}`);
            if (!response.ok) {
                throw new Error(`設定データの取得に失敗しました (Status: ${response.status})`);
            }
            pointsData = await response.json();
            console.log("jsonblob.comからスタンプポイントを正常に読み込みました。");
        } catch (e) {
            console.error("データ保管庫からのデータ取得または解析に失敗しました。", e);
            alert("スタンプラリーの設定を読み込めませんでした。URLが正しいか確認してください。");
        }
    }

    // 2. URLパラメータがない場合、rally_config.json を試みる
    if (!pointsData) {
        try {
            const response = await fetch('rally_config.json');
            if (response.ok) {
                pointsData = await response.json();
                console.log("設定ファイル `rally_config.json` からスタンプポイントを読み込みました。");
            }
        } catch (error) {
            console.warn("rally_config.json の読み込みに失敗しました。", error);
        }
    }

    // 3. それでもデータがなければ、デフォルト設定を使用
    if (pointsData && pointsData.points) {
        state.rallyConfig = pointsData;
        state.stampPoints = pointsData.points;
    } else {
        state.rallyConfig = { completionMessage: "すべてのスタンプを集めました！おめでとうございます！" };
        state.stampPoints = pointsData || defaultStampPoints; // 旧形式のデータまたはデフォルト
    }
}

// ページ読み込み時にスタンプの状態をロード
function loadStampStatus() {
    const storedData = JSON.parse(localStorage.getItem(STAMPED_DATA_STORAGE_KEY)) || {};
    // 既存のキャッシュをクリアしてから新しいデータをコピー
    Object.keys(state.stampedDataCache).forEach(key => delete state.stampedDataCache[key]);
    Object.assign(state.stampedDataCache, storedData);
    updateUI();
}

// UIの更新
function updateUI() {
    const stampedCount = Object.values(state.stampedDataCache).filter(Boolean).length;
    dom.stampCountSpan.textContent = `${stampedCount}/${state.stampPoints.length}`;

    state.stampPoints.forEach(point => {
        const card = document.getElementById(`card-${point.id}`);
        if (!card) return; // 要素が見つからない場合はスキップ
        const stampIcon = card.querySelector('.stamp-icon');
        const stampBtn = card.querySelector('.stamp-btn');
        
        // stampedData[point.id] には画像データ(Base64)が保存されている
        const stampedImageData = state.stampedDataCache[point.id];

        if (stampedImageData) {
            card.classList.add('stamped');
            // localStorageに保存された画像データを表示
            stampIcon.src = stampedImageData;
            stampBtn.disabled = true;
            stampBtn.textContent = 'スタンプ済み';
        } else {
            card.classList.remove('stamped');
            stampIcon.src = 'stamp_jpg/not_stamp.jpg';
            stampBtn.textContent = 'QRコードをスキャン';
        }
    });
}

// スタンプボタンのクリック処理
function handleStamp(pointId, imageData) {
    const point = state.stampPoints.find(p => p.id === pointId);
    if (!point) return;

    state.stampedDataCache[pointId] = imageData; // メモリ上のキャッシュを更新
    localStorage.setItem(STAMPED_DATA_STORAGE_KEY, JSON.stringify(state.stampedDataCache)); // localStorageも更新
    updateUI();
    alert(`おめでとうございます！「${point.name}」のスタンプをゲットしました！`);
    
    // 全てのスタンプが揃ったかチェック
    const stampedCount = Object.values(state.stampedDataCache).filter(Boolean).length;
    if (stampedCount === state.stampPoints.length) {
        // 0.5秒後にコンプリートモーダルを表示（スタンプUIの更新が見えるように）
        setTimeout(showCompletionModal, 500);
    }
}

// QRコードスキャナーを開始
function startQrScanner(targetPointId) {
    dom.qrScannerPage.classList.add('show');
    dom.qrMessageSpan.textContent = 'カメラをQRコードに向けてください。';

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    // 成功コールバックをラップして引数を渡す
    const successCallback = (decodedText, decodedResult) => {
        onScanSuccess(decodedText, targetPointId, decodedResult);
    };
    const errorCallback = (error) => {
        // スキャンエラーはコンソールに出力するが、UIには表示しないことが多い
        // console.warn(error);
    };

    state.html5QrCode.start({ facingMode: "environment" }, config, successCallback, errorCallback)
        .catch(err => {
            console.error("QRスキャナーの起動に失敗しました。", err);
            dom.qrMessageSpan.textContent = "カメラの起動に失敗しました。";
        });
}

// QRコードスキャナーを停止
function stopQrScanner() {
    state.html5QrCode.stop().then(ignore => {
        // QRスキャナーが正常に停止
        console.log("QR Scanner stopped.");
    }).catch(err => {
        // 停止に失敗した場合（すでに停止している場合など）
        console.warn("QR Scanner stop failed.", err);
    });
    dom.qrScannerPage.classList.remove('show');
    // メッセージを初期状態に戻す
    dom.qrMessageSpan.textContent = 'カメラをQRコードに向けてください。';
}

// QRコードスキャン成功時の処理
function onScanSuccess(decodedText, targetPointId) {
    // スキャンしたQRコードのIDが、ボタンのIDと一致するかチェック
    if (decodedText === targetPointId) {
        stopQrScanner();
        // IDが一致したポイントの画像データを取得
        const point = state.stampPoints.find(p => p.id === targetPointId);
        const imageData = point ? point.stampedImageSrc : null;

        if (imageData) {
            if (imageData === 'default_stamped') {
                // デフォルトの取得済み画像パスを指定
                handleStamp(targetPointId, 'stamp_jpg/get.png'); 
            } else {
                // 管理者設定の画像を使用
                handleStamp(targetPointId, imageData);
            }
        } else {
            alert('エラー: スタンプ画像が見つかりませんでした。');
        }
    } else {
        dom.qrMessageSpan.textContent = `違う場所のQRコードです。もう一度試してください。`;
    }
}

function showCompletionModal() {
    const overlay = document.getElementById('completion-overlay');
    const messageEl = document.getElementById('completion-message');
    
    messageEl.textContent = state.rallyConfig.completionMessage || 'すべてのスタンプを集めました！おめでとうございます！';
    overlay.classList.add('show');
    startConfetti();
}

function hideCompletionModal() {
    const overlay = document.getElementById('completion-overlay');
    overlay.classList.remove('show');
    stopConfetti();
}

// --- Confetti Animation ---
let confettiAnimationId;

function startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let confettiPieces = [];
    const pieceCount = 150;
    const colors = ['#f1c40f', '#e67e22', '#e74c3c', '#3498db', '#2ecc71'];
    const gravity = 0.1;
    const drag = 0.98;

    function createConfetti() {
        confettiPieces = [];
        for (let i = 0; i < pieceCount; i++) {
            const angle = Math.random() * Math.PI * 2; // 360度ランダムな角度
            const speed = Math.random() * 8 + 4; // 初速
            confettiPieces.push({
                x: canvas.width / 2,
                y: canvas.height, // 画面下中央から
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed * -1, // 上向きの力
                size: Math.random() * 8 + 4,
                rotation: Math.random() * 360,
                rotationSpeed: Math.random() * 10 - 5,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        confettiPieces.forEach(piece => {
            // 物理演算
            piece.vy += gravity;
            piece.vx *= drag;
            piece.vy *= drag;
            piece.x += piece.vx;
            piece.y += piece.vy;
            piece.rotation += piece.rotationSpeed;

            ctx.save();
            ctx.translate(piece.x, piece.y);
            ctx.rotate(piece.rotation * Math.PI / 180);
            ctx.fillStyle = piece.color;
            ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.7);
            ctx.restore();
        });

        confettiAnimationId = requestAnimationFrame(animate);
    }
    createConfetti();
    animate(); // アニメーション開始
}

function stopConfetti() {
    cancelAnimationFrame(confettiAnimationId);
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// DOMの読み込みが完了したらアプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    dom.stampCardsContainer = document.getElementById('stamp-cards-container');
    dom.currentLocationSpan = document.getElementById('current-location');
    dom.stampCountSpan = document.getElementById('stamp-count');
    dom.clearButton = document.getElementById('clear-button');
    dom.completionBackBtn = document.getElementById('completion-back-btn');
    dom.qrScannerPage = document.getElementById('qr-scanner-page');
    dom.qrReaderElement = document.getElementById('qr-reader');
    dom.qrMessageSpan = document.getElementById('qr-message');
    state.html5QrCode = new Html5Qrcode("qr-reader");

    // --- イベントリスナーの設定 ---

    // スタンプカードコンテナ
    dom.stampCardsContainer.addEventListener('click', (event) => {
        const stampButton = event.target.closest('.stamp-btn');
        if (stampButton && !stampButton.disabled) {
            startQrScanner(stampButton.dataset.id);
        }
    });

    // リセットボタン
    dom.clearButton.addEventListener('click', () => {
        if (confirm('本当にスタンプをリセットしますか？')) {
            localStorage.removeItem(STAMPED_DATA_STORAGE_KEY);
            loadStampStatus(); // キャッシュをリロード
            alert('スタンプをリセットしました。');
        }
    });

    // モーダル関連
    // dom.qrScannerPage内の閉じるボタンにイベントリスナーを設定
    const qrScannerCloseBtn = dom.qrScannerPage.querySelector('.close-btn');
    dom.completionBackBtn.addEventListener('click', hideCompletionModal);
    qrScannerCloseBtn.addEventListener('click', stopQrScanner);

    // --- アプリケーションのメインロジック ---

    // 位置情報が更新されたときにUIを更新する関数
    function onLocationUpdate(position) {
        state.userPosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        };
        dom.currentLocationSpan.textContent = `緯度: ${state.userPosition.latitude.toFixed(4)}, 経度: ${state.userPosition.longitude.toFixed(4)}`;
        updateDistancesAndButtons();
    }

    // 距離とボタンの状態を更新する
    function updateDistancesAndButtons() {
        if (!state.userPosition) return;

        state.stampPoints.forEach(point => {
            const distance = getDistance(
                state.userPosition.latitude,
                state.userPosition.longitude,
                point.latitude,
                point.longitude
            );

            const distanceInfoSpan = document.getElementById(`distance-${point.id}`);
            if (distanceInfoSpan) {
                distanceInfoSpan.textContent = `距離: ${distance.toFixed(1)} m`;
            }

            const stampBtn = document.getElementById(`btn-${point.id}`);
            // スタンプ済み、または距離がしきい値より遠い場合はボタンを無効化
            if (stampBtn && !state.stampedDataCache[point.id]) {
                stampBtn.disabled = (distance > stampThreshold);
            }
        });
    }

    // 位置情報の取得に失敗したときの処理
    function onLocationError(error) {
        state.userPosition = null;
        console.error("位置情報の取得に失敗しました: ", error);
        dom.currentLocationSpan.textContent = "位置情報が取得できませんでした。";
        // すべての未取得スタンプボタンを無効化
        state.stampPoints.forEach(point => {
            const stampBtn = document.getElementById(`btn-${point.id}`);
            if (stampBtn && !state.stampedDataCache[point.id]) {
                stampBtn.disabled = true;
            }
        });
    }

    // アプリケーションの初期化
    async function initializeApp() {
        await loadStampPoints(); // 設定ファイルの読み込みを待つ
        createStampCards();
        loadStampStatus();

        // 位置情報の監視を開始
        if ("geolocation" in navigator) {
            navigator.geolocation.watchPosition(onLocationUpdate, onLocationError, { enableHighAccuracy: true });
        } else {
            onLocationError(new Error("Geolocation is not supported by this browser."));
        }
    }
    initializeApp();
});