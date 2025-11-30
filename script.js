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
            // Create an objectStore to hold information about our customers. We're
            // going to use "id" as our key path because it's guaranteed to be
            // unique.
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

        // Process files sequentially to ensure order
        let promiseChain = Promise.resolve();

        files.forEach(file => {
            if (!file.type.startsWith('image/')) return;

            promiseChain = promiseChain.then(() => {
                return new Promise((resolve, reject) => {
                    // We store the file (Blob) directly, no need for FileReader to Base64
                    // This saves memory and storage space
                    saveImageToDB(file).then(() => {
                        resolve();
                    }).catch(err => {
                        console.error("Error saving file:", err);
                        resolve(); // Continue even if one fails
                    });
                });
            });
        });

        promiseChain.then(() => {
            // Reload gallery after all saves are done
            loadGalleryFromDB();
            e.target.value = ''; // Reset input
        });
    }

    function saveImageToDB(file) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const objectStore = transaction.objectStore(STORE_NAME);

            const timestamp = file.lastModified || Date.now();
            const date = new Date(timestamp);
            const dateKey = date.toISOString().split('T')[0];

            const imageData = {
                name: file.name,
                type: file.type,
                timestamp: timestamp,
                dateKey: dateKey,
                blob: file // Store the File object directly!
            };

            const request = objectStore.add(imageData);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    function loadGalleryFromDB() {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const objectStore = transaction.objectStore(STORE_NAME);
        const index = objectStore.index("timestamp"); // Sort by timestamp

        imageGroups = {}; // Reset local groups

        // Open cursor to iterate all items
        // direction 'prev' sorts by timestamp descending (newest first)
        const request = index.openCursor(null, 'prev');

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const data = cursor.value;

                if (!imageGroups[data.dateKey]) {
                    imageGroups[data.dateKey] = [];
                }

                // We keep the blob in memory only for rendering. 
                // URL.createObjectURL is efficient.
                imageGroups[data.dateKey].push(data);

                cursor.continue();
            } else {
                // Iteration complete
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

            // Share Group Button
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
                // Create object URL from the stored Blob
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
                loadGalleryFromDB(); // Reload (empty)
            };

            request.onerror = (e) => {
                console.error("Clear failed:", e);
                alert("เกิดข้อผิดพลาดในการลบข้อมูล");
            };
        }
    }

    // --- Features ---

    async function shareGroup(dateKey) {
        const images = imageGroups[dateKey];
        if (!images || images.length === 0) return;

        try {
            const files = images.map(data => data.blob); // We already have File objects

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

        // Save Button
        const saveBtn = document.createElement('a');
        saveBtn.className = 'action-btn';
        saveBtn.innerHTML = '<span class="material-icons-round">save_alt</span> บันทึก';
        saveBtn.download = data.name;
        saveBtn.href = img.src;
        saveBtn.style.textDecoration = 'none';

        // Share Button
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

        // Delete Single Image Button
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

            for (const [dateKey, images] of Object.entries(imageGroups)) {
                const dateDirHandle = await rootHandle.getDirectoryHandle(dateKey, { create: true });

                for (let i = 0; i < images.length; i++) {
                    const data = images[i];
                    const fileName = data.name || `image_${data.timestamp}.jpg`;
                    const fileHandle = await dateDirHandle.getFileHandle(fileName, { create: true });

                    const writable = await fileHandle.createWritable();
                    await writable.write(data.blob);
                    await writable.close();

                    totalFiles++;
                }
            }

            alert(`บันทึกเรียบร้อย! ทั้งหมด ${totalFiles} รูป`);

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
