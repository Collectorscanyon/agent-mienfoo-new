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
        if (type === 'cast.created') {
            const cast = data;
            console.log('Processing cast:', JSON.stringify(cast, null, 2));
            
            // Enhanced mention detection
            const isBotMentioned = (
                cast.mentions?.some((m: any) => m.fid?.toString() === config.BOT_FID) ||
                cast.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`) ||
                cast.text?.toLowerCase().includes('@mienfoo.eth')
            );

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
        console.error('Webhook processing error:', error);
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
