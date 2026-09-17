document.addEventListener('DOMContentLoaded', () => {
    // --- NAVIGATION TAB SWITCHING ---
    const scanImageTab = document.getElementById('scanImageTab');
    const cameraTab = document.getElementById('cameraTab');
    const cameraView = document.getElementById('cameraView');
    const imageView = document.getElementById('imageView');

    if (scanImageTab && cameraTab) {
        scanImageTab.addEventListener('click', () => {
            scanImageTab.classList.add('active');
            cameraTab.classList.remove('active');
            
            imageView.removeAttribute('hidden');
            cameraView.setAttribute('hidden', '');

            stopCamera();
        });

        cameraTab.addEventListener('click', () => {
            cameraTab.classList.add('active');
            scanImageTab.classList.remove('active');
            
            cameraView.removeAttribute('hidden');
            imageView.setAttribute('hidden', '');

            populateCameraList();
        });
    }

    // --- CAMERA & FILE ELEMENTS ---
    const video = document.getElementById('video');
    const cameraOffState = document.getElementById('cameraOffState');
    const startCamBtn = document.getElementById('startCamBtn');
    const cameraSelect = document.getElementById('cameraSelect');

    const statusText = document.getElementById('statusText');
    const statusIndicator = document.querySelector('.status-indicator');
    const resultDisplay = document.getElementById('resultDisplay');
    const copyResultBtn = document.getElementById('copyResultBtn');

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const pasteBtn = document.getElementById('pasteBtn');

    const canvas = document.getElementById('canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    let stream = null;
    let animationFrameId = null;
    let isCameraActive = false;
    let isProcessingScan = false; // Debounce flag to prevent duplicate scans

    if (startCamBtn) {
        startCamBtn.addEventListener('click', () => {
            if (!isCameraActive) startCamera();
            else stopCamera();
        });
    }

    async function populateCameraList() {
        if (!cameraSelect) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            cameraSelect.innerHTML = '';
            videoDevices.forEach((device, index) => {
                const opt = document.createElement('option');
                opt.value = device.deviceId;
                opt.text = device.label || `Camera ${index + 1}`;
                cameraSelect.appendChild(opt);
            });
        } catch (e) {
            console.warn(e);
        }
    }

    async function startCamera() {
        const deviceId = cameraSelect ? cameraSelect.value : null;
        const constraints = { 
            video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' } 
        };

        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            video.hidden = false;
            cameraOffState.hidden = true;
            video.play();

            isCameraActive = true;
            startCamBtn.style.backgroundColor = '#ef4444';
            startCamBtn.innerHTML = `Stop Camera`;
            if (statusText) statusText.textContent = 'Camera active - Ready to scan...';
            if (statusIndicator) statusIndicator.classList.add('active');

            animationFrameId = requestAnimationFrame(tickCamera);
        } catch (err) {
            showToast("Failed to access camera", "error");
            alert('Unable to access camera: ' + err.message);
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        if (animationFrameId) cancelAnimationFrame(animationFrameId);

        if (video) video.hidden = true;
        if (cameraOffState) cameraOffState.hidden = false;
        isCameraActive = false;

        if (startCamBtn) {
            startCamBtn.style.backgroundColor = '#2563eb';
            startCamBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Start Camera`;
        }

        if (statusText) statusText.textContent = 'Camera inactive';
        if (statusIndicator) statusIndicator.classList.remove('active');
    }

    function tickCamera() {
        if (isCameraActive && video && video.readyState === video.HAVE_ENOUGH_DATA) {
            if (!isProcessingScan) {
                canvas.height = video.videoHeight;
                canvas.width = video.videoWidth;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code && code.data) {
                    isProcessingScan = true; // Pause scanning temporarily to avoid rapid multi-scans
                    const snapshotDataUrl = canvas.toDataURL('image/jpeg', 0.6);
                    
                    handleNewScan(code.data, snapshotDataUrl, 'Camera');
                    showToast("Scanned Successfully", "success");

                    // Resume scanning after 2.5 seconds
                    setTimeout(() => {
                        isProcessingScan = false;
                    }, 2500);
                }
            }
        }
        
        if (isCameraActive) {
            animationFrameId = requestAnimationFrame(tickCamera);
        }
    }

    // --- UPLOAD / PASTE IMAGE HANDLERS ---
    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        browseBtn.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) processFile(e.target.files[0]);
        });
    }

    if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const clipboardItems = await navigator.clipboard.read();
                for (const item of clipboardItems) {
                    const imageType = item.types.find(type => type.startsWith('image/'));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        processFile(blob);
                        return;
                    }
                }
                showToast("Scan Failed: No image in clipboard", "error");
            } catch (err) {
                showToast("Scan Failed: Unable to read clipboard", "error");
            }
        });
    }

    function processFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code && code.data) {
                    const thumbnailCanvas = document.createElement('canvas');
                    const maxDim = 200;
                    let w = img.width, h = img.height;
                    if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; } 
                    else { w = Math.round((w * maxDim) / h); h = maxDim; }
                    thumbnailCanvas.width = w;
                    thumbnailCanvas.height = h;
                    thumbnailCanvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    
                    const thumbnailDataUrl = thumbnailCanvas.toDataURL('image/jpeg', 0.7);

                    handleNewScan(code.data, thumbnailDataUrl, 'Scanned File');
                    showToast("Scanned Successfully", "success");
                } else {
                    showToast("Scan Failed: No QR Code found", "error");
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // --- PARSER & SCAN LOGGER ---
    async function handleNewScan(qrCodeMessage, imagePreviewUrl = null, scanType = 'Manual') {
        const now = new Date();
        const currentDate = now.toLocaleDateString();
        const currentTime = now.toLocaleTimeString();

        let name = "";
        let college = "N/A";
        let designation = "Member";

        const designationsList = [
            "Vice President",
            "Asst. Business Manager",
            "Asst. Team Leader",
            "Business Manager",
            "Undersecretary",
            "Media Committee Head",
            "Media Committee Graphic Artist",
            "Content Creator",
            "Team Leader",
            "Representative",
            "President",
            "Secretary",
            "Treasurer",
            "PIO"
        ];

        const collegeMappings = [
            { code: "COED & SHS", pattern: /College of Education and Senior High\s*School|College of Education|Senior High\s*School|\bCOED\b|\bSHS\b/gi },
            { code: "CBAA", pattern: /College of Business Administration and Accountancy|\bCBAA\b/gi },
            { code: "CSSH", pattern: /College of Social Sciences and Humanities|\bCSSH\b/gi },
            { code: "CNSM", pattern: /College of Natural Sciences and Mathematics|\bCNSM\b/gi },
            { code: "CFAS", pattern: /College of Fisheries and Aquatic Sciences?|\bCFAS\b/gi },
            { code: "IIAIS", pattern: /Institute of Islamic, Arabic, and International Studies|\bIIAIS\b/gi },
            { code: "CHS", pattern: /College of Health Sciences|\bCHS\b/gi },
            { code: "COE", pattern: /College of Engineering|\bCOE\b/gi },
            { code: "COA", pattern: /College of Agriculture|\bCOA\b/gi }
        ];

        let remainingText = qrCodeMessage;

        // 1. Extract Designation
        for (const title of designationsList) {
            const regex = new RegExp(`\\b${title}\\b`, "i");
            if (regex.test(remainingText)) {
                designation = title;
                remainingText = remainingText.replace(regex, "").trim();
                break;
            }
        }

        // 2. Identify College Short Code
        for (const mapping of collegeMappings) {
            if (mapping.pattern.test(remainingText)) {
                college = mapping.code;
                break;
            }
        }

        // 3. Strip ALL college patterns from remaining text
        for (const mapping of collegeMappings) {
            remainingText = remainingText.replace(mapping.pattern, "");
        }
        remainingText = remainingText.replace(/College of [A-Za-z\s]+/gi, "");

        // 4. Clean remaining text for Name
        name = remainingText.replace(/\s+/g, " ").trim() || "Unknown";

        const scanData = {
            id: Date.now(),
            scanDate: currentDate,
            scanTime: currentTime,
            name: name,
            college: college,
            designation: designation,
            rawQrData: qrCodeMessage,
            imagePreview: imagePreviewUrl,
            scanType: scanType
        };

        // Update UI
        if (resultDisplay) {
            resultDisplay.innerHTML = `
                <div style="font-weight: bold; font-size: 1.1rem; color: #0f172a; margin-bottom: 6px;">${scanData.name}</div>
                <div style="color: #2563eb; font-weight: 500; margin-bottom: 4px;">${scanData.college} · ${scanData.designation}</div>
                <div style="font-size: 0.8rem; color: #64748b; margin-top: 10px; word-break: break-all; border-top: 1px solid #e2e8f0; padding-top: 8px;">
                    <strong>Raw QR:</strong> ${scanData.rawQrData}
                </div>
            `;
        }

        const lastResultEl = document.getElementById("last-result");
        if (lastResultEl) {
            lastResultEl.textContent = `${scanData.name} | ${scanData.college} | ${scanData.designation}`;
        }

        if (copyResultBtn) copyResultBtn.disabled = false;

        saveScanToHistory(scanData);
    }

    function saveScanToHistory(scanData) {
        let logs = JSON.parse(localStorage.getItem('qr_logs') || '[]');
        logs.unshift(scanData);
        if (logs.length > 100) logs = logs.slice(0, 100);

        try {
            localStorage.setItem('qr_logs', JSON.stringify(logs));
        } catch (e) {
            logs = logs.map(item => ({ ...item, imagePreview: null }));
            localStorage.setItem('qr_logs', JSON.stringify(logs));
        }
    }

    // --- TOAST NOTIFICATIONS ("Scanned Successfully" / "Scan Failed") ---
    function showToast(message, type = 'success') {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span>${type === 'success' ? '✓' : '✕'}</span>
            <span>${message}</span>
        `;

        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2200);
    }

    // --- RENDER LOGS TABLE ---
    const logsTableBody = document.getElementById('logsTableBody');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    if (logsTableBody) {
        renderLogsTable();
    }

    function renderLogsTable() {
        const logs = JSON.parse(localStorage.getItem('qr_logs') || '[]');
        if (logs.length > 0) {
            logsTableBody.innerHTML = logs.map(log => `
                <tr>
                    <td>
                        ${log.imagePreview 
                            ? `<img src="${log.imagePreview}" class="log-thumb-img" alt="Scanned image" />` 
                            : `<div class="log-no-img">No Image</div>`
                        }
                    </td>
                    <td><strong>${escapeHtml(log.name)}</strong></td>
                    <td><span class="badge-college">${escapeHtml(log.college)}</span></td>
                    <td>${escapeHtml(log.designation)}</td>
                    <td><small>${log.scanDate}<br>${log.scanTime}</small></td>
                    <td class="raw-data-cell" title="${escapeHtml(log.rawQrData)}">${escapeHtml(log.rawQrData)}</td>
                    <td>
                        <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${escapeJs(log.rawQrData)}')">Copy</button>
                    </td>
                </tr>
            `).join('');
        } else {
            logsTableBody.innerHTML = `<tr><td colspan="7" class="empty-msg">No scan history recorded yet.</td></tr>`;
        }
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all scan history?')) {
                localStorage.removeItem('qr_logs');
                renderLogsTable();
            }
        });
    }

    if (copyResultBtn && resultDisplay) {
        copyResultBtn.addEventListener('click', () => {
            const rawText = resultDisplay.innerText;
            navigator.clipboard.writeText(rawText).then(() => {
                showToast("Copied to clipboard!", "success");
            });
        });
    }

    function escapeHtml(text) {
        return (text || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function escapeJs(text) {
        return (text || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
    }
});