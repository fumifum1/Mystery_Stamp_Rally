// スタンプポイントのデータ（クイズ情報を含む）
const stampPoints = [
    {
        id: 'Apoint',
        name: '宮崎県宮崎市-加護神社',
        latitude: 31.857671668903887,
        longitude: 131.43358943930386,
        stampImage: 'Apoint.jpg',
        hint: 'ヒント：樹齢約200年の大きな木'
    },
    {
        id: 'Bpoint',
        name: 'ひなた宮崎県総合運動公園',
        latitude: 31.822937553365797,
        longitude: 131.44847837597044,
        stampImage: 'Bpoint.jpg',
        hint: 'ヒント：日本の四季折々、池のほとり'
    },
    {
        id: 'Cpoint',
        name: '？？？神社',
        latitude: 31.868149252123626,
        longitude: 131.43150601893436,
        stampImage: 'Cpoint.jpg',
        hint: 'ヒント：赤江村大字本郷大字鵜戸尻に鎮座する鵜戸尻宮を合祀'
    }
];

const stampThreshold = 50; // 50メートルを範囲とします。GPSの誤差を考慮して少し広めに設定。

// グローバル変数の宣言（DOM要素は後で代入）
let stampCardsContainer, currentLocationSpan, stampCountSpan, clearButton, completionModal, modalCloseBtn;

const STORAGE_KEY = 'stampedData';

// ----------------------------------------------------
// ユーティリティ関数
// ----------------------------------------------------

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

// ----------------------------------------------------
// UIと状態管理
// ----------------------------------------------------

// スタンプカードを動的に生成
function createStampCards() {
    if (!stampCardsContainer) {
        console.error('Error: stamp-cards-container element not found in HTML.');
        return;
    }
    stampCardsContainer.innerHTML = ''; // 一旦クリア
    stampPoints.forEach(point => {
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
            <!-- クイズセクションを削除し、ボタンを直接配置 -->
            <button class="btn btn-primary stamp-btn" id="btn-${point.id}" data-id="${point.id}" disabled>スタンプを押す</button>
        `;
        stampCardsContainer.appendChild(card);
    });
}

// ページ読み込み時にスタンプの状態をロード
function loadStampStatus(targetCache) {
    const storedData = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    // 既存のキャッシュをクリアしてから新しいデータをコピー
    Object.keys(targetCache).forEach(key => delete targetCache[key]);
    Object.assign(targetCache, storedData);
    updateUI(targetCache);
}

// UIの更新
function updateUI(stampedData) {
    const stampedCount = Object.values(stampedData).filter(Boolean).length;
    stampCountSpan.textContent = `${stampedCount}/${stampPoints.length}`;

    stampPoints.forEach(point => {
        const card = document.getElementById(`card-${point.id}`);
        if (!card) return; // 要素が見つからない場合はスキップ
        const stampIcon = card.querySelector('.stamp-icon');
        const stampBtn = card.querySelector('.stamp-btn');
        
        if (stampedData[point.id]) {
            card.classList.add('stamped');
            stampIcon.src = `stamp_jpg/${point.stampImage}`;
            stampBtn.disabled = true;
            stampBtn.textContent = 'スタンプ済み';
        } else {
            card.classList.remove('stamped');
            stampIcon.src = 'stamp_jpg/not_stamp.jpg';
            stampBtn.textContent = 'スタンプを押す';
        }
    });
}

// ----------------------------------------------------
// イベントハンドラ
// ----------------------------------------------------

// スタンプボタンのクリック処理
function handleStamp(pointId, stampedDataCache) {
    const point = stampPoints.find(p => p.id === pointId);

    stampedDataCache[pointId] = true; // メモリ上のキャッシュを更新
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stampedDataCache)); // localStorageも更新
    updateUI(stampedDataCache);
    alert(`おめでとうございます！「${point.name}」のスタンプをゲットしました！`);
    
    // 全てのスタンプが揃ったかチェック
    const stampedCount = Object.values(stampedDataCache).filter(Boolean).length;
    if (stampedCount === stampPoints.length) {
        // 0.5秒後にコンプリートモーダルを表示（スタンプUIの更新が見えるように）
        setTimeout(showCompletionModal, 500);
    }
}

// ----------------------------------------------------
// モーダル関連の処理
// ----------------------------------------------------

function showCompletionModal() {
    completionModal.classList.add('show');
}

function hideCompletionModal() {
    completionModal.classList.remove('show');
}

// DOMの読み込みが完了したらアプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    stampCardsContainer = document.getElementById('stamp-cards-container');
    currentLocationSpan = document.getElementById('current-location');
    stampCountSpan = document.getElementById('stamp-count');
    clearButton = document.getElementById('clear-button');
    completionModal = document.getElementById('completion-modal');
    modalCloseBtn = document.querySelector('.modal-close-btn');

    // --- 状態管理 ---
    const stampedDataCache = {}; // スタンプ状態をメモリにキャッシュ

    // --- イベントリスナーの設定 ---

    // スタンプカードコンテナ
    stampCardsContainer.addEventListener('click', (event) => {
        const stampButton = event.target.closest('.stamp-btn');
        if (stampButton && !stampButton.disabled) {
            const pointId = stampButton.dataset.id;
            handleStamp(pointId, stampedDataCache);
        }
    });

    // リセットボタン
    clearButton.addEventListener('click', () => {
        if (confirm('本当にスタンプをリセットしますか？')) {
            localStorage.removeItem(STORAGE_KEY);
            loadStampStatus(stampedDataCache); // キャッシュをリロード
            alert('スタンプをリセットしました。');
        }
    });

    // モーダル関連
    modalCloseBtn.addEventListener('click', hideCompletionModal);
    completionModal.addEventListener('click', (event) => {
        if (event.target === completionModal) {
            hideCompletionModal();
        }
    });

    // --- アプリケーションのメインロジック ---

    // 位置情報が更新されたときにUIを更新する関数
    function onLocationUpdate(position) {
        const userPosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        };
        currentLocationSpan.textContent = `緯度: ${userPosition.latitude.toFixed(4)}, 経度: ${userPosition.longitude.toFixed(4)}`;

        stampPoints.forEach(point => {
            const distance = getDistance(
                userPosition.latitude,
                userPosition.longitude,
                point.latitude,
                point.longitude
            );
            
            const distanceInfoSpan = document.getElementById(`distance-${point.id}`);
            if (distanceInfoSpan) {
                distanceInfoSpan.textContent = `距離: ${distance.toFixed(1)} m`;
            }

            const stampBtn = document.getElementById(`btn-${point.id}`);
            if (stampBtn) {
                // スタンプ済みならボタンは常に無効
                if (stampedDataCache[point.id]) {
                    stampBtn.disabled = true;
                } else {
                    // 未スタンプなら距離に応じて有効/無効を切り替え
                    stampBtn.disabled = (distance > stampThreshold);
                }
            }
        });
    }

    // 位置情報の取得に失敗したときの処理
    function onLocationError(error) {
        console.error("位置情報の取得に失敗しました: ", error);
        currentLocationSpan.textContent = "位置情報が取得できませんでした。";
        document.querySelectorAll('.stamp-btn').forEach(btn => btn.disabled = true);
    }

    // アプリケーションの初期化
    createStampCards();
    loadStampStatus(stampedDataCache);

    // 位置情報の監視を開始
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(onLocationUpdate, onLocationError, { enableHighAccuracy: true });
    } else {
        onLocationError(new Error("Geolocation is not supported by this browser."));
    }
});