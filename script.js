document.addEventListener('DOMContentLoaded', () => {
    const galleryInput = document.getElementById('gallery-input');
    const cameraInput = document.getElementById('camera-input');
    const galleryContainer = document.getElementById('gallery-container');
    const emptyState = document.getElementById('empty-state');
    const clearBtn = document.getElementById('clear-btn');
    const saveFolderBtn = document.getElementById('save-folder-btn');

    // IndexedDB Configuration
    const DB_NAME = 'PhotoGalleryDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'images';

    let db;
    let imageGroups = {};

    // Initialize Database
    initDB();

    galleryInput.addEventListener('change', handleFiles);
    cameraInput.addEventListener('change', handleFiles);
    clearBtn.addEventListener('click', clearGallery);
    saveFolderBtn.addEventListener('click', saveToFolderStructure);

    function initDB() {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Database error: " + event.target.errorCode);
            alert("ไม่สามารถเปิดฐานข้อมูลได้");
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
                objectStore.createIndex("dateKey", "dateKey", { unique: false });
                objectStore.createIndex("timestamp", "timestamp", { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            loadGalleryFromDB();
        };
    }

    function handleFiles(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        let promiseChain = Promise.resolve();

        files.forEach(file => {
            if (file.type && !file.type.startsWith('image/')) return;

            promiseChain = promiseChain.then(() => {
                return new Promise((resolve, reject) => {
                    saveImageToDB(file).then(() => {
                        resolve();
                    }).catch(err => {
                        console.error("Error saving file:", err);
                        resolve();
                    });
                });
            });
        });

        promiseChain.then(() => {
            loadGalleryFromDB();
            e.target.value = '';
        });
    }

    function saveImageToDB(file) {
        return new Promise((resolve, reject) => {
            // Validate file size
            if (file.size === 0) {
                console.warn("File size is 0, skipping:", file.name);
                resolve(); // Skip empty files
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const arrayBuffer = e.target.result;
                const transaction = db.transaction([STORE_NAME], "readwrite");
                const objectStore = transaction.objectStore(STORE_NAME);

                const timestamp = file.lastModified || Date.now();
                const date = new Date(timestamp);
                const dateKey = date.toISOString().split('T')[0];

                // Better MIME type detection
                let fileType = file.type;
                if (!fileType || fileType === '') {
                    const ext = file.name.split('.').pop().toLowerCase();
                    if (ext === 'png') fileType = 'image/png';
                    else if (ext === 'webp') fileType = 'image/webp';
                    else if (ext === 'heic') fileType = 'image/heic';
                    else if (ext === 'heif') fileType = 'image/heif';
                    else fileType = 'image/jpeg';
                }

                // Create a new Blob from the ArrayBuffer to ensure we have the actual data
                const blob = new Blob([arrayBuffer], { type: fileType });

                const imageData = {
                    name: file.name || `photo_${timestamp}.${fileType.split('/')[1] || 'jpg'}`,
                    type: fileType,
                    timestamp: timestamp,
                    dateKey: dateKey,
                    blob: blob
                };

                const request = objectStore.add(imageData);

                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);
            };

            reader.onerror = (e) => {
                console.error("FileReader error:", e);
                reject(e);
            };

            // Read the file content to ensure we capture the data
            reader.readAsArrayBuffer(file);
        });
    }

    function loadGalleryFromDB() {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const objectStore = transaction.objectStore(STORE_NAME);
        const index = objectStore.index("timestamp");

        imageGroups = {};

        const request = index.openCursor(null, 'prev');

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const data = cursor.value;

                if (!imageGroups[data.dateKey]) {
                    imageGroups[data.dateKey] = [];
                }

                imageGroups[data.dateKey].push(data);

                cursor.continue();
            } else {
                renderGallery();
            }
        };
    }

    function renderGallery() {
        galleryContainer.innerHTML = '';
        const sortedDateKeys = Object.keys(imageGroups).sort((a, b) => b.localeCompare(a));

        if (sortedDateKeys.length === 0) {
            galleryContainer.appendChild(emptyState);
            emptyState.style.display = 'flex';
            return;
        }

        sortedDateKeys.forEach(dateKey => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'date-group';

            const headerContainer = document.createElement('div');
            headerContainer.className = 'date-header-container';

            const header = document.createElement('h3');
            header.className = 'date-header';
            header.textContent = formatDateHeader(dateKey);

            const shareGroupBtn = document.createElement('button');
            shareGroupBtn.className = 'icon-btn small';
            shareGroupBtn.innerHTML = '<span class="material-icons-round" style="font-size: 18px;">share</span>';
            shareGroupBtn.title = 'แชร์รูปทั้งหมดในวันนี้';
            shareGroupBtn.onclick = () => shareGroup(dateKey);

            headerContainer.appendChild(header);
            headerContainer.appendChild(shareGroupBtn);
            groupDiv.appendChild(headerContainer);

            const grid = document.createElement('div');
            grid.className = 'photo-grid';

            imageGroups[dateKey].forEach(data => {
                const photoItem = document.createElement('div');
                photoItem.className = 'photo-item';

                const img = document.createElement('img');
                img.src = URL.createObjectURL(data.blob);
                img.alt = data.name;
                img.loading = 'lazy';
                img.onload = () => img.classList.add('loaded');

                photoItem.onclick = () => viewImage(data);

                photoItem.appendChild(img);
                grid.appendChild(photoItem);
            });

            groupDiv.appendChild(grid);
            galleryContainer.appendChild(groupDiv);
        });
    }

    function formatDateHeader(dateKey) {
        const date = new Date(dateKey);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        today.setHours(0, 0, 0, 0);
        yesterday.setHours(0, 0, 0, 0);
        const compareDate = new Date(dateKey + 'T00:00:00');

        if (compareDate.getTime() === today.getTime()) {
            return 'วันนี้';
        } else if (compareDate.getTime() === yesterday.getTime()) {
            return 'เมื่อวาน';
        } else {
            return compareDate.toLocaleDateString('th-TH', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }

    function clearGallery() {
        if (confirm('ต้องการลบรูปภาพทั้งหมดใช่หรือไม่? (ไม่สามารถกู้คืนได้)')) {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.clear();

            request.onsuccess = () => {
                loadGalleryFromDB();
            };

            request.onerror = (e) => {
                console.error("Clear failed:", e);
                alert("เกิดข้อผิดพลาดในการลบข้อมูล");
            };
        }
    }

    async function shareGroup(dateKey) {
        const images = imageGroups[dateKey];
        if (!images || images.length === 0) return;

        try {
            const files = images.map(data => data.blob);

            if (navigator.share) {
                await navigator.share({
                    files: files,
                    title: `รูปภาพวันที่ ${dateKey}`,
                    text: `รูปภาพจำนวน ${files.length} รูป`
                });
            } else {
                alert('เบราว์เซอร์นี้ไม่รองรับการแชร์กลุ่มรูปภาพ');
            }
        } catch (err) {
            console.error('Share group failed:', err);
            alert('เกิดข้อผิดพลาดในการแชร์ (อาจมีรูปเยอะเกินไป)');
        }
    }

    function viewImage(data) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';

        const content = document.createElement('div');
        content.className = 'modal-content';

        const img = document.createElement('img');
        img.src = URL.createObjectURL(data.blob);

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const saveBtn = document.createElement('a');
        saveBtn.className = 'action-btn';
        saveBtn.innerHTML = '<span class="material-icons-round">save_alt</span> บันทึก';
        saveBtn.download = data.name;
        saveBtn.href = img.src;
        saveBtn.style.textDecoration = 'none';

        const shareBtn = document.createElement('button');
        shareBtn.className = 'action-btn secondary';
        shareBtn.innerHTML = '<span class="material-icons-round">share</span> แชร์';
        shareBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                if (navigator.share) {
                    await navigator.share({
                        files: [data.blob],
                        title: 'แชร์รูปภาพ'
                    });
                } else {
                    alert('เบราว์เซอร์นี้ไม่รองรับการแชร์');
                }
            } catch (err) {
                console.error('Share failed:', err);
            }
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn secondary';
        deleteBtn.style.backgroundColor = '#ffb4ab';
        deleteBtn.style.color = '#690005';
        deleteBtn.innerHTML = '<span class="material-icons-round">delete</span>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm('ต้องการลบรูปนี้?')) {
                deleteImage(data.id);
                document.body.removeChild(modal);
            }
        };

        const closeBtn = document.createElement('button');
        closeBtn.className = 'action-btn secondary';
        closeBtn.innerHTML = '<span class="material-icons-round">close</span>';
        closeBtn.onclick = () => document.body.removeChild(modal);

        actions.appendChild(saveBtn);
        actions.appendChild(shareBtn);
        actions.appendChild(deleteBtn);
        actions.appendChild(closeBtn);

        content.appendChild(img);
        content.appendChild(actions);
        modal.appendChild(content);

        modal.onclick = (e) => {
            if (e.target === modal) document.body.removeChild(modal);
        };

        document.body.appendChild(modal);
    }

    function deleteImage(id) {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.delete(id);

        request.onsuccess = () => {
            loadGalleryFromDB();
        };
    }

    async function saveToFolderStructure() {
        if (!window.showDirectoryPicker) {
            alert('ขออภัย เบราว์เซอร์ของคุณไม่รองรับการสร้างโฟลเดอร์โดยตรง');
            return;
        }

        if (Object.keys(imageGroups).length === 0) {
            alert('ไม่มีรูปภาพให้บันทึก');
            return;
        }

        try {
            alert('กรุณาเลือกโฟลเดอร์หลักที่จะใช้เก็บรูปภาพ');
            const rootHandle = await window.showDirectoryPicker();

            const originalIcon = saveFolderBtn.innerHTML;
            saveFolderBtn.innerHTML = '<span class="material-icons-round">hourglass_top</span>';
            saveFolderBtn.disabled = true;

            let totalFiles = 0;
            let errorCount = 0;

            for (const [dateKey, images] of Object.entries(imageGroups)) {
                const dateDirHandle = await rootHandle.getDirectoryHandle(dateKey, { create: true });

                for (let i = 0; i < images.length; i++) {
                    const data = images[i];

                    // Determine correct extension from MIME type first, then filename
                    let ext = 'jpg';
                    if (data.type === 'image/png') ext = 'png';
                    else if (data.type === 'image/webp') ext = 'webp';
                    else if (data.type === 'image/heic') ext = 'heic';
                    else if (data.type === 'image/heif') ext = 'heif';
                    else {
                        const nameExt = data.name.split('.').pop().toLowerCase();
                        if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(nameExt)) {
                            ext = nameExt;
                        }
                    }

                    // Clean filename base
                    let nameWithoutExt = data.name.substring(0, data.name.lastIndexOf('.')) || 'image';
                    nameWithoutExt = nameWithoutExt.replace(/[^a-z0-9]/gi, '_');

                    const fileName = `${nameWithoutExt}_${data.timestamp}_${i}.${ext}`;

                    try {
                        const fileHandle = await dateDirHandle.getFileHandle(fileName, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(data.blob);
                        await writable.close();
                        totalFiles++;
                    } catch (writeErr) {
                        console.error(`Failed to save ${fileName}:`, writeErr);
                        errorCount++;

                        try {
                            const retryName = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
                            const fileHandle = await dateDirHandle.getFileHandle(retryName, { create: true });
                            const writable = await fileHandle.createWritable();
                            await writable.write(data.blob);
                            await writable.close();
                            totalFiles++;
                            errorCount--;
                        } catch (retryErr) {
                            console.error("Retry failed:", retryErr);
                        }
                    }
                }
            }

            if (errorCount > 0) {
                alert(`บันทึกเสร็จสิ้น ${totalFiles} รูป (มีข้อผิดพลาด ${errorCount} รูป)`);
            } else {
                alert(`บันทึกเรียบร้อย! ทั้งหมด ${totalFiles} รูป`);
            }

        } catch (err) {
            console.error('Save to folder failed:', err);
            if (err.name !== 'AbortError') {
                alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
            }
        } finally {
            saveFolderBtn.innerHTML = '<span class="material-icons-round">drive_file_move</span>';
            saveFolderBtn.disabled = false;
        }
    }
});
