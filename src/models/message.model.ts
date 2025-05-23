import mongoose, { Schema, model, Document, Types } from 'mongoose';

// TypeScript Interfaces
interface IMediaMetadata {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    duration?: number;
    thumbnailUrl?: string;
}

interface IMessageStatus {
    userId: Types.ObjectId;
    isSent: boolean;
    isDelivered: boolean;
    isRead: boolean;
    deliveredAt?: Date;
    readAt?: Date;
}

interface IReaction {
    userId: Types.ObjectId;
    emoji: string;
    createdAt: Date;
}

type ContentType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'system';

interface IMessage extends Document {
    chatId: Types.ObjectId;
    senderId: Types.ObjectId;
    contentType: ContentType;
    content: string;
    mediaMetadata?: IMediaMetadata;
    status: IMessageStatus[];
    reactions: IReaction[];
    isForwarded: boolean;
    replyToMessageId?: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

// --- Message Schema ---
// Represents an individual message within a chat
const messageSchema = new Schema({
    chatId: { // The chat this message belongs to
        type: Schema.Types.ObjectId,
        ref: 'Chat',
        required: true,
        index: true,
    },
    senderId: { // The user who sent the message
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    contentType: { // Type of content in the message
        type: String,
        enum: ['text', 'image', 'video', 'audio', 'file', 'location', 'system'], // 'system' for "User X joined"
        default: 'text',
    },
    content: { // The actual message content (text, URL to media, etc.)
        type: String, // For text, URLs. For location, could be a JSON string of {lat, long}
        required: true,
    },
    mediaMetadata: { // Optional: for media files (e.g., filename, size, duration for audio/video)
        fileName: String,
        fileSize: Number, // in bytes
        mimeType: String,
        duration: Number, // in seconds for audio/video
        thumbnailUrl: String, // for images/videos
    },
    // Tracks message status for each recipient
    // This allows for per-user delivered/read receipts
    status: [{
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        isSent: { type: Boolean, default: true }, // Message sent from sender's device
        isDelivered: { type: Boolean, default: false }, // Message delivered to recipient's device
        isRead: { type: Boolean, default: false }, // Message read by recipient
        deliveredAt: Date,
        readAt: Date,
    }],
    reactions: [{ // Emoji reactions to messages
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        emoji: String,
        createdAt: { type: Date, default: Date.now }
    }],
    isForwarded: {
        type: Boolean,
        default: false,
    },
    replyToMessageId: { // If this message is a reply to another message
        type: Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
    }
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt fields (acts as sentAt for the sender)
});

// Add indexes for common query patterns
messageSchema.index({ chatId: 1, createdAt: -1 }); // For fetching messages in a chat, sorted by time
messageSchema.index({ senderId: 1, createdAt: -1 }); // For fetching messages sent by a user

// Create and export the model
const Message = model<IMessage>('Message', messageSchema);
export default Message;

// Export interfaces for use in other files
export { 
    IMessage, 
    IMediaMetadata, 
    IMessageStatus, 
    IReaction, 
    ContentType 
}; 