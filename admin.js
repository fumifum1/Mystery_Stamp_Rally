document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('admin-stamp-points-container');
    const saveButton = document.getElementById('save-button');
    const addButton = document.getElementById('add-point-button');
    // モーダル関連の要素
    const shareModal = document.getElementById('share-modal');
    const shareModalCloseBtn = document.getElementById('share-modal-close-btn');
    const modalUrlOutput = document.getElementById('modal-url-output');
    const modalQrcodeElement = document.getElementById('modal-qrcode');
    const copyUrlBtn = document.getElementById('copy-url-btn');
    const downloadQrBtn = document.getElementById('download-qr-btn');
 
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
                    <h3 class="card-title">ポイント ${index + 1}</h3>
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
                <div class="preview-container">
                    <p>画像プレビュー（スタンプ達成時に表示されます）</p>
                    <img id="image-preview-${index}" src="${point.stampedImageSrc || 'stamp_jpg/get.png'}" alt="画像プレビュー" class="stamp-icon">
                </div>
                <div style="text-align: center; margin-top: 15px;">
                    <p>↓【現地設置用】このQRコードをスキャンすると上の画像がスタンプされます</p>
                    <div class="point-qrcode-wrapper">
                         <div class="qr-code-container" id="qrcode-${index}">
                         </div>
                         <button class="download-btn" data-point-index="${index}" title="QRコードをダウンロード"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-download" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg></button>
                     </div>
                </div>
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
                    
                    const qrCode = new QRCodeStyling({
                        width: 150,
                        height: 150,
                        data: qrText,
                        margin: 0,
                        qrOptions: { errorCorrectionLevel: 'H' },
                        dotsOptions: {
                            type: 'dots',
                            color: '#3498db',
                            gradient: {
                                type: 'linear',
                                rotation: 90,
                                colorStops: [{ offset: 0, color: '#3498db' }, { offset: 1, color: '#2c3e50' }]
                            }
                        },
                        cornersSquareOptions: { type: 'dot', color: '#2980b9' },
                        cornersDotOptions: { type: 'dot', color: '#2980b9' },
                        backgroundOptions: { color: '#ffffff' },
                        imageOptions: { hideBackgroundDots: true, imageSize: 0.4, margin: 4 },
                        // 中央のテキストは画像として生成して埋め込む
                        image: createTextDataUrl(`SP${index + 1}`)
                    });

                    qrCode.append(qrCodeElement);
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
 
    // 共有モーダルを閉じるイベント
    shareModalCloseBtn.addEventListener('click', () => {
        shareModal.classList.remove('show');
    });

    // URLコピーボタンのイベント
    copyUrlBtn.addEventListener('click', () => {
        const urlToCopy = modalUrlOutput.value;
        if (!urlToCopy) return;

        navigator.clipboard.writeText(urlToCopy).then(() => {
            // 成功フィードバック
            const originalIcon = copyUrlBtn.innerHTML;
            copyUrlBtn.innerHTML = '✓'; // チェックマークに変更
            copyUrlBtn.title = 'コピーしました！';
            copyUrlBtn.style.backgroundColor = '#27ae60'; // 緑色に変更

            setTimeout(() => {
                copyUrlBtn.innerHTML = originalIcon;
                copyUrlBtn.title = 'URLをクリップボードにコピー';
                copyUrlBtn.style.backgroundColor = ''; // 元の色に戻す
            }, 2000); // 2秒後に元に戻す
        }).catch(err => {
            console.error('クリップボードへのコピーに失敗しました:', err);
            alert('コピーに失敗しました。');
        });
    });

    // QRコードダウンロードボタンのイベント
    downloadQrBtn.addEventListener('click', () => {
        const qrCanvas = modalQrcodeElement.querySelector('canvas');
        const qrImg = modalQrcodeElement.querySelector('img');

        if (qrCanvas) {
            const link = document.createElement('a');
            link.download = 'rally-qrcode.png';
            link.href = qrCanvas.toDataURL('image/png');
            link.click();
        } else if (qrImg) {
            // qrcode.jsがimgタグを生成した場合のフォールバック
            const link = document.createElement('a');
            link.download = 'rally-qrcode.png';
            link.href = qrImg.src;
            link.click();
        }
    });

    container.addEventListener('click', (event) => {
        const downloadButton = event.target.closest('.download-btn[data-point-index]');
        if (downloadButton) {
            const index = downloadButton.dataset.pointIndex;
            const qrCodeElement = document.getElementById(`qrcode-${index}`);
            const qrCanvas = qrCodeElement.querySelector('canvas');

            if (qrCanvas) {
                const link = document.createElement('a');
                // ファイル名にポイント名を含める
                const pointName = currentStampPoints[index]?.name.replace(/\s+/g, '_') || `point_${index + 1}`;
                link.download = `point-qrcode-${pointName}.png`;
                link.href = qrCanvas.toDataURL('image/png');
                link.click();
            }
        }
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
            const rallyTitle = document.getElementById('rally-title').value;
            const completionMessage = document.getElementById('completion-message').value;

            // アップロードするデータオブジェクトを作成
            const dataToUpload = {
                title: rallyTitle,
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
 
            // モーダルにURLとQRコードを設定
            modalUrlOutput.value = fullUrl;
            modalQrcodeElement.innerHTML = '';
            const qrCode = new QRCodeStyling({
                width: 200,
                height: 200,
                data: fullUrl,
                margin: 0,
                qrOptions: { errorCorrectionLevel: 'H' },
                dotsOptions: {
                    type: 'dots',
                    color: '#3498db',
                    gradient: {
                        type: 'linear',
                        rotation: 90,
                        colorStops: [{ offset: 0, color: '#f1c40f' }, { offset: 1, color: '#e74c3c' }]
                    }
                },
                cornersSquareOptions: { type: 'dot', color: '#e67e22' },
                cornersDotOptions: { type: 'dot', color: '#e67e22' },
                backgroundOptions: { color: '#ffffff' },
                imageOptions: { hideBackgroundDots: true, imageSize: 0.4, margin: 4 },
                image: createTextDataUrl('Rally')
            });
            
            qrCode.append(modalQrcodeElement);
            
            // モーダルを表示
            shareModal.classList.add('show');
        } catch (error) {
            console.error('URL生成エラー:', error);
            alert(`URLの生成に失敗しました: ${error.message}\n\n時間をおいて再度お試しください。`);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = '共有URLを生成';
        }
    });

    // 中央に表示するテキストを画像(DataURL)に変換するヘルパー関数
    function createTextDataUrl(text) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 128;

        // 白い背景
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // テキストのスタイル
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 32px "Noto Sans JP", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        return canvas.toDataURL();
    }
 
    // アプリケーションの初期化
    function initialize() {
        document.getElementById('rally-title').value = 'Mystery Stamp Rally'; // デフォルトタイトルを設定
        currentStampPoints = [ // 以前の修正でポイントIDの表示を連番に変更したため、ここも修正
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
