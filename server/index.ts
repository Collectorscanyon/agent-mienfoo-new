import express from 'express';
import bodyParser from 'body-parser';
import type { Request, Response, NextFunction } from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { generateBotResponse } from './bot/openai';
import { config } from './config';

const app = express();

// Initialize Neynar client
const neynar = new NeynarAPIClient({ 
    apiKey: config.NEYNAR_API_KEY,
    configuration: {
        baseOptions: {
            headers: {
                "x-neynar-api-key": config.NEYNAR_API_KEY
            }
        }
    }
});

// Detailed request logging
app.use((req: Request, res: Response, next) => {
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

// Webhook endpoint with enhanced mention handling
app.post('/webhook', async (req: Request, res: Response) => {
    try {
        // Log the full webhook payload for debugging
        console.log('Webhook received:', JSON.stringify(req.body, null, 2));

        // Send immediate acknowledgment
        res.status(200).json({ status: 'success', message: 'Webhook received' });

        const { type, data } = req.body;

        // Process webhook asynchronously
        if (type === 'cast.created' && data?.mentioned_profiles) {
            console.log('Processing cast:', JSON.stringify(data, null, 2));
            
            // Check if bot was mentioned
            const isBotMentioned = data.mentioned_profiles.some((profile: any) => 
                profile.fid === config.BOT_FID ||
                profile.username?.toLowerCase() === config.BOT_USERNAME.toLowerCase()
            );

            if (isBotMentioned) {
                console.log('Bot mention detected:', {
                    castHash: data.hash,
                    author: data.author.username,
                    text: data.text
                });

                try {
                    // Step 1: Like the mention
                    await neynar.publishReaction({
                        signerUuid: config.SIGNER_UUID,
                        reactionType: 'like',
                        target: data.hash
                    });
                    console.log('Successfully liked the mention');

                    // Step 2: Generate response
                    const cleanedMessage = data.text
                        .replace(new RegExp(`@${config.BOT_USERNAME}`, 'gi'), '')
                        .trim();
                    const response = await generateBotResponse(cleanedMessage);
                    console.log('Generated response:', response);

                    // Step 3: Reply to the mention
                    await neynar.publishCast({
                        signerUuid: config.SIGNER_UUID,
                        text: `@${data.author.username} ${response}`,
                        parent: data.hash,
                        channelId: 'collectorscanyon'
                    });
                    console.log('Successfully replied to the mention');

                } catch (error) {
                    console.error('Error in bot actions:', error);
                    if (error instanceof Error) {
                        console.error('Error details:', {
                            name: error.name,
                            message: error.message,
                            stack: error.stack
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Webhook processing error:', error);
        // Already sent 200 OK, just log the error
    }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log('Ready to handle mentions and cast in collectors canyon');
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});
