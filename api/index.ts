import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleWebhook } from './bot/handlers';

// Track processed webhook events (with automatic cleanup)
const processedWebhookEvents = new Set<string>();
const WEBHOOK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Enhanced request logging
const logRequest = (req: VercelRequest) => {
    console.log('Incoming request:', {
        method: req.method,
        url: req.url,
        headers: {
            'content-type': req.headers['content-type'],
            'content-length': req.headers['content-length']
        },
        body: req.body,
        timestamp: new Date().toISOString()
    });
};

// Main serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        logRequest(req);

        // Health check endpoint
        if (req.method === 'GET') {
            return res.json({ status: 'ok', message: 'Server is running' });
        }

        // Webhook endpoint
        if (req.method === 'POST' && req.url === '/api/webhook') {
            // Enhanced error handling for webhook payload
            if (!req.body || typeof req.body !== 'object') {
                console.error('Invalid request body:', req.body);
                return res.status(400).json({ error: 'Invalid request body' });
            }

            // Send 200 OK after validation to prevent retries
            res.status(200).send('OK');

        try {
                // Log the raw webhook payload
                console.log('Processing webhook payload:', {
                    body: req.body,
                    contentType: req.headers['content-type'],
                    timestamp: new Date().toISOString()
                });

                const { type, data } = req.body;
                
                // Enhanced validation with detailed logging
                if (!type || !data || type !== 'cast.created' || !data.hash) {
                    console.error('Invalid webhook payload structure:', {
                        type,
                        hasData: !!data,
                        hasHash: data?.hash ? true : false,
                        timestamp: new Date().toISOString()
                    });
                    return res.status(400).json({ 
                        error: 'Invalid webhook payload structure',
                        details: {
                            type: !type ? 'missing' : type,
                            data: !data ? 'missing' : 'present',
                            hash: !data?.hash ? 'missing' : 'present'
                        }
                    });
                }

            // Comprehensive deduplication check
            const eventId = `${type}-${data.hash}-${data.author?.username}`;
            if (processedWebhookEvents.has(eventId)) {
                console.log('Skipping duplicate webhook event:', {
                    eventId,
                    timestamp: new Date().toISOString(),
                    hash: data.hash,
                    author: data.author?.username
                });
                return;
            }

            // Mark as processed immediately before any async operations
            processedWebhookEvents.add(eventId);
            
            // Cleanup old events after 5 minutes
            setTimeout(() => {
                if (processedWebhookEvents.has(eventId)) {
                    processedWebhookEvents.delete(eventId);
                }
            }, 5 * 60 * 1000);

            // Process webhook
            await handleWebhook({ body: req.body });

        } catch (error) {
            console.error('Webhook processing error:', {
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error,
                webhookBody: req.body
            });
        }
    }

    // Health check endpoint
    if (req.method === 'GET' && req.url === '/api') {
        return res.status(200).json({ status: 'ok', message: 'Bot API is running' });
    }

    // Return 405 for unsupported methods
    return res.status(405).json({ error: 'Method not allowed' });
}

// Bot configuration from environment variables
export const config = {
    NEYNAR_API_KEY: process.env.NEYNAR_API_KEY || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    SIGNER_UUID: process.env.SIGNER_UUID || '',
    BOT_USERNAME: process.env.BOT_USERNAME || '',
    BOT_FID: process.env.BOT_FID || '',
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || ''
};
