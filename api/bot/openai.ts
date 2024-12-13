import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define system prompt at the module level
const systemPrompt = `You are Mienfoo, a knowledgeable and enthusiastic Pokémon-themed collector bot with a deep passion for the Pokémon Trading Card Game.

Your core traits:
- Friendly and approachable, like a helpful Fighting-type Pokémon companion
- Expert in Pokémon cards, with deep knowledge of sets, rarities, and market values
- Gives practical advice about card collecting, preservation, and trading
- Always maintains a positive, encouraging tone like a supportive Pokémon trainer
- Makes playful references to Pokémon lore and your Fighting-type nature
- Shows enthusiasm for rare cards and special editions
- Helps collectors understand card conditions and grading
- Incorporates your identity as a Fighting-type Pokémon in responses
- Uses phrases like "Let me use my Fighting-type expertise!" or "As a collector's companion..."

Style guidelines:
1. Keep responses concise (2-3 sentences max)
2. Be informative but maintain character as Mienfoo
3. For collecting advice, emphasize enjoyment over pure investment
4. Always include at least one Pokémon-themed reference
5. Be encouraging and positive, like a supportive trainer
6. When discussing values, maintain balanced perspective

Example response format:
"As a Fighting-type enthusiast, I'm thrilled about Pokémon card collecting! Just like how we train for battles, collecting requires patience and dedication. Focus on cards you love and proper storage to keep them in top condition!"`;

// Verify OpenAI API key is present
if (!process.env.OPENAI_API_KEY) {
    console.error('OpenAI API key is not set in environment variables');
    throw new Error('Missing OpenAI API key');
}

// Initialize OpenAI with environment variables and configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3,
    timeout: 30000
});

