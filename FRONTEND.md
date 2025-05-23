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

## Fetching User Chats

### Types
```typescript
interface Chat {
    _id: string;
    name?: string;
    isGroupChat: boolean;
    participants: User[];
    groupAdmins?: User[];
    lastMessage?: {
        content: string;
        contentType: string;
        createdAt: string;
    };
    groupIconUrl?: string;
    userSpecificSettings: {
        isMuted: boolean;
        unreadCount: number;
    };
    createdAt: string;
    updatedAt: string;
}

interface User {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
}

interface ChatResponse {
    success: boolean;
    data: Chat[];
}
```

### Basic Usage
```typescript
const ChatList: React.FC = () => {
    const [chats, setChats] = useState<Chat[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchChats();
    }, []);

    const fetchChats = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/chats', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch chats');
            }

            const { success, data }: ChatResponse = await response.json();
            if (!success) {
                throw new Error('Failed to fetch chats');
            }

            setChats(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div>Loading chats...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div className="chat-list">
            {chats.map(chat => (
                <ChatListItem key={chat._id} chat={chat} />
            ))}
        </div>
    );
};

interface ChatListItemProps {
    chat: Chat;
}

const ChatListItem: React.FC<ChatListItemProps> = ({ chat }) => {
    const formatLastMessageTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="chat-item">
            <div className="chat-avatar">
                {chat.isGroupChat ? (
                    <img src={chat.groupIconUrl || '/default-group.png'} alt={chat.name} />
                ) : (
                    <img 
                        src={chat.participants[0].profilePicture || '/default-user.png'} 
                        alt={chat.participants[0].username} 
                    />
                )}
            </div>
            <div className="chat-details">
                <div className="chat-header">
                    <h3>{chat.isGroupChat ? chat.name : chat.participants[0].username}</h3>
                    {chat.lastMessage && (
                        <span className="last-message-time">
                            {formatLastMessageTime(chat.lastMessage.createdAt)}
                        </span>
                    )}
                </div>
                <div className="chat-preview">
                    {chat.lastMessage ? (
                        <p>{chat.lastMessage.content}</p>
                    ) : (
                        <p className="no-messages">No messages yet</p>
                    )}
                    {chat.userSpecificSettings.unreadCount > 0 && (
                        <span className="unread-badge">
                            {chat.userSpecificSettings.unreadCount}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

// Optional: Custom hook for chat management
const useChats = () => {
    const [chats, setChats] = useState<Chat[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchChats = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/chats', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch chats');
            }

            const { success, data }: ChatResponse = await response.json();
            if (!success) {
                throw new Error('Failed to fetch chats');
            }

            setChats(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    }, []);

    const updateChat = useCallback((updatedChat: Chat) => {
        setChats(prevChats => 
            prevChats.map(chat => 
                chat._id === updatedChat._id ? updatedChat : chat
            )
        );
    }, []);

    const addChat = useCallback((newChat: Chat) => {
        setChats(prevChats => [newChat, ...prevChats]);
    }, []);

    return {
        chats,
        loading,
        error,
        fetchChats,
        updateChat,
        addChat
    };
};
```

### Styling
```css
.chat-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
}

.chat-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    background-color: #ffffff;
    transition: background-color 0.2s;
    cursor: pointer;
}

.chat-item:hover {
    background-color: #f5f5f5;
}

.chat-avatar img {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
}

.chat-details {
    flex: 1;
}

.chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
}

.chat-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}

.last-message-time {
    font-size: 12px;
    color: #666;
}

.chat-preview {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.chat-preview p {
    margin: 0;
    font-size: 14px;
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 80%;
}

.no-messages {
    font-style: italic;
}

.unread-badge {
    background-color: #007bff;
    color: white;
    padding: 2px 6px;
    border-radius: 12px;
    font-size: 12px;
    min-width: 20px;
    text-align: center;
}
```

### Usage with Context
```typescript
interface ChatContextType {
    chats: Chat[];
    loading: boolean;
    error: string | null;
    fetchChats: () => Promise<void>;
    updateChat: (chat: Chat) => void;
    addChat: (chat: Chat) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const chatState = useChats();

    return (
        <ChatContext.Provider value={chatState}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
};

// Usage in components
const ChatApp: React.FC = () => {
    return (
        <ChatProvider>
            <ChatList />
            <ChatWindow />
        </ChatProvider>
    );
};
```

### Best Practices

1. **Error Handling**
   - Always handle network errors gracefully
   - Show appropriate loading states
   - Provide clear error messages to users
   - Implement retry mechanisms for failed requests

2. **Performance**
   - Implement chat list virtualization for large lists
   - Cache chat data locally
   - Use optimistic updates for better UX
   - Implement proper cleanup in useEffect hooks

3. **Real-time Updates**
   - Subscribe to Socket.IO events for real-time updates
   - Update chat list when receiving new messages
   - Update unread counts and last messages
   - Handle user online/offline status

4. **Security**
   - Always include authentication tokens
   - Validate data before displaying
   - Handle token expiration
   - Implement proper logout mechanisms

5. **Accessibility**
   - Use semantic HTML elements
   - Include proper ARIA labels
   - Ensure keyboard navigation
   - Maintain sufficient color contrast

### Example: Chat List with Virtualization
```typescript
import { FixedSizeList } from 'react-window';

const VirtualizedChatList: React.FC = () => {
    const { chats, loading, error } = useChat();
    
    if (loading) return <div>Loading chats...</div>;
    if (error) return <div>Error: {error}</div>;

    const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
        <div style={style}>
            <ChatListItem chat={chats[index]} />
        </div>
    );

    return (
        <FixedSizeList
            height={600}
            width="100%"
            itemCount={chats.length}
            itemSize={72}
        >
            {Row}
        </FixedSizeList>
    );
};
``` 