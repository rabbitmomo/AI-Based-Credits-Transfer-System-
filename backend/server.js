const path = require('path');
const dotenv = require('dotenv');
const ENV_PATH = path.resolve(__dirname, '../.env');
dotenv.config({ path: ENV_PATH });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const computeMunkres = require('munkres-js');
const { supabase, supabaseAdmin } = require("./supabaseClient");

const app = express();
app.use(cors());
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

function getBatchEmbeddingValues(embedResponse, expectedCount) {
  let embeddingVectors = [];

  if (Array.isArray(embedResponse?.embeddings)) {
    embeddingVectors = embedResponse.embeddings.map((embeddingItem) => {
      if (Array.isArray(embeddingItem)) {
        return embeddingItem;
      }

      if (Array.isArray(embeddingItem?.values)) {
        return embeddingItem.values;
      }

      throw new Error('Unexpected batch embedding item shape from Gemini');
    });
  } else if (embedResponse?.embedding?.values) {
    embeddingVectors = [embedResponse.embedding.values];
  }

  if (!Array.isArray(embeddingVectors) || embeddingVectors.length !== expectedCount) {
    throw new Error('Batch embedding count does not match topic count');
  }

  return embeddingVectors;
}

function normalizeTopicWithSubtopics(topicItem) {
  if (typeof topicItem === 'string') {
    return topicItem.trim();
  }

  if (!topicItem || typeof topicItem !== 'object') {
    return '';
  }

  const baseTopic = String(
    topicItem.topic || topicItem.name || topicItem.title || topicItem.big_topic || '',
  ).trim();

  const subtopicsSource =
    topicItem.subtopics || topicItem.sub_topics || topicItem.subTopics || topicItem.details || [];
  const subtopics = Array.isArray(subtopicsSource)
    ? subtopicsSource.map((subtopic) => String(subtopic || '').trim()).filter(Boolean)
    : [String(subtopicsSource || '').trim()].filter(Boolean);

  if (!baseTopic && !subtopics.length) {
    return '';
  }

  if (!subtopics.length) {
    return baseTopic;
  }

  return `${baseTopic}: ${subtopics.join(', ')}`;
}

function extractJsonTextFromResponse(responseText) {
  let jsonText = responseText;

  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
  } else {
    const genericCodeBlockMatch = responseText.match(/```\s*([\s\S]*?)\s*```/);
    if (genericCodeBlockMatch) {
      jsonText = genericCodeBlockMatch[1];
    }
  }

  return jsonText;
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

    if (!supabaseAdmin) {
      return res.status(500).json({
        error: 'Missing VITE_SUPABASE_SERVICE_ROLE_KEY in backend environment variables',
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

app.post('/api/similarity-synopsis', async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    const synopsisA = req.body?.synopsis_A ?? req.body?.synopsisA;
    const synopsisB = req.body?.synopsis_B ?? req.body?.synopsisB;
    const thresholdInput = req.body?.threshold;
    const threshold =
      typeof thresholdInput === 'number' ? thresholdInput : Number(thresholdInput ?? 0.8);
    const apiKey = process.env.GEMINI_API_KEY;

    if (!synopsisA || typeof synopsisA !== 'string') {
      return res.status(400).json({
        error: 'Please provide synopsis_A as a string in req.body.synopsis_A',
      });
    }

    if (!synopsisB || typeof synopsisB !== 'string') {
      return res.status(400).json({
        error: 'Please provide synopsis_B as a string in req.body.synopsis_B',
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
    const processedSynopsisA = preprocessText(synopsisA);
    const processedSynopsisB = preprocessText(synopsisB);

    const [embedA, embedB] = await Promise.all([
      ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: processedSynopsisA,
      }),
      ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: processedSynopsisB,
      }),
    ]);

    const vectorA = getEmbeddingValues(embedA);
    const vectorB = getEmbeddingValues(embedB);
    const cosineScore = cosineSimilarity(vectorA, vectorB);

    return res.json({
      synopsis_A: synopsisA,
      synopsis_B: synopsisB,
      model: 'gemini-embedding-001',
      metric: 'cosine_similarity',
      score: Number(cosineScore.toFixed(4)),
      threshold,
      similar: cosineScore >= threshold,
    });
  } catch (error) {
    console.error('Gemini synopsis similarity error:', error);
    return res.status(500).json({
      error: 'Failed to compare synopses with embeddings',
      details: error.message,
    });
  }
});

