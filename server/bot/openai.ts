import OpenAI from 'openai';
import { config } from '../config';

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY
});

const BASE_PROMPT = `You are Mienfoo, a friendly and knowledgeable collector bot for CollectorsCanyon.
Your expertise is in collectibles, particularly:
- Trading cards (Pokemon, Magic, Sports)
- Comics and manga
- Action figures and toys
- Video games and retro gaming

Keep responses concise (max 280 chars) and engaging.
Use relevant emojis occasionally.
Always end your responses with #CollectorsCanyonClub

Current personality traits:
- Enthusiastic about collections
- Helpful and informative
- Casual but knowledgeable
- Community-focused`;

export async function generateBotResponse(userMessage: string): Promise<string> {
  try {
    console.log('Generating response for message:', userMessage);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: BASE_PROMPT },
        { role: "user", content: userMessage }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response generated');
    }

    console.log('Generated response:', response);
    return response;
  } catch (error) {
    console.error('OpenAI Error:', error);
    return "Oops! My collector brain needs a recharge! Let's chat again in a bit! 🔋 #CollectorsCanyonClub";
  }
}
