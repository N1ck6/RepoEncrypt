class CryptoEncoder {
    constructor() {
        // Алфавит для шифрования: русский, английский, цифры, символы программирования
        this.alphabet = this.buildAlphabet();
        this.maxFileSize = 5 * 1024 * 1024; // 5MB limit for encryption
        this.supportedExtensions = [
            'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
            'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'r',
            'html', 'css', 'scss', 'less', 'json', 'xml', 'yaml', 'yml',
            'md', 'txt', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
            'env', 'ini', 'cfg', 'conf', 'toml', 'graphql', 'proto'
        ];
        this.imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];
        
        this.repoUrl = '';
        this.passphrase = '';
        this.mode = null; // 'encrypt' or 'decrypt'
        this.files = [];
        this.currentFile = null;
        this.folderStates = {}; // Track expanded/collapsed folders
        
        this.init();
    }
    
    buildAlphabet() {
        const chars = [];
        let index = 0;
        
        // Английские буквы (верхний и нижний регистр)
        'abcdefghijklmnopqrstuvwxyz'.split('').forEach(c => chars[index++] = c);
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(c => chars[index++] = c);
        
        // Русские буквы (верхний и нижний регистр)
        'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'.split('').forEach(c => chars[index++] = c);
        'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'.split('').forEach(c => chars[index++] = c);
        
        // Цифры
        '0123456789'.split('').forEach(c => chars[index++] = c);
        
        // Символы программирования и клавиатуры (включая пробел!)
        const symbols = ' \n\t!@#$%^&*()_+-=[]{}|;\':",.<>?/\\`~';
        symbols.split('').forEach(c => chars[index++] = c);
        
        return chars;
    }
    
    init() {
        this.bindEvents();
    }
    
    bindEvents() {
        document.getElementById('btn-encrypt').addEventListener('click', () => this.startProcess('encrypt'));
        document.getElementById('btn-decrypt').addEventListener('click', () => this.startProcess('decrypt'));
        document.getElementById('back-btn').addEventListener('click', () => this.goBack());
        document.getElementById('download-zip').addEventListener('click', () => this.downloadZIP());
        document.getElementById('download-file').addEventListener('click', () => this.downloadCurrentFile());
        
        // Toggle password visibility
        document.getElementById('toggle-password').addEventListener('click', () => this.togglePasswordVisibility());
    }
    
    togglePasswordVisibility() {
        const input = document.getElementById('passphrase');
        const eyeIcon = document.querySelector('.eye-icon');
        const eyeOffIcon = document.querySelector('.eye-off-icon');
        
        if (input.type === 'password') {
            input.type = 'text';
            eyeIcon.style.display = 'none';
            eyeOffIcon.style.display = 'block';
        } else {
            input.type = 'password';
            eyeIcon.style.display = 'block';
            eyeOffIcon.style.display = 'none';
        }
    }
    
    showLoading(text = 'Загрузка...') {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading-overlay').style.display = 'flex';
    }
    
    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    }
    
    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    
    async startProcess(mode) {
        const repoUrl = document.getElementById('repo-url').value.trim();
        const passphrase = document.getElementById('passphrase').value;
        
        if (!repoUrl) {
            this.showToast('Пожалуйста, введите ссылку на репозиторий', 'error');
            return;
        }
        
        if (!passphrase) {
            this.showToast('Пожалуйста, введите кодовое слово', 'error');
            return;
        }
        
        // Parse GitHub URL
        const repoInfo = this.parseGitHubUrl(repoUrl);
        if (!repoInfo) {
            this.showToast('Неверная ссылка на GitHub репозиторий', 'error');
            return;
        }
        
        this.repoUrl = repoUrl;
        this.passphrase = passphrase;
        this.mode = mode;
        
        this.showLoading('Загрузка файлов репозитория...');
        
        try {
            await this.loadRepoFiles(repoInfo.owner, repoInfo.repo);
            this.showWorkspace();
        } catch (error) {
            this.hideLoading();
            this.showToast('Ошибка загрузки репозитория: ' + error.message, 'error');
        }
    }
    
    parseGitHubUrl(url) {
        const patterns = [
            /github\.com\/([^\/]+)\/([^\/]+)/,
            /github\.com\/([^\/]+)\/([^\/]+)\.git/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return { owner: match[1], repo: match[2].replace('.git', '') };
            }
        }
        return null;
    }
    
    async loadRepoFiles(owner, repo) {
        // Try different branches
        const branches = ['main', 'master', 'develop'];
        let treeData = null;
        
        for (const branch of branches) {
            try {
                const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
                const response = await fetch(apiUrl);
                if (response.ok) {
                    treeData = await response.json();
                    break;
                }
            } catch (error) {
                continue;
            }
        }
        
        if (!treeData) {
            throw new Error('Не удалось получить доступ к репозиторию. Проверьте, что он публичный.');
        }
        
        this.processTreeData(treeData.tree);
    }
    
    processTreeData(tree) {
        this.files = tree.filter(item => item.type === 'blob').map(item => ({
            path: item.path,
            sha: item.sha,
            size: item.size,
            type: this.getFileType(item.path),
            isSupported: this.isSupportedFile(item.path),
            isImage: this.isImageFile(item.path)
        }));
        
        document.getElementById('repo-name').textContent = this.repoUrl.split('/').slice(-2).join('/');
        document.getElementById('repo-link').href = this.repoUrl;
        
        // Update stats
        const totalFiles = this.files.length;
        const supportedFiles = this.files.filter(f => f.isSupported).length;
        document.getElementById('total-files').textContent = totalFiles;
        document.getElementById('encrypted-files').textContent = supportedFiles;
        
        this.renderFileTree();
        this.hideLoading();
    }
    
    getFileType(path) {
        const ext = path.split('.').pop().toLowerCase();
        if (this.imageExtensions.includes(ext)) return 'image';
        if (this.supportedExtensions.includes(ext)) return 'code';
        return 'other';
    }
    
    isSupportedFile(path) {
        const ext = path.split('.').pop().toLowerCase();
        return this.supportedExtensions.includes(ext);
    }
    
    isImageFile(path) {
        const ext = path.split('.').pop().toLowerCase();
        return this.imageExtensions.includes(ext);
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    renderFileTree() {
        const treeContainer = document.getElementById('file-tree');
        treeContainer.innerHTML = '';
        
        // Build folder structure
        const structure = {};
        
        this.files.forEach(file => {
            const parts = file.path.split('/');
            let current = structure;
            
            parts.forEach((part, index) => {
                if (index === parts.length - 1) {
                    // File
                    current[part] = { __file__: file };
                } else {
                    // Folder
                    if (!current[part]) {
                        current[part] = {};
                    }
                    current = current[part];
                }
            });
        });
        
        this.renderTreeItem(structure, treeContainer, '');
    }
    
    renderTreeItem(obj, container, path) {
        const keys = Object.keys(obj).sort((a, b) => {
            const aIsFile = !!obj[a].__file__;
            const bIsFile = !!obj[b].__file__;
            if (aIsFile && !bIsFile) return 1;
            if (!aIsFile && bIsFile) return -1;
            return a.localeCompare(b);
        });
        
        keys.forEach(key => {
            const item = obj[key];
            const isFile = !!item.__file__;
            const fullPath = path ? `${path}/${key}` : key;
            
            if (isFile) {
                const file = item.__file__;
                const div = document.createElement('div');
                div.className = 'file-tree-item';
                div.dataset.path = fullPath;
                
                const icon = this.getFileIcon(file.type);
                div.innerHTML = `${icon}<span>${key}</span>`;
                
                if (file.type === 'code') {
                    div.dataset.type = file.path.split('.').pop().toLowerCase();
                } else if (file.type === 'image') {
                    div.dataset.type = 'image';
                }
                
                // Mark encrypted files in decrypt mode
                if (this.mode === 'decrypt' && file.isSupported) {
                    div.classList.add('encrypted');
                }
                
                div.addEventListener('click', () => this.selectFile(file));
                container.appendChild(div);
            } else {
                // Folder
                const div = document.createElement('div');
                div.className = 'file-tree-item folder';
                
                const folderIcon = '<svg class="icon folder-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>';
                div.innerHTML = `${folderIcon}<span>${key}</span>`;
                
                const childrenDiv = document.createElement('div');
                childrenDiv.className = 'file-tree-children';
                
                // Check if folder was previously expanded
                const isExpanded = this.folderStates[fullPath] !== false;
                if (!isExpanded) {
                    childrenDiv.classList.add('collapsed');
                } else {
                    div.classList.add('expanded');
                }
                
                div.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleFolder(fullPath, div, childrenDiv);
                });
                
                container.appendChild(div);
                this.renderTreeItem(item, childrenDiv, fullPath);
                container.appendChild(childrenDiv);
            }
        });
    }
    
    toggleFolder(path, folderDiv, childrenDiv) {
        const isCollapsed = childrenDiv.classList.contains('collapsed');
        
        if (isCollapsed) {
            childrenDiv.classList.remove('collapsed');
            folderDiv.classList.add('expanded');
            this.folderStates[path] = true;
        } else {
            childrenDiv.classList.add('collapsed');
            folderDiv.classList.remove('expanded');
            this.folderStates[path] = false;
        }
    }
    
    getFileIcon(type) {
        const icons = {
            code: '<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
            image: '<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
            other: '<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>'
        };
        return icons[type] || icons.other;
    }
    
    async selectFile(file) {
        this.currentFile = file;
        
        // Update UI
        document.querySelectorAll('.file-tree-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-path="${file.path}"]`)?.classList.add('active');
        
        document.getElementById('current-file-path').textContent = file.path;
        document.getElementById('file-size').textContent = this.formatFileSize(file.size);
        document.getElementById('welcome-message').style.display = 'none';
        document.getElementById('file-editor').style.display = 'none';
        document.getElementById('file-preview').style.display = 'none';
        document.getElementById('image-preview').style.display = 'none';
        document.getElementById('download-file').style.display = 'none';
        
        // Update download button text based on mode
        const downloadBtnText = document.getElementById('download-btn-text');
        if (this.mode === 'encrypt') {
            downloadBtnText.textContent = 'Скачать зашифрованный';
        } else {
            downloadBtnText.textContent = 'Скачать';
        }
        
        if (file.type === 'image') {
            await this.loadAndDisplayImage(file);
        } else if (file.isSupported) {
            await this.loadAndDisplayFile(file);
        } else {
            // Show message for unsupported files
            document.getElementById('file-preview').innerHTML = 
                '<p style="color: var(--text-muted);">Предпросмотр этого типа файла недоступен</p>';
            document.getElementById('file-preview').style.display = 'block';
        }
    }
    
    async loadAndDisplayImage(file) {
        this.showLoading('Загрузка изображения...');
        
        try {
            const content = await this.fetchFileContent(file.path);
            const blob = await this.convertBase64ToBlob(content.content, content.encoding);
            const url = URL.createObjectURL(blob);
            
            const iframe = document.getElementById('image-preview');
            iframe.src = url;
            iframe.style.display = 'block';
            document.getElementById('download-file').style.display = 'inline-flex';
        } catch (error) {
            document.getElementById('file-preview').innerHTML = 
                `<p style="color: var(--error);">Ошибка загрузки: ${error.message}</p>`;
            document.getElementById('file-preview').style.display = 'block';
        } finally {
            this.hideLoading();
        }
    }
    
    async loadAndDisplayFile(file) {
        this.showLoading('Загрузка файла...');
        
        try {
            const content = await this.fetchFileContent(file.path);
            let decodedContent = atob(content.content);
            
            let displayContent = decodedContent;
            let isEncrypted = false;
            
            if (this.mode === 'encrypt') {
                // In encrypt mode, show file as-is without syntax highlighting
                displayContent = decodedContent;
            } else if (this.mode === 'decrypt') {
                // Check if file is encrypted (starts with "Encoder")
                if (decodedContent.startsWith('Encoder\n')) {
                    isEncrypted = true;
                    const encryptedContent = decodedContent.substring(8); // Remove "Encoder\n"
                    displayContent = this.decrypt(encryptedContent, this.passphrase);
                }
            }
            
            const editor = document.getElementById('file-editor');
            editor.value = displayContent;
            editor.style.display = 'block';
            editor.readOnly = true;
            
            document.getElementById('download-file').style.display = 'inline-flex';
        } catch (error) {
            document.getElementById('file-preview').innerHTML = 
                `<p style="color: var(--error);">Ошибка загрузки: ${error.message}</p>`;
            document.getElementById('file-preview').style.display = 'block';
        } finally {
            this.hideLoading();
        }
    }
    
    async fetchFileContent(path) {
        const repoInfo = this.parseGitHubUrl(this.repoUrl);
        const apiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${path}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error('Не удалось загрузить файл');
        }
        
        return await response.json();
    }
    
    convertBase64ToBlob(base64, encoding) {
        return new Promise((resolve) => {
            const binary = atob(base64);
            const array = [];
            for (let i = 0; i < binary.length; i++) {
                array.push(binary.charCodeAt(i));
            }
            resolve(new Blob([new Uint8Array(array)], { type: 'application/octet-stream' }));
        });
    }
    
    generateKey(passphrase) {
        // Generate numeric key from passphrase
        const key = [];
        for (let i = 0; i < passphrase.length; i++) {
            const charCode = passphrase.charCodeAt(i);
            key.push(charCode % this.alphabet.length);
        }
        return key;
    }
    
    encrypt(text, passphrase) {
        const key = this.generateKey(passphrase);
        let result = '';
        let keyIndex = 0;
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const charIndex = this.alphabet.indexOf(char);
            
            if (charIndex !== -1) {
                const shift = key[keyIndex % key.length];
                const newIndex = (charIndex + shift) % this.alphabet.length;
                result += this.alphabet[newIndex];
                keyIndex++;
            } else {
                result += char;
            }
        }
        
        return result;
    }
    
    decrypt(text, passphrase) {
        const key = this.generateKey(passphrase);
        let result = '';
        let keyIndex = 0;
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const charIndex = this.alphabet.indexOf(char);
            
            if (charIndex !== -1) {
                const shift = key[keyIndex % key.length];
                let newIndex = charIndex - shift;
                if (newIndex < 0) {
                    newIndex += this.alphabet.length;
                }
                result += this.alphabet[newIndex];
                keyIndex++;
            } else {
                result += char;
            }
        }
        
        return result;
    }
    
    async downloadCurrentFile() {
        if (!this.currentFile) return;
        
        try {
            const content = await this.fetchFileContent(this.currentFile.path);
            let decodedContent = atob(content.content);
            
            if (this.mode === 'encrypt' && this.currentFile.isSupported) {
                // Add "Encoder" header and encrypt
                const encryptedContent = this.encrypt(decodedContent, this.passphrase);
                decodedContent = 'Encoder\n' + encryptedContent;
            }
            
            const blob = new Blob([decodedContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = this.currentFile.path.split('/').pop();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showToast('Файл скачан', 'success');
        } catch (error) {
            this.showToast('Ошибка скачивания файла: ' + error.message, 'error');
        }
    }
    
    async downloadZIP() {
        if (this.mode !== 'encrypt') {
            this.showToast('Скачивание ZIP доступно только в режиме шифрования', 'error');
            return;
        }
        
        this.showLoading('Создание ZIP архива...');
        
        try {
            const zip = new JSZip();
            let processedCount = 0;
            
            for (const file of this.files) {
                processedCount++;
                this.showLoading(`Обработка: ${file.path} (${processedCount}/${this.files.length})`);
                
                try {
                    const content = await this.fetchFileContent(file.path);
                    let decodedContent = atob(content.content);
                    
                    // Only encrypt supported files under size limit
                    if (file.isSupported && file.size < this.maxFileSize) {
                        const encryptedContent = this.encrypt(decodedContent, this.passphrase);
                        decodedContent = 'Encoder\n' + encryptedContent;
                    }
                    
                    zip.file(file.path, decodedContent);
                } catch (error) {
                    console.error(`Error processing ${file.path}:`, error);
                    // Continue with other files
                }
            }
            
            this.showLoading('Упаковка ZIP...');
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            
            const repoName = this.repoUrl.split('/').filter(Boolean).pop();
            const a = document.createElement('a');
            a.href = url;
            a.download = `${repoName}-encrypted.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showToast('ZIP архив успешно создан!', 'success');
        } catch (error) {
            this.showToast('Ошибка создания ZIP: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    showWorkspace() {
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('workspace-screen').classList.add('active');
    }
    
    goBack() {
        document.getElementById('workspace-screen').classList.remove('active');
        document.getElementById('start-screen').classList.add('active');
        
        // Reset state
        this.files = [];
        this.currentFile = null;
        this.folderStates = {};
        document.getElementById('file-tree').innerHTML = '';
        document.getElementById('welcome-message').style.display = 'flex';
        document.getElementById('file-editor').style.display = 'none';
        document.getElementById('file-preview').style.display = 'none';
        document.getElementById('image-preview').style.display = 'none';
        document.getElementById('file-size').textContent = '';
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new CryptoEncoder();
});
