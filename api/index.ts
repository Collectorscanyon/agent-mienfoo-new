import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import webhookRouter from './routes/webhook';

// Load environment variables
dotenv.config();

// Verify required environment variables
if (!process.env.OPENAI_API_KEY || !process.env.NEYNAR_API_KEY) {
    throw new Error('Missing required API keys');
}

// Initialize Express app
const app = express();

// Configure body parsing middleware first
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced logging middleware
app.use((req: Request, res: Response, next) => {
    const requestId = Math.random().toString(36).substring(7);
    const timestamp = new Date().toISOString();
    
    console.log('Request received:', {
        requestId,
        timestamp,
        method: req.method,
        path: req.path,
        headers: req.headers,
        body: req.body,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasNeynarKey: !!process.env.NEYNAR_API_KEY
    });
    next();
});

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
    res.json({ 
        status: 'ok', 
        message: 'Bot API is running',
        config: {
            hasOpenAIKey: !!process.env.OPENAI_API_KEY,
            hasNeynarKey: !!process.env.NEYNAR_API_KEY,
            hasBotConfig: !!process.env.BOT_USERNAME
        }
    });
});

// Register webhook routes
app.use('/api', webhookRouter);

// Vercel serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
    return new Promise((resolve, reject) => {
        const expressReq = Object.assign(req, {
            get: (header: string) => req.headers[header],
            header: (header: string) => req.headers[header],
            accepts: () => true,
        });

        const expressRes = Object.assign(res, {
            status: (statusCode: number) => {
                res.status(statusCode);
                return expressRes;
            },
            json: (body: any) => {
                res.json(body);
                return expressRes;
            },
            send: (body: any) => {
                res.send(body);
                return expressRes;
            }
        });

        app(expressReq as any, expressRes as any, (err?: any) => {
            if (err) {
                console.error('Express error:', err);
                reject(err);
            } else {
                resolve(undefined);
            }
        });
    });
}

// Start local server if not in Vercel environment
if (process.env.VERCEL !== '1') {
    const port = parseInt(process.env.PORT || '5000', 10);
    app.listen(port, '0.0.0.0', () => {
        const timestamp = new Date().toISOString();
        console.log('Server started successfully:', {
            timestamp,
            port,
            environment: process.env.NODE_ENV,
            botConfig: {
                username: process.env.BOT_USERNAME,
                fid: process.env.BOT_FID,
                hasNeynarKey: !!process.env.NEYNAR_API_KEY,
                hasSignerUuid: !!process.env.SIGNER_UUID,
                hasOpenAIKey: !!process.env.OPENAI_API_KEY
            }
        });
    });
}