const SUPABASE_URL = "https://skfydvuuuuyiwtlxqdsf.supabase.co";
const SUPABASE_KEY = "sb_publishable_Q4SbADpg8dq7dpMwJAWbEg_6bXqGqrg";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentChat = null;

async function signup() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await client.auth.signUp({
    email,
    password
  });

  if (error) {
    alert(error.message);
    return;
  }

  alert('Account created!');
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert(error.message);
    return;
  }

  currentUser = data.user;

  loadChats();

  alert('Logged in');
}

async function createChat() {
  const name = prompt('Group name');

  if (!name) return;

  const { data, error } = await client
    .from('chats')
    .insert({
      name,
      is_group: true
    })
    .select()
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  await client.from('chat_members').insert({
    chat_id: data.id,
    user_id: currentUser.id
  });

  loadChats();
}

async function loadChats() {
  const { data, error } = await client
    .from('chats')
    .select('*')
    .order('created_at', { ascending: false });

  const chatList = document.getElementById('chatList');

  chatList.innerHTML = '';

  data.forEach(chat => {
    const div = document.createElement('div');

    div.className = 'chat-item';
    div.innerText = chat.name;

    div.onclick = () => openChat(chat.id);

    chatList.appendChild(div);
  });
}

async function openChat(chatId) {
  currentChat = chatId;

  loadMessages();

  subscribeMessages();
}

async function loadMessages() {
  const { data, error } = await client
    .from('messages')
    .select('*')
    .eq('chat_id', currentChat)
    .order('created_at', { ascending: true });

  renderMessages(data);
}

function renderMessages(messages) {
  const messagesDiv = document.getElementById('messages');

  messagesDiv.innerHTML = '';

  messages.forEach(msg => {
    const div = document.createElement('div');

    div.className = 'message';

    if (msg.sender_id === currentUser.id) {
      div.classList.add('mine');
    }

    div.innerText = msg.content;

    messagesDiv.appendChild(div);
  });

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('messageInput');

  if (!input.value.trim()) return;

  await client.from('messages').insert({
    chat_id: currentChat,
    sender_id: currentUser.id,
    content: input.value
  });

  input.value = '';
}

function subscribeMessages() {
  client
    .channel('room-' + currentChat)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${currentChat}`
      },
      payload => {
        loadMessages();
      }
    )
    .subscribe();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
        }
