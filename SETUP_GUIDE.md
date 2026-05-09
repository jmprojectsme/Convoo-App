# Convoo - Setup & Deployment Guide

A real-time messaging app with 1-on-1 and group chats, built with vanilla HTML/CSS/JS and Supabase.

## 📋 Quick Start

### 1. **Supabase Setup**

#### Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Go to **Settings → API** and copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`

#### Create Database Schema

Go to **SQL Editor** in Supabase and run this SQL:

```sql
-- Users table
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT auth.uid(),
    email varchar(255) UNIQUE NOT NULL,
    display_name varchar(255),
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Direct messages (1-on-1 chats)
CREATE TABLE direct_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE(user1_id, user2_id)
);

-- Group chats
CREATE TABLE group_chats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Group members
CREATE TABLE group_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_chat_id uuid NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at timestamp with time zone DEFAULT now(),
    UNIQUE(group_chat_id, user_id)
);

-- Messages (for both direct and group)
CREATE TABLE messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    direct_message_id uuid REFERENCES direct_messages(id) ON DELETE CASCADE,
    group_chat_id uuid REFERENCES group_chats(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CHECK (
        (direct_message_id IS NOT NULL AND group_chat_id IS NULL) OR
        (direct_message_id IS NULL AND group_chat_id IS NOT NULL)
    )
);

-- Create indexes for better query performance
CREATE INDEX idx_direct_messages_user1 ON direct_messages(user1_id);
CREATE INDEX idx_direct_messages_user2 ON direct_messages(user2_id);
CREATE INDEX idx_group_members_group ON group_members(group_chat_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_messages_direct ON messages(direct_message_id);
CREATE INDEX idx_messages_group ON messages(group_chat_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can read all users" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for direct messages
CREATE POLICY "Users can read direct messages they're part of" ON direct_messages 
    FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- RLS Policies for group chats
CREATE POLICY "Users can read groups they're a member of" ON group_chats 
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM group_members WHERE group_chat_id = id AND user_id = auth.uid())
    );

-- RLS Policies for group members
CREATE POLICY "Users can read group members" ON group_members 
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM group_members gm2 WHERE gm2.group_chat_id = group_chat_id AND gm2.user_id = auth.uid())
    );
CREATE POLICY "Users can insert to groups they're a member of" ON group_members 
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM group_members gm2 WHERE gm2.group_chat_id = group_chat_id AND gm2.user_id = auth.uid())
    );

-- RLS Policies for messages
CREATE POLICY "Users can read messages from chats they're in" ON messages 
    FOR SELECT USING (
        (EXISTS (SELECT 1 FROM direct_messages WHERE id = direct_message_id AND (user1_id = auth.uid() OR user2_id = auth.uid())))
        OR
        (EXISTS (SELECT 1 FROM group_members WHERE group_chat_id = messages.group_chat_id AND user_id = auth.uid()))
    );
CREATE POLICY "Users can insert messages to chats they're in" ON messages 
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND (
            (EXISTS (SELECT 1 FROM direct_messages WHERE id = direct_message_id AND (user1_id = auth.uid() OR user2_id = auth.uid())))
            OR
            (EXISTS (SELECT 1 FROM group_members WHERE group_chat_id = messages.group_chat_id AND user_id = auth.uid()))
        )
    );

-- Enable realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

#### Enable Authentication

1. Go to **Authentication → Providers**
2. Make sure **Email** provider is enabled
3. Go to **Authentication → URL Configuration**
4. Add your GitHub Pages URL under **Redirect URLs**:
   - `https://YOUR_GITHUB_USERNAME.github.io/messagehub/`
   - `http://localhost:3000` (for local testing)

---

### 2. **Configure the App**

Edit `config.js`:

```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
const DEBUG_MODE = false;
```

Find your credentials at: **Settings → API** in your Supabase dashboard.

---

### 3. **Deploy to GitHub Pages**

#### Create GitHub Repository

1. Create a new repository named `convoo`
2. Clone it to your local machine:
```bash
git clone https://github.com/YOUR_USERNAME/convoo.git
cd convoo
```

#### Copy Files

Copy these files to your repo:
- `index.html` - Main app UI
- `style.css` - Styling
- `config.js` - Supabase credentials
- `main.js` - App logic
- `sw.js` - Service Worker (PWA offline support)
- `manifest.json` - PWA manifest
- `logo.png` - Your custom logo
- `SETUP_GUIDE.md` (optional, for reference)

#### Push to GitHub

```bash
git add .
git commit -m "Initial commit: MessageHub app"
git push origin main
```

#### Enable GitHub Pages

1. Go to your repository **Settings**
2. Scroll to **Pages** section
3. Set **Source** to `main` branch
4. Set folder to `/ (root)`
5. Click **Save**

Your app will be live at: `https://YOUR_GITHUB_USERNAME.github.io/convoo/`

---

### 4. **Test the App**

1. Go to your GitHub Pages URL (`https://YOUR_GITHUB_USERNAME.github.io/convoo/`)
2. Create an account
3. Create another account (or use a different browser)
4. Start a direct message chat
5. Send messages in real-time!

