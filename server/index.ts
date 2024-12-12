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

// Webhook endpoint with mention handling and OpenAI integration
app.post('/webhook', async (req: Request, res: Response) => {
    try {
        console.log('Webhook received:', {
            timestamp: new Date().toISOString(),
            body: req.body
        });

        const { type, cast } = req.body;

        // Send immediate acknowledgment
        res.status(200).json({ status: 'success', message: 'Webhook received' });

        if (type === 'cast.created') {
            // Check for mentions using both FID and username
            const isMentioned = cast.mentions?.some((m: any) => m.fid === config.BOT_FID) ||
                              cast.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`);
            
            if (isMentioned) {
                console.log('Bot mention detected in cast:', cast.text);
                
                try {
                    // Like the mention
                    await neynar.publishReaction({
                        signerUuid: config.SIGNER_UUID,
                        reactionType: 'like',
                        target: cast.hash
                    });

                    // Generate and send response
                    const cleanedMessage = cast.text.replace(new RegExp(`@${config.BOT_USERNAME}`, 'i'), '').trim();
                    const response = await generateBotResponse(cleanedMessage);
                    
                    // Reply in the collectors canyon channel
                    await neynar.publishCast({
                        signerUuid: config.SIGNER_UUID,
                        text: `@${cast.author.username} ${response}`,
                        parent: cast.hash,
                        channelId: 'collectorscanyon'
                    });

                    console.log('Successfully responded to mention');
                } catch (error) {
                    console.error('Error handling mention:', error);
                }
            }
        }
    } catch (error) {
        console.error('Webhook error:', error);
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
