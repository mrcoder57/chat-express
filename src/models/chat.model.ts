import mongoose, { Schema, model, Document, Types } from 'mongoose';

// TypeScript Interfaces
interface IUserSpecificSettings {
    userId: Types.ObjectId;
    isMuted: boolean;
    unreadCount: number;
}

interface IChat extends Document {
    name?: string;
    isGroupChat: boolean;
    participants: Types.ObjectId[];
    groupAdmins: Types.ObjectId[];
    lastMessage?: Types.ObjectId;
    groupIconUrl?: string | null;
    userSpecificSettings: IUserSpecificSettings[];
    createdAt: Date;
    updatedAt: Date;
}

// --- Chat Schema ---
// Represents a conversation, either one-on-one or group
const chatSchema = new Schema({
    name: { // Group chat name, can be null for one-on-one chats
        type: String,
        trim: true,
    },
    isGroupChat: {
        type: Boolean,
        default: false,
    },
    participants: [{ // Users participating in the chat
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    }],
    groupAdmins: [{ // User IDs of group administrators (only if isGroupChat is true)
        type: Schema.Types.ObjectId,
        ref: 'User',
    }],
    lastMessage: { // Reference to the last message sent in this chat
        type: Schema.Types.ObjectId,
        ref: 'Message',
    },
    groupIconUrl: {
        type: String,
        default: null, // Default to no group icon
    },
    // Stores per-user settings for a chat, e.g., mute notifications
    userSpecificSettings: [{
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        isMuted: { type: Boolean, default: false },
        unreadCount: { type: Number, default: 0 } // Can be managed client-side or server-side
    }]
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
});

// Add an index on participants for faster querying of chats by user
chatSchema.index({ participants: 1 });

// Export the model
const Chat = model<IChat>('Chat', chatSchema);
export default Chat;

// Export interfaces for use in other files
export { IChat, IUserSpecificSettings }; 