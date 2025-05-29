import mongoose, { Schema, Document, Types } from 'mongoose';

// TypeScript Interface
export interface IUser extends Document {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  userName: string;
  email: string;
  userImage?: string | null;
  userType: string;
}

// Minimal User Schema for references
const userSchema = new Schema<IUser>({
  _id: {
    type: Schema.Types.ObjectId,
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  userImage: {
    type: String,
    default: null
  },
  userType: {
    type: String,
    required: true
  }
});

// Register the schema
const User = mongoose.model<IUser>('User', userSchema);
export default User;