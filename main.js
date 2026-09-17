document.addEventListener('DOMContentLoaded', () => {
    // Tabs
    const scanImageTab = document.getElementById('scanImageTab');
    const cameraTab = document.getElementById('cameraTab');
    const cameraView = document.getElementById('cameraView');
    const imageView = document.getElementById('imageView');

    // Camera Controls & Preview
    const video = document.getElementById('video');
    const previewContainer = document.getElementById('previewContainer');
    const qrBoundingBox = document.getElementById('qrBoundingBox');
    const cameraOffState = document.getElementById('cameraOffState');
    const startCamBtn = document.getElementById('startCamBtn');
    const flashBtn = document.getElementById('flashBtn');
    const switchCamBtn = document.getElementById('switchCamBtn');

    // Upload Elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    // Display & Result
    const statusText = document.getElementById('statusText');
    const statusIndicator = document.querySelector('.status-indicator');
    const resultDisplay = document.getElementById('resultDisplay');
    const copyResultBtn = document.getElementById('copyResultBtn');

    // Canvas
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    let stream = null;
    let animationFrameId = null;
    let isCameraActive = false;

    // --- Tab Switching ---
    scanImageTab.addEventListener('click', () => {
        scanImageTab.classList.add('active');
        cameraTab.classList.remove('active');
        imageView.hidden = false;
        cameraView.hidden = true;
        stopCamera();
    });

    cameraTab.addEventListener('click', () => {
        cameraTab.classList.add('active');
        scanImageTab.classList.remove('active');
        cameraView.hidden = false;
        imageView.hidden = true;
    });

    // --- Camera Handling ---
    startCamBtn.addEventListener('click', () => {
        if (!isCameraActive) {
            startCamera();
        } else {
            stopCamera();
        }
    });

    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            video.srcObject = stream;
            video.hidden = false;
            cameraOffState.hidden = true;
            video.play();

            isCameraActive = true;
            startCamBtn.style.backgroundColor = '#ef4444';
            startCamBtn.innerHTML = `Stop Camera`;
            statusText.textContent = 'Camera active - Searching for QR...';
            statusIndicator.classList.add('active');

            flashBtn.disabled = false;
            switchCamBtn.disabled = false;

            animationFrameId = requestAnimationFrame(tickCamera);
        } catch (err) {
            alert('Unable to access camera: ' + err.message);
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }

        video.hidden = true;
        cameraOffState.hidden = false;
        qrBoundingBox.hidden = true;
        isCameraActive = false;

        startCamBtn.style.backgroundColor = '#1a73e8';
        startCamBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Start Camera`;
        
        statusText.textContent = 'Camera inactive';
        statusIndicator.classList.remove('active');

        flashBtn.disabled = true;
        switchCamBtn.disabled = true;
    }

    function tickCamera() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code && code.location) {
                // Draw dynamic yellow bounding box around code
                drawBoundingBox(code.location);

                if (code.data) {
                    handleResult(code.data);
                    setTimeout(() => stopCamera(), 600); // slight delay so user sees the box target
                    return;
                }
            } else {
                qrBoundingBox.hidden = true;
            }
        }
        if (isCameraActive) {
            animationFrameId = requestAnimationFrame(tickCamera);
        }
    }

    // --- Dynamic Positioning for Bounding Box ---
    function drawBoundingBox(location) {
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        const containerWidth = previewContainer.clientWidth;
        const containerHeight = previewContainer.clientHeight;

        // Scale factors from video dimensions to UI preview size
        const scaleX = containerWidth / videoWidth;
        const scaleY = containerHeight / videoHeight;

        // Calculate min/max coordinates of the 4 corner points
        const xCoords = [location.topLeftCorner.x, location.topRightCorner.x, location.bottomRightCorner.x, location.bottomLeftCorner.x];
        const yCoords = [location.topLeftCorner.y, location.topRightCorner.y, location.bottomRightCorner.y, location.bottomLeftCorner.y];

        const minX = Math.min(...xCoords) * scaleX;
        const maxX = Math.max(...xCoords) * scaleX;
        const minY = Math.min(...yCoords) * scaleY;
        const maxY = Math.max(...yCoords) * scaleY;

        const width = maxX - minX;
        const height = maxY - minY;

        // Position the bounding box overlay div
        qrBoundingBox.style.left = `${minX - 10}px`;
        qrBoundingBox.style.top = `${minY - 10}px`;
        qrBoundingBox.style.width = `${width + 20}px`;
        qrBoundingBox.style.height = `${height + 20}px`;
        qrBoundingBox.hidden = false;
    }

    // --- Drag and Drop File Scanner ---
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) processFile(e.target.files[0]);
    });

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
                    handleResult(code.data);
                } else {
                    alert('No QR code detected in this image.');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // --- Handle Result & Actions ---
    function handleResult(data) {
        resultDisplay.textContent = data;
        copyResultBtn.disabled = false;
    }

    copyResultBtn.addEventListener('click', () => {
        if (!resultDisplay.textContent || resultDisplay.querySelector('.placeholder-text')) return;

        navigator.clipboard.writeText(resultDisplay.textContent).then(() => {
            const originalText = copyResultBtn.textContent;
            copyResultBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyResultBtn.textContent = originalText;
            }, 1500);
        });
    });
});