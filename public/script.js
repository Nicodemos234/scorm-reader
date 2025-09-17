// Global variables
let currentSCORMData = null;
let currentFilename = null;
let currentPackageId = null;

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultsSection = document.getElementById('resultsSection');
const packageInfo = document.getElementById('packageInfo');
const fileTree = document.getElementById('fileTree');
const manifestSection = document.getElementById('manifestSection');
const manifestContent = document.getElementById('manifestContent');
const viewContentBtn = document.getElementById('viewContentBtn');
const downloadBtn = document.getElementById('downloadBtn');
const contentViewer = document.getElementById('contentViewer');
const contentFrame = document.getElementById('contentFrame');
const closeViewer = document.getElementById('closeViewer');

// Event listeners
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
uploadArea.addEventListener('dragover', handleDragOver);
uploadArea.addEventListener('dragleave', handleDragLeave);
uploadArea.addEventListener('drop', handleDrop);
viewContentBtn.addEventListener('click', viewContent);
downloadBtn.addEventListener('click', downloadPackage);
closeViewer.addEventListener('click', closeContentViewer);

// Drag and drop handlers
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
}

// File selection handler
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
}

// File upload handler
function handleFileUpload(file) {
    // Validate file type
    const allowedTypes = ['.zip', '.scorm', '.pif'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
        showError('Please select a valid SCORM file (.zip, .scorm, or .pif)');
        return;
    }

    // Validate file size (100MB limit)
    if (file.size > 100 * 1024 * 1024) {
        showError('File size too large. Maximum size is 100MB.');
        return;
    }

    // Show upload progress
    uploadProgress.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Uploading...';

    // Create FormData
    const formData = new FormData();
    formData.append('scormFile', file);

    // Upload file
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            progressFill.style.width = percentComplete + '%';
            progressText.textContent = `Uploading... ${Math.round(percentComplete)}%`;
        }
    });

    xhr.addEventListener('load', () => {
        uploadProgress.style.display = 'none';
        
        if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            currentSCORMData = response.scormData;
            currentFilename = response.filename;
            currentPackageId = response.packageId;
            displayResults(response);
            showSuccess('SCORM file uploaded and analyzed successfully!');
        } else {
            const error = JSON.parse(xhr.responseText);
            showError(error.error || 'Upload failed');
        }
    });

    xhr.addEventListener('error', () => {
        uploadProgress.style.display = 'none';
        showError('Upload failed. Please try again.');
    });

    xhr.open('POST', '/upload');
    xhr.send(formData);
}

