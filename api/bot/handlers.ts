
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { generateBotResponse } from './openai';

if (!process.env.NEYNAR_API_KEY) {
  throw new Error('Missing NEYNAR_API_KEY');
}

const neynar = new NeynarAPIClient({ 
  apiKey: process.env.NEYNAR_API_KEY 
});

const processedCasts = new Set<string>();

export async function handleWebhook(req: any) {
  const cast = req.body?.data;
  if (!cast?.hash) return;

  // Prevent duplicate processing
  if (processedCasts.has(cast.hash)) return;
  processedCasts.add(cast.hash);

  // Clean up old casts after 5 minutes
  setTimeout(() => processedCasts.delete(cast.hash), 5 * 60 * 1000);

  try {
    const isBotMentioned = cast.text?.toLowerCase().includes(`@${process.env.BOT_USERNAME?.toLowerCase()}`);
    
    if (isBotMentioned) {
      // Like the cast
      await neynar.publishReaction({
        signerUuid: process.env.SIGNER_UUID || '',
        reactionType: 'like',
        target: cast.hash
      });

      // Generate and send response
      const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
      const response = await generateBotResponse(cleanedMessage);

      await neynar.publishCast({
        signerUuid: process.env.SIGNER_UUID || '',
        text: `@${cast.author.username} ${response}`,
        parent: cast.hash,
        channelId: 'collectorscanyon'
      });
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    throw error;
  }
}
