import jwt from 'jsonwebtoken';
import { config } from 'dotenv';

config();

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "accesssecret";

interface TokenPayload {
    userId: string;
    exp?: number;
}

// Verify Access Token
export const verifyAccessToken = (token: string): Promise<TokenPayload> => {
    return new Promise((resolve, reject) => {
        jwt.verify(token, JWT_ACCESS_SECRET, (err, decoded) => {
            if (err || !decoded) {
                reject(new Error("Invalid or expired access token"));
            } else {
                resolve(decoded as TokenPayload);
            }
        });
    });
};

// Decode Token (without verification)
export const decodeToken = (token: string): null | TokenPayload => {
    if (!token) return null;
    try {
        return jwt.decode(token) as TokenPayload;
    } catch {
        return null;
    }
}; 