document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENT REFERENCES ---
    const operatorNameInput = document.getElementById('operatorName');
    const saveAccountBtn = document.getElementById('saveAccountBtn');

    const savedPresetsSelect = document.getElementById('savedPresetsSelect');
    const presetLabelInput = document.getElementById('presetLabel');
    const webAppUrlInput = document.getElementById('webAppUrl');
    const savePresetBtn = document.getElementById('savePresetBtn');
    const deletePresetBtn = document.getElementById('deletePresetBtn');

    const queueStatusText = document.getElementById('queueStatusText');
    const manualSyncBtn = document.getElementById('manualSyncBtn');

    // --- STORAGE KEYS ---
    const ACCOUNT_KEY = 'scanqr_account_info';
    const PRESETS_KEY = 'scanqr_google_script_presets';
    const ACTIVE_URL_KEY = 'scanqr_active_script_url';
    const QUEUE_KEY = 'scanqr_offline_queue';

    // --- INITIAL LOAD ---
    loadAccountSettings();
    loadPresets();
    updateQueueStatusUI();

    // ------------------------------------------------------------------
    // 1. ACCOUNT SETTINGS MANAGEMENT
    // ------------------------------------------------------------------
    function loadAccountSettings() {
        if (!operatorNameInput) return;
        const savedAccount = localStorage.getItem(ACCOUNT_KEY);
        if (savedAccount) {
            operatorNameInput.value = savedAccount;
        }
    }

    if (saveAccountBtn) {
        saveAccountBtn.addEventListener('click', () => {
            const name = operatorNameInput.value.trim();
            if (name) {
                localStorage.setItem(ACCOUNT_KEY, name);
                showToast("Account Info Saved Successfully", "success");
            } else {
                localStorage.removeItem(ACCOUNT_KEY);
                showToast("Account Info Cleared", "success");
            }
        });
    }

    // ------------------------------------------------------------------
    // 2. GOOGLE SCRIPT PRESETS MANAGEMENT
    // ------------------------------------------------------------------
    function loadPresets() {
        if (!savedPresetsSelect) return;
        const presets = getPresets();
        const activeUrl = localStorage.getItem(ACTIVE_URL_KEY);
        
        savedPresetsSelect.innerHTML = '<option value="">-- Select a saved URL --</option>';

        let matchedIndex = "";
        presets.forEach((preset, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = preset.label;
            
            if (preset.url === activeUrl) {
                matchedIndex = index.toString();
            }
            savedPresetsSelect.appendChild(option);
        });

        if (matchedIndex !== "") {
            savedPresetsSelect.value = matchedIndex;
            presetLabelInput.value = presets[matchedIndex].label;
            webAppUrlInput.value = presets[matchedIndex].url;
        } else if (activeUrl) {
            webAppUrlInput.value = activeUrl;
        }
    }

    function getPresets() {
        return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]');
    }

    if (savedPresetsSelect) {
        savedPresetsSelect.addEventListener('change', (e) => {
            const index = e.target.value;
            const presets = getPresets();

            if (index !== "" && presets[index]) {
                presetLabelInput.value = presets[index].label;
                webAppUrlInput.value = presets[index].url;
                localStorage.setItem(ACTIVE_URL_KEY, presets[index].url);
                showToast(`Active URL set to: "${presets[index].label}"`, "success");
            } else {
                presetLabelInput.value = "";
                webAppUrlInput.value = "";
                localStorage.removeItem(ACTIVE_URL_KEY);
            }
        });
    }

    if (savePresetBtn) {
        savePresetBtn.addEventListener('click', () => {
            const label = presetLabelInput.value.trim() || "Untitled Script";
            const url = webAppUrlInput.value.trim();

            if (!url) {
                showToast("Please enter a valid Google Web App URL", "error");
                return;
            }

            let presets = getPresets();
            const selectedIndex = savedPresetsSelect.value;

            if (selectedIndex !== "" && presets[selectedIndex]) {
                presets[selectedIndex] = { label, url };
            } else {
                const existingIndex = presets.findIndex(p => p.label.toLowerCase() === label.toLowerCase());
                if (existingIndex !== -1) {
                    presets[existingIndex] = { label, url };
                } else {
                    presets.push({ label, url });
                }
            }

            localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
            localStorage.setItem(ACTIVE_URL_KEY, url);

            loadPresets();
            showToast("URL Saved & Activated Successfully", "success");
        });
    }

    if (deletePresetBtn) {
        deletePresetBtn.addEventListener('click', () => {
            const selectedIndex = savedPresetsSelect.value;
            
            if (selectedIndex === "") {
                showToast("Please select a preset to delete", "error");
                return;
            }

            let presets = getPresets();
            const deleted = presets[selectedIndex];

            presets.splice(selectedIndex, 1);
            localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));

            if (localStorage.getItem(ACTIVE_URL_KEY) === deleted.url) {
                localStorage.removeItem(ACTIVE_URL_KEY);
            }

            presetLabelInput.value = "";
            webAppUrlInput.value = "";
            loadPresets();

            showToast(`Deleted preset "${deleted.label}"`, "success");
        });
    }

    // ------------------------------------------------------------------
    // 3. OFFLINE QUEUE & MANUAL SYNC FUNCTIONALITY
    // ------------------------------------------------------------------
    function updateQueueStatusUI() {
        if (!queueStatusText) return;
        const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        queueStatusText.textContent = `Pending Items: ${queue.length}`;
    }

    if (manualSyncBtn) {
        manualSyncBtn.addEventListener('click', async () => {
            // Check internet connection
            if (!navigator.onLine) {
                showToast("Cannot sync: No internet connection", "error");
                return;
            }

            const activeUrl = localStorage.getItem(ACTIVE_URL_KEY);
            if (!activeUrl) {
                showToast("Cannot sync: No Google Script URL saved or selected", "error");
                return;
            }

            const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
            if (queue.length === 0) {
                showToast("Queue is empty. No pending data to sync.", "success");
                return;
            }

            // Disable button during sync
            manualSyncBtn.disabled = true;
            manualSyncBtn.textContent = "Syncing...";
            showToast(`Starting sync for ${queue.length} item(s)...`, "success");

            let remainingQueue = [...queue];
            let successCount = 0;
            let failCount = 0;

            for (const data of queue) {
                try {
                    await fetch(activeUrl, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: {
                            'Content-Type': 'text/plain;charset=utf-8'
                        },
                        body: JSON.stringify({
                            date: data.scanDate,
                            time: data.scanTime,
                            name: data.name,
                            college: data.college,
                            designation: data.designation,
                            rawQrData: data.rawQrData,
                            scanType: data.scanType,
                            operator: data.operator
                        })
                    });

                    // Remove processed item from queue
                    remainingQueue.shift();
                    localStorage.setItem(QUEUE_KEY, JSON.stringify(remainingQueue));
                    updateQueueStatusUI();
                    successCount++;
                } catch (error) {
                    console.error("Failed to sync item:", data, error);
                    failCount++;
                    break; // Stop loop on network failure
                }
            }

            // Re-enable button
            manualSyncBtn.disabled = false;
            manualSyncBtn.textContent = "Sync Now";

            // Show sync notification status
            if (failCount === 0 && remainingQueue.length === 0) {
                showToast(`Sync Complete! Successfully uploaded ${successCount} item(s).`, "success");
            } else {
                showToast(`Sync Interrupted! Uploaded: ${successCount}, Remaining: ${remainingQueue.length}`, "error");
            }

            updateQueueStatusUI();
        });
    }

    // Auto sync when coming back online while in Settings page
    window.addEventListener('online', () => {
        showToast("Internet connection restored!", "success");
    });

    // ------------------------------------------------------------------
    // 4. TOAST NOTIFICATION HELPER
    // ------------------------------------------------------------------
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
            <span style="font-size: 1.1rem;">${type === 'success' ? '✓' : '✕'}</span>
            <span>${message}</span>
        `;

        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
});