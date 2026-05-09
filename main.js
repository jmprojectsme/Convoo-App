// ===== CONVOO - MAIN APP =====
// Real-time messaging PWA with Supabase backend

console.log('Convoo: Script loaded');

// Register Service Worker for PWA functionality
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then((registration) => {
            console.log('Convoo: Service Worker registered successfully');
        })
        .catch((error) => {
            console.error('Convoo: Service Worker registration failed:', error);
        });
}

// Initialize Supabase
let supabase;
let currentUser = null;
let currentChatId = null;
let currentChatType = null; // 'direct' or 'group'
let realtimeSubscriptions = [];

// Initialize the app
async function initApp() {
    console.log('Convoo: initApp called');
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        // Check if user is logged in
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            currentUser = user;
            showAppScreen();
            await loadChats();
            setupRealtimeSubscriptions();
        } else {
            showAuthScreen();
        }
    } catch (error) {
        console.error('Init error:', error);
        showAuthScreen();
    }
}

// ===== AUTH FUNCTIONS =====

function showAuthScreen() {
    console.log('Convoo: Showing auth screen');
    document.getElementById('authScreen').classList.add('active');
    document.getElementById('appScreen').classList.remove('active');
}

function showAppScreen() {
    console.log('Convoo: Showing app screen');
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('appScreen').classList.add('active');
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('Convoo: DOM Content Loaded');
    
    // Auth tab switching
    const authTabs = document.querySelectorAll('.auth-tabs .tab-btn');
    console.log('Convoo: Found', authTabs.length, 'auth tabs');
    
    authTabs.forEach(btn => {
        btn.addEventListener('click', function(e) {
            console.log('Convoo: Tab clicked', this.dataset.tab);
            e.preventDefault();
            
            const tab = this.dataset.tab;
            document.querySelectorAll('.auth-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
            const formId = tab === 'login' ? 'loginForm' : 'signupForm';
            const form = document.getElementById(formId);
            console.log('Convoo: Showing form', formId);
            if (form) {
                form.classList.add('active');
            }
        });
    });

    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const errorEl = document.getElementById('loginError');
            
            try {
                errorEl.textContent = '';
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                
                if (error) throw error;
                
                currentUser = data.user;
                showAppScreen();
                await loadChats();
                setupRealtimeSubscriptions();
            } catch (error) {
                errorEl.textContent = error.message;
                console.error('Login error:', error);
            }
        });
    }

    // Signup form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const confirmPassword = document.getElementById('signupPasswordConfirm').value;
            const errorEl = document.getElementById('signupError');
            
            try {
                errorEl.textContent = '';
                
                if (password !== confirmPassword) {
                    throw new Error('Passwords do not match');
                }
                
                const { data, error } = await supabase.auth.signUp({ email, password });
                
                if (error) throw error;
                
                // Create user profile
                await supabase.from('users').insert([
                    {
                        id: data.user.id,
                        email: email,
                        display_name: name,
                        created_at: new Date().toISOString()
                    }
                ]);
                
                currentUser = data.user;
                showAppScreen();
                await loadChats();
                setupRealtimeSubscriptions();
            } catch (error) {
                errorEl.textContent = error.message;
                console.error('Signup error:', error);
            }
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                realtimeSubscriptions.forEach(sub => sub.unsubscribe());
                realtimeSubscriptions = [];
                
                await supabase.auth.signOut();
                currentUser = null;
                currentChatId = null;
                showAuthScreen();
            } catch (error) {
                console.error('Logout error:', error);
            }
        });
    }

    // User menu
    const userMenuBtn = document.getElementById('userMenuBtn');
    if (userMenuBtn) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('userDropdown').classList.toggle('active');
        });
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-menu')) {
            const dropdown = document.getElementById('userDropdown');
            if (dropdown) dropdown.classList.remove('active');
        }
    });

    // New chat modal
    const newChatModal = document.getElementById('newChatModal');
    const newChatBtn = document.getElementById('newChatBtn');
    
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            newChatModal.classList.add('active');
            loadUsersForChat();
        });
    }

    const newChatCloseBtn = document.querySelector('#newChatModal .close-btn');
    if (newChatCloseBtn) {
        newChatCloseBtn.addEventListener('click', () => {
            newChatModal.classList.remove('active');
        });
    }

    if (newChatModal) {
        newChatModal.addEventListener('click', (e) => {
            if (e.target === newChatModal) {
                newChatModal.classList.remove('active');
            }
        });
    }

    // Message form
    const messageForm = document.getElementById('messageForm');
    if (messageForm) {
        messageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('messageInput');
            const content = input.value.trim();
            
            if (!content || !currentChatId) return;
            
            try {
                const messageData = {
                    content,
                    sender_id: currentUser.id,
                    created_at: new Date().toISOString()
                };
                
                if (currentChatType === 'direct') {
                    messageData.direct_message_id = currentChatId;
                } else {
                    messageData.group_chat_id = currentChatId;
                }
                
                const { error } = await supabase.from('messages').insert([messageData]);
                
                if (error) throw error;
                
                input.value = '';
                input.style.height = 'auto';
                
                await loadMessages(currentChatId, currentChatType);
            } catch (error) {
                console.error('Send message error:', error);
                alert('Failed to send message');
            }
        });
    }

    // Auto-resize textarea
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
        });
    }

    // Modal tabs
    document.querySelectorAll('.modal .tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            const tab = e.target.dataset.tab;
            
            modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            modal.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            const tabContent = modal.querySelector(`#${tab}-tab`);
            if (tabContent) tabContent.classList.add('active');
        });
    });

    // Chat tabs filter
    document.querySelectorAll('.chat-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.chat-tab').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const type = e.target.dataset.type;
            const chatsList = document.getElementById('chatsList');
            const items = chatsList.querySelectorAll('.chat-item');
            
            items.forEach(item => {
                if (type === 'all' || item.dataset.chatType === type) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });

    // Create group form
    const createGroupForm = document.getElementById('createGroupForm');
    if (createGroupForm) {
        createGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const groupName = document.getElementById('groupName').value.trim();
            const selectedUsers = Array.from(document.querySelectorAll('.group-user-checkbox:checked'))
                .map(cb => cb.dataset.userId);
            
            if (!groupName || selectedUsers.length === 0) {
                alert('Please enter a group name and select at least one member');
                return;
            }
            
            try {
                const { data: newGroup, error: createError } = await supabase
                    .from('group_chats')
                    .insert([
                        {
                            name: groupName,
                            created_by: currentUser.id,
                            created_at: new Date().toISOString()
                        }
                    ])
                    .select()
                    .single();
                
                if (createError) throw createError;
                
                const members = [currentUser.id, ...selectedUsers].map(userId => ({
                    group_chat_id: newGroup.id,
                    user_id: userId,
                    joined_at: new Date().toISOString()
                }));
                
                const { error: membersError } = await supabase
                    .from('group_members')
                    .insert(members);
                
                if (membersError) throw membersError;
                
                document.getElementById('createGroupForm').reset();
                await loadChats();
                loadChat(newGroup.id, 'group');
                document.getElementById('newChatModal').classList.remove('active');
            } catch (error) {
                console.error('Create group error:', error);
                alert('Failed to create group');
            }
        });
    }

    console.log('Convoo: All event listeners attached');
});

