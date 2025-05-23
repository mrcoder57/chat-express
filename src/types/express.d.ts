import { Request } from 'express';
import { Types } from 'mongoose';

declare global {
    namespace Express {
        interface User {
            _id: Types.ObjectId;
            username: string;
            email: string;
            // Add other user properties as needed
        }

        interface Request {
            user?: User;
        }
    }
} 