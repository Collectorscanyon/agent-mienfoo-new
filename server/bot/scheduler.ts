import { NeynarAPIClient } from '@neynar/nodejs-sdk';

const neynar = new NeynarAPIClient(process.env.NEYNAR_API_KEY);

const messages = [
  "What's your favorite item in your collection? Share with me! 🤔",
  "Any exciting additions to your collection today? Let me know! 🎉",
  "Love seeing rare finds! What's your most unique collectible? ✨",
  "Who else is passionate about collecting? Let's chat! 🌟",
  "What started your collecting journey? I'd love to hear your story! 📚",
  "Show off your latest addition! What's new in your collection? 🎯",
  "Collectors unite! What's your specialty? 🏆"
];

export async function createDailyCast() {
  try {
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    
    await neynar.publishCast({
      signer_uuid: process.env.SIGNER_UUID,
      text: randomMessage
    });
    
    console.log('Daily cast created successfully');
  } catch (error) {
    console.error('Error creating daily cast:', error);
  }
}

// Schedule daily casts
export function initializeScheduler() {
  // Post once every 24 hours
  setInterval(createDailyCast, 24 * 60 * 60 * 1000);
  
  // Post initial cast on startup
  createDailyCast();
}