// ===== CHAT FUNCTIONS =====

async function loadChats() {
    const chatsList = document.getElementById('chatsList');
    chatsList.innerHTML = '<div class="empty-state">Loading...</div>';
    
    try {
        const { data: directChats, error: directError } = await supabase
            .from('direct_messages')
            .select(`
                id,
                user1_id,
                user2_id,
                created_at,
                messages (
                    id,
                    content,
                    created_at,
                    sender_id
                )
            `)
            .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false });
        
        if (directError) throw directError;
        
        const { data: groupChats, error: groupError } = await supabase
            .from('group_chats')
            .select(`
                id,
                name,
                created_at,
                group_members (
                    user_id
                ),
                messages (
                    id,
                    content,
                    created_at,
                    sender_id
                )
            `)
            .order('created_at', { ascending: false });
        
        if (groupError) throw groupError;
        
        const allChats = [];
        
        if (directChats) {
            for (const chat of directChats) {
                const otherUserId = chat.user1_id === currentUser.id ? chat.user2_id : chat.user1_id;
                const { data: otherUser } = await supabase
                    .from('users')
                    .select('display_name, email')
                    .eq('id', otherUserId)
                    .single();
                
                allChats.push({
                    id: chat.id,
                    type: 'direct',
                    name: otherUser?.display_name || otherUser?.email || 'Unknown User',
                    userId: otherUserId,
                    lastMessage: chat.messages?.[0]?.content || 'No messages yet',
                    lastTime: chat.messages?.[0]?.created_at || chat.created_at,
                    unread: false
                });
            }
        }
        
        if (groupChats) {
            for (const chat of groupChats) {
                const isMember = chat.group_members?.some(m => m.user_id === currentUser.id);
                if (isMember) {
                    allChats.push({
                        id: chat.id,
                        type: 'group',
                        name: chat.name,
                        lastMessage: chat.messages?.[0]?.content || 'No messages yet',
                        lastTime: chat.messages?.[0]?.created_at || chat.created_at,
                        unread: false
                    });
                }
            }
        }
        
        allChats.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
        
        if (allChats.length === 0) {
            chatsList.innerHTML = '<div class="empty-state">No conversations yet</div>';
            return;
        }
        
        chatsList.innerHTML = '';
        allChats.forEach(chat => {
            const chatEl = createChatElement(chat);
            chatsList.appendChild(chatEl);
        });
    } catch (error) {
        console.error('Load chats error:', error);
        chatsList.innerHTML = '<div class="empty-state">Error loading chats</div>';
    }
}

