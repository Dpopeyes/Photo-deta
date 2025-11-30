document.addEventListener('DOMContentLoaded', () => {
    const galleryInput = document.getElementById('gallery-input');
    const cameraInput = document.getElementById('camera-input');
    const galleryContainer = document.getElementById('gallery-container');
    const emptyState = document.getElementById('empty-state');
    const clearBtn = document.getElementById('clear-btn');

    let imageGroups = {};

    loadFromStorage();

    // Listen to both inputs
    galleryInput.addEventListener('change', handleFiles);
    cameraInput.addEventListener('change', handleFiles);

    clearBtn.addEventListener('click', clearGallery);

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

        // Reset inputs
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

            const header = document.createElement('h3');
            header.className = 'date-header';
            header.textContent = formatDateHeader(dateKey);
            groupDiv.appendChild(header);

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

                photoItem.onclick = () => viewImage(imgData.src);

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

    function viewImage(src) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.9); z-index: 1000;
            display: flex; align-items: center; justify-content: center;
            cursor: zoom-out; animation: fadeIn 0.2s;
        `;

        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = `max-width: 100%; max-height: 100%; object-fit: contain;`;

        modal.appendChild(img);
        modal.onclick = () => document.body.removeChild(modal);
        document.body.appendChild(modal);
    }
});