app.post('/api/similarity-topic-matching', async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    const apiKey = process.env.GEMINI_API_KEY;
    const courseA = req.body?.courseA;
    const courseB = req.body?.courseB;
    const threshold = 0.8;

    if (!courseA || typeof courseA !== 'object') {
      return res.status(400).json({
        error: 'Please provide courseA as a JSON object in req.body.courseA',
      });
    }

    if (!courseB || typeof courseB !== 'object') {
      return res.status(400).json({
        error: 'Please provide courseB as a JSON object in req.body.courseB',
      });
    }

    if (!Array.isArray(courseA.topics)) {
      return res.status(400).json({
        error: 'courseA.topics must be an array',
      });
    }

    if (!Array.isArray(courseB.topics)) {
      return res.status(400).json({
        error: 'courseB.topics must be an array',
      });
    }

    const normalizedTopicsA = courseA.topics
      .map((topic) => String(topic || '').trim())
      .filter(Boolean);
    const normalizedTopicsB = courseB.topics
      .map((topic) => String(topic || '').trim())
      .filter(Boolean);

    if (!normalizedTopicsA.length) {
      return res.status(400).json({
        error: 'courseA.topics must not be empty',
      });
    }

    if (!normalizedTopicsB.length) {
      return res.status(400).json({
        error: 'courseB.topics must not be empty',
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: 'Missing GEMINI_API_KEY in backend environment variables',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        error: 'Missing VITE_SUPABASE_SERVICE_ROLE_KEY in backend environment variables',
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Step 1: Batch-embed topics for each course (exactly two embedding calls).
    const [embeddedTopicsAResponse, embeddedTopicsBResponse] = await Promise.all([
      ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: normalizedTopicsA,
      }),
      ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: normalizedTopicsB,
      }),
    ]);

    const topicVectorsA = getBatchEmbeddingValues(embeddedTopicsAResponse, normalizedTopicsA.length);
    const topicVectorsB = getBatchEmbeddingValues(embeddedTopicsBResponse, normalizedTopicsB.length);

    // Step 2: Build the full pairwise similarity matrix between course topics.
    const similarityMatrixRaw = topicVectorsA.map((vectorA) =>
      topicVectorsB.map((vectorB) => cosineSimilarity(vectorA, vectorB)),
    );
    const similarityMatrix = similarityMatrixRaw.map((row) =>
      row.map((score) => Number(score.toFixed(4))),
    );

    // Step 3: Convert similarity matrix to cost matrix so Hungarian maximizes similarity.
    const costMatrix = similarityMatrixRaw.map((row) => row.map((score) => 1 - score));

    // Step 4: Get optimal one-to-one topic assignment using Hungarian algorithm.
    const assignments = computeMunkres(costMatrix);

    // Step 5: Build assignment results with threshold-based matched status.
    const topicMatches = assignments
      .filter(([rowIndex, colIndex]) =>
        rowIndex >= 0 &&
        rowIndex < normalizedTopicsA.length &&
        colIndex >= 0 &&
        colIndex < normalizedTopicsB.length,
      )
      .map(([rowIndex, colIndex]) => {
        const similarityScore = Number(similarityMatrixRaw[rowIndex][colIndex].toFixed(4));
        const isMatched = similarityScore >= threshold;

        const matchRecord = {
          courseA_topic: normalizedTopicsA[rowIndex],
          courseB_topic: normalizedTopicsB[colIndex],
          similarity: similarityScore,
          matched: isMatched,
          status: isMatched ? 'Matched' : 'Not Matched',
        };

        if (!isMatched) {
          matchRecord.reason = 'Similarity below threshold (0.80)';
        }

        return {
          ...matchRecord,
          _rowIndex: rowIndex,
          _colIndex: colIndex,
        };
      });

    const matchedRowIndexes = new Set(
      topicMatches.filter((item) => item.matched).map((item) => item._rowIndex),
    );
    const matchedColIndexes = new Set(
      topicMatches.filter((item) => item.matched).map((item) => item._colIndex),
    );

    const unmatchedCourseATopics = normalizedTopicsA.filter((_, index) => !matchedRowIndexes.has(index));
    const unmatchedCourseBTopics = normalizedTopicsB.filter((_, index) => !matchedColIndexes.has(index));

    const topicMatchesWithoutInternalIndexes = topicMatches.map(({ _rowIndex, _colIndex, ...item }) => item);
    const matchedTopicsCount = topicMatchesWithoutInternalIndexes.filter((item) => item.matched).length;
    const percentageDenominator = Math.max(normalizedTopicsA.length, normalizedTopicsB.length);
    const matchingPercentage = Number(((matchedTopicsCount / percentageDenominator) * 100).toFixed(2));

    return res.json({
      courseA_code: courseA.course_code || 'N/A',
      courseB_code: courseB.course_code || 'N/A',
      threshold: Number(threshold.toFixed(2)),
      similarity_matrix: similarityMatrix,
      topic_matches: topicMatchesWithoutInternalIndexes,
      matched_topics: matchedTopicsCount,
      unmatched_courseA_topics: unmatchedCourseATopics,
      unmatched_courseB_topics: unmatchedCourseBTopics,
      matching_percentage: matchingPercentage,
    });
  } catch (error) {
    console.error('Topic matching similarity error:', error);
    return res.status(500).json({
      error: 'Failed to perform topic matching with embeddings',
      details: error.message,
    });
  }
});

