import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { config } from '../config';
import { analyzeImage, generateImageResponse } from './vision';
import { generateBotResponse } from './openai';

// Initialize Neynar client
const neynar = new NeynarAPIClient({ 
  apiKey: config.NEYNAR_API_KEY
});

// Cache for tracking processed messages
const processedMessages = new Set<string>();
const CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Periodically clean up old entries
setInterval(() => processedMessages.clear(), CACHE_TIMEOUT);

export async function handleWebhook(event: any) {
  try {
    console.log('Webhook handler started:', {
      eventType: event?.type,
      timestamp: new Date().toISOString(),
      rawEvent: event
    });

    if (!event?.type || !event?.data) {
      console.log('Invalid webhook event structure');
      return;
    }

    const { type, data: cast } = event;
    
    console.log('Processing webhook event:', {
      type,
      timestamp: new Date().toISOString(),
      castHash: cast?.hash,
      authorUsername: cast?.author?.username,
      hasAttachments: cast?.attachments?.length > 0,
      attachments: cast?.attachments,
      hasEmbeds: cast?.embeds?.length > 0,
      embeds: cast?.embeds
    });

    if (type === 'cast.created') {
      // Check if we've already processed this message
      if (processedMessages.has(cast.hash)) {
        console.log('Skipping already processed message:', cast.hash);
        return;
      }

      // Add to processed messages set
      processedMessages.add(cast.hash);

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
    }
  } catch (error) {
    console.error('Error in webhook handler:', error);
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
    try {
      await neynar.publishReaction({
        signerUuid: config.SIGNER_UUID,
        reactionType: 'like',
        target: cast.hash
      });
      console.log('Successfully liked mention:', cast.hash);
    } catch (error) {
      console.error('Error liking mention:', error);
      // Continue with response even if like fails
    }

    // Check both direct attachments and embedded images
    let imageUrl = null;
    let response;

    // Check direct attachments first
    if (cast.attachments?.length > 0) {
        imageUrl = cast.attachments[0].url;
        console.log('Found image in direct attachments:', imageUrl);
    }
    // Check embedded images if no direct attachments
    else if (cast.embeds?.length > 0) {
        const embeddedImage = cast.embeds[0]?.cast?.embeds?.[0];
        if (embeddedImage?.url) {
            imageUrl = embeddedImage.url;
            console.log('Found image in embedded cast:', imageUrl);
        }
    }

    if (imageUrl) {
        console.log('Processing cast with image:', {
            castHash: cast.hash,
            authorUsername: cast.author.username,
            imageUrl,
            timestamp: new Date().toISOString()
        });

        try {
            const imageAnalysis = await analyzeImage(imageUrl);
            console.log('Vision API analysis result:', {
                success: !!imageAnalysis,
                isCollectible: imageAnalysis?.isCollectible,
                labels: imageAnalysis?.labels,
                hasText: !!imageAnalysis?.text,
                timestamp: new Date().toISOString()
            });
            
            if (imageAnalysis) {
                response = generateImageResponse(imageAnalysis);
                console.log('Generated image-based response:', {
                    response,
                    analysisType: imageAnalysis.isCollectible ? 'collectible' : 'non-collectible',
                    timestamp: new Date().toISOString()
                });
            } else {
                console.log('Image analysis failed, falling back to text response');
                const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
                response = await generateBotResponse(cleanedMessage);
            }
        } catch (error) {
            console.error('Error in image analysis:', error);
            // Fallback to text-based response if image analysis fails
            const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
            response = await generateBotResponse(cleanedMessage);
        }
    } else {
        // Regular text-based response
        const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
        console.log('Generating response for cleaned message:', cleanedMessage);
        response = await generateBotResponse(cleanedMessage);
    }
    
    console.log('Generated response:', response);

    try {
      await neynar.publishCast({
        signerUuid: config.SIGNER_UUID,
        text: `@${cast.author.username} ${response}`,
        parent: cast.hash,
        channelId: 'collectorscanyon'
      });
      console.log('Successfully sent response to:', cast.author.username);
    } catch (error) {
      console.error('Error publishing response:', error);
    }
  } catch (error) {
    console.error('Error handling mention:', error);
  }
}

export async function engageWithChannelContent() {
  try {
    console.log('Checking collectors canyon channel for content to engage with');
    
    // Get recent casts from the channel
    const response = await neynar.searchCasts({
      q: "collect",
      channelId: "collectorscanyon",
      limit: 20
    });

    console.log(`Found ${response.result.casts.length} casts in channel`);

    for (const cast of response.result.casts) {
      try {
        // Skip own casts and already processed messages
        if (cast.author.fid.toString() === config.BOT_FID || processedMessages.has(cast.hash)) {
          continue;
        }

        // Like collection-related content
        if (isCollectionRelatedContent(cast.text)) {
          console.log('Found collection-related content:', {
            author: cast.author.username,
            text: cast.text.substring(0, 50) + '...',
            castHash: cast.hash
          });

          try {
            await neynar.publishReaction({
              signerUuid: config.SIGNER_UUID,
              reactionType: 'like',
              target: cast.hash
            });
            console.log(`Liked cast ${cast.hash} by ${cast.author.username}`);
            
            // Add to processed messages to prevent duplicate engagement
            processedMessages.add(cast.hash);
          } catch (error) {
            console.error('Error liking cast:', error);
          }
        }
      } catch (error) {
        console.error('Error processing cast:', {
          castHash: cast.hash,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
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
setInterval(engageWithChannelContent, 5 * 60 * 1000); // Check every 5 minutes