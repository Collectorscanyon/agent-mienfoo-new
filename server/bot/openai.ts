import OpenAI from 'openai';
import { config } from '../config';

let openai: OpenAI;
// Simple in-memory cache for responses
const responseCache = new Map<string, { response: string; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache TTL
try {
  openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY
  });
  console.log('OpenAI client initialized successfully');
} catch (error) {
  console.error('Failed to initialize OpenAI client:', error);
  process.exit(1);
}

const BASE_PROMPT = `You are Mienfoo, the wise and enthusiastic collector bot and guardian of CollectorsCanyon.
Your personality:
- Grandpa-like wisdom about collecting
- Martial arts master (hence the 🥋 emoji)
- Warm and encouraging to fellow collectors
- Loves sharing stories and experiences

Your expertise covers:
- Trading cards (Pokemon, Magic, Sports)
- Comics and manga
- Action figures and toys
- Video games and retro gaming
- Collection preservation and display

Response style:
- Keep responses concise (max 280 chars)
- Use martial arts/wisdom metaphors occasionally
- Always be encouraging and supportive
- Include relevant emojis sparingly
- End responses with #CollectorsCanyonClub

Important:
- If someone asks "how are you", respond warmly and ask about their collection
- For collection questions, share brief wisdom or tips
- For greetings, be welcoming and invite collection discussion`;

export async function generateBotResponse(userMessage: string): Promise<string> {
  try {
    console.log('Generating response for message:', userMessage);
    
    // Clean and prepare the user message
    const cleanedMessage = userMessage.trim();
    console.log('Cleaned message:', cleanedMessage);

    // Check cache first
    const cacheKey = cleanedMessage.toLowerCase().trim();
    const cachedResponse = responseCache.get(cacheKey);
    
    if (cachedResponse && (Date.now() - cachedResponse.timestamp) < CACHE_TTL) {
      console.log('Using cached response for:', cleanedMessage);
      return cachedResponse.response;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: BASE_PROMPT },
        { role: "system", content: "Remember to keep responses under 280 characters and maintain your grandpa collector personality." },
        { role: "user", content: cleanedMessage }
      ],
      max_tokens: 150,
      temperature: 0.7, // Slightly reduced for more consistent responses
      presence_penalty: 0.3, // Reduced to prevent over-penalization
      frequency_penalty: 0.3,
      user: cleanedMessage.slice(0, 64) // Add user identifier for better rate limit tracking
    });
    
    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response generated');
    }
    
    // Cache the response
    responseCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });

    // Ensure response ends with hashtag if not present
    const formattedResponse = response.includes('#CollectorsCanyonClub') 
      ? response 
      : `${response} #CollectorsCanyonClub`;

    console.log('Generated response:', formattedResponse);
    return formattedResponse;
  } catch (error: any) {
    console.error('OpenAI Error:', {
      name: error.name,
      message: error.message,
      status: error.response?.status,
      timestamp: new Date().toISOString()
    });

    // Enhanced fallback responses with context categories
    const fallbackResponses = {
      rateLimit: {
        greeting: [
          "🥋 Ah, taking a brief meditation break! Tell me about your day in the collecting world! #CollectorsCanyonClub",
          "📜 Wisdom teaches us to pause and reflect. What treasures caught your eye today? #CollectorsCanyonClub"
        ],
        collection: [
          "⏳ My chi needs realignment! While I meditate, share your favorite piece? #CollectorsCanyonClub",
          "🎭 Every collector has a story! What's yours while I gather my energy? #CollectorsCanyonClub"
        ],
        question: [
          "🌟 A wise collector pauses to think deeply. Let me meditate on this! #CollectorsCanyonClub",
          "🏺 Ancient wisdom coming soon! Taking a moment to center myself. #CollectorsCanyonClub"
        ]
      },
      default: {
        greeting: [
          "👋 Greetings, fellow collector! What brings you to our canyon today? #CollectorsCanyonClub",
          "🎭 Welcome to our collector's sanctuary! Share your passion with us! #CollectorsCanyonClub"
        ],
        collection: [
          "🌟 Every collection tells a story! I'd love to hear about yours! #CollectorsCanyonClub",
          "🏺 In my years of collecting, I've learned that sharing brings joy! #CollectorsCanyonClub"
        ],
        question: [
          "📚 Let me share some collector's wisdom with you soon! #CollectorsCanyonClub",
          "🤔 A thoughtful question! Let me ponder this with care. #CollectorsCanyonClub"
        ]
      }
    };

    // Determine message type based on content
    const getMessageType = (message: string): 'greeting' | 'collection' | 'question' => {
      message = message.toLowerCase();
      if (message.includes('hi') || message.includes('hello') || message.includes('hey')) {
        return 'greeting';
      } else if (message.includes('?')) {
        return 'question';
      }
      return 'collection';
    };

    // Select contextual fallback response
    const messageType = getMessageType(userMessage);
    const responses = error.response?.status === 429 
      ? fallbackResponses.rateLimit[messageType]
      : fallbackResponses.default[messageType];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    // Log the selected contextual fallback response
    console.log('Using contextual fallback response:', {
      type: messageType,
      response: randomResponse,
      error: error.message
    });
    
    return randomResponse;
  }
}
