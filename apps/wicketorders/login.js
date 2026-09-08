const loginManager = {
    users: {},
    currentUser: null,
    
    init() {
        this.loadUsers();
        this.loadSavedCredentials();
        this.bindEvents();
        this.checkAutoLogin();
    },
    
    loadUsers() {
        const usersData = localStorage.getItem('systemUsers');
        if (usersData) {
            this.users = JSON.parse(usersData);
        } else {
            this.users = {
                'admin': {
                    password: this.hashPassword('admin123'),
                    createdAt: new Date().toISOString()
                }
            };
            this.saveUsers();
        }
    },
    
    saveUsers() {
        localStorage.setItem('systemUsers', JSON.stringify(this.users));
    },
    
    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'hash_' + Math.abs(hash).toString(16) + '_' + password.length;
    },
    
    verifyPassword(inputPassword, storedHash) {
        return this.hashPassword(inputPassword) === storedHash;
    },
    
    loadSavedCredentials() {
        const savedUsername = localStorage.getItem('rememberedUsername');
        const savedPassword = localStorage.getItem('rememberedPassword');
        
        if (savedUsername) {
            document.getElementById('username').value = savedUsername;
            document.getElementById('rememberUsername').checked = true;
        }
        
        if (savedPassword) {
            document.getElementById('password').value = savedPassword;
            document.getElementById('rememberPassword').checked = true;
        }
    },
    
    saveCredentials() {
        const rememberUsername = document.getElementById('rememberUsername').checked;
        const rememberPassword = document.getElementById('rememberPassword').checked;
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        
        if (rememberUsername) {
            localStorage.setItem('rememberedUsername', username);
        } else {
            localStorage.removeItem('rememberedUsername');
        }
        
        if (rememberPassword) {
            localStorage.setItem('rememberedPassword', password);
        } else {
            localStorage.removeItem('rememberedPassword');
        }
    },
    
    checkAutoLogin() {
        const rememberPassword = localStorage.getItem('rememberedPassword');
        const username = localStorage.getItem('rememberedUsername');
        
        if (rememberPassword && username) {
            setTimeout(() => {
                this.login(username, rememberPassword);
            }, 500);
        }
    },
    
    bindEvents() {
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
        
        document.getElementById('changePasswordForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleChangePassword();
        });
        
        document.getElementById('rememberPassword').addEventListener('change', () => {
            if (document.getElementById('rememberPassword').checked) {
                document.getElementById('rememberUsername').checked = true;
            } else {
                localStorage.removeItem('rememberedPassword');
            }
        });
        
        document.getElementById('rememberUsername').addEventListener('change', () => {
            if (!document.getElementById('rememberUsername').checked) {
                localStorage.removeItem('rememberedUsername');
                document.getElementById('rememberPassword').checked = false;
                localStorage.removeItem('rememberedPassword');
            }
        });
    },
    
    handleLogin() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('loginError');
        const successEl = document.getElementById('loginSuccess');
        
        errorEl.style.display = 'none';
        successEl.style.display = 'none';
        
        if (!username || !password) {
            this.showError('请输入用户名和密码');
            return;
        }
        
        if (!this.users[username]) {
            this.showError('用户名不存在');
            return;
        }
        
        if (!this.verifyPassword(password, this.users[username].password)) {
            this.showError('密码错误');
            return;
        }
        
        this.currentUser = username;
        this.saveCredentials();
        localStorage.setItem('currentUser', username);
        localStorage.setItem('loginTime', new Date().toISOString());
        
        this.showSuccess('登录成功，正在进入系统...');
        
        setTimeout(() => {
            this.hideLogin();
        }, 800);
    },
    
    login(username, password) {
        const errorEl = document.getElementById('loginError');
        errorEl.style.display = 'none';
        
        if (!this.users[username]) {
            return false;
        }
        
        if (!this.verifyPassword(password, this.users[username].password)) {
            return false;
        }
        
        this.currentUser = username;
        localStorage.setItem('currentUser', username);
        localStorage.setItem('loginTime', new Date().toISOString());
        
        this.hideLogin();
        return true;
    },
    
    hideLogin() {
        document.getElementById('loginOverlay').classList.add('hidden');
    },
    
    showLogin() {
        document.getElementById('loginOverlay').classList.remove('hidden');
    },
    
    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        localStorage.removeItem('loginTime');
        localStorage.removeItem('rememberedUsername');
        localStorage.removeItem('rememberedPassword');
        this.showLogin();
    },
    
    isLoggedIn() {
        return this.currentUser !== null || localStorage.getItem('currentUser') !== null;
    },
    
    showError(message) {
        const errorEl = document.getElementById('loginError');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    },
    
    showSuccess(message) {
        const successEl = document.getElementById('loginSuccess');
        successEl.textContent = message;
        successEl.style.display = 'block';
    },
    
    showChangePasswordModal() {
        document.getElementById('changePasswordModal').classList.remove('hidden');
        document.getElementById('cpError').style.display = 'none';
        document.getElementById('cpSuccess').style.display = 'none';
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
    },
    
    closeChangePasswordModal() {
        document.getElementById('changePasswordModal').classList.add('hidden');
    },
    
    handleChangePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;
        const errorEl = document.getElementById('cpError');
        const successEl = document.getElementById('cpSuccess');
        
        errorEl.style.display = 'none';
        successEl.style.display = 'none';
        
        if (!this.currentUser && !localStorage.getItem('currentUser')) {
            this.showCPError('请先登录后再修改密码');
            return;
        }
        
        const username = this.currentUser || localStorage.getItem('currentUser');
        
        if (!this.users[username]) {
            this.showCPError('用户不存在');
            return;
        }
        
        if (!this.verifyPassword(currentPassword, this.users[username].password)) {
            this.showCPError('当前密码错误');
            return;
        }
        
        if (newPassword.length < 6) {
            this.showCPError('新密码长度至少6位');
            return;
        }
        
        if (newPassword !== confirmNewPassword) {
            this.showCPError('两次输入的密码不一致');
            return;
        }
        
        if (this.verifyPassword(newPassword, this.users[username].password)) {
            this.showCPError('新密码不能与当前密码相同');
            return;
        }
        
        this.users[username].password = this.hashPassword(newPassword);
        this.users[username].updatedAt = new Date().toISOString();
        this.saveUsers();
        
        if (document.getElementById('rememberPassword').checked) {
            localStorage.setItem('rememberedPassword', newPassword);
        }
        
        this.showCPSuccess('密码修改成功');
        
        setTimeout(() => {
            this.closeChangePasswordModal();
        }, 1500);
    },
    
    showCPError(message) {
        const errorEl = document.getElementById('cpError');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    },
    
    showCPSuccess(message) {
        const successEl = document.getElementById('cpSuccess');
        successEl.textContent = message;
        successEl.style.display = 'block';
    },
    
    registerUser(username, password) {
        if (this.users[username]) {
            return { success: false, message: '用户名已存在' };
        }
        
        if (password.length < 6) {
            return { success: false, message: '密码长度至少6位' };
        }
        
        this.users[username] = {
            password: this.hashPassword(password),
            createdAt: new Date().toISOString()
        };
        this.saveUsers();
        
        return { success: true, message: '用户注册成功' };
    },
    
    deleteUser(username) {
        if (!this.users[username]) {
            return { success: false, message: '用户不存在' };
        }
        
        if (username === 'admin') {
            return { success: false, message: '不能删除管理员账户' };
        }
        
        delete this.users[username];
        this.saveUsers();
        
        return { success: true, message: '用户删除成功' };
    }
};

loginManager.init();

// 将方法暴露到全局作用域，供HTML onclick调用
window.showChangePasswordModal = function() {
    loginManager.showChangePasswordModal();
};

window.closeChangePasswordModal = function() {
    loginManager.closeChangePasswordModal();
};

window.handleLogout = function() {
    loginManager.logout();
};
