import express, { type Request, type Response, type NextFunction } from 'express';
import bodyParser from 'body-parser';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { config } from './config';
import { handleWebhook } from './bot/handlers';

// Initialize OpenAI later to prevent startup issues
let generateBotResponse: (message: string) => Promise<string>;
import('./bot/openai').then(module => {
    generateBotResponse = module.generateBotResponse;
    console.log('OpenAI module loaded successfully');
}).catch(error => {
    console.error('Error loading OpenAI module:', error);
});

const app = express();

// Initialize Neynar client
const neynar = new NeynarAPIClient({ 
    apiKey: config.NEYNAR_API_KEY
});

// Track processed webhook events with timestamps
const processedWebhookEvents = new Map<string, number>();

// Detailed request logging
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log('Request details:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        contentType: req.headers['content-type'],
        body: req.body
    });
    next();
});

// Parse JSON bodies (with less strict parsing)
app.use(bodyParser.json({ 
    strict: false,
    limit: '10mb'
}));

// Parse URL-encoded bodies
app.use(bodyParser.urlencoded({ 
    extended: true,
    limit: '10mb'
}));

// Error handling for parsing errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError) {
        console.error('Parse error:', err);
        return res.status(200).json({ 
            status: 'error',
            message: 'Invalid request format'
        });
    }
    next(err);
});

// Health check endpoint
app.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Webhook endpoint with immediate response and async processing
app.post('/webhook', (req: Request, res: Response) => {
    // Send 200 OK immediately to prevent retries
    res.status(200).send('OK');

    // Process the webhook asynchronously
    setImmediate(async () => {
        try {
            // Enhanced request logging
            console.log('Webhook request received:', {
                timestamp: new Date().toISOString(),
                headers: req.headers,
                body: req.body,
                path: req.path
            });

            const { type, data } = req.body;
            
            // Early validation
            if (!type || !data || type !== 'cast.created' || !data.hash) {
                console.log('Invalid webhook payload:', { type, hasData: !!data });
                return;
            }

            // Comprehensive deduplication check with timestamp
            const eventId = `${type}-${data.hash}`;
            const now = Date.now();
            const lastProcessed = processedWebhookEvents.get(eventId);
            
            if (lastProcessed && now - lastProcessed < 5 * 60 * 1000) { // 5 minute window
                console.log('Skipping duplicate webhook event:', {
                    eventId,
                    timeSinceLastProcess: `${Math.round((now - lastProcessed) / 1000)}s`,
                    hash: data.hash,
                    author: data.author?.username
                });
                return;
            }

            // Mark as processed immediately
            processedWebhookEvents.set(eventId, now);

            // Process webhook via handlers
            await handleWebhook({ body: req.body });

            // Cleanup old events
            const fiveMinutesAgo = now - 5 * 60 * 1000;
            Array.from(processedWebhookEvents.entries()).forEach(([key, timestamp]) => {
                if (timestamp < fiveMinutesAgo) {
                    processedWebhookEvents.delete(key);
                }
            });

        } catch (error) {
            console.error('Fatal webhook error:', {
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error,
                rawBody: req.body
            });
        }
    });
});

// Cleanup old processed events periodically (every hour)
setInterval(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    console.log('Cleaning up old processed webhook events');
    
    Array.from(processedWebhookEvents.entries()).forEach(([eventId, timestamp]) => {
        if (timestamp < oneHourAgo) {
            processedWebhookEvents.delete(eventId);
        }
    });
}, 60 * 60 * 1000);

// Start server
const { PORT } = config;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log('Ready to handle mentions and cast in collectors canyon');
    console.log('Bot config:', {
        username: config.BOT_USERNAME,
        fid: config.BOT_FID,
        hasNeynarKey: !!config.NEYNAR_API_KEY,
        hasSignerUuid: !!config.SIGNER_UUID
    });
    
    console.log('Bot is ready to handle webhook events');
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});