import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { config } from '../config';
import { generateBotResponse } from './openai';
import { analyzeImage, generateImageResponse } from './vision';

const neynar = new NeynarAPIClient({ 
  apiKey: config.NEYNAR_API_KEY
});

export async function handleWebhook(event: any) {
  try {
    console.log('Webhook handler started:', {
      eventType: event?.type,
      timestamp: new Date().toISOString(),
      rawEvent: event
    });

    if (!event || !event.type || !event.data) {
      console.error('Invalid webhook event structure:', event);
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
      console.log('Processing cast.created event:', {
        castHash: cast.hash,
        authorUsername: cast.author?.username,
        text: cast.text,
        hasEmbeds: cast.embeds?.length > 0,
        embeds: cast.embeds
      });

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
            console.log('Starting image analysis process:', {
                imageUrl,
                castHash: cast.hash,
                timestamp: new Date().toISOString()
            });
            
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
    
    // Get recent casts from the channel
    const response = await neynar.searchCasts({
      channelId: "collectorscanyon",
      limit: 20
    });

    if (!response?.casts || response.casts.length === 0) {
      console.log('No casts found in channel');
      return;
    }

    console.log(`Found ${response.casts.length} casts in the channel`);
    const casts = response.casts;
    
    for (const cast of casts) {
      try {
        // Skip own casts
        if (cast.author.fid.toString() === config.BOT_FID) {
          console.log('Skipping own cast');
          continue;
        }

        if (isCollectionRelatedContent(cast.text)) {
          const engagementLevel = getEngagementType(cast.text);
          console.log('Found collection-related content:', {
            author: cast.author.username,
            text: cast.text.substring(0, 50) + '...',
            castHash: cast.hash,
            engagementLevel
          });

          // Always like collection-related content
          await neynar.publishReaction({
            signerUuid: config.SIGNER_UUID,
            reactionType: 'like',
            target: cast.hash
          });
          console.log(`Liked cast ${cast.hash} by ${cast.author.username}`);

          // For high engagement content, recast as well
          if (engagementLevel === 'high') {
            // Generate an enthusiastic response based on content type
            let response;
            if (cast.text.toLowerCase().includes('rare')) {
              response = `A rare treasure indeed! @${cast.author.username}'s find reminds us that every collection has its gems! 🏺✨`;
            } else if (cast.text.toLowerCase().includes('grade')) {
              response = `Wonderful grade on this piece, @${cast.author.username}! Quality is the heart of collecting! 🥋`;
            } else {
              response = `Amazing share by @${cast.author.username}! This is what makes our collecting community special! ✨`;
            }

            // Share the enthusiasm
            await neynar.publishCast({
              signerUuid: config.SIGNER_UUID,
              text: response,
              parent: cast.hash,
              channelId: 'collectorscanyon'
            });
            console.log(`Engaged with high-value content from ${cast.author.username}`);
          }
          
          // Add a delay between actions to avoid rate limits
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
  const highPriorityKeywords = [
    'collect', 'rare', 'vintage', 'limited edition',
    'first edition', 'mint condition', 'graded', 'sealed',
    'treasure', 'showcase', 'collection', 'display'
  ];
  
  const collectionTypes = [
    'cards', 'trading cards', 'figures', 'comics',
    'manga', 'coins', 'stamps', 'antiques', 'toys',
    'memorabilia', 'artwork', 'plushies'
  ];
  
  text = text.toLowerCase();
  
  // Check for high-priority collection keywords
  const hasHighPriority = highPriorityKeywords.some(keyword => text.includes(keyword));
  
  // Check for collection type mentions
  const hasCollectionType = collectionTypes.some(type => text.includes(type));
  
  // Content should either have a high-priority keyword or combine a collection type with value-related terms
  const hasValueTerms = !!text.match(/rare|value|worth|price|grade|condition/);
  return hasHighPriority || (hasCollectionType && hasValueTerms);
}

function getEngagementType(text: string): 'high' | 'medium' | 'low' {
  const enthusiasm = text.match(/!+|\?+|amazing|incredible|wow|awesome/gi)?.length || 0;
  const hasPhotos = text.includes('url.xyz') || text.includes('img'); // Basic check for media
  const wordCount = text.split(/\s+/).length;
  
  if ((enthusiasm >= 2 && wordCount > 10) || hasPhotos) {
    return 'high';
  } else if (enthusiasm >= 1 || wordCount > 15) {
    return 'medium';
  }
  return 'low';
}

// Start periodic engagement
setInterval(engageWithChannelContent, 5 * 60 * 1000); // Check every 5 minutes