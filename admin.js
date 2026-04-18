document.addEventListener('DOMContentLoaded', () => {
    // 達成画像未設定時のデフォルトプレビュー画像
    // 達成画像未設定(または独自の画像を使わない設定)時のデフォルトスタンプ画像
    const ADMIN_DEFAULT_STAMP_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='44' fill='none' stroke='%23e74c3c' stroke-width='4'/%3E%3Ccircle cx='50' cy='50' r='38' fill='none' stroke='%23e74c3c' stroke-width='1.5'/%3E%3Ctext x='50' y='53' font-family='sans-serif' font-size='14' font-weight='bold' fill='%23e74c3c' text-anchor='middle' transform='rotate(-15, 50, 53)'%3EComplete!!%3C/text%3E%3C/svg%3E";
    let mapInstances = {}; // 各スタンプカードの地図インスタンスを保持
    let modalMapInstance = null; // 拡大地図モーダル用の地図インスタンス
    let editingPointIndexForModal = null; // 現在モーダルで編集中のポイントインデックス
    const container = document.getElementById('admin-stamp-points-container');
    const saveButton = document.getElementById('save-button');
    const addButton = document.getElementById('add-point-button');
    const previewButton = document.getElementById('preview-button');
    // モーダル関連の要素
    const shareModal = document.getElementById('share-modal');
    const shareModalCloseBtn = document.getElementById('share-modal-close-btn');
    const modalUrlOutput = document.getElementById('modal-url-output');
    const modalQrcodeElement = document.getElementById('modal-qrcode');
    const copyUrlBtn = document.getElementById('copy-url-btn');
    const downloadQrBtn = document.getElementById('download-qr-btn');
    const startTutorialBtn = document.getElementById('start-tutorial-btn');
    // 初回訪問モーダル関連
    const welcomeModal = document.getElementById('welcome-modal');
    const showWelcomeModalBtn = document.getElementById('show-welcome-modal-btn');
    const welcomeModalCloseBtn = document.getElementById('welcome-modal-close-btn');

    // 画像設定の定数
    const MAX_IMAGE_WIDTH = 200; // 画像の最大幅 (URLサイズ抑制のため 250->200)
    const MAX_IMAGE_HEIGHT = 200; // 画像の最大高さ
    const STAMP_IMAGE_QUALITY = 0.4; // 達成画像の画質 (0.7->0.4)
    const HINT_IMAGE_QUALITY = 0.3;  // ヒント画像の画質 (0.4->0.3)
    const LARGE_FILE_THRESHOLD_MB = 1; // 高圧縮を適用するファイルサイズの閾値(MB)
    const LARGE_FILE_THRESHOLD_BYTES = LARGE_FILE_THRESHOLD_MB * 1024 * 1024;
    const MAX_TOTAL_JSON_SIZE = 256 * 1024; // JSON全体の最大サイズ目安 (256KB)
    const MAX_DATA_URL_SIZE_BYTES = 100 * 1024; // 個別画像の目安サイズ (100KB)

    let currentStampPoints = [];
    // mapInstances は冒頭で宣言済みのため、ここでは追加しない

 
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
            const qrRequiredInput = document.getElementById(`qr-required-${index}`);
            point.qrRequired = qrRequiredInput ? qrRequiredInput.checked : (point.qrRequired !== undefined ? point.qrRequired : true);
            
            const useHintInput = document.getElementById(`use-hint-${index}`);
            point.useHint = useHintInput ? useHintInput.checked : (point.useHint !== undefined ? point.useHint : !!point.hint);

            const useHintImageInput = document.getElementById(`use-hint-image-${index}`);
            point.useHintImage = useHintImageInput ? useHintImageInput.checked : (point.useHintImage !== undefined ? point.useHintImage : !!point.hintImageSrc);

            const useCustomStampedImageInput = document.getElementById(`use-custom-stamped-image-${index}`);
            point.useCustomStampedImage = useCustomStampedImageInput ? useCustomStampedImageInput.checked : (point.useCustomStampedImage !== undefined ? point.useCustomStampedImage : (point.stampedImageSrc && point.stampedImageSrc !== 'default_stamped'));

            // 重要：QRスキャン不要な場合は文言を「スタンプゲット！」に固定
            if (point.qrRequired === false) {
                point.acquisitionButtonLabel = 'スタンプゲット！';
            } else {
                point.acquisitionButtonLabel = 'スタンプをゲット！'; // または既存の値を維持（今回はシンプルにスキャン必須ならデフォルト）
            }
            
            // 座標設定方法の同期
            const methodSelect = pointElements[index].querySelector('.method-select');
            point.coordMethod = methodSelect ? methodSelect.value : (point.coordMethod || 'current');

            // 画像指定モードの同期
            const hintImageMode = document.querySelector(`input[name="hint-image-mode-${index}"]:checked`)?.value;
            if (hintImageMode) point.hintImageMode = hintImageMode;
            if (point.hintImageMode === 'url') {
                point.hintImageSrc = document.getElementById(`hint-image-url-${index}`)?.value || '';
            }

            const stampedImageMode = document.querySelector(`input[name="stamped-image-mode-${index}"]:checked`)?.value;
            if (stampedImageMode) point.stampedImageMode = stampedImageMode;
            if (point.stampedImageMode === 'url') {
                point.stampedImageSrc = document.getElementById(`stamped-image-url-${index}`)?.value || '';
            }

            // hintImageSrc(file方式)などはイベントリスナーで直接更新されるためここでは上書きしない
        });
    }
 
    // currentStampPoints配列に基づいてUIを再描画する
    function renderUI() {
        container.innerHTML = '';
        currentStampPoints.forEach((point, index) => {
            const pointElement = document.createElement('div');
            pointElement.className = 'stamp-card';
            pointElement.innerHTML = `
                <div class="stamp-card-header">
                    <h3 class="card-title">ポイント ${index + 1}</h3>
                    <button class="delete-btn" data-index="${index}" title="このポイントを削除"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg></button>
                </div>
                <div class="admin-form-group vertical-group">
                    <label for="name-${index}">ポイントタイトル</label>
                    <input type="text" id="name-${index}" value="${point.name || ''}" placeholder="例：東京駅">
                </div>
                <div class="admin-form-group vertical-group coord-selector-wrapper">
                    <label>座標の設定方法</label>
                    <select class="method-select" data-index="${index}">
                        <option value="current" ${(!point.coordMethod || point.coordMethod === 'current') ? 'selected' : ''}>① 現在地</option>
                        <option value="map" ${point.coordMethod === 'map' ? 'selected' : ''}>② 地図から取得</option>
                        <option value="manual" ${point.coordMethod === 'manual' ? 'selected' : ''}>③ 手動入力</option>
                    </select>
                </div>

                <!-- 各セクションを保持するコンテナ -->
                <div class="coord-sections-container">
                    <!-- 現在地から取得セクション -->
                    <div id="section-current-${index}" class="coord-section current-section" style="${(!point.coordMethod || point.coordMethod === 'current') ? '' : 'display: none;'}">
                        <div class="admin-form-group">
                            <button type="button" class="btn btn-secondary get-location-btn btn-sm-text" data-index="${index}">現在地を取得</button>
                        </div>
                    </div>

                    <!-- 地図から取得セクション -->
                    <div id="section-map-${index}" class="coord-section map-section" style="${point.coordMethod === 'map' ? '' : 'display: none;'}">
                        <div class="admin-form-group">
                            <button type="button" class="btn btn-secondary open-map-modal-btn" data-index="${index}">地図を拡大して設定</button>
                        </div>
                        <p class="coord-hint">※大きな地図から正確な場所を指定できます</p>
                    </div>

                    <!-- 手動入力セクション -->
                    <div id="section-manual-${index}" class="coord-section manual-section" style="${point.coordMethod === 'manual' ? '' : 'display: none;'}">
                        <div class="admin-form-group">
                            <label for="lat-${index}">緯度:</label>
                            <input type="number" step="any" id="lat-${index}" value="${point.latitude || 0}">
                        </div>
                        <div class="admin-form-group">
                            <label for="lon-${index}">経度:</label>
                            <input type="number" step="any" id="lon-${index}" value="${point.longitude || 0}">
                        </div>
                    </div>
                </div>

                <!-- 取得済み座標の確認用 -->
                <div id="coord-info-${index}" class="coord-display-info" style="${point.coordMethod === 'manual' ? 'display: none;' : ''}">
                    <p>設定中の座標: <span id="display-lat-${index}">${point.latitude}</span>, <span id="display-lon-${index}">${point.longitude}</span></p>
                    <input type="hidden" id="hidden-lat-${index}" value="${point.latitude || 0}">
                    <input type="hidden" id="hidden-lon-${index}" value="${point.longitude || 0}">
                </div>

                <div class="admin-form-group checkbox-group" style="margin-top: 20px;">
                    <input type="checkbox" id="qr-required-${index}" ${point.qrRequired !== false ? 'checked' : ''}>
                    <label for="qr-required-${index}">QRコードのスキャンを必須にする</label>
                </div>

                <div class="admin-form-group checkbox-group">
                    <input type="checkbox" id="use-hint-${index}" ${point.useHint ? 'checked' : ''} class="use-hint-checkbox" data-index="${index}">
                    <label for="use-hint-${index}">ヒント(文字)を入力する</label>
                </div>

                <!-- ヒント入力コンテナ -->
                <div id="hint-section-container-${index}" class="hint-section-container" style="${point.useHint ? '' : 'display: none;'}">
                    <div class="admin-form-group vertical-group">
                        <textarea id="hint-${index}" placeholder="ヒントを入力してください">${point.hint || ''}</textarea>
                    </div>
                </div>

                <div class="admin-form-group checkbox-group">
                    <input type="checkbox" id="use-hint-image-${index}" ${point.useHintImage ? 'checked' : ''} class="use-hint-image-checkbox" data-index="${index}">
                    <label for="use-hint-image-${index}">ヒント画像を入れる</label>
                </div>

                <div id="hint-image-section-container-${index}" class="hint-section-container" style="${point.useHintImage ? '' : 'display: none;'}">
                    <div class="admin-form-group">
                        <div class="image-mode-selector">
                            <label><input type="radio" name="hint-image-mode-${index}" value="file" ${point.hintImageMode !== 'url' ? 'checked' : ''} class="hint-image-mode-radio" data-index="${index}"> 画像をアップロード</label>
                            <label><input type="radio" name="hint-image-mode-${index}" value="url" ${point.hintImageMode === 'url' ? 'checked' : ''} class="hint-image-mode-radio" data-index="${index}"> URLを指定</label>
                        </div>
                        <div class="admin-form-row">
                            <div class="hint-image-controls">
                                <div id="hint-image-file-input-${index}" style="${point.hintImageMode !== 'url' ? '' : 'display: none;'}">
                                    ${point.hintImageSrc && point.hintImageSrc.startsWith('data:')
                                        ? `
                                            <div class="hint-image-preview-wrapper">
                                                <img src="${point.hintImageSrc}" alt="ヒント画像プレビュー" class="hint-image-preview">
                                                <button class="delete-btn delete-hint-image-btn" data-index="${index}" title="ヒント画像を削除"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg></button>
                                            </div>
                                        ` : `
                                            <label for="hint-image-upload-${index}" class="button-2">ヒント画像を選択</label>
                                            <input type="file" id="hint-image-upload-${index}" accept="image/*" class="hint-image-upload-input" data-index="${index}" style="display: none;" >
                                        `}
                                </div>
                                <div id="hint-image-url-input-${index}" style="${point.hintImageMode === 'url' ? '' : 'display: none;'}">
                                    <input type="text" id="hint-image-url-${index}" value="${point.hintImageMode === 'url' ? point.hintImageSrc : ''}" placeholder="https://example.com/image.jpg" class="hint-image-url-input" data-index="${index}">
                                    <p class="input-hint">※Googleドライブ, Gyazo, Dropbox等の直接リンクを入力してください。</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="admin-form-group checkbox-group">
                    <input type="checkbox" id="use-custom-stamped-image-${index}" ${point.useCustomStampedImage ? 'checked' : ''} class="use-custom-stamped-image-checkbox" data-index="${index}">
                    <label for="use-custom-stamped-image-${index}">独自の達成画像を使用する</label>
                </div>

                <!-- 達成画像アップロードコンテナ -->
                <div id="stamped-image-section-container-${index}" class="hint-section-container" style="${point.useCustomStampedImage ? '' : 'display: none;'}">
                    <div class="admin-form-group">
                        <div class="image-mode-selector">
                            <label><input type="radio" name="stamped-image-mode-${index}" value="file" ${point.stampedImageMode !== 'url' ? 'checked' : ''} class="stamped-image-mode-radio" data-index="${index}"> 画像をアップロード</label>
                            <label><input type="radio" name="stamped-image-mode-${index}" value="url" ${point.stampedImageMode === 'url' ? 'checked' : ''} class="stamped-image-mode-radio" data-index="${index}"> URLを指定</label>
                        </div>
                        <div class="admin-form-row">
                            <div class="stamped-image-controls">
                                <div id="stamped-image-file-input-${index}" style="${point.stampedImageMode !== 'url' ? '' : 'display: none;'}">
                                    <label for="image-upload-${index}" class="button-2">画像ファイルを選択</label>
                                    <input type="file" id="image-upload-${index}" accept="image/*" class="image-upload-input" data-index="${index}" style="display: none;">
                                </div>
                                <div id="stamped-image-url-input-${index}" style="${point.stampedImageMode === 'url' ? '' : 'display: none;'}">
                                    <input type="text" id="stamped-image-url-${index}" value="${point.stampedImageMode === 'url' ? point.stampedImageSrc : ''}" placeholder="https://example.com/image.jpg" class="stamped-image-url-input" data-index="${index}">
                                    <p class="input-hint">※Googleドライブ, Gyazo, Dropbox等の直接リンクを入力してください。</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="admin-media-container" style="${point.qrRequired === false ? 'opacity: 0.6;' : ''}">
                    <div class="media-item">
                        <p>画像プレビュー（達成時に表示されます）</p>
                        <img id="image-preview-${index}" src="${point.stampedImageSrc && point.stampedImageSrc !== 'default_stamped' ? point.stampedImageSrc : ADMIN_DEFAULT_STAMP_IMG}" alt="画像プレビュー" class="stamp-icon">
                    </div>
                    <div class="media-item" style="${point.qrRequired === false ? 'display: none;' : ''}">
                        <p>↓【現地設置用】このQRコードをスキャンすると上の画像がスタンプされます</p>
                        <div class="point-qrcode-wrapper">
                            <div class="qr-code-container" id="qrcode-${index}">
                            </div>
                            <button class="download-btn" data-point-index="${index}" title="QRコードをダウンロード"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-download" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg></button>
                        </div>
                    </div>
                    ${point.qrRequired === false ? `
                        <div class="media-itemDirect">
                            <p style="color: #e67e22; font-weight: bold;">※QRコード不要設定：エリア内に入ると直接スタンプ可能になります。</p>
                        </div>
                    ` : ''}
                </div>
            `;
            container.appendChild(pointElement);
        });

        // QRコード生成（DOM追加後に実行）
        currentStampPoints.forEach((point, index) => {
            setTimeout(() => {
                const qrCodeElement = document.getElementById(`qrcode-${index}`);
                if (qrCodeElement && point.qrRequired !== false) {
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
        updateDataSizeIndicator();
    }

    // データ量の目安を計算してUIに表示する
    function updateDataSizeIndicator() {
        const display = document.getElementById('data-size-display');
        if (!display) return;

        try {
            // syncDataFromUI() は呼ばずに、現在の currentStampPoints から概算
            const rallyTitle = document.getElementById('rally-title')?.value || '';
            const completionMessage = document.getElementById('completion-message')?.value || '';
            
            const tempData = {
                title: rallyTitle,
                completionMessage: completionMessage,
                points: currentStampPoints.map(p => ({
                    id: p.id,
                    name: p.name,
                    latitude: p.latitude,
                    longitude: p.longitude,
                    stampedImageSrc: p.useCustomStampedImage ? (p.stampedImageSrc || 'default_stamped') : 'default_stamped',
                    hint: p.useHint ? p.hint : '',
                    hintImageSrc: p.useHintImage ? p.hintImageSrc : ''
                }))
            };

            const size = JSON.stringify(tempData).length;
            const sizeKB = (size / 1024).toFixed(1);
            display.textContent = `データ量目安: ${sizeKB}KB`;

            if (size > MAX_TOTAL_JSON_SIZE) {
                display.style.color = '#e74c3c'; // 赤
                display.style.fontWeight = 'bold';
                display.textContent += ' (容量大：エラーの可能性あり)';
            } else if (size > MAX_TOTAL_JSON_SIZE * 0.7) {
                display.style.color = '#e67e22'; // オレンジ
                display.style.fontWeight = 'normal';
            } else {
                display.style.color = '#7f8c8d'; // グレー
                display.style.fontWeight = 'normal';
            }
        } catch (e) {
            console.warn('Size calculation failed', e);
        }
    }
 
    // イベントリスナーの設定
    addButton.addEventListener('click', () => {
        syncDataFromUI(); // UIの現在の値をデータに同期
        const newId = 'point_' + Date.now();
        currentStampPoints.push({
            id: newId,
            name: '新規ポイント',
            latitude: 35.681236, // デフォルト: 東京駅
            longitude: 139.767125,
            stampedImageSrc: '',
            hint: '',
            hintImageSrc: '', // ヒント画像用のプロパティを追加
            hintImageMode: 'file', // 'file' or 'url'
            stampedImageMode: 'file', // 'file' or 'url'
            useHint: false,   // ヒントを使用するかどうか
            useHintImage: false, // ヒント画像を使用するかどうか
            useCustomStampedImage: false, // 独自の達成画像を使用するかどうか
            qrRequired: true,
            coordMethod: 'current'
        });
        renderUI();
    });
 
    // 共有モーダルを閉じるイベント
    shareModalCloseBtn.addEventListener('click', () => {
        shareModal.classList.remove('show');
    });

    // チュートリアルを開始するイベント
    startTutorialBtn.addEventListener('click', () => {
        runTutorial();
    });

    // 注意事項モーダルを表示するイベント
    showWelcomeModalBtn.addEventListener('click', () => {
        welcomeModal.classList.add('show');
    });

    // タイトルやメッセージ入力時にもサイズ表示を更新
    document.getElementById('rally-title').addEventListener('input', updateDataSizeIndicator);
    document.getElementById('completion-message').addEventListener('input', updateDataSizeIndicator);

    // --- 自作チュートリアル機能 ---
    function runTutorial() {
        const steps = [
            { 
                title: 'ステップ1: ラリーの基本設定', 
                image: 'https://fumifum1.github.io/Mystery_Stamp_Rally/tutorial_images/step1.JPG', 
                description: 'まず、スタンプラリーの「タイトル」と、クリアした時の「コンプリート時メッセージ」を入力します。これらは参加者が見る最初の画面と最後の画面になります。' 
            },
            { 
                title: 'ステップ2: ポイントの基本情報', 
                image: 'https://fumifum1.github.io/Mystery_Stamp_Rally/tutorial_images/step2.JPG', 
                description: '「スタンプポイントを追加」ボタンでポイントを増やせます。各ポイントの「名前」と「緯度・経度」を設定しましょう。「地図から座標を取得」を使うと、地図をクリックして簡単に座標を入力できます。' 
            },
            { 
                title: 'ステップ3: ヒントとヒント画像', 
                image: 'https://fumifum1.github.io/Mystery_Stamp_Rally/tutorial_images/step3.JPG', 
                description: '参加者への「ヒント」をテキストで入力します。さらに、「ヒント画像を追加」ボタンから画像を設定することも可能です。謎解きの鍵となる画像などを設定しましょう。' 
            },
            { 
                title: 'ステップ4: 達成画像とQRコード', 
                image: 'https://fumifum1.github.io/Mystery_Stamp_Rally/tutorial_images/step4.JPG', 
                description: '「達成画像を選択」ボタンで、スタンプを押した時に表示される画像を設定します。設定後、その下にある「現地設置用QRコード」をダウンロードし、印刷して各ポイントに設置してください。' 
            },
            { 
                title: 'ステップ5: ラリーの公開', 
                image: 'https://fumifum1.github.io/Mystery_Stamp_Rally/tutorial_images/step5.JPG', 
                description: 'すべての設定が終わったら、「共有URLを生成」ボタンを押します。表示されたURLまたはQRコードを参加者に共有すれば、ラリーを開始できます！' 
            }
        ];

        let currentStep = 0;
        const overlay = document.createElement('div');
        overlay.className = 'tutorial-overlay';
        overlay.onclick = endTutorial; // 背景クリックで閉じる

        const popover = document.createElement('div');
        popover.className = 'tutorial-popover';
        popover.onclick = (e) => e.stopPropagation(); // ポップオーバー内のクリックは伝播させない

        document.body.appendChild(overlay);
        document.body.appendChild(popover);

        function showStep(index) {
            const step = steps[index];

            popover.innerHTML = `
                <h4>${step.title}</h4>
                ${step.image ? `<img src="${step.image}" alt="${step.title}" class="tutorial-image">` : ''}
                <p>${step.description}</p>
                <div class="tutorial-navigation">
                    <button id="tutorial-prev" class="btn btn-secondary" ${index === 0 ? 'disabled' : ''}>戻る</button>
                    <span class="step-counter">${index + 1} / ${steps.length}</span>
                    <button id="tutorial-next" class="btn btn-primary">${index === steps.length - 1 ? '完了' : '次へ'}</button>
                </div>
                <button id="tutorial-close" class="modal-close-btn" title="閉じる">&times;</button>
            `;

            setTimeout(() => popover.classList.add('show'), 50);

            document.getElementById('tutorial-close').onclick = endTutorial;

            document.getElementById('tutorial-next').onclick = () => {
                if (currentStep < steps.length - 1) {
                    currentStep++;
                    showStep(currentStep);
                } else {
                    endTutorial();
                }
            };

            document.getElementById('tutorial-prev').onclick = () => {
                if (currentStep > 0) {
                    currentStep--;
                    showStep(currentStep);
                }
            };
        }

        function endTutorial() {
            overlay.classList.remove('show');
            popover.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(overlay);
                document.body.removeChild(popover);
            }, 300);
        }

        overlay.classList.add('show');
        showStep(currentStep);
    }

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
        // 拡大地図モーダルを開くボタン
        const openMapModalBtn = event.target.closest('.open-map-modal-btn');
        if (openMapModalBtn) {
            const index = parseInt(openMapModalBtn.dataset.index, 10);
            openMapModal(index);
            return;
        }

        // 現在地の座標を取得ボタンの処理
        const getLocationBtn = event.target.closest('.get-location-btn');
        if (getLocationBtn) {
            const index = parseInt(getLocationBtn.dataset.index, 10);
            if (!navigator.geolocation) {
                alert("お使いのブラウザは位置情報をサポートしていません。");
                return;
            }

            getLocationBtn.disabled = true;
            getLocationBtn.textContent = "取得中...";

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude.toFixed(6);
                    const lon = position.coords.longitude.toFixed(6);
                    
                    // データを更新
                    currentStampPoints[index].latitude = parseFloat(lat);
                    currentStampPoints[index].longitude = parseFloat(lon);
                    
                    alert("現在地を取得しました。");
                    renderUI(); // 画面を更新して値を表示
                },
                (error) => {
                    console.error("位置情報取得エラー:", error);
                    alert("位置情報の取得に失敗しました。設定を確認してください。");
                    getLocationBtn.disabled = false;
                    getLocationBtn.textContent = "現在地の座標を取得して入力";
                },
                { enableHighAccuracy: true }
            );
            return;
        }

        // 地図表示切り替えリンクの処理 (これは廃止されたが念のため互換性維持するか削除するか。今回はUIから消したので削除気味)
        // QRコードダウンロードボタンの処理
        const downloadButton = event.target.closest('.download-btn[data-point-index]');
        if (downloadButton) {
            const index = parseInt(downloadButton.dataset.pointIndex, 10);
            const qrCodeElement = document.getElementById(`qrcode-${index}`);
            const qrCanvas = qrCodeElement.querySelector('canvas');
    
            if (qrCanvas) {
                const link = document.createElement('a');
                const pointName = currentStampPoints[index]?.name.replace(/\s+/g, '_') || `point_${index + 1}`;
                link.download = `point-qrcode-${pointName}.png`;
                link.href = qrCanvas.toDataURL('image/png');
                link.click();
            }
            return;
        }

        // ヒント画像削除ボタンの処理
        const deleteHintImageBtn = event.target.closest('.delete-hint-image-btn');
        if (deleteHintImageBtn) {
            const index = parseInt(deleteHintImageBtn.dataset.index, 10);
            if (currentStampPoints[index]) {
                currentStampPoints[index].hintImageSrc = '';
                renderUI();
            }
            return;
        }

        // 削除ボタンの処理
        const deleteButton = event.target.closest('.delete-btn:not(.delete-hint-image-btn)');
        if (deleteButton) {
            const index = parseInt(deleteButton.dataset.index, 10);
            const pointName = currentStampPoints[index].name || '(新規ポイント)';
            if (confirm(`「${pointName}」を本当に削除しますか？\nこの操作は元に戻せません。`)) {
                currentStampPoints.splice(index, 1);
                renderUI();
            }
            return;
        }
    });

    container.addEventListener('change', async (event) => {
        // 座標設定方法の切り替え処理 (プルダウン)
        const methodSelect = event.target.closest('.method-select');
        if (methodSelect) {
            const index = parseInt(methodSelect.dataset.index, 10);
            const method = methodSelect.value;
            
            if (currentStampPoints[index]) {
                currentStampPoints[index].coordMethod = method;
                
                // DOM要素の表示切り替え (renderUIを使わずに切り替え)
                const card = methodSelect.closest('.stamp-card');
                const sections = card.querySelectorAll('.coord-section');
                sections.forEach(sec => sec.style.display = 'none');
                
                const targetSection = card.querySelector(`.coord-section.${method}-section`);
                if (targetSection) {
                    targetSection.style.display = 'block';
                    // 地図の場合、表示された瞬間にサイズを再計算
                    if (method === 'map' && mapInstances[index]) {
                        setTimeout(() => mapInstances[index].invalidateSize(), 10);
                    }
                }
                
                // 確認用表示の制御
                const infoSection = document.getElementById(`coord-info-${index}`);
                if (infoSection) {
                    infoSection.style.display = (method === 'manual') ? 'none' : 'block';
                }
            }
            return;
        }

        // ヒント画像使用チェックボックスの切り替え処理
        const useHintImageCheckbox = event.target.closest('.use-hint-image-checkbox');
        if (useHintImageCheckbox) {
            const index = parseInt(useHintImageCheckbox.dataset.index, 10);
            const isChecked = useHintImageCheckbox.checked;
            
            if (currentStampPoints[index]) {
                currentStampPoints[index].useHintImage = isChecked;
                
                // DOM要素の表示切り替え
                const container = document.getElementById(`hint-image-section-container-${index}`);
                if (container) {
                    container.style.display = isChecked ? 'block' : 'none';
                }
            }
            return;
        }

        // ヒント使用チェックボックスの切り替え処理
        const useHintCheckbox = event.target.closest('.use-hint-checkbox');
        if (useHintCheckbox) {
            const index = parseInt(useHintCheckbox.dataset.index, 10);
            const isChecked = useHintCheckbox.checked;
            
            if (currentStampPoints[index]) {
                currentStampPoints[index].useHint = isChecked;
                
                // DOM要素の表示切り替え
                const container = document.getElementById(`hint-section-container-${index}`);
                if (container) {
                    container.style.display = isChecked ? 'block' : 'none';
                }
            }
            return;
        }

        // QR必須チェックボックスの切り替えを即座に反映
        if (event.target.id && event.target.id.startsWith('qr-required-')) {
            syncDataFromUI();
            renderUI();
            return;
        }

        // 独自の達成画像使用チェックボックスの切り替え処理
        const useCustomStampedImageCheckbox = event.target.closest('.use-custom-stamped-image-checkbox');
        if (useCustomStampedImageCheckbox) {
            const index = parseInt(useCustomStampedImageCheckbox.dataset.index, 10);
            const isChecked = useCustomStampedImageCheckbox.checked;
            
            if (currentStampPoints[index]) {
                currentStampPoints[index].useCustomStampedImage = isChecked;
                
                // DOM要素の表示切り替えとプレビューの更新
                const container = document.getElementById(`stamped-image-section-container-${index}`);
                if (container) {
                    container.style.display = isChecked ? 'block' : 'none';
                }
                const previewImg = document.getElementById(`image-preview-${index}`);
                if (previewImg) {
                    previewImg.src = (isChecked && currentStampPoints[index].stampedImageSrc && currentStampPoints[index].stampedImageSrc !== 'default_stamped') 
                        ? currentStampPoints[index].stampedImageSrc 
                        : ADMIN_DEFAULT_STAMP_IMG;
                }
            }
            return;
        }
        // 画像アップロードの処理
        if (event.target.matches('.image-upload-input')) {
            const index = parseInt(event.target.dataset.index, 10);
            const point = currentStampPoints[index];
            const file = event.target.files[0];
 
            if (file && point) {
                try {
                    syncDataFromUI(); // 他のフォームの値をデータに同期
                    const resizedImageSrc = await processAndResizeImage(file, STAMP_IMAGE_QUALITY);
                    point.stampedImageSrc = resizedImageSrc;
                    renderUI(); // 画像処理が終わったらUIを再描画して反映
                    updateDataSizeIndicator(); // サイズ表示を更新
                } catch (error) {
                    alert(error.message);
                    event.target.value = ''; // ファイル選択をリセット
                }
            }
        }
        // ヒント画像アップロードの処理
        if (event.target.matches('.hint-image-upload-input')) {
            const index = parseInt(event.target.dataset.index, 10);
            const point = currentStampPoints[index];
            const file = event.target.files[0];
 
            if (file && point) {
                try {
                    syncDataFromUI(); // 他のフォームの値をデータに同期
                    const resizedImageSrc = await processAndResizeImage(file, HINT_IMAGE_QUALITY);
                    point.hintImageSrc = resizedImageSrc;
                    renderUI(); // 画像処理が終わったらUIを再描画して反映
                    updateDataSizeIndicator(); // サイズ表示を更新
                } catch (error) {
                    alert(error.message);
                    event.target.value = ''; // ファイル選択をリセット
                }
            }
        }

        // ヒント画像入力モード切り替え
        const hintImageModeRadio = event.target.closest('.hint-image-mode-radio');
        if (hintImageModeRadio) {
            const index = parseInt(hintImageModeRadio.dataset.index, 10);
            const mode = hintImageModeRadio.value;
            if (currentStampPoints[index]) {
                currentStampPoints[index].hintImageMode = mode;
                // 表示切替
                document.getElementById(`hint-image-file-input-${index}`).style.display = mode === 'file' ? '' : 'none';
                document.getElementById(`hint-image-url-input-${index}`).style.display = mode === 'url' ? '' : 'none';
                updateDataSizeIndicator();
            }
            return;
        }

        // 達成画像入力モード切り替え
        const stampedImageModeRadio = event.target.closest('.stamped-image-mode-radio');
        if (stampedImageModeRadio) {
            const index = parseInt(stampedImageModeRadio.dataset.index, 10);
            const mode = stampedImageModeRadio.value;
            if (currentStampPoints[index]) {
                currentStampPoints[index].stampedImageMode = mode;
                // 表示切替
                document.getElementById(`stamped-image-file-input-${index}`).style.display = mode === 'file' ? '' : 'none';
                document.getElementById(`stamped-image-url-input-${index}`).style.display = mode === 'url' ? '' : 'none';
                
                // プレビューの即時反映（URLモード時）
                if (mode === 'url') {
                    const url = document.getElementById(`stamped-image-url-${index}`).value;
                    document.getElementById(`image-preview-${index}`).src = url || ADMIN_DEFAULT_STAMP_IMG;
                } else {
                    const src = currentStampPoints[index].stampedImageSrc;
                    document.getElementById(`image-preview-${index}`).src = (src && src.startsWith('data:')) ? src : ADMIN_DEFAULT_STAMP_IMG;
                }
                updateDataSizeIndicator();
            }
            return;
        }

        // URL直接入力時のプレビュー更新リスナー
        if (event.target.matches('.stamped-image-url-input')) {
            const index = parseInt(event.target.dataset.index, 10);
            const url = event.target.value;
            if (currentStampPoints[index]) {
                currentStampPoints[index].stampedImageSrc = url;
                document.getElementById(`image-preview-${index}`).src = url || ADMIN_DEFAULT_STAMP_IMG;
                updateDataSizeIndicator();
            }
            return;
        }

        if (event.target.matches('.hint-image-url-input')) {
            updateDataSizeIndicator();
            return;
        }

    });

    // 画像リサイズ処理
    async function processAndResizeImage(file, targetQuality = 0.7) {
        return new Promise((resolve, reject) => {
            // 元々の品質設定を上書き（指定があればそれを使う）
            const quality = targetQuality;

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

                    // JPEG形式で品質を指定してDataURLを取得
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);

                    // リサイズ後のデータサイズが大きすぎる場合はエラーを投げる
                    if (dataUrl.length > MAX_DATA_URL_SIZE_BYTES) {
                        return reject(new Error('画像ファイルが大きすぎます。もう少し小さい画像を選択するか、画像の数を減らしてください。'));
                    }
                    resolve(dataUrl);
                };
            };
        });
    }

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
 
            const rallyTitle = document.getElementById('rally-title').value;
            const completionMessage = document.getElementById('completion-message').value;

            // アップロードするデータオブジェクトを作成
            const dataToUpload = {
                title: rallyTitle,
                completionMessage: completionMessage,
                points: JSON.parse(JSON.stringify(currentStampPoints)) // ディープコピーを作成
            };

            // 参加者の混乱を避けるため、ヒントがオフの場合はデータを空にする
            dataToUpload.points.forEach(point => {
                if (!point.useHint) {
                    point.hint = '';
                }
                if (!point.useHintImage) {
                    point.hintImageSrc = '';
                }
                // 不要な内部フラグは削除しておく（オプション）
                // delete point.useHint; 
                // delete point.useHintImage;
            });

            if (!dataToUpload.points || dataToUpload.points.length === 0) {
                throw new Error("スタンプポイントが1つもありません。");
            }

            // 画像が設定されていないポイントには、デフォルト画像を使用する目印を付ける
            dataToUpload.points.forEach(point => {
                if (!point.useCustomStampedImage) {
                    point.stampedImageSrc = 'default_stamped';
                } else if (!point.stampedImageSrc) {
                    point.stampedImageSrc = 'default_stamped';
                }
            });
 
            saveButton.disabled = true;
            saveButton.textContent = 'URLを生成中...';

            const jsonString = JSON.stringify(dataToUpload);
            const totalSize = jsonString.length;

            // データサイズが非常に大きい場合の警告
            if (totalSize > MAX_TOTAL_JSON_SIZE) {
                if (!confirm(`警告: データ量が非常に多くなっています（${(totalSize / 1024).toFixed(1)}KB）。\n共有URLがエラーになったり、QRコードが正常に生成されない可能性があります。\n画像の数を減らすか、より小さな画像を使用することをお勧めします。\nこのまま続行しますか？`)) {
                    saveButton.disabled = false;
                    saveButton.textContent = '共有URLを生成';
                    return;
                }
            }

            const baseUrl = window.location.href.replace('admin.html', 'mspr.html');
            let fullUrl;

            try {
                // jsonblob.comにデータをアップロードして短いURLを生成
                const response = await fetch('https://jsonblob.com/api/jsonBlob', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: jsonString
                });

                if (response.status === 201) {
                    const location = response.headers.get('Location');
                    if (location) {
                        const binId = location.pop ? location.pop() : location.split('/').pop();
                        fullUrl = `${baseUrl}?bin=${binId}`;
                    } else {
                        throw new Error('Locationヘッダーが取得できませんでした。');
                    }
                } else if (response.status === 413) {
                    throw new Error('画像データが大きすぎて保存できません。画像の数を減らすか、さらに小さな画像を使用してください。');
                } else {
                    throw new Error(`アップロード失敗 (Status: ${response.status})`);
                }
            } catch (uploadError) {
                // jsonblob.comが利用できない場合、またはデータ制限を超えた場合は、圧縮URLにフォールバック
                console.warn('jsonblob.comへのアップロードに失敗しました。圧縮URLで生成します。', uploadError);
                
                const compressed = pako.deflate(jsonString);
                const base64 = uint8ArrayToBase64(compressed);
                const encoded = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                fullUrl = `${baseUrl}?data=${encoded}`;
                
                // データ量が多すぎる場合はユーザーに警告
                if (fullUrl.length > 5000) {
                    alert('【重要】データの圧縮後もURLが非常に長くなっています。一部の環境（LINEやTwitterなど）ではURLが途切れてエラーになる可能性があります。画像の数や種類を減らすことを強くお勧めします。');
                }
            }

            modalUrlOutput.value = fullUrl;
            modalQrcodeElement.innerHTML = '';
            const qrCode = new QRCodeStyling({
                width: 200, height: 200, data: fullUrl, margin: 0,
                qrOptions: { errorCorrectionLevel: 'M' }, // H (30%) から M (15%) に変更して密度を下げる
                dotsOptions: { type: 'dots', color: '#3498db', gradient: { type: 'linear', rotation: 90, colorStops: [{ offset: 0, color: '#f1c40f' }, { offset: 1, color: '#e74c3c' }] } },
                cornersSquareOptions: { type: 'dot', color: '#e67e22' },
                cornersDotOptions: { type: 'dot', color: '#e67e22' },
                backgroundOptions: { color: '#ffffff' },
                imageOptions: { hideBackgroundDots: true, imageSize: 0.3, margin: 4 }, // ロゴサイズを少し小さく
                image: createTextDataUrl('Rally')
            });
            qrCode.append(modalQrcodeElement);
            shareModal.classList.add('show');

        } catch (error) {
            console.error('URL生成エラー:', error);
            alert(`URLの生成に失敗しました: ${error.message}\n\n時間をおいて再度お試しください。`);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = '共有URLを生成';
        }
    });

    /**
     * Uint8ArrayをBase64文字列に変換します。
     * btoa()が大きなバイナリ文字列を扱えない問題を回避するため、チャンクに分割して処理します。
     * @param {Uint8Array} bytes 変換するバイナリデータ
     * @returns {string} Base64エンコードされた文字列
     */
    function uint8ArrayToBase64(bytes) {
        let binary = '';
        const len = bytes.byteLength;
        const chunkSize = 8192; // チャンクサイズ
        for (let i = 0; i < len; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }


    // プレビューボタンのイベントリスナー
    previewButton.addEventListener('click', () => {
        try {
            syncDataFromUI(); // UIから最新のデータを取得

            const rallyTitle = document.getElementById('rally-title').value;
            const completionMessage = document.getElementById('completion-message').value;

            // プレビュー用のデータオブジェクトを作成
            const previewData = {
                title: rallyTitle,
                completionMessage: completionMessage,
                points: currentStampPoints
            };

            // localStorageにプレビューデータを保存
            localStorage.setItem('rallyPreviewData', JSON.stringify(previewData));

            // プレビューモードでmspr.htmlを新しいタブで開く
            const previewUrl = 'mspr.html?preview=true';
            window.open(previewUrl, '_blank');

        } catch (error) {
            alert(`プレビューの生成に失敗しました: ${error.message}`);
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
 
    // 地図モーダルの初期化と制御
    const mapModal = document.getElementById('map-modal');
    const mapModalConfirmBtn = document.getElementById('map-modal-confirm-btn');
    const mapModalCancelBtn = document.getElementById('map-modal-cancel-btn');
    let tempLat = 0;
    let tempLon = 0;
    let modalMarker = null;

    function openMapModal(index) {
        editingPointIndexForModal = index;
        const point = currentStampPoints[index];
        tempLat = point.latitude;
        tempLon = point.longitude;

        mapModal.classList.add('show');

        // 地図の初期化（初回のみ）
        setTimeout(() => {
            if (!modalMapInstance) {
                modalMapInstance = L.map('modal-map-container').setView([tempLat, tempLon], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap'
                }).addTo(modalMapInstance);

                modalMapInstance.on('click', (e) => {
                    const lat = e.latlng.lat;
                    const lon = e.latlng.lng;
                    updateModalMarker(lat, lon);
                });
            } else {
                modalMapInstance.setView([tempLat, tempLon], 15);
                modalMapInstance.invalidateSize();
            }

            updateModalMarker(tempLat, tempLon);
        }, 300);
    }

    function updateModalMarker(lat, lon) {
        tempLat = lat;
        tempLon = lon;
        if (modalMarker) {
            modalMarker.setLatLng([lat, lon]);
        } else {
            modalMarker = L.marker([lat, lon], { draggable: true }).addTo(modalMapInstance);
            modalMarker.on('dragend', function(e) {
                const pos = e.target.getLatLng();
                tempLat = pos.lat;
                tempLon = pos.lng;
            });
        }
    }

    mapModalConfirmBtn.addEventListener('click', () => {
        if (editingPointIndexForModal !== null) {
            const latVal = tempLat.toFixed(6);
            const lonVal = tempLon.toFixed(6);
            
            // データを更新
            currentStampPoints[editingPointIndexForModal].latitude = parseFloat(latVal);
            currentStampPoints[editingPointIndexForModal].longitude = parseFloat(lonVal);
            
            mapModal.classList.remove('show');
            renderUI();
        }
    });

    mapModalCancelBtn.addEventListener('click', () => {
        mapModal.classList.remove('show');
    });

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
                hint: '',
                hintImageSrc: '', // ヒント画像用のプロパティを追加
                hintImageMode: 'file',
                stampedImageMode: 'file',
                useHint: false,
                useHintImage: false,
                useCustomStampedImage: false, // 独自の達成画像を使用するかどうか
                qrRequired: true,
                coordMethod: 'current'
            }
        ];

        // 初回訪問時に注意事項モーダルを表示
        if (!localStorage.getItem('hasVisitedAdmin')) {
            welcomeModal.classList.add('show');
        }
        // 注意事項モーダルを閉じるイベント（常時設定）
        welcomeModalCloseBtn.addEventListener('click', () => {
            welcomeModal.classList.remove('show');
            // 初回訪問フラグは、初めて閉じたときにだけ立てる
            if (!localStorage.getItem('hasVisitedAdmin')) {
                localStorage.setItem('hasVisitedAdmin', 'true');
            }
        });

        renderUI();
    }
 
    initialize();
});
