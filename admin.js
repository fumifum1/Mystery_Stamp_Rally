/**
 * Mystery Stamp Rally - Administrator Interface
 * Optimized and Refactored Version
 */

document.addEventListener('DOMContentLoaded', () => {
    // === 1. Constants & Configuration ===
    
    // Default preview image for empty achievements
    const ADMIN_DEFAULT_STAMP_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='44' fill='none' stroke='%23e74c3c' stroke-width='4'/%3E%3Ccircle cx='50' cy='50' r='38' fill='none' stroke='%23e74c3c' stroke-width='1.5'/%3E%3Ctext x='50' y='53' font-family='sans-serif' font-size='14' font-weight='bold' fill='%23e74c3c' text-anchor='middle' transform='rotate(-15, 50, 53)'%3EComplete!!%3C/text%3E%3C/svg%3E";
    
    // Limits
    const MAX_TOTAL_JSON_SIZE = 256 * 1024; // 256KB threshold for URL warnings

    // === 2. Application State ===
    
    let currentStampPoints = [];
    let modalMapInstance = null; // Leaflet instance for the modal
    let editingPointIndexForModal = null; // Currently editing point in modal

    // DOM References
    const container = document.getElementById('admin-stamp-points-container');
    const saveButton = document.getElementById('save-button');
    const addButton = document.getElementById('add-point-button');
    const previewButton = document.getElementById('preview-button');
    const rallyTitleInput = document.getElementById('rally-title');
    const completionMessageInput = document.getElementById('completion-message');

    // Modal References
    const shareModal = document.getElementById('share-modal');
    const shareModalCloseBtn = document.getElementById('share-modal-close-btn');
    const modalUrlOutput = document.getElementById('modal-url-output');
    const modalQrcodeElement = document.getElementById('modal-qrcode');
    const copyUrlBtn = document.getElementById('copy-url-btn');
    const downloadQrBtn = document.getElementById('download-qr-btn');
    
    const welcomeModal = document.getElementById('welcome-modal');
    const showWelcomeModalBtn = document.getElementById('show-welcome-modal-btn');
    const welcomeModalCloseBtn = document.getElementById('welcome-modal-close-btn');
    const startTutorialBtn = document.getElementById('start-tutorial-btn');

    const mapModal = document.getElementById('map-modal');
    const mapModalConfirmBtn = document.getElementById('map-modal-confirm-btn');
    const mapModalCancelBtn = document.getElementById('map-modal-cancel-btn');

    // === 3. Utility Functions ===

    /**
     * Converts common shared URLs (Google Drive, Dropbox, Gyazo) to direct image links.
     * @param {string} url - The URL to convert.
     * @returns {string} The converted direct image link.
     */
    function convertImageDirectLink(url) {
        if (!url) return url;
        let converted = url.trim();

        // Google Drive
        if (converted.includes('drive.google.com')) {
            // Match /file/d/ID/... or ?id=ID
            const matchPath = converted.match(/\/file\/d\/([^\/\?]+)/);
            const matchQuery = converted.match(/[?&]id=([^\/&]+)/);
            const fileId = matchPath ? matchPath[1] : (matchQuery ? matchQuery[1] : null);
            if (fileId) {
                // /uc?export=view is the most reliable direct image URL for Google Drive
                return `https://drive.google.com/uc?export=view&id=${fileId}`;
            }
        }

        // Dropbox
        if (converted.includes('dropbox.com')) {
            return converted.replace(/\?dl=[0-1]$|\?dl=0$|\?dl=1$/, '').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
        }

        // Gyazo
        if (converted.includes('gyazo.com') && !converted.includes('i.gyazo.com')) {
            const match = converted.match(/gyazo\.com\/([a-f0-9]+)/);
            if (match && match[1]) {
                return `https://i.gyazo.com/${match[1]}.png`;
            }
        }

        return converted;
    }

    /**
     * Converts a Uint8Array to a Base64 string safely even for large data.
     */
    function uint8ArrayToBase64(bytes) {
        let binary = '';
        const len = bytes.byteLength;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    /**
     * Creates a simple text-based DataURL to be used as a logo in QR codes.
     */
    function createTextDataUrl(text) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 128;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 32px "Noto Sans JP", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        return canvas.toDataURL();
    }

    /**
     * Calculates and updates the data size indicator in the UI.
     */
    function updateDataSizeIndicator() {
        const display = document.getElementById('data-size-display');
        if (!display) return;

        try {
            const rallyTitle = rallyTitleInput.value || '';
            const completionMessage = completionMessageInput.value || '';
            
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
                display.style.color = '#e74c3c';
                display.style.fontWeight = 'bold';
                display.textContent += ' (容量大：エラーの可能性あり)';
            } else {
                display.style.color = size > MAX_TOTAL_JSON_SIZE * 0.7 ? '#e67e22' : '#7f8c8d';
                display.style.fontWeight = 'normal';
            }
        } catch (e) {
            console.warn('Size calculation failed', e);
        }
    }

    // === 4. Core Logic Functions ===

    /**
     * Syncs the current UI state to the currentStampPoints array.
     */
    function syncDataFromUI() {
        currentStampPoints.forEach((point, index) => {
            const nameInput = document.getElementById(`name-${index}`);
            const latInput = document.getElementById(`lat-${index}`);
            const lonInput = document.getElementById(`lon-${index}`);
            const hintInput = document.getElementById(`hint-${index}`);

            if (nameInput) point.name = nameInput.value;
            if (latInput) point.latitude = parseFloat(latInput.value) || 0;
            if (lonInput) point.longitude = parseFloat(lonInput.value) || 0;
            if (hintInput) point.hint = hintInput.value;

            point.qrRequired = document.getElementById(`qr-required-${index}`)?.checked ?? true;
            point.useHint = document.getElementById(`use-hint-${index}`)?.checked ?? false;
            point.useHintImage = document.getElementById(`use-hint-image-${index}`)?.checked ?? false;
            point.useCustomStampedImage = document.getElementById(`use-custom-stamped-image-${index}`)?.checked ?? false;

            // Image URLs
            point.hintImageSrc = document.getElementById(`hint-image-url-${index}`)?.value || '';
            point.stampedImageSrc = document.getElementById(`stamped-image-url-${index}`)?.value || '';

            // Implicit values
            point.acquisitionButtonLabel = point.qrRequired ? 'スタンプをゲット！' : 'スタンプゲット！';
        });
    }

    /**
     * Generates the sharing URL and displays the modal.
     */
    async function generateAndShare() {
        syncDataFromUI();
        saveButton.disabled = true;
        saveButton.textContent = '生成中...';

        try {
            const rallyTitle = rallyTitleInput.value || 'Mystery Stamp Rally';
            const completionMessage = completionMessageInput.value || 'クリアおめでとうございます！';

            const rallyData = {
                title: rallyTitle,
                completionMessage: completionMessage,
                points: currentStampPoints.map(p => ({
                    id: p.id,
                    name: p.name,
                    latitude: p.latitude,
                    longitude: p.longitude,
                    stampedImageSrc: p.useCustomStampedImage ? p.stampedImageSrc : 'default_stamped',
                    hint: p.useHint ? p.hint : '',
                    hintImageSrc: p.useHintImage ? p.hintImageSrc : '',
                    qrRequired: p.qrRequired,
                    acquisitionButtonLabel: p.acquisitionButtonLabel
                }))
            };

            const jsonString = JSON.stringify(rallyData);
            const baseUrl = window.location.href.split('admin.html')[0] + 'mspr.html';
            let fullUrl = '';

            try {
                // pako compression
                const compressed = pako.deflate(jsonString);
                const base64 = uint8ArrayToBase64(compressed);
                const encoded = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                fullUrl = `${baseUrl}?data=${encoded}`;

                if (fullUrl.length > 5000) {
                    alert('【注意】データが非常に多いため、URLが長くなっています。一部のアプリでは正常に開けない可能性があります。');
                }
            } catch (pakoError) {
                console.error('Compression failed:', pakoError);
                throw new Error('データの圧縮に失敗しました。');
            }

            modalUrlOutput.value = fullUrl;
            modalQrcodeElement.innerHTML = '';
            
            const qrCode = new QRCodeStyling({
                width: 200, height: 200, data: fullUrl, margin: 0,
                qrOptions: { errorCorrectionLevel: 'M' },
                dotsOptions: { 
                    type: 'dots', color: '#3498db', 
                    gradient: { type: 'linear', rotation: 90, colorStops: [{ offset: 0, color: '#f1c40f' }, { offset: 1, color: '#e74c3c' }] } 
                },
                cornersSquareOptions: { type: 'dot', color: '#e67e22' },
                cornersDotOptions: { type: 'dot', color: '#e67e22' },
                backgroundOptions: { color: '#ffffff' },
                imageOptions: { hideBackgroundDots: true, imageSize: 0.3, margin: 4 },
                image: createTextDataUrl('Rally')
            });
            
            qrCode.append(modalQrcodeElement);
            shareModal.classList.add('show');

        } catch (error) {
            console.error('URL generation error:', error);
            alert(`生成エラー: ${error.message}`);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = '共有URLを生成';
        }
    }

    // === 5. UI Rendering Components ===

    /**
     * Renders a single stamp point card.
     */
    function renderPointCard(point, index) {
        const div = document.createElement('div');
        div.className = 'stamp-card';
        div.innerHTML = `
            ${renderCardHeader(index)}
            ${renderBasicSettings(point, index)}
            ${renderCoordinateSelector(point, index)}
            ${renderBehaviorCheckboxes(point, index)}
            ${renderHintSection(point, index)}
            ${renderImageSection(point, index)}
            ${renderPreviewSection(point, index)}
        `;
        return div;
    }

    function renderCardHeader(index) {
        return `
            <div class="stamp-card-header">
                <h3 class="card-title">ポイント ${index + 1}</h3>
                <button class="delete-btn delete-point-btn" data-index="${index}" title="このポイントを削除">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                    </svg>
                </button>
            </div>`;
    }

    function renderBasicSettings(point, index) {
        return `
            <div class="admin-form-group vertical-group">
                <label for="name-${index}">ポイントタイトル</label>
                <input type="text" id="name-${index}" value="${point.name || ''}" placeholder="例：東京駅">
            </div>`;
    }

    function renderCoordinateSelector(point, index) {
        return `
            <div class="admin-form-group vertical-group">
                <label>座標の設定</label>
                <div class="coord-selector-wrapper">
                    <select class="method-select" data-index="${index}" style="width:100%; padding:10px; background-color:var(--input-bg); color:var(--input-text); border-radius:4px; border:1px solid var(--border-color); font-size:1rem; -webkit-appearance:none; appearance:none;">
                        <option value="current" ${point.coordMethod === 'current' ? 'selected' : ''}>① 現在地から</option>
                        <option value="map" ${point.coordMethod === 'map' ? 'selected' : ''}>② 地図から取得</option>
                        <option value="manual" ${point.coordMethod === 'manual' ? 'selected' : ''}>③ 手動入力</option>
                    </select>
                </div>
                <div class="coord-sections-container">
                    <div class="coord-section current-section" style="${point.coordMethod === 'current' ? '' : 'display: none;'}">
                        <button type="button" class="btn btn-secondary get-location-btn btn-sm-text" data-index="${index}">現在地を取得</button>
                    </div>
                    <div class="coord-section map-section" style="${point.coordMethod === 'map' ? '' : 'display: none;'}">
                        <button type="button" class="btn btn-secondary open-map-modal-btn" data-index="${index}">大きな地図で指定</button>
                        <p class="coord-hint">※地図上の正確な場所をタップしてください</p>
                    </div>
                    <div class="coord-section manual-section" style="${point.coordMethod === 'manual' ? '' : 'display: none;'}">
                        <div class="admin-form-group"><label>緯度:</label><input type="number" step="any" id="lat-${index}" value="${point.latitude}"></div>
                        <div class="admin-form-group"><label>経度:</label><input type="number" step="any" id="lon-${index}" value="${point.longitude}"></div>
                    </div>
                </div>
                <div id="coord-info-${index}" class="coord-display-info" style="${point.coordMethod === 'manual' ? 'display: none;' : ''}">
                    <p>設定済み: 緯度 <span id="display-lat-${index}">${point.latitude}</span>, 経度 <span id="display-lon-${index}">${point.longitude}</span></p>
                </div>
            </div>`;
    }

    function renderBehaviorCheckboxes(point, index) {
        return `
            <div class="admin-form-group checkbox-group" style="margin-top: 20px;">
                <input type="checkbox" id="qr-required-${index}" ${point.qrRequired !== false ? 'checked' : ''} class="sync-trigger">
                <label for="qr-required-${index}">QRコードのスキャンを必須にする</label>
            </div>
            <div class="admin-form-group checkbox-group">
                <input type="checkbox" id="use-hint-${index}" ${point.useHint ? 'checked' : ''} class="toggle-trigger" data-target="hint-section-${index}">
                <label for="use-hint-${index}">ヒント(文字)を入力する</label>
            </div>`;
    }

    function renderHintSection(point, index) {
        return `
            <div id="hint-section-${index}" class="hint-section-container" style="${point.useHint ? '' : 'display: none;'}">
                <div class="admin-form-group vertical-group">
                    <textarea id="hint-${index}" placeholder="ヒントを入力してください">${point.hint || ''}</textarea>
                </div>
            </div>
            <div class="admin-form-group checkbox-group">
                <input type="checkbox" id="use-hint-image-${index}" ${point.useHintImage ? 'checked' : ''} class="toggle-trigger" data-target="hint-image-section-${index}">
                <label for="use-hint-image-${index}">ヒント画像(URL)を入れる</label>
            </div>
            <div id="hint-image-section-${index}" class="hint-section-container" style="${point.useHintImage ? '' : 'display: none;'}">
                <div class="admin-form-group vertical-group">
                    <label>ヒント画像URL</label>
                    <input type="text" id="hint-image-url-${index}" value="${point.hintImageSrc || ''}" placeholder="https://..." class="url-input hint-url" data-preview="hint-image-preview-${index}" data-error="hint-error-${index}">
                    <p class="input-hint">※Googleドライブ, Gyazo等の「直リンク」に対応</p>
                    <div class="url-preview-container" style="margin-top: 10px; text-align: center;">
                        <img id="hint-image-preview-${index}" src="${point.hintImageSrc || ''}" alt="Hint Preview" class="hint-image" referrerpolicy="no-referrer" style="max-height: 150px; ${point.hintImageSrc ? '' : 'display: none;'}" onerror="window.handlePreviewError(this)">
                        <div id="hint-error-${index}" class="preview-error-message">画像の読み込みに失敗しました。URLが正しいか、公開設定になっているか確認してください。</div>
                    </div>
                </div>
            </div>`;
    }

    function renderImageSection(point, index) {
        return `
            <div class="admin-form-group checkbox-group">
                <input type="checkbox" id="use-custom-stamped-image-${index}" ${point.useCustomStampedImage ? 'checked' : ''} class="toggle-trigger" data-target="achievement-section-${index}">
                <label for="use-custom-stamped-image-${index}">独自の達成画像を使用する</label>
            </div>
            <div id="achievement-section-${index}" class="hint-section-container" style="${point.useCustomStampedImage ? '' : 'display: none;'}">
                <div class="admin-form-group vertical-group">
                    <label>達成画像URL</label>
                    <input type="text" id="stamped-image-url-${index}" value="${point.stampedImageSrc || ''}" placeholder="https://..." class="url-input stamped-url" data-preview="image-preview-${index}" data-error="stamped-error-${index}">
                    <p class="input-hint">※Googleドライブ, Gyazo等の「直リンク」に対応</p>
                    <div id="stamped-error-${index}" class="preview-error-message">画像の読み込みに失敗しました。</div>
                </div>
            </div>`;
    }

    function renderPreviewSection(point, index) {
        return `
            <div class="admin-media-container" style="${point.qrRequired === false ? 'opacity: 0.6;' : ''}">
                <div class="media-item">
                    <p>達成時画像プレビュー</p>
                    <img id="image-preview-${index}" src="${point.stampedImageSrc || ADMIN_DEFAULT_STAMP_IMG}" alt="Preview" class="stamp-icon" referrerpolicy="no-referrer" onerror="window.handlePreviewError(this)">
                </div>
                <div class="media-item" style="${point.qrRequired === false ? 'display: none;' : ''}">
                    <p>現地設置用QRコード</p>
                    <div class="point-qrcode-wrapper">
                        <div class="qr-code-container" id="qrcode-${index}"></div>
                        <button class="download-btn download-point-qr" data-index="${index}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg></button>
                    </div>
                </div>
            </div>`;
    }

    /**
     * Re-renders the entire point list.
     */
    function renderUI() {
        container.innerHTML = '';
        currentStampPoints.forEach((point, index) => {
            container.appendChild(renderPointCard(point, index));
            
            // Generate QR codes after attaching to DOM
            setTimeout(() => {
                const qrEl = document.getElementById(`qrcode-${index}`);
                if (qrEl && point.qrRequired !== false) {
                    const qr = new QRCodeStyling({
                        width: 150, height: 150, data: point.id, margin: 0,
                        dotsOptions: { type: 'dots', color: '#3498db' },
                        cornersSquareOptions: { type: 'dot', color: '#2980b9' },
                        imageOptions: { hideBackgroundDots: true, imageSize: 0.4, margin: 4 },
                        image: createTextDataUrl(`SP${index + 1}`)
                    });
                    qr.append(qrEl);
                }
            }, 0);
        });
        updateDataSizeIndicator();
    }

    // === 6. Event Handlers ===

    // Delegation for dynamic elements
    container.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const index = parseInt(target.dataset.index, 10);

        if (target.classList.contains('delete-point-btn')) {
            if (confirm('このポイントを削除してもよろしいですか？')) {
                currentStampPoints.splice(index, 1);
                renderUI();
            }
        } else if (target.classList.contains('get-location-btn')) {
            target.disabled = true;
            target.textContent = '取得中...';
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    currentStampPoints[index].latitude = parseFloat(pos.coords.latitude.toFixed(6));
                    currentStampPoints[index].longitude = parseFloat(pos.coords.longitude.toFixed(6));
                    renderUI();
                },
                () => { alert('位置情報の取得に失敗しました。'); target.disabled = false; target.textContent = '現在地を取得'; },
                { enableHighAccuracy: true }
            );
        } else if (target.classList.contains('open-map-modal-btn')) {
            openMapModal(index);
        } else if (target.classList.contains('download-point-qr')) {
            const canvas = document.getElementById(`qrcode-${index}`).querySelector('canvas');
            if (canvas) {
                const link = document.createElement('a');
                link.download = `qr_${currentStampPoints[index].name || index}.png`;
                link.href = canvas.toDataURL();
                link.click();
            }
        }
    });

    container.addEventListener('change', (e) => {
        const target = e.target;
        const index = parseInt(target.closest('.stamp-card')?.querySelector('.card-title').textContent.match(/\d+/)[0], 10) - 1;

        if (target.classList.contains('method-select')) {
            currentStampPoints[index].coordMethod = target.value;
            renderUI();
        } else if (target.classList.contains('toggle-trigger')) {
            const section = document.getElementById(target.dataset.target);
            if (section) section.style.display = target.checked ? 'block' : 'none';
            syncDataFromUI();
            updateDataSizeIndicator();
        } else if (target.classList.contains('sync-trigger')) {
            syncDataFromUI();
            renderUI();
        }
    });

    container.addEventListener('input', (e) => {
        const target = e.target;
        if (target.classList.contains('url-input')) {
            const converted = convertImageDirectLink(target.value);
            if (converted !== target.value) target.value = converted;
            
            const previewId = target.dataset.preview;
            const errorId = target.dataset.error;
            if (previewId) {
                const preview = document.getElementById(previewId);
                const errorEl = document.getElementById(errorId);
                if (preview) {
                    if (errorEl) errorEl.style.display = 'none';
                    preview.src = target.value || (target.classList.contains('stamped-url') ? ADMIN_DEFAULT_STAMP_IMG : '');
                    preview.style.display = target.value || target.classList.contains('stamped-url') ? 'inline-block' : 'none';
                }
            }
            syncDataFromUI();
            updateDataSizeIndicator();
        }
    });

    // Global Buttons
    addButton.addEventListener('click', () => {
        syncDataFromUI();
        currentStampPoints.push({
            id: 'point_' + Date.now(),
            name: '新規ポイント',
            latitude: 35.681236,
            longitude: 139.767125,
            stampedImageSrc: '',
            hint: '',
            hintImageSrc: '',
            useHint: false,
            useHintImage: false,
            useCustomStampedImage: false,
            qrRequired: true,
            coordMethod: 'current'
        });
        renderUI();
    });

    saveButton.addEventListener('click', generateAndShare);
    
    previewButton.addEventListener('click', () => {
        syncDataFromUI();
        localStorage.setItem('rallyPreviewData', JSON.stringify({
            title: rallyTitleInput.value,
            completionMessage: completionMessageInput.value,
            points: currentStampPoints
        }));
        window.open('mspr.html?preview=true', '_blank');
    });

    // Modal Helpers
    copyUrlBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(modalUrlOutput.value).then(() => {
            const orig = copyUrlBtn.innerHTML;
            copyUrlBtn.innerHTML = '✓';
            setTimeout(() => copyUrlBtn.innerHTML = orig, 1500);
        });
    });

    downloadQrBtn.addEventListener('click', () => {
        const canvas = modalQrcodeElement.querySelector('canvas');
        if (canvas) {
            const link = document.createElement('a');
            link.download = 'rally_qr.png';
            link.href = canvas.toDataURL();
            link.click();
        }
    });

    // Map Modal logic
    function openMapModal(index) {
        editingPointIndexForModal = index;
        const pt = currentStampPoints[index];
        mapModal.classList.add('show');
        
        setTimeout(() => {
            if (!modalMapInstance) {
                modalMapInstance = L.map('modal-map-container').setView([pt.latitude, pt.longitude], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(modalMapInstance);
                modalMapInstance.on('click', (e) => {
                    const lat = e.latlng.lat, lon = e.latlng.lng;
                    currentStampPoints[index].latitude = parseFloat(lat.toFixed(6));
                    currentStampPoints[index].longitude = parseFloat(lon.toFixed(6));
                    updateModalMarker(lat, lon);
                });
            } else {
                modalMapInstance.setView([pt.latitude, pt.longitude], 15);
                modalMapInstance.invalidateSize();
            }
            updateModalMarker(pt.latitude, pt.longitude);
        }, 100);
    }

    let modalMarker = null;
    function updateModalMarker(lat, lon) {
        if (modalMarker) modalMarker.setLatLng([lat, lon]);
        else modalMarker = L.marker([lat, lon], { draggable: true }).addTo(modalMapInstance);
    }

    mapModalConfirmBtn.addEventListener('click', () => {
        if (modalMarker) {
            const pos = modalMarker.getLatLng();
            currentStampPoints[editingPointIndexForModal].latitude = parseFloat(pos.lat.toFixed(6));
            currentStampPoints[editingPointIndexForModal].longitude = parseFloat(pos.lng.toFixed(6));
        }
        mapModal.classList.remove('show');
        renderUI();
    });

    mapModalCancelBtn.addEventListener('click', () => {
        mapModal.classList.remove('show');
    });

    shareModalCloseBtn.addEventListener('click', () => {
        shareModal.classList.remove('show');
    });

    // Helper for image errors
    window.handlePreviewError = function(img) {
        img.style.display = 'none';
        const inputId = img.id.includes('hint') ? img.id.replace('hint-image-preview-', 'hint-image-url-') : img.id.replace('image-preview-', 'stamped-image-url-');
        const input = document.getElementById(inputId);
        if (input && input.dataset.error) {
            const errorEl = document.getElementById(input.dataset.error);
            if (errorEl && input.value) errorEl.style.display = 'block';
        }
    };

    // Initialization
    function init() {
        rallyTitleInput.value = 'Mystery Stamp Rally';
        completionMessageInput.value = 'おめでとうございます！すべてのポイントを制覇しました！';
        currentStampPoints = [{
            id: 'point_' + Date.now(),
            name: 'スタート地点',
            latitude: 35.681236, longitude: 139.767125,
            stampedImageSrc: '', hint: '', hintImageSrc: '',
            useHint: false, useHintImage: false, useCustomStampedImage: false,
            qrRequired: true, coordMethod: 'current'
        }];
        
        if (!localStorage.getItem('hasVisitedAdmin')) welcomeModal.classList.add('show');
        welcomeModalCloseBtn.addEventListener('click', () => {
            welcomeModal.classList.remove('show');
            localStorage.setItem('hasVisitedAdmin', 'true');
        });
        
        renderUI();
    }

    init();
});
