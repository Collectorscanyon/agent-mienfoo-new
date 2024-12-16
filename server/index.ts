import express from 'express';
import bodyParser from 'body-parser';
import type { Request, Response, NextFunction } from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { config } from './config';

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

// Raw body parsing for webhook verification
app.use(express.raw({ type: 'application/json' }));

// Parse JSON for other routes
app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/webhook') {
        try {
            req.body = JSON.parse(req.body.toString());
        } catch (error) {
            console.error('Webhook body parse error:', error);
            return res.status(400).json({ error: 'Invalid JSON' });
        }
    }
    next();
});

// Error handling for parsing errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Request processing error:', {
        path: req.path,
        method: req.method,
        error: err.message
    });
    if (err instanceof SyntaxError) {
        return res.status(400).json({ 
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
        console.log('Webhook received:', {
            headers: req.headers,
            body: req.body,
            timestamp: new Date().toISOString()
        });

        // Validate webhook payload
        if (!req.body || typeof req.body !== 'object') {
            console.error('Invalid webhook payload:', req.body);
            return res.status(400).json({ error: 'Invalid webhook payload' });
        }

        // Send immediate acknowledgment
        res.status(200).json({ status: 'success', message: 'Webhook received' });

        const { type, data } = req.body;
        console.log('Processing webhook:', { type, timestamp: new Date().toISOString() });

        // Process webhook asynchronously
        if (type === 'cast.created') {
            const cast = data;
            console.log('Processing cast:', JSON.stringify(cast, null, 2));
            
            // Enhanced mention detection with logging
            const mentionChecks = {
                byFid: cast.mentions?.some((m: any) => m.fid?.toString() === config.BOT_FID),
                byUsername: cast.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`),
                byEth: cast.text?.toLowerCase().includes('@mienfoo.eth')
            };

            console.log('Mention detection:', {
                checks: mentionChecks,
                castText: cast.text,
                mentions: cast.mentions
            });

            const isBotMentioned = Object.values(mentionChecks).some(check => check);

            if (isBotMentioned) {
                console.log('Bot mention detected:', {
                    castHash: cast.hash,
                    author: cast.author.username,
                    text: cast.text,
                    mentions: cast.mentions
                });

                try {
                    // Step 1: Like the mention
                    console.log('Attempting to like cast:', cast.hash);
                    try {
                        const likeResult = await neynar.publishReaction({
                            signerUuid: config.SIGNER_UUID,
                            reactionType: 'like',
                            target: cast.hash,
                        });
                        console.log('Successfully liked the mention:', likeResult);
                    } catch (error) {
                        console.error('Error liking cast:', error instanceof Error ? error.message : error);
                        // Continue with reply even if like fails
                    }

                    // Step 2: Generate and send response
                    try {
                        // Clean the message by removing all @mentions
                        const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
                        console.log('Generating response for cleaned message:', cleanedMessage);
                        
                        const response = await generateBotResponse(cleanedMessage);
                        console.log('Generated response:', response);

                        // Step 3: Reply to the mention
                        console.log('Attempting to reply to cast:', {
                            hash: cast.hash,
                            signerUuid: config.SIGNER_UUID,
                            author: cast.author.username
                        });

                        const replyText = `@${cast.author.username} ${response}`;
                        console.log('Sending reply:', replyText);

                        const replyResult = await neynar.publishCast({
                            signerUuid: config.SIGNER_UUID,
                            text: replyText,
                            parent: cast.hash,
                            channelId: "collectorscanyon"  // Use the collectors canyon channel
                        });

                        console.log('Reply sent successfully:', {
                            replyHash: replyResult.cast.hash,
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        console.error('Error in response generation or reply:', {
                            error: error instanceof Error ? {
                                name: error.name,
                                message: error.message,
                                stack: error.stack
                            } : error,
                            timestamp: new Date().toISOString()
                        });
                    }

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
        console.error('Webhook processing error:', {
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : error,
            webhookBody: req.body
        });
        // Already sent 200 OK, just log the error
    }
});

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
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});
