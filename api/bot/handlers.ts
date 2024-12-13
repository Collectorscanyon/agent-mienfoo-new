import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { generateBotResponse } from './openai';

// Initialize Neynar client with environment variables
if (!process.env.NEYNAR_API_KEY) {
    throw new Error('Missing NEYNAR_API_KEY environment variable');
}

const neynar = new NeynarAPIClient({ 
    apiKey: process.env.NEYNAR_API_KEY
});

// Validate required environment variables
if (!process.env.SIGNER_UUID || !process.env.BOT_USERNAME || !process.env.BOT_FID) {
    throw new Error('Missing required environment variables for Farcaster bot');
}

// Track processed casts to prevent duplicates
const processedCastHashes = new Set<string>();

// Clean up old hashes periodically (if the function instance lives long enough)
setInterval(() => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    processedCastHashes.clear();
}, 5 * 60 * 1000);

function isBotMessage(cast: any): boolean {
    if (!cast?.author) return false;
    
    const botFid = process.env.BOT_FID;
    const botUsername = process.env.BOT_USERNAME?.toLowerCase();
    
    return (
        cast.author.fid?.toString() === botFid ||
        cast.author.username?.toLowerCase() === botUsername ||
        cast.author.username?.toLowerCase() === 'mienfoo.eth'
    );
}

export async function handleWebhook(event: any) {
    const timestamp = new Date().toISOString();
    const requestId = Math.random().toString(36).substring(7);
    
    try {
        console.log('Processing webhook event:', {
            requestId,
            timestamp,
            eventType: event.type,
            hasData: !!event.data,
            hasOpenAIKey: !!process.env.OPENAI_API_KEY,
            hasNeynarKey: !!process.env.NEYNAR_API_KEY,
            hasBotConfig: !!process.env.BOT_USERNAME && !!process.env.BOT_FID
        });

        const { type, data: cast } = event;
        
        // Early validation
        if (!type || !cast || type !== 'cast.created' || !cast.hash) {
            console.log('Invalid webhook payload:', { 
                requestId, 
                timestamp, 
                type, 
                hasData: !!cast,
                receivedPayload: event 
            });
            return;
        }

        // Deduplication check
        if (processedCastHashes.has(cast.hash)) {
            console.log('Skipping duplicate cast:', {
                requestId,
                timestamp,
                castHash: cast.hash,
                author: cast.author?.username
            });
            return;
        }

        // Add to processed set
        processedCastHashes.add(cast.hash);
        setTimeout(() => processedCastHashes.delete(cast.hash), 5 * 60 * 1000);

        // Check for bot mentions with enhanced logging
        const botMentions = [
            '@mienfoo.eth',
            `@${process.env.BOT_USERNAME}`
        ];
        
        const isMentioned = botMentions.some(mention => 
            cast.text?.toLowerCase().includes(mention.toLowerCase())
        );

        console.log('Mention detection:', {
            requestId,
            timestamp,
            castHash: cast.hash,
            text: cast.text,
            isMentioned,
            isBot: isBotMessage(cast)
        });

        if (isMentioned && !isBotMessage(cast)) {
            console.log('Processing mention:', {
                requestId,
                timestamp,
                castHash: cast.hash,
                author: cast.author?.username,
                text: cast.text,
                threadHash: cast.thread_hash
            });

            try {
                // Like the mention first
                console.log('Attempting to like cast:', {
                    requestId,
                    timestamp,
                    castHash: cast.hash,
                    signerUuid: process.env.SIGNER_UUID
                });

                try {
                    const reaction = await neynar.publishReaction({
                        signerUuid: process.env.SIGNER_UUID || '',
                        reactionType: 'like',
                        target: cast.hash,
                    });

                    console.log('Successfully liked cast:', {
                        requestId,
                        timestamp,
                        castHash: cast.hash,
                        reactionStatus: 'success'
                    });
                } catch (likeError) {
                    console.error('Error liking cast:', {
                        requestId,
                        timestamp,
                        castHash: cast.hash,
                        error: likeError instanceof Error ? likeError.message : likeError
                    });
                    // Continue with reply even if like fails
                }

                // Generate and post response
                const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
                console.log('Generating response for message:', {
                    requestId,
                    timestamp,
                    castHash: cast.hash,
                    originalText: cast.text,
                    cleanedMessage,
                    author: cast.author?.username,
                    messageCategory: 'pokemon_collecting'
                });

                // Add retry logic for OpenAI response
                let response;
                let retryCount = 0;
                while (retryCount < 3) {
                    try {
                        response = await generateBotResponse(cleanedMessage);
                        if (response) break;
                        retryCount++;
                    } catch (error) {
                        console.error('Error generating response (attempt ${retryCount + 1}):', {
                            requestId,
                            timestamp,
                            error: error instanceof Error ? error.message : error
                        });
                        if (retryCount === 2) throw error;
                        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                    }
                }

                if (!response) {
                    throw new Error('Failed to generate response after retries');
                }

                // Format the reply with proper mention and channel tag
                const replyText = `@${cast.author?.username} ${response} #CollectorsCanyon`;
                
                // Post the reply to Farcaster
                const reply = await neynar.publishCast({
                    signerUuid: process.env.SIGNER_UUID || '',
                    text: replyText,
                    parent: cast.hash,
                    channelId: 'collectorscanyon'
                });

                console.log('Successfully posted reply:', {
                    requestId,
                    timestamp,
                    originalCastHash: cast.hash,
                    replyHash: reply.cast.hash,
                    replyText: replyText.substring(0, 50) + '...',
                    author: cast.author.username
                });

            } catch (error) {
                console.error('Error in Farcaster interaction:', {
                    requestId,
                    timestamp,
                    castHash: cast.hash,
                    error: error instanceof Error ? {
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    } : error,
                    phase: error instanceof Error && error.message.includes('like') ? 'liking' : 'replying'
                });
            }

            // Additional logging for completion
            console.log('Webhook processing completed:', {
                requestId,
                timestamp,
                castHash: cast.hash,
                author: cast.author?.username,
                hasResponse: true
            });
        }
    } catch (error) {
        console.error('Error in webhook handler:', {
            requestId,
            timestamp,
            error: error instanceof Error ? error.message : error,
            event
        });
    }
}