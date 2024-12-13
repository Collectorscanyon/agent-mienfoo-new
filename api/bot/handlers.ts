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

// Clean up old hashes periodically
setInterval(() => {
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
    
    console.log('Processing webhook event:', {
        requestId,
        timestamp,
        eventType: event.type,
        hasData: !!event.data,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasNeynarKey: !!process.env.NEYNAR_API_KEY,
        hasBotConfig: !!process.env.BOT_USERNAME && !!process.env.BOT_FID
    });

    try {
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

        // Enhanced mention detection
        const botMentions = [
            '@mienfoo.eth',
            process.env.BOT_USERNAME ? `@${process.env.BOT_USERNAME}` : ''
        ].filter(Boolean);
        
        const isMentioned = botMentions.some(mention => 
            cast.text?.toLowerCase().includes(mention.toLowerCase())
        );

        console.log('Mention detection:', {
            requestId,
            timestamp,
            castHash: cast.hash,
            text: cast.text,
            isMentioned,
            isBot: isBotMessage(cast),
            hasOpenAIKey: !!process.env.OPENAI_API_KEY,
            botMentionsFound: botMentions
        });

        if (!isMentioned || isBotMessage(cast)) {
            return;
        }

        // Process the mention
        console.log('Processing mention:', {
            requestId,
            timestamp,
            castHash: cast.hash,
            author: cast.author?.username,
            text: cast.text,
            threadHash: cast.thread_hash,
            processingStage: 'starting_mention_processing'
        });

        try {
            // Like the cast
            await neynar.publishReaction({
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

            // Generate response
            const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
            const startTime = Date.now();
            
            console.log('Generating response:', {
                requestId,
                timestamp,
                castHash: cast.hash,
                originalText: cast.text,
                cleanedMessage,
                author: cast.author?.username,
                messageCategory: 'pokemon_collecting',
                processingStage: 'starting_openai_request'
            });

            const response = await generateBotResponse(cleanedMessage);
            
            if (!response) {
                throw new Error('Failed to generate response');
            }

            // Format and post reply
            const replyText = `@${cast.author?.username} ${response} #CollectorsCanyon`;
            
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
                author: cast.author?.username,
                processingTime: Date.now() - startTime
            });

        } catch (error) {
            console.error('Error in cast interaction:', {
                requestId,
                timestamp,
                castHash: cast.hash,
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            });
            throw error; // Re-throw to be caught by outer try-catch
        }

    } catch (error) {
        console.error('Error in webhook handler:', {
            requestId,
            timestamp,
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : error,
            event
        });
    }
}