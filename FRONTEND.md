# Chat Application Frontend Implementation Guide

This guide explains how to implement the frontend for the chat application using Socket.IO client. The backend provides real-time messaging, typing indicators, online status, and message persistence.

## Installation

```bash
npm install socket.io-client @types/socket.io-client date-fns
```

## Socket.IO Connection Setup

```typescript
import { io, Socket } from 'socket.io-client';

const socket = io('http://your-backend-url', {
    auth: {
        token: 'your_jwt_token' // Add your JWT token here
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
});
```

## Available Events

### Connection Events
```typescript
// Listen for connection
socket.on('connect', () => {
    console.log('Connected to chat server');
});

// Listen for disconnection
socket.on('disconnect', () => {
    console.log('Disconnected from chat server');
});

// Listen for connection errors
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});
```

### Chat Room Management

```typescript
// Join a chat room
socket.emit('join:chat', chatId);

// Listen for user join events
socket.on('user:joined', ({ userId, chatId }) => {
    console.log(`User ${userId} joined chat ${chatId}`);
});

// Listen for user leave events
socket.on('user:left', ({ userId, chatId }) => {
    console.log(`User ${userId} left chat ${chatId}`);
});
```

### Messaging

```typescript
// Send a text message
socket.emit('message:send', {
    chatId: 'chat_id',
    content: 'Hello!',
    contentType: 'text'
});

// Send a media message
socket.emit('message:send', {
    chatId: 'chat_id',
    content: 'media_url',
    contentType: 'image',
    mediaMetadata: {
        fileName: 'image.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        thumbnailUrl: 'thumbnail_url'
    }
});

// Listen for new messages
socket.on('message:new', ({ message }) => {
    console.log('New message received:', message);
});

// Listen for message errors
socket.on('message:error', ({ error }) => {
    console.error('Message error:', error);
});
```

### Typing Indicators

```typescript
// Send typing start
socket.emit('typing:start', chatId);

// Send typing stop
socket.emit('typing:stop', chatId);

// Listen for typing updates
socket.on('typing:update', ({ userId, chatId, isTyping }) => {
    console.log(`User ${userId} is ${isTyping ? 'typing' : 'stopped typing'} in chat ${chatId}`);
});
```

## React Component Example

```typescript
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface Message {
    _id: string;
    chatId: string;
    senderId: string;
    content: string;
    contentType: string;
    createdAt: string;
}

const ChatComponent: React.FC<{ chatId: string; token: string }> = ({ chatId, token }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [message, setMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);

    useEffect(() => {
        // Initialize socket connection
        const newSocket = io('http://your-backend-url', {
            auth: { token }
        });

        newSocket.on('connect', () => {
            console.log('Connected to chat server');
            newSocket.emit('join:chat', chatId);
        });

        newSocket.on('message:new', ({ message }) => {
            setMessages(prev => [...prev, message]);
        });

        newSocket.on('typing:update', ({ userId, isTyping }) => {
            // Handle typing indicator
            setIsTyping(isTyping);
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [chatId, token]);

    const sendMessage = () => {
        if (!socket || !message.trim()) return;

        socket.emit('message:send', {
            chatId,
            content: message,
            contentType: 'text'
        });

        setMessage('');
    };

    const handleTyping = (typing: boolean) => {
        if (!socket) return;
        
        socket.emit(typing ? 'typing:start' : 'typing:stop', chatId);
    };

    return (
        <div className="chat-container">
            <div className="messages">
                {messages.map(msg => (
                    <div key={msg._id} className="message">
                        <span>{msg.senderId}: </span>
                        <span>{msg.content}</span>
                    </div>
                ))}
            </div>
            {isTyping && <div className="typing-indicator">Someone is typing...</div>}
            <div className="input-container">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => {
                        setMessage(e.target.value);
                        handleTyping(true);
                    }}
                    onBlur={() => handleTyping(false)}
                    placeholder="Type a message..."
                />
                <button onClick={sendMessage}>Send</button>
            </div>
        </div>
    );
};

export default ChatComponent;
```

## TypeScript Interfaces

```typescript
interface Message {
    _id: string;
    chatId: string;
    senderId: string;
    content: string;
    contentType: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'system';
    mediaMetadata?: {
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
        duration?: number;
        thumbnailUrl?: string;
    };
    status: MessageStatus[];
    createdAt: string;
    updatedAt: string;
}

interface MessageStatus {
    userId: string;
    isSent: boolean;
    isDelivered: boolean;
    isRead: boolean;
    deliveredAt?: string;
    readAt?: string;
}

interface Chat {
    _id: string;
    name?: string;
    isGroupChat: boolean;
    participants: string[];
    groupAdmins?: string[];
    lastMessage?: Message;
    groupIconUrl?: string;
    userSpecificSettings: UserSpecificSettings[];
    createdAt: string;
    updatedAt: string;
}

interface UserSpecificSettings {
    userId: string;
    isMuted: boolean;
    unreadCount: number;
}
```

## Best Practices

1. **Error Handling**
   - Always handle connection errors
   - Implement reconnection logic
   - Handle message sending failures

2. **Performance**
   - Implement message pagination
   - Cache messages locally
   - Debounce typing events

3. **User Experience**
   - Show loading states
   - Implement optimistic updates
   - Show connection status
   - Provide message delivery status

4. **Security**
   - Always send JWT token with connection
   - Validate data before sending
   - Handle token expiration

## Example Features Implementation

### Message Pagination
```typescript
const loadMoreMessages = (chatId: string, before: string) => {
    // API call to load messages before the given message ID
    fetch(`/api/chats/${chatId}/messages?before=${before}`)
        .then(res => res.json())
        .then(messages => {
            setMessages(prev => [...messages, ...prev]);
        });
};
```

### Message Status Updates
```typescript
socket.on('message:status', ({ messageId, userId, status }) => {
    setMessages(prev => prev.map(msg => 
        msg._id === messageId 
            ? {
                ...msg,
                status: msg.status.map(s => 
                    s.userId === userId 
                        ? { ...s, ...status }
                        : s
                )
            }
            : msg
    ));
});
```

### File Upload
```typescript
const handleFileUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });

    const { url } = await response.json();

    socket.emit('message:send', {
        chatId,
        content: url,
        contentType: file.type.startsWith('image/') ? 'image' : 'file',
        mediaMetadata: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type
        }
    });
};
```

## Common Issues and Solutions

1. **Connection Issues**
   - Implement exponential backoff for reconnection
   - Show connection status to users
   - Cache messages locally during disconnection

2. **Message Order**
   - Use message timestamps for ordering
   - Handle out-of-order message delivery
   - Implement message queuing during disconnection

3. **Performance**
   - Implement virtual scrolling for large message lists
   - Compress images before upload
   - Cache frequently accessed data

4. **State Management**
   - Use appropriate state management solution (Redux, Context API)
   - Handle concurrent updates
   - Maintain message order during updates 