import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { config } from '../config';
import { generateBotResponse } from './openai';

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

export async function handleWebhook(event: any) {
  const { type, cast } = event;
  
  try {
    console.log('Webhook received:', {
      type,
      timestamp: new Date().toISOString(),
      castHash: cast?.hash,
      authorUsername: cast?.author?.username
    });

    if (type === 'cast.created') {
      // Check for mentions using both FID and username
      const isMentioned = cast.mentions?.some((m: any) => m.fid === config.BOT_FID) ||
                         cast.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`);
      
      console.log('Mention detection:', {
        hasMention: isMentioned,
        botFid: config.BOT_FID,
        botUsername: config.BOT_USERNAME,
        text: cast.text,
        mentions: cast.mentions
      });

      if (isMentioned) {
        console.log('Bot mention detected in cast:', cast.text);
        await handleMention(cast);
      }
      
      // Check if cast should be shared to collectorscanyon
      if (shouldShareToCollectorsCanyon(cast)) {
        await shareToCollectorsCanyon(cast);
      }
    }
  } catch (error) {
    console.error('Error in webhook handler:', error);
    throw error;
  }
}

async function handleMention(cast: any) {
  try {
    console.log('Processing mention:', {
      timestamp: new Date().toISOString(),
      castHash: cast.hash,
      author: cast.author.username,
      text: cast.text,
      mentions: cast.mentions
    });
    
    // Like the mention first
    await neynar.publishReaction({
      signerUuid: config.SIGNER_UUID,
      reactionType: 'like',
      target: cast.hash
    });

    // Generate and send response
    const cleanedMessage = cast.text.replace(new RegExp(`@${config.BOT_USERNAME}`, 'i'), '').trim();
    const response = await generateBotResponse(cleanedMessage);
    
    await neynar.publishCast({
      signerUuid: config.SIGNER_UUID,
      text: `@${cast.author.username} ${response}`,
      parent: cast.hash,
      channelId: 'collectorscanyon'
    });
  } catch (error) {
    console.error('Error handling mention:', error);
    throw error;
  }
}

async function shareToCollectorsCanyon(cast: any) {
  try {
    await neynar.publishCast({
      signerUuid: config.SIGNER_UUID,
      text: `💡 Interesting discussion about collectibles!\n\n${cast.text}`,
      channelId: 'collectorscanyon'
    });
  } catch (error) {
    console.error('Error sharing to channel:', error);
  }
}

function shouldShareToCollectorsCanyon(cast: any): boolean {
  const text = cast.text.toLowerCase();
  return text.includes('collect') || 
         text.includes('cards') || 
         text.includes('trading') ||
         text.includes('rare');
}
