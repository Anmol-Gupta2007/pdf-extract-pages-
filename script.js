// Global State
let originalFileBytes = null;
let originalFileName = "";
let totalPages = 0;
let selectedPages = new Set(); // Keeps track of pages chosen to extract

// --- UI Elements ---
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const chooseBtn = document.getElementById('choose-btn');
const outputContainer = document.getElementById('output-container');
const actionBar = document.getElementById('action-bar');
const statusText = document.getElementById('status-text');
const extractSingleBtn = document.getElementById('extract-single-btn');
const extractIndividualBtn = document.getElementById('extract-individual-btn');
const modal = document.getElementById('processing-modal');

// --- Helper: Download Function ---
function download(data, filename, type) {
    const blob = new Blob([data], { type: type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// --- Event Listeners for Uploading ---
chooseBtn.addEventListener('click', (e) => {
    e.stopPropagation(); 
    fileInput.click();
});

uploadArea.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        processFile(e.target.files[0]);
    }
    fileInput.value = ''; 
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        processFile(e.dataTransfer.files[0]);
    }
});

// --- Process Uploaded File ---
async function processFile(file) {
    if (file.type !== 'application/pdf') {
        alert("Please select a valid PDF file.");
        return;
    }

    modal.style.display = 'flex';
    originalFileName = file.name.replace('.pdf', '');
    selectedPages.clear(); 

    try {
        originalFileBytes = await file.arrayBuffer();
        
        // 1. Get total pages using pdf-lib
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.load(originalFileBytes);
        totalPages = pdfDoc.getPageCount();
        
        actionBar.style.display = 'block';
        updateStatusText();
        
        // 2. Render visual previews using pdf.js
        await renderPreviews();

    } catch (error) {
        console.error("Error reading PDF:", error);
        alert("Could not process this PDF. It may be corrupted or encrypted.");
    }
    
    modal.style.display = 'none';
}

// --- Render Visual Page Previews ---
async function renderPreviews() {
    outputContainer.innerHTML = '';

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(originalFileBytes) });
    const pdfViewerDoc = await loadingTask.promise;

    for (let i = 0; i < totalPages; i++) {
        const card = document.createElement('div');
        card.className = 'pdf-card';
        card.id = `page-card-${i}`;

        card.innerHTML = `
            <canvas id="canvas-${i}" class="pdf-preview"></canvas>
            <div class="pdf-name">Page ${i + 1}</div>
            <button id="btn-${i}" class="toggle-btn btn-unselected" onclick="togglePage(${i})">Select Page</button>
        `;
        
        outputContainer.appendChild(card);

        // Render PDF page onto canvas
        try {
            const page = await pdfViewerDoc.getPage(i + 1);
            const canvas = document.getElementById(`canvas-${i}`);
            const context = canvas.getContext('2d');
            
            const unscaledViewport = page.getViewport({ scale: 1 });
            const scale = 160 / unscaledViewport.height; 
            const viewport = page.getViewport({ scale: scale });
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
        } catch (err) {
            console.error("Error rendering page", i, err);
        }
    }
}

// --- Instant Toggle Page State ---
window.togglePage = function(pageIndex) {
    const card = document.getElementById(`page-card-${pageIndex}`);
    const btn = document.getElementById(`btn-${pageIndex}`);

    if (selectedPages.has(pageIndex)) {
        // Deselect
        selectedPages.delete(pageIndex); 
        card.classList.remove('selected-state');
        btn.className = 'toggle-btn btn-unselected';
        btn.innerHTML = 'Select Page';
    } else {
        // Select for extraction
        selectedPages.add(pageIndex); 
        card.classList.add('selected-state');
        btn.className = 'toggle-btn btn-selected';
        btn.innerHTML = '✔️ Selected';
    }
    
    updateStatusText();
}

function updateStatusText() {
    if (selectedPages.size === 0) {
        statusText.innerText = "0 pages selected. Click pages below to select them.";
        statusText.style.color = "#7b7b7b";
    } else {
        statusText.innerText = `${selectedPages.size} page(s) selected for extraction.`;
        statusText.style.color = "#4facfe";
    }
}

// --- OPTION 1: Extract as Single PDF ---
extractSingleBtn.addEventListener('click', async () => {
    if (!originalFileBytes || selectedPages.size === 0) {
        alert("Please select at least one page to extract.");
        return;
    }

    modal.style.display = 'flex';

    try {
        const { PDFDocument } = PDFLib;
        const originalDoc = await PDFDocument.load(originalFileBytes);
        const newDoc = await PDFDocument.create();
        
        // Convert Set to Array and sort numerically so pages stay in original order
        const indicesToExtract = Array.from(selectedPages).sort((a, b) => a - b);

        const copiedPages = await newDoc.copyPages(originalDoc, indicesToExtract);
        copiedPages.forEach((page) => newDoc.addPage(page));

        const newPdfBytes = await newDoc.save();
        download(newPdfBytes, `${originalFileName}_Extracted.pdf`, "application/pdf");
        
    } catch (error) {
        console.error("Error extracting PDF:", error);
        alert("Failed to extract pages.");
    }
    
    modal.style.display = 'none';
});

// --- OPTION 2: Extract as Individual PDFs ---
extractIndividualBtn.addEventListener('click', async () => {
    if (!originalFileBytes || selectedPages.size === 0) {
        alert("Please select at least one page to extract.");
        return;
    }

    modal.style.display = 'flex';

    try {
        const { PDFDocument } = PDFLib;
        const originalDoc = await PDFDocument.load(originalFileBytes);
        
        const indicesToExtract = Array.from(selectedPages).sort((a, b) => a - b);

        // Loop through each selected page and download it separately
        for (const idx of indicesToExtract) {
            const newDoc = await PDFDocument.create();
            
            const [copiedPage] = await newDoc.copyPages(originalDoc, [idx]);
            newDoc.addPage(copiedPage);

            const newPdfBytes = await newDoc.save();
            download(newPdfBytes, `${originalFileName}_Page_${idx + 1}.pdf`, "application/pdf");
            
            // Add a slight delay so the browser can process multiple downloads cleanly
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
    } catch (error) {
        console.error("Error extracting PDF:", error);
        alert("Failed to extract pages individually.");
    }
    
    modal.style.display = 'none';
});
