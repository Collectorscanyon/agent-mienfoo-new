import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleWebhook } from './bot/handlers';
import express from 'express';
import { Server } from 'http';

// Initialize Express app
const app = express();

// Track processed webhook events
const processedEvents = new Set<string>();
const WEBHOOK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Enhanced logging middleware
app.use((req, res, next) => {
    console.log('Request details:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
    });
    next();
});

// Parse JSON payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', message: 'Bot API is running' });
});

// Webhook handler
async function webhookHandler(req: VercelRequest, res: VercelResponse) {
    try {
        // Send immediate acknowledgment
        res.status(200).send('OK');

        const { type, data } = req.body;

        // Validate webhook payload
        if (!type || !data || type !== 'cast.created' || !data.hash) {
            console.error('Invalid webhook structure:', { type, hasData: !!data });
            return;
        }

        // Deduplication check
        const eventId = `${type}-${data.hash}-${data.author?.username}`;
        if (processedEvents.has(eventId)) {
            console.log('Skipping duplicate event:', eventId);
            return;
        }

        // Mark as processed and set cleanup
        processedEvents.add(eventId);
        setTimeout(() => processedEvents.delete(eventId), WEBHOOK_TIMEOUT);

        // Process webhook
        await handleWebhook({ body: req.body });

    } catch (error) {
        console.error('Webhook processing error:', {
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : error,
            body: req.body
        });
    }
}

// Webhook endpoint
app.post('/api/webhook', webhookHandler);
app.post('/webhook', webhookHandler);

// Serverless function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Forward to Express app
    return new Promise((resolve, reject) => {
        app(req, res, (err) => {
            if (err) {
                console.error('Express error:', err);
                reject(err);
            } else {
                resolve(undefined);
            }
        });
    });
}

// Start server if running locally
if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 5000;
    const server = new Server(app);
    
    server.listen(port, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${port}`);
        console.log('Bot config:', {
            username: process.env.BOT_USERNAME,
            fid: process.env.BOT_FID,
            hasNeynarKey: !!process.env.NEYNAR_API_KEY,
            hasSignerUuid: !!process.env.SIGNER_UUID
        });
    });
}