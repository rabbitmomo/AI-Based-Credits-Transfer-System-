const path = require('path');
const dotenv = require('dotenv');
const ENV_PATH = path.resolve(__dirname, '../.env');
dotenv.config({ path: ENV_PATH });
const express = require('express');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function cosineSimilarity(vectorA, vectorB) {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
    throw new Error('Embedding vectors must be arrays');
  }

  if (!vectorA.length || !vectorB.length || vectorA.length !== vectorB.length) {
    throw new Error('Embedding vectors must be non-empty and same length');
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i += 1) {
    const a = Number(vectorA[i]);
    const b = Number(vectorB[i]);
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) {
    throw new Error('Embedding vectors must not be zero vectors');
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function preprocessText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getEmbeddingValues(embedResponse) {
  if (embedResponse?.embedding?.values) {
    return embedResponse.embedding.values;
  }

  if (Array.isArray(embedResponse?.embeddings) && embedResponse.embeddings[0]?.values) {
    return embedResponse.embeddings[0].values;
  }

  if (Array.isArray(embedResponse?.embeddings) && Array.isArray(embedResponse.embeddings[0])) {
    return embedResponse.embeddings[0];
  }

  throw new Error('Unexpected embedding response shape from Gemini');
}

const PORT = Number(process.env.PORT) || 3000;

app.post('/api/similarity-embedding', async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    const sentenceA = req.body?.sentenceA;
    const sentenceB = req.body?.sentenceB;
    const thresholdInput = req.body?.threshold;
    const threshold =
      typeof thresholdInput === 'number' ? thresholdInput : Number(thresholdInput ?? 0.8);
    const apiKey = process.env.GEMINI_API_KEY;

    if (!sentenceA || typeof sentenceA !== 'string') {
      return res.status(400).json({
        error: 'Please provide sentenceA as a string in req.body.sentenceA',
      });
    }

    if (!sentenceB || typeof sentenceB !== 'string') {
      return res.status(400).json({
        error: 'Please provide sentenceB as a string in req.body.sentenceB',
      });
    }

    if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
      return res.status(400).json({
        error: 'threshold must be a number between -1 and 1',
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: 'Missing GEMINI_API_KEY in backend environment variables',
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const processedSentenceA = preprocessText(sentenceA);
    const processedSentenceB = preprocessText(sentenceB);

    const [embedA, embedB] = await Promise.all([
      ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: processedSentenceA,
      }),
      ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: processedSentenceB,
      }),
    ]);

    const vectorA = getEmbeddingValues(embedA);
    const vectorB = getEmbeddingValues(embedB);
    const cosineScore = cosineSimilarity(vectorA, vectorB);

    return res.json({
      sentenceA,
      sentenceB,
      model: 'gemini-embedding-001',
      metric: 'cosine_similarity',
      score: cosineScore,
      threshold,
      similar: cosineScore >= threshold,
    });
  } catch (error) {
    console.error('Gemini embedding similarity error:', error);
    return res.status(500).json({
      error: 'Failed to compare sentences with embeddings',
      details: error.message,
    });
  }
});

app.post('/api/pdf-ocr', upload.single('file'), async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    const apiKey = process.env.GEMINI_API_KEY;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: "Please upload a PDF as form-data key 'file'",
      });
    }

    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({
        error: 'Only PDF files are supported for this route',
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: 'Missing GEMINI_API_KEY in backend environment variables',
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                'Perform strict OCR on this PDF and return only extracted text. Rules: 1) Do not summarize, paraphrase, translate, or correct grammar. 2) Preserve original wording and line breaks as much as possible. 3) Do not add any commentary, labels, markdown, or extra words.',
            },
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: file.buffer.toString('base64'),
              },
            },
          ],
        },
      ],
    });

    return res.json({
      filename: file.originalname,
      mimeType: file.mimetype,
      text: (response.text || '').trim(),
    });
  } catch (error) {
    console.error('Gemini PDF OCR error:', error);
    return res.status(500).json({
      error: 'Failed to OCR PDF',
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
