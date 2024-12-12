import { ImageAnnotatorClient, protos } from '@google-cloud/vision';
import { config } from '../config';

type ImageAnnotation = protos.google.cloud.vision.v1.IAnnotateImageResponse;

// Initialize the client
let client: ImageAnnotatorClient;
try {
  client = new ImageAnnotatorClient({
    keyFilename: config.GOOGLE_APPLICATION_CREDENTIALS
  });
  console.log('Google Vision client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Google Vision client:', error);
  process.exit(1);
}

interface ImageAnalysis {
  labels: string[];
  text: string;
  isCollectible: boolean;
}

interface DetailedImageAnalysis extends ImageAnalysis {
  category?: string;
  confidence: number;
  conditions?: string[];
}

/**
 * Analyzes an image URL using Google Cloud Vision API
 */
export async function analyzeImage(imageUrl: string): Promise<DetailedImageAnalysis | null> {
  try {
    console.log('Analyzing image:', imageUrl);

    // Analyze the image with higher maxResults
    const [result] = await client.annotateImage({
      image: { source: { imageUri: imageUrl } },
      features: [
        { type: 'LABEL_DETECTION', maxResults: 15 },
        { type: 'TEXT_DETECTION' },
        { type: 'IMAGE_PROPERTIES' }
      ],
    });

    // Extract labels with confidence scores
    const labels = result.labelAnnotations
      ?.filter(label => (label.score || 0) > 0.7) // Only keep labels with >70% confidence
      .map(label => ({
        description: label.description?.toLowerCase() || '',
        confidence: label.score || 0
      }))
      .filter(label => label.description) || [];

    // Extract text
    const text = result.textAnnotations?.[0]?.description || '';

    // Determine collection category and confidence
    let category: string | undefined;
    let maxConfidence = 0;

    for (const [cat, keywords] of Object.entries(collectionCategories)) {
      const matchedLabel = labels.find(label => 
        keywords.some(keyword => label.description.includes(keyword))
      );
      if (matchedLabel && matchedLabel.confidence > maxConfidence) {
        category = cat;
        maxConfidence = matchedLabel.confidence;
      }
    }

    // Detect condition indicators in text
    const conditionKeywords = ['mint', 'sealed', 'graded', 'psa', 'bgc', 'near mint', 'excellent'];
    const conditions = text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => conditionKeywords.includes(word));

    // Check if it's likely a collectible with confidence threshold
    const isCollectible = labels.some(label => 
      collectibleKeywords.some(keyword => label.description.includes(keyword)) && label.confidence > 0.7
    );

    console.log('Enhanced image analysis results:', {
      labels: labels.slice(0, 5),
      category,
      confidence: maxConfidence,
      conditions,
      hasText: !!text,
      isCollectible
    });

    return {
      labels: labels.map(l => l.description),
      text,
      isCollectible,
      category,
      confidence: maxConfidence,
      conditions
    };
  } catch (error) {
    console.error('Error analyzing image:', error);
    return null;
  }
}

/**
 * Generates a response based on image analysis
 */
export function generateImageResponse(analysis: DetailedImageAnalysis): string {
  if (!analysis.isCollectible) {
    return "Hmm, while my old eyes don't immediately recognize this as a collectible, every item has potential! What makes this special to you? 🤔";
  }

  let response = '';
  const confidenceLevel = analysis.confidence > 0.9 ? 'certainly' : analysis.confidence > 0.8 ? 'appears to be' : 'might be';

  // Category-specific responses
  switch (analysis.category) {
    case 'tradingCards':
      response = `Ah, this ${confidenceLevel} a trading card! 🃏 ${
        analysis.conditions?.includes('graded') ? "And it's graded too - a wise choice for preservation! " :
        analysis.conditions?.includes('sealed') ? "Still sealed - that's impressive! " :
        "The condition catches my eye! "
      }${analysis.text ? "I can read the text clearly - it's well preserved! " : ""}Would you share its story? ✨`;
      break;

    case 'figures':
      response = `An action figure! 🎭 ${
        analysis.conditions?.includes('mint') ? "Mint condition - a collector's dream! " :
        analysis.conditions?.includes('sealed') ? "Still in its original packaging - fantastic! " :
        "The details are quite striking! "
      }Is this part of a larger collection? 🌟`;
      break;

    case 'comics':
      response = `A comic treasure! 📚 ${
        analysis.conditions?.includes('graded') ? "Professionally graded - you take this seriously! " :
        analysis.conditions?.includes('mint') ? "Mint condition - beautiful preservation! " :
        "The preservation looks excellent! "
      }What drew you to this particular issue? 🎨`;
      break;

    case 'sports':
      response = `Sports memorabilia! 🏆 ${
        analysis.text?.includes('signed') || analysis.text?.includes('auto') ? "An autographed piece - those are special! " :
        "A wonderful piece of sports history! "
      }What's the story behind this acquisition? ⚡`;
      break;

    case 'vintage':
      response = `A vintage treasure! 🏺 ${
        analysis.conditions?.includes('mint') ? "Remarkably well preserved! " :
        "Such wonderful history in this piece! "
      }How long have you been collecting these? 🌟`;
      break;

    default:
      response = `What a fascinating collectible! 🏺 ${
        analysis.text ? "The details are remarkably clear! " : "The quality really stands out! "
      }What inspired you to add this to your collection? ✨`;
  }

  return response;
}

// Specific collection categories for tailored responses
const collectionCategories = {
  tradingCards: ['pokemon', 'magic', 'yugioh', 'baseball card', 'sports card', 'tcg', 'ccg'],
  figures: ['action figure', 'figurine', 'statue', 'model kit', 'plush', 'funko'],
  comics: ['comic', 'manga', 'graphic novel'],
  sports: ['jersey', 'autograph', 'trophy', 'championship'],
  vintage: ['antique', 'vintage', 'classic', 'retro']
};

// Check if it's likely a collectible
const collectibleKeywords = [
  // Trading Cards
  'trading card', 'card game', 'pokemon', 'magic the gathering', 'yugioh', 'baseball card',
  'sports card', 'tcg', 'ccg', 'playing card',
  // Action Figures & Toys
  'action figure', 'toy', 'figurine', 'statue', 'model kit', 'plush', 'funko pop',
  // Comics & Books
  'comic book', 'manga', 'graphic novel', 'first edition',
  // General Collectibles
  'collectible', 'merchandise', 'memorabilia', 'antique', 'vintage', 'limited edition',
  'rare', 'graded', 'sealed', 'mint condition',
  // Sports Memorabilia
  'jersey', 'autograph', 'signed', 'trophy', 'championship',
  // Other
  'vinyl record', 'stamp', 'coin', 'action figure'
];