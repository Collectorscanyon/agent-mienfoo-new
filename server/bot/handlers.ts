import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { config } from '../config';
import { analyzeImage, generateImageResponse } from './vision';
import { generateBotResponse } from './openai';

// Initialize Neynar client
const neynar = new NeynarAPIClient({ 
  apiKey: config.NEYNAR_API_KEY
});

// Simple set for strict deduplication by cast hash
const processedCastHashes = new Set<string>();

// Cleanup old hashes periodically (every hour)
setInterval(() => {
  processedCastHashes.clear();
}, 60 * 60 * 1000);

function isBotMessage(text: string, author: any): boolean {
  if (!text || !author) return false;
  
  return (
    author.fid?.toString() === config.BOT_FID ||
    author.username?.toLowerCase() === config.BOT_USERNAME.toLowerCase() ||
    author.username?.toLowerCase() === 'mienfoo.eth'
  );
}

export async function handleWebhook(event: any) {
  try {
    if (!event?.type || !event?.data) {
      console.log('Invalid webhook event structure');
      return;
    }

    const { type, data: cast } = event;
    
    // Early exit for non-cast events
    if (type !== 'cast.created') {
      return;
    }

    // Early exit for bot's own messages
    if (isBotMessage(cast.text, cast.author)) {
      console.log('Skipping bot\'s own message:', {
        hash: cast.hash,
        author: cast.author.username
      });
      return;
    }

    // Strict deduplication by cast hash
    if (processedCastHashes.has(cast.hash)) {
      console.log('Duplicate cast detected, skipping:', {
        hash: cast.hash,
        author: cast.author.username
      });
      return;
    }

    // Mark as processed immediately
    processedCastHashes.add(cast.hash);

    // Check for bot mentions
    const isMentioned = (
      cast.mentions?.some((m: any) => m.fid?.toString() === config.BOT_FID) ||
      cast.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`) ||
      cast.text?.toLowerCase().includes('@mienfoo.eth')
    );

    if (isMentioned) {
      console.log('Processing mention:', {
        hash: cast.hash,
        author: cast.author.username,
        text: cast.text
      });
      await handleMention(cast);
    }
  } catch (error) {
    console.error('Error in webhook handler:', error);
  }
}

async function handleMention(cast: any) {
  try {
    // Like the mention
    try {
      await neynar.publishReaction({
        signerUuid: config.SIGNER_UUID,
        reactionType: 'like',
        target: cast.hash
      });
    } catch (error) {
      console.error('Error liking mention:', error);
    }

    // Process image if present
    let imageUrl = null;
    let response;

    if (cast.attachments?.length > 0) {
      imageUrl = cast.attachments[0].url;
    } else if (cast.embeds?.length > 0) {
      const embeddedImage = cast.embeds[0]?.cast?.embeds?.[0];
      imageUrl = embeddedImage?.url;
    }

    if (imageUrl) {
      try {
        const imageAnalysis = await analyzeImage(imageUrl);
        response = imageAnalysis ? generateImageResponse(imageAnalysis) : await generateTextResponse(cast.text);
      } catch (error) {
        console.error('Error analyzing image:', error);
        response = await generateTextResponse(cast.text);
      }
    } else {
      response = await generateTextResponse(cast.text);
    }

    // Send response
    try {
      await neynar.publishCast({
        signerUuid: config.SIGNER_UUID,
        text: `@${cast.author.username} ${response}`,
        parent: cast.hash,
        channelId: 'collectorscanyon'
      });
    } catch (error) {
      console.error('Error publishing response:', error);
    }
  } catch (error) {
    console.error('Error handling mention:', error);
  }
}

async function generateTextResponse(text: string): Promise<string> {
  const cleanedMessage = text.replace(/@[\w.]+/g, '').trim();
  return await generateBotResponse(cleanedMessage);
}

export async function engageWithChannelContent() {
  try {
    const response = await neynar.searchCasts({
      q: "collectorscanyon",
      channelId: "collectorscanyon",
      limit: 20
    });

    if (!response?.result?.casts) {
      return;
    }

    for (const cast of response.result.casts) {
      // Skip bot's own messages and processed casts
      if (isBotMessage(cast.text, cast.author) || processedCastHashes.has(cast.hash)) {
        continue;
      }

      if (isCollectionRelatedContent(cast.text)) {
        try {
          await neynar.publishReaction({
            signerUuid: config.SIGNER_UUID,
            reactionType: 'like',
            target: cast.hash
          });
          processedCastHashes.add(cast.hash);
        } catch (error) {
          console.error('Error liking cast:', error);
        }
      }
    }
  } catch (error) {
    console.error('Error engaging with channel content:', error);
  }
}

function isCollectionRelatedContent(text: string): boolean {
  if (!text) return false;
  
  const keywords = [
    'collect', 'rare', 'vintage', 'limited edition',
    'first edition', 'mint condition', 'graded', 'sealed',
    'cards', 'trading cards', 'figures', 'comics',
    'manga', 'coins', 'stamps', 'antiques', 'toys',
    'memorabilia', 'artwork'
  ];
  
  text = text.toLowerCase();
  return keywords.some(keyword => text.includes(keyword));
}

// Start periodic engagement
setInterval(engageWithChannelContent, 5 * 60 * 1000);