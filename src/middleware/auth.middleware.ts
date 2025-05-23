import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.utils';

// Extend Express Request type to include userId
declare global {
    namespace Express {
        interface Request {
            userId?: string;
        }
    }
}

export const authenticateUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const authHeader = req.header('Authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Authorization token is required'
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = await verifyAccessToken(token);

        // Add userId to request object for use in route handlers
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

// Optional authentication middleware
export const optionalAuthenticateUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const authHeader = req.header('Authorization');

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = await verifyAccessToken(token);
            req.userId = decoded.userId;
        }
        next();
    } catch (error) {
        // Continue without setting userId
        next();
    }
}; 