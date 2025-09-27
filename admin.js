document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('admin-stamp-points-container');
    const saveButton = document.getElementById('save-button');
    const urlOutput = document.getElementById('url-output');
    const urlQrcodeElement = document.getElementById('url-qrcode');
    const addButton = document.getElementById('add-point-button');
 
    // 画像設定の定数
    const MAX_IMAGE_WIDTH = 400; // 画像の最大幅
    const MAX_IMAGE_HEIGHT = 400; // 画像の最大高さ
    const IMAGE_QUALITY = 0.8; // 縮小時の画質 (JPEG)
    const MAX_FILE_SIZE_MB = 1; // 警告を出すファイルサイズ(MB)
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    let currentStampPoints = [];
 
    // UIから現在の入力値を読み取り、currentStampPointsに同期する
    function syncDataFromUI() {
        const pointElements = container.querySelectorAll('.stamp-card');
        if (pointElements.length !== currentStampPoints.length) {
            // UIとデータの要素数が一致しない場合、同期は危険なのでスキップ
            // これは削除操作の直後などに発生しうるが、その後のrenderUIで解決される
            return;
        }
        currentStampPoints.forEach((point, index) => {
            const nameInput = document.getElementById(`name-${index}`);
            const latInput = document.getElementById(`lat-${index}`);
            const lonInput = document.getElementById(`lon-${index}`);
            const hintInput = document.getElementById(`hint-${index}`);
 
            point.name = nameInput ? nameInput.value : point.name;
            point.latitude = latInput ? parseFloat(latInput.value) : point.latitude;
            point.longitude = lonInput ? parseFloat(lonInput.value) : point.longitude;
            point.hint = hintInput ? hintInput.value : point.hint;
        });
    }
 
    // currentStampPoints配列に基づいてUIを再描画する
    function renderUI() {
        // 再描画する前に現在の入力値を保存
        syncDataFromUI();
 
        container.innerHTML = '';
        currentStampPoints.forEach((point, index) => {
            const pointElement = document.createElement('div');
            pointElement.className = 'stamp-card';
            pointElement.innerHTML = `
                <div class="stamp-card-header">
                    <h3 class="card-title">ポイントID: ${point.id}</h3>
                    <button class="delete-btn" data-index="${index}" title="このポイントを削除"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg></button>
                </div>
                <div class="admin-form-group">
                    <label for="name-${index}">名前:</label>
                    <input type="text" id="name-${index}" value="${point.name || ''}">
                </div>
                <div class="admin-form-group">
                    <label for="lat-${index}">緯度:</label>
                    <input type="number" step="any" id="lat-${index}" value="${point.latitude || 0}">
                </div>
                <div class="admin-form-group">
                    <label for="lon-${index}">経度:</label>
                    <input type="number" step="any" id="lon-${index}" value="${point.longitude || 0}">
                </div>
                <div class="admin-form-group">
                    <p style="width: 100%; margin: 10px 0 5px;">↓地図をクリックして座標を設定</p>
                    <div id="map-${index}" class="map-container"></div>
                </div>
                <div class="admin-form-group">
                    <label for="hint-${index}">ヒント:</label>
                    <textarea id="hint-${index}">${point.hint || ''}</textarea>
                </div>
                <div class="admin-form-group">
                    <label for="image-upload-${index}">達成画像:</label>
                    <input type="file" id="image-upload-${index}" accept="image/*" class="image-upload-input" data-index="${index}">
                </div>
                <p>画像プレビュー（スタンプ達成時に表示されます）</p>
                <img id="image-preview-${index}" src="${point.stampedImageSrc || 'stamp_jpg/get.png'}" alt="画像プレビュー" class="stamp-icon">
                <p>↓【現地設置用】このQRコードをスキャンすると上の画像がスタンプされます</p>
                <div class="qr-code-container" id="qrcode-${index}"></div>
            `;
            container.appendChild(pointElement);
 
            // setTimeoutを使い、DOMの描画が完了した後にQRコードを生成する
            // 地図の初期化
            const mapElement = document.getElementById(`map-${index}`);
            const latInput = document.getElementById(`lat-${index}`);
            const lonInput = document.getElementById(`lon-${index}`);

            if (mapElement && latInput && lonInput) {
                const currentLat = parseFloat(latInput.value);
                const currentLon = parseFloat(lonInput.value);

                // ベースレイヤーを定義
                const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                });

                const gsiOrtLayer = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg', {
                    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>'
                });

                // Leaflet地図を初期化し、デフォルトで白地図を表示
                const map = L.map(mapElement, {
                    layers: [osmLayer] // デフォルトで表示するレイヤー
                }).setView([currentLat, currentLon], 15);

                // レイヤーコントロールに追加するベースマップの定義
                const baseLayers = {
                    "白地図": osmLayer,
                    "航空写真": gsiOrtLayer
                };

                // レイヤー切り替えコントロールを地図に追加
                L.control.layers(baseLayers).addTo(map);

                // マーカーを初期位置に配置
                let marker = L.marker([currentLat, currentLon]).addTo(map);

                // 地図クリックイベント
                map.on('click', function(e) {
                    const clickedLat = e.latlng.lat;
                    const clickedLon = e.latlng.lng;

                    // フォームの値を更新
                    latInput.value = clickedLat.toFixed(6);
                    lonInput.value = clickedLon.toFixed(6);

                    // マーカーの位置を更新
                    marker.setLatLng(e.latlng);
                });
            }
            setTimeout(() => {
                const qrCodeElement = document.getElementById(`qrcode-${index}`);
                if (qrCodeElement) {
                    const qrText = point.id; // QRコードには常にIDのみを格納
                    // 念のため、生成前に中身をクリア
                    qrCodeElement.innerHTML = '';
                    new QRCode(qrCodeElement, { text: qrText, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.H });
                }
            }, 0);
        });
    }
 
    // イベントリスナーの設定
    addButton.addEventListener('click', () => {
        const newId = 'point_' + Date.now();
        currentStampPoints.push({
            id: newId,
            name: '新規ポイント',
            latitude: 35.681236, // デフォルト: 東京駅
            longitude: 139.767125,
            stampedImageSrc: '',
            hint: ''
        });
        renderUI();
    });
 
    container.addEventListener('click', (event) => {
        if (event.target.matches('.delete-btn')) {
            const index = parseInt(event.target.dataset.index, 10);
            const pointName = currentStampPoints[index].name || '(新規ポイント)';
            if (confirm(`「${pointName}」を本当に削除しますか？\nこの操作は元に戻せません。`)) {
                currentStampPoints.splice(index, 1);
                renderUI();
            }
        }
    });
 
    // 画像リサイズ処理
    async function processAndResizeImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onerror = reject;
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onerror = reject;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let { width, height } = img;

                    if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
                        const ratio = Math.min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // JPEG形式で品質を指定してBase64文字列を取得
                    resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
                };
            };
        });
    }

    container.addEventListener('change', async (event) => {
        if (event.target.matches('.image-upload-input')) {
            const index = parseInt(event.target.dataset.index, 10);
            const point = currentStampPoints[index];
            const file = event.target.files[0];
 
            if (file && point) {
                if (file.size > MAX_FILE_SIZE_BYTES) {
                    alert(`ファイルサイズが大きすぎます。\n${MAX_FILE_SIZE_MB}MB以下の画像を選択してください。`);
                    event.target.value = ''; // ファイル選択をリセット
                    return;
                }
                point.stampedImageSrc = await processAndResizeImage(file);
                renderUI(); // 画像処理が終わったらUIを再描画して反映
            }
        }
    });
 
    saveButton.addEventListener('click', async () => {
        try {
            syncDataFromUI();
 
            currentStampPoints.forEach(point => {
                if (!point.name || !point.name.trim()) {
                    throw new Error(`ポイントID「${point.id}」の名前が空です。`);
                }
                if (isNaN(point.latitude) || isNaN(point.longitude)) {
                    throw new Error(`ポイントID「${point.id}」の座標に無効な値が入力されています。`);
                }
            });
 
            // コンプリートメッセージを取得
            const completionMessage = document.getElementById('completion-message').value;

            // アップロードするデータオブジェクトを作成
            const dataToUpload = {
                completionMessage: completionMessage,
                points: currentStampPoints
            };
            if (!dataToUpload.points || dataToUpload.points.length === 0) {
                throw new Error("スタンプポイントが1つもありません。");
            }

            // 画像が設定されていないポイントには、デフォルト画像を使用する目印を付ける
            dataToUpload.points.forEach(point => {
                if (!point.stampedImageSrc) {
                    point.stampedImageSrc = 'default_stamped';
                }
            });
 
            saveButton.disabled = true;
            saveButton.textContent = 'URLを生成中...';
 
            // データ保管サービスを jsonblob.com に変更
            const response = await fetch('https://jsonblob.com/api/jsonBlob', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(dataToUpload)
            });
 
            if (!response.ok) {
                // エラーレスポンスがJSON形式でない場合も考慮
                const errorText = await response.text();
                throw new Error(`データ保管庫の作成に失敗しました (Status: ${response.status}): ${errorText}`);
            }
 
            // jsonblob.comはレスポンスヘッダーのLocationにURLを返す
            const locationUrl = response.headers.get('Location');
            if (!locationUrl) {
                throw new Error('データ保管庫のURLが取得できませんでした。');
            }
            const binId = locationUrl.substring(locationUrl.lastIndexOf('/') + 1);
 
            const baseUrl = window.location.href.replace('admin.html', 'mspr.html');
            const fullUrl = `${baseUrl}?bin=${binId}`;
 
            urlOutput.value = fullUrl;
            urlOutput.style.backgroundColor = '#dff9fb';
 
            urlQrcodeElement.innerHTML = '';
            new QRCode(urlQrcodeElement, {
                text: fullUrl,
                width: 200,
                height: 200,
                correctLevel: QRCode.CorrectLevel.L
            });
            document.getElementById('url-qrcode-container').style.display = 'block';
 
            alert('共有用のURLを生成しました。下のテキストエリアからURLをコピーして参加者に共有してください。');
 
        } catch (error) {
            console.error('URL生成エラー:', error);
            alert(`URLの生成に失敗しました: ${error.message}\n\n時間をおいて再度お試しください。`);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = '共有URLを生成';
        }
    });
 
    // アプリケーションの初期化
    function initialize() {
        currentStampPoints = [
            {
                id: 'point_' + Date.now(),
                name: '最初のポイント',
                latitude: 35.681236,
                longitude: 139.767125,
                stampedImageSrc: '',
                hint: '例：東京駅'
            }
        ];
        renderUI();
    }
 
    initialize();
});
