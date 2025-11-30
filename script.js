document.addEventListener('DOMContentLoaded', () => {
    const galleryInput = document.getElementById('gallery-input');
    const cameraInput = document.getElementById('camera-input');
    const galleryContainer = document.getElementById('gallery-container');
    const emptyState = document.getElementById('empty-state');
    const clearBtn = document.getElementById('clear-btn');
    const saveFolderBtn = document.getElementById('save-folder-btn');

    let imageGroups = {};

    loadFromStorage();

    galleryInput.addEventListener('change', handleFiles);
    cameraInput.addEventListener('change', handleFiles);
    clearBtn.addEventListener('click', clearGallery);
    saveFolderBtn.addEventListener('click', saveToFolderStructure);

    function handleFiles(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        let processedCount = 0;

        files.forEach(file => {
            if (!file.type.startsWith('image/')) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const src = e.target.result;
                const timestamp = file.lastModified || Date.now();

                addImageToGroup(src, timestamp, file.name);

                processedCount++;
                if (processedCount === files.length) {
                    saveToStorage();
                    renderGallery();
                }
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    }

    function addImageToGroup(src, timestamp, name) {
        const date = new Date(timestamp);
        const dateKey = date.toISOString().split('T')[0];

        if (!imageGroups[dateKey]) {
            imageGroups[dateKey] = [];
        }

        imageGroups[dateKey].push({ src, timestamp, name });
        imageGroups[dateKey].sort((a, b) => b.timestamp - a.timestamp);
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

            headerContainer.appendChild(header);
            groupDiv.appendChild(headerContainer);

            const grid = document.createElement('div');
            grid.className = 'photo-grid';

            imageGroups[dateKey].forEach(imgData => {
                const photoItem = document.createElement('div');
                photoItem.className = 'photo-item';

                const img = document.createElement('img');
                img.src = imgData.src;
                img.alt = imgData.name;
                img.loading = 'lazy';
                img.onload = () => img.classList.add('loaded');

                photoItem.onclick = () => viewImage(imgData);

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

    function saveToStorage() {
        try {
            localStorage.setItem('my_gallery_data', JSON.stringify(imageGroups));
        } catch (e) {
            console.warn('Storage full', e);
            alert('พื้นที่จัดเก็บเต็ม รูปภาพบางส่วนอาจไม่ถูกบันทึก');
        }
    }

    function loadFromStorage() {
        try {
            const data = localStorage.getItem('my_gallery_data');
            if (data) {
                imageGroups = JSON.parse(data);
                renderGallery();
            }
        } catch (e) {
            console.error('Error loading data', e);
        }
    }

    function clearGallery() {
        if (confirm('ต้องการลบรูปภาพทั้งหมดใช่หรือไม่?')) {
            imageGroups = {};
            localStorage.removeItem('my_gallery_data');
            renderGallery();
        }
    }

    // --- File System Access API Feature ---

    async function saveToFolderStructure() {
        // Check browser support
        if (!window.showDirectoryPicker) {
            alert('ขออภัย เบราว์เซอร์ของคุณไม่รองรับการสร้างโฟลเดอร์โดยตรง (ฟีเจอร์นี้รองรับเฉพาะ Chrome บน PC หรือ Android บางรุ่นที่เปิดใช้งาน File System Access)');
            return;
        }

        if (Object.keys(imageGroups).length === 0) {
            alert('ไม่มีรูปภาพให้บันทึก');
            return;
        }

        try {
            alert('กรุณาเลือกโฟลเดอร์หลักที่จะใช้เก็บรูปภาพ (หรือสร้างโฟลเดอร์ใหม่)');

            // 1. Ask user to pick a root directory
            const rootHandle = await window.showDirectoryPicker();

            // Show loading indicator
            const originalIcon = saveFolderBtn.innerHTML;
            saveFolderBtn.innerHTML = '<span class="material-icons-round">hourglass_top</span>';
            saveFolderBtn.disabled = true;

            let totalFiles = 0;

            // 2. Loop through date groups
            for (const [dateKey, images] of Object.entries(imageGroups)) {
                // 3. Create/Get sub-directory for this date (e.g., "2023-11-30")
                const dateDirHandle = await rootHandle.getDirectoryHandle(dateKey, { create: true });

                // 4. Save files into this sub-directory
                for (let i = 0; i < images.length; i++) {
                    const imgData = images[i];

                    // Convert Base64 to Blob
                    const response = await fetch(imgData.src);
                    const blob = await response.blob();

                    // Create file handle
                    const fileName = imgData.name || `image_${Date.now()}_${i}.jpg`;
                    const fileHandle = await dateDirHandle.getFileHandle(fileName, { create: true });

                    // Write to file
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();

                    totalFiles++;
                }
            }

            alert(`บันทึกเรียบร้อย! ทั้งหมด ${totalFiles} รูปในโฟลเดอร์ที่เลือก`);

        } catch (err) {
            console.error('Save to folder failed:', err);
            if (err.name !== 'AbortError') { // Don't alert if user cancelled
                alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
            }
        } finally {
            saveFolderBtn.innerHTML = '<span class="material-icons-round">drive_file_move</span>';
            saveFolderBtn.disabled = false;
        }
    }

    function viewImage(imgData) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';

        const content = document.createElement('div');
        content.className = 'modal-content';

        const img = document.createElement('img');
        img.src = imgData.src;

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const shareBtn = document.createElement('button');
        shareBtn.className = 'action-btn';
        shareBtn.innerHTML = '<span class="material-icons-round">share</span> แชร์';
        shareBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                const blob = await (await fetch(imgData.src)).blob();
                const file = new File([blob], imgData.name || 'image.jpg', { type: blob.type });

                if (navigator.share) {
                    await navigator.share({
                        files: [file],
                        title: 'แชร์รูปภาพ'
                    });
                } else {
                    alert('เบราว์เซอร์นี้ไม่รองรับการแชร์');
                }
            } catch (err) {
                console.error('Share failed:', err);
            }
        };

        const closeBtn = document.createElement('button');
        closeBtn.className = 'action-btn secondary';
        closeBtn.innerHTML = '<span class="material-icons-round">close</span>';
        closeBtn.onclick = () => document.body.removeChild(modal);

        actions.appendChild(shareBtn);
        actions.appendChild(closeBtn);

        content.appendChild(img);
        content.appendChild(actions);
        modal.appendChild(content);

        modal.onclick = (e) => {
            if (e.target === modal) document.body.removeChild(modal);
        };

        document.body.appendChild(modal);
    }
});