function createChatElement(chat) {
    const el = document.createElement('div');
    el.className = 'chat-item';
    el.dataset.chatId = chat.id;
    el.dataset.chatType = chat.type;
    
    const timeStr = formatTime(chat.lastTime);
    const messagePreview = chat.lastMessage.substring(0, 40);
    
    el.innerHTML = `
        <div class="chat-item-header">
            <span class="chat-item-name">${escapeHtml(chat.name)}</span>
            <span class="chat-item-time">${timeStr}</span>
        </div>
        <div class="chat-item-message">${escapeHtml(messagePreview)}</div>
    `;
    
    el.addEventListener('click', () => {
        loadChat(chat.id, chat.type);
    });
    
    return el;
}

async function loadChat(chatId, chatType) {
    currentChatId = chatId;
    currentChatType = chatType;
    
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-chat-id="${chatId}"]`)?.classList.add('active');
    
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('chatWindow').style.display = 'flex';
    
    try {
        if (chatType === 'direct') {
            const { data: directChat } = await supabase
                .from('direct_messages')
                .select('user1_id, user2_id')
                .eq('id', chatId)
                .single();
            
            const otherUserId = directChat.user1_id === currentUser.id ? directChat.user2_id : directChat.user1_id;
            const { data: otherUser } = await supabase
                .from('users')
                .select('display_name, email')
                .eq('id', otherUserId)
                .single();
            
            document.getElementById('chatTitle').textContent = otherUser?.display_name || otherUser?.email;
            document.getElementById('chatStatus').textContent = 'Online';
        } else {
            const { data: groupChat } = await supabase
                .from('group_chats')
                .select('name, group_members(user_id)')
                .eq('id', chatId)
                .single();
            
            document.getElementById('chatTitle').textContent = groupChat.name;
            document.getElementById('chatStatus').textContent = `${groupChat.group_members?.length || 0} members`;
        }
        
        await loadMessages(chatId, chatType);
    } catch (error) {
        console.error('Load chat error:', error);
    }
}

async function loadMessages(chatId, chatType) {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '<div class="empty-state">Loading messages...</div>';
    
    try {
        let query = supabase.from('messages').select(`
            id,
            content,
            created_at,
            sender_id,
            users (
                display_name,
                email
            )
        `);
        
        if (chatType === 'direct') {
            query = query.eq('direct_message_id', chatId);
        } else {
            query = query.eq('group_chat_id', chatId);
        }
        
        const { data: messages, error } = await query.order('created_at', { ascending: true });
        
        if (error) throw error;
        
        if (!messages || messages.length === 0) {
            messagesContainer.innerHTML = '<div class="empty-state">No messages yet. Start the conversation!</div>';
            return;
        }
        
        messagesContainer.innerHTML = '';
        messages.forEach(msg => {
            const msgEl = createMessageElement(msg);
            messagesContainer.appendChild(msgEl);
        });
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('Load messages error:', error);
        messagesContainer.innerHTML = '<div class="empty-state">Error loading messages</div>';
    }
}

function createMessageElement(msg) {
    const el = document.createElement('div');
    const isOwn = msg.sender_id === currentUser.id;
    el.className = `message ${isOwn ? 'sent' : 'received'}`;
    
    const timeStr = formatTime(msg.created_at, true);
    const senderName = msg.users?.display_name || msg.users?.email || 'Unknown';
    
    el.innerHTML = `
        ${!isOwn ? `<div class="message-avatar">${senderName.charAt(0).toUpperCase()}</div>` : ''}
        <div class="message-content">
            ${!isOwn ? `<div class="message-sender">${escapeHtml(senderName)}</div>` : ''}
            <div class="message-bubble">${escapeHtml(msg.content)}</div>
            <div class="message-time">${timeStr}</div>
        </div>
        ${isOwn ? `<div class="message-avatar">${currentUser.user_metadata?.display_name?.charAt(0).toUpperCase() || 'U'}</div>` : ''}
    `;
    
    return el;
}

// ===== NEW CHAT FUNCTIONS =====

async function loadUsersForChat() {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, display_name, email')
            .neq('id', currentUser.id);
        
        if (error) throw error;
        
        const usersList = document.getElementById('usersList');
        const groupUsersList = document.getElementById('groupUsersList');
        
        if (!users || users.length === 0) {
            usersList.innerHTML = '<div class="empty-state">No users available</div>';
            groupUsersList.innerHTML = '<div class="empty-state">No users available</div>';
            return;
        }
        
        usersList.innerHTML = '';
        users.forEach(user => {
            const el = document.createElement('div');
            el.className = 'user-item';
            el.innerHTML = `
                <div class="user-avatar">${user.display_name.charAt(0).toUpperCase()}</div>
                <div class="user-info">
                    <div class="user-name">${escapeHtml(user.display_name)}</div>
                    <div class="user-email">${escapeHtml(user.email)}</div>
                </div>
            `;
            el.addEventListener('click', () => startDirectMessage(user.id));
            usersList.appendChild(el);
        });
        
        groupUsersList.innerHTML = '';
        users.forEach(user => {
            const el = document.createElement('label');
            el.className = 'user-item group-user-item';
            el.innerHTML = `
                <input type="checkbox" class="group-user-checkbox" data-user-id="${user.id}">
                <div class="user-avatar">${user.display_name.charAt(0).toUpperCase()}</div>
                <div class="user-info">
                    <div class="user-name">${escapeHtml(user.display_name)}</div>
                    <div class="user-email">${escapeHtml(user.email)}</div>
                </div>
            `;
            el.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    e.target.closest('label').querySelector('input').click();
                }
            });
            groupUsersList.appendChild(el);
        });
    } catch (error) {
        console.error('Load users error:', error);
    }
}

async function startDirectMessage(userId) {
    try {
        const { data: existing } = await supabase
            .from('direct_messages')
            .select('id')
            .or(`and(user1_id.eq.${currentUser.id},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${currentUser.id})`)
            .single();
        
        if (existing) {
            loadChat(existing.id, 'direct');
        } else {
            const { data: newChat, error } = await supabase
                .from('direct_messages')
                .insert([
                    {
                        user1_id: currentUser.id,
                        user2_id: userId,
                        created_at: new Date().toISOString()
                    }
                ])
                .select()
                .single();
            
            if (error) throw error;
            
            await loadChats();
            loadChat(newChat.id, 'direct');
        }
        
        document.getElementById('newChatModal').classList.remove('active');
    } catch (error) {
        console.error('Start direct message error:', error);
        alert('Failed to start chat');
    }
}

// ===== REALTIME SUBSCRIPTIONS =====

function setupRealtimeSubscriptions() {
    const channel = supabase.channel('messages')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
                if (currentChatId && (
                    (currentChatType === 'direct' && payload.new.direct_message_id === currentChatId) ||
                    (currentChatType === 'group' && payload.new.group_chat_id === currentChatId)
                )) {
                    loadMessages(currentChatId, currentChatType);
                }
                loadChats();
            }
        )
        .subscribe();
    
    realtimeSubscriptions.push(channel);
}

// ===== UTILITY FUNCTIONS =====

function formatTime(dateString, includeTime = false) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    if (includeTime) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== INIT =====
console.log('Convoo: About to call initApp');
initApp();
console.log('Convoo: initApp called');
