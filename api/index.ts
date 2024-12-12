import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleWebhook } from './bot/handlers';

// Track processed webhook events (with automatic cleanup)
const processedWebhookEvents = new Set<string>();
const WEBHOOK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Main serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Health check endpoint
    if (req.method === 'GET') {
        return res.json({ status: 'ok', message: 'Server is running' });
    }

    // Webhook endpoint
    if (req.method === 'POST' && req.url === '/api/webhook') {
        // Send 200 OK immediately to prevent retries
        res.status(200).send('OK');

        try {
            const { type, data } = req.body;
            
            // Early validation
            if (!type || !data || type !== 'cast.created' || !data.hash) {
                console.log('Invalid webhook payload:', { type, hasData: !!data });
                return;
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