---

## 🔧 Features

✅ **Authentication** - Email/password via Supabase Auth  
✅ **Direct Messages** - 1-on-1 chats  
✅ **Group Chats** - Multi-user conversations  
✅ **Real-time Updates** - Supabase Realtime subscriptions  
✅ **Mobile-First** - Responsive design (tested on Redmi Note 14)  
✅ **Modern UI** - Clean, accessible interface  
✅ **Message History** - All messages persisted  
✅ **User Profiles** - Display names and email  
✅ **PWA Support** - Install as app on phones, works offline  
✅ **Service Worker** - Smart caching, background sync ready  

---

## 🛠️ File Structure

```
convoo/
├── index.html       # Main HTML with PWA meta tags
├── style.css        # Styling
├── config.js        # Supabase config (add your keys here)
├── main.js          # Application logic + Service Worker registration
├── sw.js            # Service Worker for PWA (offline, caching)
├── manifest.json    # PWA manifest (app metadata, icons, config)
├── logo.png         # App logo (your custom logo)
└── SETUP_GUIDE.md   # This file
```

---

## 📱 Usage

### Create Account
- Click **Create Account**
- Enter name, email, password
- Confirm password

### Start a Chat
- Click **+ New Chat**
- Choose **Direct Message** or **Create Group**
- For direct: Select a user
- For group: Name the group and select members

### Send Messages
- Type in the message box
- Press Enter or click send button
- Messages appear in real-time

### Manage Groups
- Create groups with multiple members
- See member count in chat header
- Add all friends to share updates

---

## 📲 Install as PWA (Progressive Web App)

Convoo can be installed as an app on your phone!

### On Android (Chrome)
1. Go to `https://YOUR_GITHUB_USERNAME.github.io/convoo/`
2. Click the **three dots** (⋮) menu in the top-right
3. Select **"Install app"** or **"Add to Home Screen"**
4. Confirm installation
5. Open from your home screen like any app!

### On iPhone (Safari)
1. Go to `https://YOUR_GITHUB_USERNAME.github.io/convoo/`
2. Click the **Share** button
3. Select **"Add to Home Screen"**
4. Name it "Convoo" and tap **Add**
5. Open from your home screen!

### PWA Benefits
✅ **Offline Access** - View cached messages without internet  
✅ **Fast Loading** - App shell cached, instant launch  
✅ **No App Store** - Install directly from web  
✅ **Home Screen** - Acts like a native app  
✅ **Background Sync** - Queue messages to send when online  

---

## ⚙️ Advanced Options

### Customize Colors
Edit `:root` in `style.css`:
```css
:root {
    --primary: #2563eb;      /* Blue */
    --accent: #f97316;       /* Orange */
    --danger: #dc2626;       /* Red */
    /* ... more colors ... */
}
```

### Add More Features
- **Typing indicators**: Listen to presence channel
- **Read receipts**: Track message read status
- **File uploads**: Use Supabase Storage
- **User avatars**: Store URLs in users table
- **Message reactions**: Add emoji reactions table

---

## 🚀 Troubleshooting

### "Authentication error"
- Check `config.js` has correct Supabase keys
- Verify Supabase project is active
- Check Email provider is enabled in Auth

### "Messages not loading"
- Check RLS policies are enabled (see SQL above)
- Verify database schema created correctly
- Check browser console for errors (F12)

### "Real-time not working"
- Verify `ALTER PUBLICATION supabase_realtime ADD TABLE messages;` was run
- Check Realtime is enabled in Supabase Settings
- Reload page and try again

### "GitHub Pages not working"
- Wait 1-2 minutes after push (GitHub builds the site)
- Check repository Settings → Pages
- Verify main branch is selected

---

## 📝 Notes

- User passwords are never stored; Supabase Auth handles encryption
- All messages are stored in Supabase database
- RLS (Row Level Security) ensures users can only see messages they're part of
- Real-time works via Supabase WebSocket subscriptions
- Works offline but needs internet to sync

---

## 🔐 Security

- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Email/password authentication
- ✅ User IDs verified server-side
- ✅ Messages scoped to authorized participants
- ✅ No sensitive data in browser localStorage

---

## 💡 For Community Disaster Resilience

This app can be used for:
- **Emergency coordination** - Group chats for barangay alerts
- **Resource sharing** - Direct messages for supply requests
- **Community updates** - Broadcast messages to large groups
- **Offline-ready** - Can cache messages locally (future enhancement)

Consider adding:
- Location sharing for disaster mapping
- Media uploads for situation reports
- Message pinning for critical alerts
- Broadcast channels for official announcements

---

## 📞 Support

For issues:
1. Check browser console (F12 → Console tab)
2. Verify Supabase schema matches SQL above
3. Re-check config.js credentials
4. Try clearing localStorage (Ctrl+Shift+Delete)

---

**Built with ❤️ for Filipino communities**

Happy messaging! 💬
