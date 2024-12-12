import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { config } from '../config';
import { generateBotResponse } from './openai';

const neynar = new NeynarAPIClient({ 
  apiKey: config.NEYNAR_API_KEY
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

export async function engageWithChannelContent() {
  try {
    console.log('Checking collectors canyon channel for content to engage with');
    
    // Get recent casts from the channel using the v2 API method
    const response = await neynar.fetchChannel({ 
      channelId: 'collectorscanyon'
    });

    if (!response) {
      console.log('No response received from channel fetch');
      return;
    }

    console.log(`Found ${response.casts?.length || 0} casts in the channel`);
    const casts = response.casts?.slice(0, 20) || [];
    
    for (const cast of casts) {
      try {
        // Skip own casts and already engaged content
        if (cast.author.fid.toString() === config.BOT_FID) {
          console.log('Skipping own cast');
          continue;
        }

        // Evaluate if content is reaction-worthy
        if (isCollectionRelatedContent(cast.text)) {
          console.log('Found collection-related content:', {
            author: cast.author.username,
            text: cast.text.substring(0, 50) + '...',
            castHash: cast.hash
          });

          // Add reaction (like)
          await neynar.publishReaction({
            signerUuid: config.SIGNER_UUID,
            reactionType: 'like',
            target: cast.hash
          });
          
          console.log(`Successfully liked cast ${cast.hash} by ${cast.author.username}`);
          
          // Add a delay between reactions to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error('Error processing cast:', {
          castHash: cast.hash,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue with next cast even if one fails
        continue;
      }
    }
    
    console.log('Finished engaging with channel content');
  } catch (error) {
    console.error('Error engaging with channel content:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

function isCollectionRelatedContent(text: string): boolean {
  const keywords = [
    'collect', 'rare', 'vintage', 'cards', 'trading',
    'figure', 'limited', 'edition', 'mint', 'graded',
    'sealed', 'hobby', 'treasure', 'antique', 'value'
  ];
  
  text = text.toLowerCase();
  return keywords.some(keyword => text.includes(keyword));
}

// Start periodic engagement
setInterval(engageWithChannelContent, 5 * 60 * 1000); // Check every 5 minutes