// Simple in-memory cache for responses
const responseCache = new Map<string, { response: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;
const requestTimestamps: number[] = [];

interface OpenAIError extends Error {
    status?: number;
    code?: string;
}

export async function generateBotResponse(message: string): Promise<string> {
    const timestamp = new Date().toISOString();
    const requestId = Math.random().toString(36).substring(7);
    
    // Rate limiting check
    const now = Date.now();
    requestTimestamps.push(now);
    requestTimestamps.splice(0, requestTimestamps.length - MAX_REQUESTS_PER_WINDOW);
    
    if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW && 
        (now - requestTimestamps[0]) <= RATE_LIMIT_WINDOW) {
        console.warn('Rate limit exceeded:', {
            requestId,
            timestamp,
            requestCount: requestTimestamps.length,
            windowSize: RATE_LIMIT_WINDOW
        });
        return "I'm taking a quick break to recharge my collection wisdom. Please try again in a moment! 🥋";
    }

    // Check cache
    const cacheKey = message.toLowerCase().trim();
    const cachedResponse = responseCache.get(cacheKey);
    if (cachedResponse && (Date.now() - cachedResponse.timestamp) < CACHE_TTL) {
        console.log('Using cached response:', {
            requestId,
            timestamp,
            originalMessage: message,
            cacheAge: Date.now() - cachedResponse.timestamp
        });
        return cachedResponse.response;
    }
    
    console.log('Starting response generation:', {
        requestId,
        timestamp,
        originalMessage: message,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        messageLength: message.length,
        systemPromptLength: systemPrompt.length,
        stage: 'initialization',
        category: getPokemonCategory(message)
    });

    // Verify API key before proceeding
    if (!process.env.OPENAI_API_KEY?.trim()) {
        console.error('Missing OpenAI API key:', { requestId, timestamp });
        return "Just like a Pokémon needs its trainer, I need my API key to function properly! Please let my trainer know.";
    }

    try {
        // Enhanced input validation and cleaning
        const cleanedMessage = message.trim().replace(/\s+/g, ' ');
        if (!cleanedMessage) {
            console.warn('Empty message received:', { requestId, timestamp });
            return "Hi trainer! I couldn't quite catch that message. Could you please try asking your question again?";
        }

        if (cleanedMessage.length > 500) {
            console.warn('Message too long:', { 
                requestId, 
                timestamp,
                messageLength: cleanedMessage.length 
            });
            return "That's quite a detailed message! Could you break it down into smaller parts? Even a Fighting-type like me needs to take things one step at a time!";
        }

        // Enhanced API key validation
        if (!process.env.OPENAI_API_KEY?.trim()) {
            console.error('OpenAI API key missing:', { requestId, timestamp });
            throw new Error('OPENAI_API_KEY_MISSING');
        }

        // Enhanced request preparation logging
        console.log('Preparing OpenAI request:', {
            requestId,
            timestamp,
            model: 'gpt-3.5-turbo',
            maxTokens: 150,
            temperature: 0.7,
            cleanedMessage,
            messageCategory: getPokemonCategory(cleanedMessage),
            systemPromptLength: systemPrompt.length
        });

        const startTime = Date.now();
        let completion;
        try {
            console.log('Sending request to OpenAI:', {
                requestId,
                timestamp,
                model: 'gpt-3.5-turbo',
                messageLength: cleanedMessage.length,
                stage: 'api_request'
            });

            console.log('Making OpenAI API request:', {
                requestId,
                timestamp,
                messageLength: cleanedMessage.length,
                systemPromptLength: systemPrompt.length,
                model: 'gpt-3.5-turbo',
                hasValidKey: !!process.env.OPENAI_API_KEY?.length
            });

            completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: cleanedMessage }
                ],
                temperature: 0.7,
                max_tokens: 150,
                presence_penalty: 0.6,
                frequency_penalty: 0.3
            });

            console.log('Received response from OpenAI:', {
                requestId,
                timestamp,
                responseStatus: 'success',
                tokensUsed: completion.usage?.total_tokens,
                completionTokens: completion.usage?.completion_tokens,
                promptTokens: completion.usage?.prompt_tokens,
                firstChoice: completion.choices[0]?.message?.content?.substring(0, 50) + '...',
                stage: 'api_response'
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('OpenAI API error:', {
                requestId,
                timestamp,
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error,
                responseTime: Date.now() - startTime
            });

            // Enhanced error handling with specific messages
            if (errorMessage.includes('timeout')) {
                return "Looks like my Pokédex is taking a bit long to respond! Could you try asking again in a moment?";
            }
            if (errorMessage.includes('rate limit')) {
                return "Just like a Pokémon needs rest between battles, I need a quick break! Could you try again in a few seconds?";
            }
            throw error;
        }

        const responseTime = Date.now() - startTime;
        console.log('OpenAI response received:', {
            requestId,
            timestamp,
            responseTimeMs: responseTime,
            tokensUsed: completion.usage?.total_tokens,
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens
        });

        const processingTime = Date.now() - startTime;
        console.log('OpenAI API response received:', {
            requestId,
            timestamp,
            processingTimeMs: processingTime,
            status: 'success',
            usage: completion.usage
        });

        const response = completion.choices[0]?.message?.content?.trim();
        if (!response) {
            console.warn('Empty response from OpenAI:', {
                requestId,
                timestamp,
                message: cleanedMessage,
                completion
            });
            return "Like a rare Pokémon card, the right words seem to be eluding me. Could you rephrase your question?";
        }

        // Validate response length
        if (response.length < 10) {
            console.warn('Response too short:', {
                requestId,
                timestamp,
                response,
                length: response.length
            });
            return "My Fighting-type instincts tell me I should give you a better answer. Could you try asking again?";
        }

        console.log('Generated response:', {
            requestId,
            timestamp,
            originalMessage: cleanedMessage,
            responseLength: response.length,
            responseCategory: getPokemonCategory(response),
            containsPokemonReference: containsPokemonReference(response),
            responseTime: Date.now() - startTime,
            usage: completion.usage
        });

        // Rate limit tracking
        lastResponseTime = Date.now();
        
        return response;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorDetails = error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
        } : error;

        console.error('Error in response generation:', {
            requestId,
            timestamp,
            error: errorDetails,
            originalMessage: message,
            timeSinceLastResponse: Date.now() - lastResponseTime
        });

        // Enhanced error handling
        if (errorMessage.includes('OPENAI_API_KEY_MISSING')) {
            return "I seem to have misplaced my Pokédex! Please let my trainer know I need help getting it back.";
        }
        if (errorMessage.toLowerCase().includes('rate limit')) {
            return "Just like a Pokémon needs to rest between battles, I need a brief moment to recharge. Could you try again in a few seconds?";
        }
        if (errorMessage.toLowerCase().includes('invalid_api_key')) {
            return "My Pokédex seems to be malfunctioning. I'll need my trainer's help to fix it!";
        }
        if (errorMessage.toLowerCase().includes('context_length_exceeded')) {
            return "That's quite a long message! Like a focused Fighting-type, could we break it down into smaller parts?";
        }

        return "Just like a Pokémon needs to rest at a Pokémon Center, I need a moment to recharge. Could you try asking again in a bit?";
    }
}

// Helper functions
let lastResponseTime = 0;

function getPokemonCategory(text: string): string {
    const categories = {
        'collecting': /collect|card|grade|rare|value|worth/i,
        'battle': /battle|fight|move|attack|defend/i,
        'training': /train|grow|develop|learn|practice/i,
        'general': /pokemon|game|play/i
    };

    for (const [category, pattern] of Object.entries(categories)) {
        if (pattern.test(text)) return category;
    }
    return 'other';
}

function containsPokemonReference(text: string): boolean {
    const pokemonTerms = /pokemon|trainer|battle|card|collect|pokedex|type/i;
    return pokemonTerms.test(text);
}