// Display results
function displayResults(response) {
    const scormData = response.scormData;
    
    // Show package info
    packageInfo.innerHTML = `
        <h3>📦 Package Information</h3>
        <div class="info-item">
            <span class="info-label">Filename:</span>
            <span class="info-value">${response.filename}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Total Files:</span>
            <span class="info-value">${scormData.files.length}</span>
        </div>
        ${scormData.manifest ? `
        <div class="info-item">
            <span class="info-label">Title:</span>
            <span class="info-value">${scormData.manifest.title || 'N/A'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Identifier:</span>
            <span class="info-value">${scormData.manifest.identifier || 'N/A'}</span>
        </div>
        ` : ''}
    `;

    // Display file tree
    displayFileTree(scormData.files);

    // Display manifest if available
    if (scormData.manifest) {
        displayManifest(scormData.manifest);
    }

    resultsSection.style.display = 'block';
}

// Display file tree
function displayFileTree(files) {
    fileTree.innerHTML = '';
    
    // Group files by directory
    const fileStructure = {};
    
    files.forEach(file => {
        const parts = file.name.split('/');
        const fileName = parts.pop();
        const directory = parts.join('/');
        
        if (!fileStructure[directory]) {
            fileStructure[directory] = [];
        }
        fileStructure[directory].push({ ...file, fileName });
    });

    // Render file structure
    Object.keys(fileStructure).sort().forEach(directory => {
        const filesInDir = fileStructure[directory];
        
        if (directory) {
            const dirElement = document.createElement('div');
            dirElement.className = 'file-item directory';
            dirElement.innerHTML = `
                <span class="file-icon">📁</span>
                <span>${directory}/</span>
            `;
            fileTree.appendChild(dirElement);
        }
        
        filesInDir.sort((a, b) => a.fileName.localeCompare(b.fileName)).forEach(file => {
            const fileElement = document.createElement('div');
            fileElement.className = 'file-item file';
            fileElement.innerHTML = `
                <span class="file-icon">${getFileIcon(file.fileName)}</span>
                <span>${file.fileName}</span>
                <span style="margin-left: auto; color: #888; font-size: 0.8rem;">
                    ${formatFileSize(file.size)}
                </span>
            `;
            fileElement.addEventListener('click', () => viewFile(file.name));
            fileTree.appendChild(fileElement);
        });
    });
}

// Display manifest information
function displayManifest(manifest) {
    manifestSection.style.display = 'block';
    
    let manifestHTML = '';
    
    if (manifest.organizations && manifest.organizations.length > 0) {
        manifestHTML += '<div class="manifest-item">';
        manifestHTML += '<div class="manifest-label">Organizations:</div>';
        manifest.organizations.forEach(org => {
            manifestHTML += `<div><strong>${org.identifier}</strong>: ${org.title}</div>`;
        });
        manifestHTML += '</div>';
    }
    
    if (manifest.resources && manifest.resources.length > 0) {
        manifestHTML += '<div class="manifest-item">';
        manifestHTML += '<div class="manifest-label">Resources:</div>';
        manifest.resources.forEach(resource => {
            manifestHTML += `<div><strong>${resource.identifier}</strong>: ${resource.href}</div>`;
        });
        manifestHTML += '</div>';
    }
    
    manifestContent.innerHTML = manifestHTML;
}

// Get file icon based on extension
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const icons = {
        'html': '🌐',
        'htm': '🌐',
        'css': '🎨',
        'js': '⚡',
        'json': '📄',
        'xml': '📄',
        'png': '🖼️',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'gif': '🖼️',
        'svg': '🖼️',
        'pdf': '📕',
        'txt': '📝',
        'doc': '📄',
        'docx': '📄',
        'mp4': '🎥',
        'mp3': '🎵',
        'wav': '🎵'
    };
    return icons[ext] || '📄';
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// View file content
function viewFile(filePath) {
    const url = `/content/${currentPackageId}/${filePath}`;
    contentFrame.src = url;
    contentViewer.style.display = 'flex';
}

// View SCORM content
function viewContent() {
    if (!currentSCORMData || !currentFilename) {
        showError('No SCORM package loaded');
        return;
    }

    // Try to find the main HTML file
    const htmlFiles = currentSCORMData.files.filter(file => 
        file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')
    );

    if (htmlFiles.length === 0) {
        showError('No HTML content found in SCORM package');
        return;
    }

    // Use the first HTML file or try to find index.html
    let mainFile = htmlFiles.find(file => 
        file.name.toLowerCase().includes('index')
    ) || htmlFiles[0];

    viewFile(mainFile.name);
}

// Download package
function downloadPackage() {
    if (!currentFilename || !currentPackageId) {
        showError('No package to download');
        return;
    }

    const link = document.createElement('a');
    link.href = `/content/${currentPackageId}/`;
    link.download = currentFilename;
    link.click();
}

// Close content viewer
function closeContentViewer() {
    contentViewer.style.display = 'none';
    contentFrame.src = 'about:blank';
}

// Utility functions
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    
    // Remove existing error messages
    const existingErrors = document.querySelectorAll('.error');
    existingErrors.forEach(error => error.remove());
    
    // Insert at the top of main
    const main = document.querySelector('main');
    main.insertBefore(errorDiv, main.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success';
    successDiv.textContent = message;
    
    // Remove existing success messages
    const existingSuccess = document.querySelectorAll('.success');
    existingSuccess.forEach(success => success.remove());
    
    // Insert at the top of main
    const main = document.querySelector('main');
    main.insertBefore(successDiv, main.firstChild);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('SCORM Reader initialized');
});