app.post('/api/rewrite-course-topics-synopsis', async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    const apiKey = process.env.GEMINI_API_KEY;
    const coursePayload = req.body?.course || req.body?.courseA || req.body || {};
    const rawTopics = coursePayload.topics ?? req.body?.topics;
    const rawSynopsis = coursePayload.synopsis ?? req.body?.synopsis;
    const courseCode = coursePayload.course_code || req.body?.course_code || 'N/A';

    if (!Array.isArray(rawTopics)) {
      return res.status(400).json({
        error: 'topics must be provided as an array',
      });
    }

    if (!rawTopics.length) {
      return res.status(400).json({
        error: 'topics must not be empty',
      });
    }

    if (typeof rawSynopsis !== 'string' || !rawSynopsis.trim()) {
      return res.status(400).json({
        error: 'synopsis must be provided as a non-empty string',
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: 'Missing GEMINI_API_KEY in backend environment variables',
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Step 1: Merge each topic with its subtopics before sending it to Gemini.
    const normalizedTopics = rawTopics.map(normalizeTopicWithSubtopics).filter(Boolean);

    if (!normalizedTopics.length) {
      return res.status(400).json({
        error: 'topics must contain at least one valid topic after normalization',
      });
    }

    // Step 2: Ask Gemini to rewrite each topic as one sentence and the synopsis as a body paragraph.
    const rewritePrompt = `You are an academic course content rewriter.

Rewrite the input into clean, publication-ready academic text.

Rules:
1. Rewrite each topic as exactly one sentence.
2. Keep the meaning of the topic and its subtopics.
3. If a topic already contains subtopics, keep them inside the rewritten sentence.
4. Rewrite the synopsis as a single coherent body paragraph.
5. Preserve the original language of the input.
6. Do not add new facts.
7. Do not remove important topic meaning.
8. Return only valid JSON.
9. Do not include markdown, bullets, labels, or explanations.

Output schema:
{
  "topics": [""],
  "synopsis": ""
}

Input data:
${JSON.stringify(
  {
    course_code: courseCode,
    topics: normalizedTopics,
    synopsis: rawSynopsis.trim(),
  },
  null,
  2,
)}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: rewritePrompt,
            },
          ],
        },
      ],
    });

    const responseText = (response.text || '').trim();
    const jsonText = extractJsonTextFromResponse(responseText);

    let rewrittenData;
    try {
      rewrittenData = JSON.parse(jsonText);
    } catch (parseError) {
      return res.status(500).json({
        error: 'Failed to parse Gemini rewrite response as JSON',
        details: parseError.message,
        rawResponse: responseText,
      });
    }

    const rewrittenTopics = Array.isArray(rewrittenData.topics)
      ? rewrittenData.topics.map((topic) => String(topic || '').trim()).filter(Boolean)
      : [];
    const rewrittenSynopsis = String(rewrittenData.synopsis || '').trim();

    if (!rewrittenTopics.length) {
      return res.status(500).json({
        error: 'Gemini did not return any rewritten topics',
        rawResponse: responseText,
      });
    }

    if (!rewrittenSynopsis) {
      return res.status(500).json({
        error: 'Gemini did not return a rewritten synopsis',
        rawResponse: responseText,
      });
    }

    return res.status(200).json({
      course_code: courseCode,
      topics: rewrittenTopics,
      synopsis: rewrittenSynopsis,
    });
  } catch (error) {
    console.error('Course topic and synopsis rewrite error:', error);
    return res.status(500).json({
      error: 'Failed to rewrite course topics and synopsis',
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

app.post('/api/similarity-embedding-structured', async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    const apiKey = process.env.GEMINI_API_KEY;
    const courseA = req.body?.courseA;
    const courseB = req.body?.courseB;

    if (!courseA || typeof courseA !== 'object') {
      return res.status(400).json({
        error: 'Please provide courseA as a JSON object in req.body.courseA',
      });
    }

    if (!courseB || typeof courseB !== 'object') {
      return res.status(400).json({
        error: 'Please provide courseB as a JSON object in req.body.courseB',
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: 'Missing GEMINI_API_KEY in backend environment variables',
      });
    }

    const isEmpty = (field) => {
      if (field === null || field === undefined) return true;
      if (Array.isArray(field)) return field.length === 0;
      if (typeof field === 'string') return field.trim() === '';
      return false;
    };

    const normalizeValue = (value) => {
      if (Array.isArray(value)) {
        return value
          .map((item) => String(item).trim())
          .filter(Boolean)
          .join(' ');
      }

      if (value === null || value === undefined) {
        return '';
      }

      return String(value).trim();
    };

    const hasLO = !isEmpty(courseA.learning_outcomes) && !isEmpty(courseB.learning_outcomes);
    const hasTopics = !isEmpty(courseA.topics) && !isEmpty(courseB.topics);
    const hasSynopsis = !isEmpty(courseA.synopsis) && !isEmpty(courseB.synopsis);
    const hasAssessments = !isEmpty(courseA.assessments) && !isEmpty(courseB.assessments);

    const baseWeights = {
      learning_outcomes: 45,
      synopsis: 35,
      topics: 15,
      assessments: 5,
    };

    const availableFields = [];
    let totalWeight = 0;

    if (hasLO) {
      availableFields.push('learning_outcomes');
      totalWeight += baseWeights.learning_outcomes;
    }
    if (hasTopics) {
      availableFields.push('topics');
      totalWeight += baseWeights.topics;
    }
    if (hasSynopsis) {
      availableFields.push('synopsis');
      totalWeight += baseWeights.synopsis;
    }
    if (hasAssessments) {
      availableFields.push('assessments');
      totalWeight += baseWeights.assessments;
    }

    const redistributedWeights = {};
    availableFields.forEach((field) => {
      redistributedWeights[field] = Number(((baseWeights[field] / totalWeight) * 100).toFixed(2));
    });

    const comparisonDataA = {};
    const comparisonDataB = {};

    const fieldTextMapA = {};
    const fieldTextMapB = {};

    if (hasLO) {
      comparisonDataA.learning_outcomes = courseA.learning_outcomes;
      comparisonDataB.learning_outcomes = courseB.learning_outcomes;
      fieldTextMapA.learning_outcomes = normalizeValue(courseA.learning_outcomes);
      fieldTextMapB.learning_outcomes = normalizeValue(courseB.learning_outcomes);
    }
    if (hasTopics) {
      comparisonDataA.topics = courseA.topics;
      comparisonDataB.topics = courseB.topics;
      fieldTextMapA.topics = normalizeValue(courseA.topics);
      fieldTextMapB.topics = normalizeValue(courseB.topics);
    }
    if (hasSynopsis) {
      comparisonDataA.synopsis = courseA.synopsis;
      comparisonDataB.synopsis = courseB.synopsis;
      fieldTextMapA.synopsis = normalizeValue(courseA.synopsis);
      fieldTextMapB.synopsis = normalizeValue(courseB.synopsis);
    }
    if (hasAssessments) {
      comparisonDataA.assessments = courseA.assessments;
      comparisonDataB.assessments = courseB.assessments;
      fieldTextMapA.assessments = normalizeValue(courseA.assessments);
      fieldTextMapB.assessments = normalizeValue(courseB.assessments);
    }

    const ai = new GoogleGenAI({ apiKey });

    const fieldScores = {};
    for (const field of availableFields) {
      const [embedA, embedB] = await Promise.all([
        ai.models.embedContent({
          model: 'gemini-embedding-001',
          contents: fieldTextMapA[field],
        }),
        ai.models.embedContent({
          model: 'gemini-embedding-001',
          contents: fieldTextMapB[field],
        }),
      ]);

      fieldScores[field] = Number(
        cosineSimilarity(getEmbeddingValues(embedA), getEmbeddingValues(embedB)).toFixed(4),
      );
    }

    const finalScore = availableFields.reduce(
      (sum, field) => sum + fieldScores[field] * (redistributedWeights[field] / 100),
      0,
    );

    const completenessRatio = availableFields.length / 4;
    const criticalFieldBonus = (hasLO ? 0.25 : 0) + (hasTopics ? 0.15 : 0);
    const confidence = Math.min(
      1,
      Number((0.35 + completenessRatio * 0.4 + criticalFieldBonus * 0.5).toFixed(2)),
    );

    let decision = 'Not Equivalent';
    if (finalScore >= 0.8) {
      decision = 'Equivalent';
    } else if (finalScore >= 0.6) {
      decision = 'Partially Equivalent';
    }

    return res.json({
      courseA_code: courseA.course_code || 'N/A',
      courseB_code: courseB.course_code || 'N/A',
      fields_available: availableFields,
      redistributed_weights: redistributedWeights,
      evaluation: {
        scores: {
          learning_outcomes: hasLO ? fieldScores.learning_outcomes ?? null : null,
          synopsis: hasSynopsis ? fieldScores.synopsis ?? null : null,
          assessments: hasAssessments ? fieldScores.assessments ?? null : null,
          topics: hasTopics ? fieldScores.topics ?? null : null,
        },
        final_score: Number(finalScore.toFixed(3)),
        confidence,
        decision,
        fields_compared: availableFields,
      },
    });
  } catch (error) {
    console.error('Course equivalence evaluation error:', error);
    return res.status(500).json({
      error: 'Failed to evaluate course equivalence',
      details: error.message,
    });
  }
});

app.post('/api/pdf-ocr-structured', upload.single('file'), async (req, res) => {
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
    
    const extractionPrompt = `You are an academic course information extraction system.

Your task is to extract structured information from a university course outline PDF.

Return ONLY valid JSON. No explanations. No markdown. No extra text.

OUTPUT SCHEMA (must follow exactly):
{
  "course_code": "",
  "course_name": "",
  "credits": 0,
  "synopsis": "",
  "learning_outcomes": [],
  "topics": [],
  "assessments": [],
  "academic_level": "",
  "language_detected": ""
}

EXTRACTION RULES:

1. Do NOT summarize or rewrite content.
   - Keep wording as close to original as possible.

2. LANGUAGE HANDLING - CRITICAL:
   - Detect the ORIGINAL language of the PDF document.
   - If text is bilingual (Malay/English), extract ONLY the Malay version.
   - Remove all English translations and equivalents.
   - Keep only Bahasa Melayu content.
   - If learning outcomes are listed as "Malay English", extract only the Malay part.
   - Example: "Menerang konsep Explain the concept" → extract only "Menerang konsep"
   - If document is ONLY in English, TRANSLATE all content to Bahasa Melayu.
   - Keep academic terms accurate when translating.
   - Set language_detected to track translation:
     * If Bahasa Melayu original: "Bahasa Melayu"
     * If Bilingual (Malay/English): "Bahasa Melayu (Bilingual - English removed)"
     * If English translated: "English (translated to Bahasa Melayu)"

3. Learning Outcomes:
   - Extract CLO / HPK / Learning Outcomes / Hasil Pembelajaran.
   - Include all listed outcomes.

4. Topics:
   - Extract ONLY if explicitly written in the document.
   - Do NOT infer or generate missing topics.

5. Assessments:
   - Extract assessment components and weights if available.
   - Example: Laporan, Ujian, Pembentangan, Tugasan.

6. Synopsis:
   - Extract course description section only.

7. Ignore:
   - references
   - bibliography
   - senate approval notes
   - administrative text
   - page numbers
   - formatting artifacts

8. If a field is missing:
   - return empty string "" or empty array []
   - DO NOT guess or infer

9. Preserve academic meaning and structure.

IMPORTANT:
This output will be used for AI-based credit transfer evaluation.
Accuracy is critical.
OUTPUT MUST ALWAYS BE IN BAHASA MELAYU.
language_detected must indicate original language and any translation that occurred.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: extractionPrompt,
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

    const responseText = (response.text || '').trim();

    // Extract JSON from response (handle cases where model wraps response in markdown)
    let jsonText = responseText;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else if (responseText.match(/```\s*([\s\S]*?)\s*```/)) {
      jsonText = responseText.match(/```\s*([\s\S]*?)\s*```/)[1];
    }

    let structuredData;
    try {
      structuredData = JSON.parse(jsonText);
    } catch (parseError) {
      return res.status(500).json({
        error: 'Failed to parse extracted data as JSON',
        details: parseError.message,
        rawResponse: responseText,
      });
    }

    return res.json({
      filename: file.originalname,
      mimeType: file.mimetype,
      data: structuredData,
    });
  } catch (error) {
    console.error('Gemini PDF structured extraction error:', error);
    return res.status(500).json({
      error: 'Failed to extract structured data from PDF',
      details: error.message,
    });
  }
});

app.post('/api/pdf-ocr-structured-save', upload.any(), async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    const apiKey = process.env.GEMINI_API_KEY;
    const file = req.files?.find((uploadedFile) => uploadedFile?.mimetype === 'application/pdf');

    if (!file) {
      return res.status(400).json({
        error: "Please upload a PDF file in form-data using any field name",
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

    const extractionPrompt = `You are an academic course information extraction system.

Your task is to extract structured information from a university course outline PDF.

Return ONLY valid JSON. No explanations. No markdown. No extra text.

OUTPUT SCHEMA (must follow exactly):
{
  "course_code": "",
  "course_name": "",
  "credits": 0,
  "synopsis": "",
  "learning_outcomes": [],
  "topics": [],
  "assessments": [],
  "academic_level": "",
  "language_detected": ""
}

EXTRACTION RULES:

1. Do NOT summarize or rewrite content.
   - Keep wording as close to original as possible.

2. LANGUAGE HANDLING - CRITICAL:
   - Detect the ORIGINAL language of the PDF document.
   - If text is bilingual (Malay/English), extract ONLY the Malay version.
   - Remove all English translations and equivalents.
   - Keep only Bahasa Melayu content.
   - If learning outcomes are listed as "Malay English", extract only the Malay part.
   - Example: "Menerang konsep Explain the concept" → extract only "Menerang konsep"
   - If document is ONLY in English, TRANSLATE all content to Bahasa Melayu.
   - Keep academic terms accurate when translating.
   - Set language_detected to track translation:
     * If Bahasa Melayu original: "Bahasa Melayu"
     * If Bilingual (Malay/English): "Bahasa Melayu (Bilingual - English removed)"
     * If English translated: "English (translated to Bahasa Melayu)"

3. Learning Outcomes:
   - Extract CLO / HPK / Learning Outcomes / Hasil Pembelajaran.
   - Include all listed outcomes.

4. Topics:
   - Extract ONLY if explicitly written in the document.
   - Do NOT infer or generate missing topics.

5. Assessments:
   - Extract assessment components and weights if available.
   - Example: Laporan, Ujian, Pembentangan, Tugasan.

6. Synopsis:
   - Extract course description section only.

7. Ignore:
   - references
   - bibliography
   - senate approval notes
   - administrative text
   - page numbers
   - formatting artifacts

8. If a field is missing:
   - return empty string "" or empty array []
   - DO NOT guess or infer

9. Preserve academic meaning and structure.

IMPORTANT:
This output will be used for AI-based credit transfer evaluation.
Accuracy is critical.
OUTPUT MUST ALWAYS BE IN BAHASA MELAYU.
language_detected must indicate original language and any translation that occurred.`;

//1
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: extractionPrompt,
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

    const responseText = (response.text || '').trim();

    let jsonText = responseText;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else if (responseText.match(/```\s*([\s\S]*?)\s*```/)) {
      jsonText = responseText.match(/```\s*([\s\S]*?)\s*```/)[1];
    }

    let structuredData;
    try {
      structuredData = JSON.parse(jsonText);
    } catch (parseError) {
      return res.status(500).json({
        error: 'Failed to parse extracted data as JSON',
        details: parseError.message,
        rawResponse: responseText,
      });
    }

    const courseCode = String(structuredData.course_code || '').trim();
    const courseName = String(structuredData.course_name || '').trim();

    if (!courseCode || !courseName) {
      return res.status(400).json({
        error: 'Extracted data must include course_code and course_name before saving',
        data: structuredData,
      });
    }

    const normalizeText = (value) =>
      String(value || '')
        .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const { data: existingCourses, error: existingError } = await supabase
      .from('courses')
      .select('id, course_code, course_name')
      .or(`course_code.eq.${courseCode},course_name.eq.${courseName}`);

    if (existingError) {
      return res.status(400).json({
        error: existingError.message,
      });
    }

    const normalizedCourseCode = normalizeText(courseCode);
    const normalizedCourseName = normalizeText(courseName);

    const similarCourse = (existingCourses || []).find((course) => {
      const existingCode = normalizeText(course.course_code);
      const existingName = normalizeText(course.course_name);
      return (
        existingCode === normalizedCourseCode ||
        existingName === normalizedCourseName ||
        existingName.includes(normalizedCourseName) ||
        normalizedCourseName.includes(existingName)
      );
    });

    if (similarCourse) {
      return res.status(409).json({
        error: 'A similar course already exists. Saving was blocked to avoid duplicates.',
        existing_course: similarCourse,
      });
    }

    const courseRecord = {
      course_code: courseCode,
      course_name: courseName,
      synopsis: structuredData.synopsis || null,
      learning_outcomes: Array.isArray(structuredData.learning_outcomes)
        ? structuredData.learning_outcomes
        : [],
      topics: Array.isArray(structuredData.topics) ? structuredData.topics : [],
      assessments: Array.isArray(structuredData.assessments) ? structuredData.assessments : [],
      credits: Number.isFinite(Number(structuredData.credits)) ? Number(structuredData.credits) : 0,
      academic_level: structuredData.academic_level || null,
      language_detected: structuredData.language_detected || null,
      source_filename: file.originalname,
      source_mime_type: file.mimetype,
    };

    const { data: insertedCourse, error: insertError } = await supabase
      .from('courses')
      .insert([courseRecord])
      .select('*')
      .single();

    if (insertError) {
      return res.status(400).json({
        error: insertError.message,
      });
    }

    return res.status(201).json({
      message: 'Course extracted and saved successfully',
      data: insertedCourse,
      extracted: structuredData,
    });
  } catch (error) {
    console.error('Gemini PDF structured save error:', error);
    return res.status(500).json({
      error: 'Failed to extract and save structured data from PDF',
      details: error.message,
    });
  }
});

app.post('/api/pdf-diploma-structured-save', upload.single('file'), async (req, res) => {
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

    const extractionPrompt = `You are an academic diploma course extraction system.

Your task is to extract only the fields needed for saving into a diploma table.

Return ONLY valid JSON. No explanations. No markdown. No extra text.

OUTPUT SCHEMA (must follow exactly):
{
  "course_code": "",
  "course_name": "",
  "total_credit": 0,
  "synopsis": "",
  "topics": [],
  "topic_sentences": []
}

EXTRACTION RULES:

1. Do NOT summarize or invent facts.
   - Keep wording as close to the source as possible.

2. Topics:
   - Extract the main topic headings from the PDF.
   - If a topic has subtopics, append the subtopics to the same topic as one combined topic string.
   - Convert each combined topic into one clear sentence.
   - Keep one sentence for one big topic.
   - Do not create duplicate topics.

3. Topic Sentences:
   - Rewrite each extracted topic into one academic sentence.
   - Each topic must have one matching sentence in topic_sentences.
   - topic_sentences must be the same length as topics.

4. Synopsis:
   - Extract only the course synopsis or course description section.
   - Keep it as one clean paragraph.

5. Course Code / Course Name / Total Credit:
   - Extract these if present in the document.
   - total_credit must be an integer.

6. Language handling:
   - Preserve the original language of the PDF.
   - If bilingual text is present, keep the course content clean and consistent.

7. If a field is missing:
   - return empty string "" or empty array []
   - return 0 for total_credit only if no credit value is found

IMPORTANT:
This output will be saved directly to the diploma_table database table.
Accuracy and valid JSON are required.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: extractionPrompt,
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

    const responseText = (response.text || '').trim();
    const jsonText = extractJsonTextFromResponse(responseText);

    let structuredData;
    try {
      structuredData = JSON.parse(jsonText);
    } catch (parseError) {
      return res.status(500).json({
        error: 'Failed to parse extracted diploma data as JSON',
        details: parseError.message,
        rawResponse: responseText,
      });
    }

    const courseCode = String(structuredData.course_code || '').trim();
    const courseName = String(structuredData.course_name || '').trim();
    const synopsis = String(structuredData.synopsis || '').trim();

    const topics = Array.isArray(structuredData.topics)
      ? structuredData.topics.map((topic) => String(topic || '').trim()).filter(Boolean)
      : [];

    let topicSentences = Array.isArray(structuredData.topic_sentences)
      ? structuredData.topic_sentences.map((sentence) => String(sentence || '').trim()).filter(Boolean)
      : [];

    if (!topicSentences.length && topics.length) {
      topicSentences = topics.map((topic) => (topic.endsWith('.') ? topic : `${topic}.`));
    }

    const totalCreditInput = structuredData.total_credit ?? structuredData.credits;
    const totalCredit = Number.parseInt(totalCreditInput, 10);

    if (!courseCode || !courseName) {
      return res.status(400).json({
        error: 'Extracted data must include course_code and course_name before saving',
        data: structuredData,
      });
    }

    if (!Number.isInteger(totalCredit) || totalCredit < 0) {
      return res.status(400).json({
        error: 'Extracted data must include a valid total_credit value before saving',
        data: structuredData,
      });
    }

    if (topics.length !== topicSentences.length) {
      return res.status(400).json({
        error: 'topics and topic_sentences must have the same number of items',
        data: structuredData,
      });
    }

    const diplomaRecord = {
      course_code: courseCode,
      course_name: courseName,
      total_credit: totalCredit,
      synopsis: synopsis || null,
      topics,
      topic_sentences: topicSentences,
    };

    const diplomaSupabase = supabaseAdmin;

    const { data: insertedDiploma, error: insertError } = await diplomaSupabase
      .from('diploma_table')
      .insert([diplomaRecord])
      .select('*')
      .single();

    if (insertError) {
      return res.status(400).json({
        error: insertError.message,
      });
    }

    return res.status(201).json({
      message: 'Diploma course extracted and saved successfully',
      data: insertedDiploma,
      extracted: structuredData,
    });
  } catch (error) {
    console.error('Gemini diploma structured save error:', error);
    return res.status(500).json({
      error: 'Failed to extract and save diploma structured data from PDF',
      details: error.message,
    });
  }
});

app.post('/api/diploma-by-code', async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    const courseCodeInput = req.body?.course_code || req.body?.code || req.body?.courseCode;

    if (!courseCodeInput || typeof courseCodeInput !== 'string') {
      return res.status(400).json({
        error: 'Please provide course_code as a string in req.body.course_code',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        error: 'Missing VITE_SUPABASE_SERVICE_ROLE_KEY in backend environment variables',
      });
    }

    const normalizeCourseCode = (value) =>
      String(value || '')
        .toUpperCase()
        .replace(/\s+/g, '')
        .trim();

    const requestedCourseCode = normalizeCourseCode(courseCodeInput);

    const { data: diplomaRows, error: selectError } = await supabaseAdmin
      .from('diploma_table')
      .select('*');

    if (selectError) {
      return res.status(400).json({
        error: selectError.message,
      });
    }

    const matchingRow = (diplomaRows || []).find(
      (row) => normalizeCourseCode(row.course_code) === requestedCourseCode,
    );

    if (!matchingRow) {
      return res.status(404).json({
        error: 'No diploma record found for the provided course code',
      });
    }

    return res.status(200).json({
      message: 'Diploma record fetched successfully',
      data: matchingRow,
    });
  } catch (error) {
    console.error('Diploma lookup by code error:', error);
    return res.status(500).json({
      error: 'Failed to fetch diploma record by course code',
      details: error.message,
    });
  }
});

app.post('/api/degree-by-code', async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    const courseCodeInput = req.body?.course_code || req.body?.code || req.body?.courseCode;

    if (!courseCodeInput || typeof courseCodeInput !== 'string') {
      return res.status(400).json({
        error: 'Please provide course_code as a string in req.body.course_code',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        error: 'Missing VITE_SUPABASE_SERVICE_ROLE_KEY in backend environment variables',
      });
    }

    const normalizeCourseCode = (value) =>
      String(value || '')
        .toUpperCase()
        .replace(/\s+/g, '')
        .trim();

    const requestedCourseCode = normalizeCourseCode(courseCodeInput);

    const { data: degreeRows, error: selectError } = await supabaseAdmin
      .from('degree_table4')
      .select('*');

    if (selectError) {
      return res.status(400).json({
        error: selectError.message,
      });
    }

    const matchingRow = (degreeRows || []).find(
      (row) => normalizeCourseCode(row.course_code) === requestedCourseCode,
    );

    if (!matchingRow) {
      return res.status(404).json({
        error: 'No degree record found for the provided course code',
      });
    }

    return res.status(200).json({
      message: 'Degree record fetched successfully',
      data: matchingRow,
    });
  } catch (error) {
    console.error('Degree lookup by code error:', error);
    return res.status(500).json({
      error: 'Failed to fetch degree record by course code',
      details: error.message,
    });
  }
});

app.get("/api/courses/selection", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("courses")
      .select("course_code, course_name, credits")
      .order("course_code", { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const courseOptions = (data || []).map((c) => ({
      course_code: c.course_code,
      course_name: c.course_name,
      credits: c.credits,
    }));

    const creditsOptions = Array.from(
      new Set((data || []).map((c) => c.credits).filter((v) => v !== null && v !== undefined)),
    ).sort((a, b) => (Number(a) > Number(b) ? 1 : -1));

    const defaultPayload = {
      courseA: {
        course_code: "",
        course_name: "",
        learning_outcomes: [],
        topics: [],
        synopsis: "",
        assessments: [],
      },
      courseB: {
        course_code: "",
        course_name: "",
        learning_outcomes: [],
        topics: [],
        synopsis: "",
        assessments: [],
      },
      credits_requested: null,
      message:
        "Saya memohon pengiktirafan kredit untuk kursus ini. Sila lampirkan dokumen sokongan dan tekan Hantar.",
    };

    return res.status(200).json({
      message: "Course selection fetched successfully",
      count: data.length,
      courseOptions,
      creditsOptions,
      defaultPayload,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
});


app.get("/api/courses", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    return res.status(200).json({
      message: "Courses fetched successfully",
      count: data.length,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
