import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { generateBotResponse } from './openai';

// Initialize Neynar client with environment variables
const neynar = new NeynarAPIClient({ 
    apiKey: process.env.NEYNAR_API_KEY || ''
});

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
    try {
        console.log('Processing webhook event:', {
            timestamp,
            eventType: event.type,
            hasData: !!event.data
        });

        const { type, data: cast } = event;
        
        // Early validation
        if (!type || !cast || type !== 'cast.created' || !cast.hash) {
            console.log('Invalid webhook payload:', { timestamp, type, hasData: !!cast });
            return;
        }

        // Deduplication check
        if (processedCastHashes.has(cast.hash)) {
            console.log('Skipping duplicate cast:', {
                timestamp,
                castHash: cast.hash,
                text: cast.text
            });
            return;
        }

        // Track processed cast
        processedCastHashes.add(cast.hash);
        console.log('Added cast to processed set:', {
            timestamp,
            castHash: cast.hash,
            setSize: processedCastHashes.size
        });

        // Check for bot mentions with enhanced logging
        const botMentions = [
            '@mienfoo.eth',
            `@${process.env.BOT_USERNAME}`
        ];
        
        const isMentioned = botMentions.some(mention => 
            cast.text?.toLowerCase().includes(mention.toLowerCase())
        );

        console.log('Mention detection:', {
            timestamp,
            castHash: cast.hash,
            text: cast.text,
            isMentioned,
            isBot: isBotMessage(cast)
        });

        if (isMentioned && !isBotMessage(cast)) {
            console.log('Processing mention:', {
                timestamp,
                castHash: cast.hash,
                author: cast.author?.username,
                text: cast.text
            });

            // Like the mention
            try {
                await neynar.publishReaction({
                    signerUuid: process.env.SIGNER_UUID || '',
                    reactionType: 'like',
                    target: cast.hash,
                });
                console.log('Successfully liked cast:', {
                    timestamp,
                    castHash: cast.hash
                });
            } catch (error) {
                console.error('Error liking cast:', {
                    timestamp,
                    castHash: cast.hash,
                    error: error instanceof Error ? error.message : error
                });
            }

            try {
                // Clean message and generate response
                const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
                const requestId = Math.random().toString(36).substring(7);
            
                console.log('Generating response for:', {
                    requestId,
                    timestamp,
                    castHash: cast.hash,
                    originalText: cast.text,
                    cleanedMessage,
                    hasOpenAIKey: !!process.env.OPENAI_API_KEY
                });

                if (!process.env.OPENAI_API_KEY) {
                    throw new Error('OpenAI API key not configured');
                }

                const response = await generateBotResponse(cleanedMessage);
                if (!response) {
                    throw new Error('Empty response from OpenAI');
                }

                console.log('Generated response:', {
                    requestId,
                    timestamp,
                    castHash: cast.hash,
                    responseLength: response.length,
                    response
                });

                // Format and send reply
                const replyText = `@${cast.author.username} ${response}`;
                console.log('Sending reply:', {
                    timestamp,
                    castHash: cast.hash,
                    replyText
                });

                await neynar.publishCast({
                    signerUuid: process.env.SIGNER_UUID || '',
                    text: replyText,
                    parent: cast.hash,
                    channelId: "collectorscanyon"
                });

                console.log('Reply sent successfully:', {
                    timestamp,
                    castHash: cast.hash,
                    parentHash: cast.hash
                });
            } catch (error) {
                console.error('Error in response generation or reply:', {
                    timestamp,
                    castHash: cast.hash,
                    error: error instanceof Error ? error.message : error
                });
            }
        }
    } catch (error) {
        console.error('Error in webhook handler:', {
            timestamp,
            error: error instanceof Error ? error.message : error,
            event
        });
    }
}