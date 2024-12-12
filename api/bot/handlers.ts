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
    try {
        const { type, data: cast } = event;
        
        // Early validation
        if (!type || !data || type !== 'cast.created' || !cast.hash) {
            console.log('Invalid webhook payload:', { type, hasData: !!cast });
            return;
        }

        // Deduplication check
        if (processedCastHashes.has(cast.hash)) {
            console.log('Skipping duplicate cast:', cast.hash);
            return;
        }

        // Track processed cast
        processedCastHashes.add(cast.hash);

        // Check for bot mentions
        const isMentioned = (
            cast.mentions?.some((m: any) => m.fid?.toString() === process.env.BOT_FID) ||
            cast.text?.toLowerCase().includes(`@${process.env.BOT_USERNAME?.toLowerCase()}`) ||
            cast.text?.toLowerCase().includes('@mienfoo.eth')
        );

        if (isMentioned && !isBotMessage(cast)) {
            // Like the mention
            try {
                await neynar.publishReaction({
                    signerUuid: process.env.SIGNER_UUID || '',
                    reactionType: 'like',
                    target: cast.hash,
                });
            } catch (error) {
                console.error('Error liking cast:', error);
            }

            // Generate and send response
            const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
            const response = await generateBotResponse(cleanedMessage);
            
            // Reply to the mention
            const replyText = `@${cast.author.username} ${response}`;
            await neynar.publishCast({
                signerUuid: process.env.SIGNER_UUID || '',
                text: replyText,
                parent: cast.hash,
                channelId: "collectorscanyon"
            });
        }
    } catch (error) {
        console.error('Error in webhook handler:', error);
    }
}
