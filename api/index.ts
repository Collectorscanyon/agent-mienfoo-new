import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleWebhook } from './bot/handlers';

// Track processed webhook events with cleanup
const processedEvents = new Set<string>();
const WEBHOOK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Enhanced request logging
function logRequest(req: VercelRequest, stage: string = 'initial') {
    console.log(`Request details (${stage}):`, {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        headers: {
            'content-type': req.headers['content-type'],
            'content-length': req.headers['content-length']
        },
        body: req.body,
        query: req.query
    });
}

// Manual body parsing for Vercel serverless function
async function parseBody(req: VercelRequest): Promise<void> {
    if (req.body) return; // Body already parsed

    return new Promise((resolve, reject) => {
        const contentType = req.headers['content-type'] || '';
        let rawBody = '';

        req.on('data', chunk => {
            rawBody += chunk.toString();
        });

        req.on('end', () => {
            try {
                if (contentType.includes('application/json')) {
                    req.body = JSON.parse(rawBody);
                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                    req.body = Object.fromEntries(new URLSearchParams(rawBody));
                }
                resolve();
            } catch (error) {
                console.error('Error parsing request body:', error);
                reject(error);
            }
        });

        req.on('error', reject);
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        // Log initial request state
        logRequest(req, 'initial');

        // Parse request body
        await parseBody(req);

        // Log parsed request state
        logRequest(req, 'after-parsing');

        // Health check endpoint
        if (req.method === 'GET' && req.url === '/api/health') {
            return res.status(200).json({ status: 'ok', message: 'Bot API is running' });
        }

        // Webhook endpoint
        if (req.method === 'POST' && req.url === '/api/webhook') {
            // Validate webhook payload
            if (!req.body || typeof req.body !== 'object') {
                console.error('Invalid webhook payload:', {
                    body: req.body,
                    type: typeof req.body,
                    contentType: req.headers['content-type']
                });
                return res.status(400).json({
                    error: 'Invalid request body',
                    details: 'Expected JSON object'
                });
            }

            const { type, data } = req.body;

            // Validate webhook structure
            if (!type || !data || type !== 'cast.created' || !data.hash) {
                console.error('Invalid webhook structure:', {
                    type,
                    hasData: !!data,
                    hasHash: data?.hash ? true : false
                });
                return res.status(400).json({
                    error: 'Invalid webhook structure',
                    details: {
                        type: !type ? 'missing' : type,
                        data: !data ? 'missing' : 'present',
                        hash: !data?.hash ? 'missing' : 'present'
                    }
                });
            }

            // Send immediate acknowledgment
            res.status(200).send('OK');

            try {
                // Deduplication check
                const eventId = `${type}-${data.hash}-${data.author?.username}`;
                if (processedEvents.has(eventId)) {
                    console.log('Skipping duplicate event:', eventId);
                    return;
                }

                // Mark as processed
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
            return;
        }

        // Handle unsupported methods
        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Server error:', {
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : error
        });
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Export configuration
export const config = {
    api: {
        bodyParser: false // Disable automatic body parsing to handle it manually
    }
};
