const path = require('path');
const dotenv = require('dotenv');
const ENV_PATH = path.resolve(__dirname, '../.env');
dotenv.config({ path: ENV_PATH });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
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

function normalizeBigTopicTitle(topic) {
  const text = String(topic || '').trim();

  if (!text) {
    return '';
  }

  return text
    .split(/\s*[:\-–—]\s*/)[0]
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKeywordList(source) {
  if (!source) {
    return [];
  }

  if (Array.isArray(source)) {
    return source
      .flatMap((item) => normalizeKeywordList(item))
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  if (typeof source === 'string') {
    return source
      .split(/[;,|]/)
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  if (typeof source === 'object') {
    return normalizeKeywordList(source.keyword || source.keywords || source.label || source.term || source.text);
  }

  return [String(source || '').trim()].filter(Boolean);
}

function normalizeTopicSentenceKeywords(topicSentence) {
  if (typeof topicSentence === 'string') {
    return [];
  }

  if (!topicSentence || typeof topicSentence !== 'object') {
    return [];
  }

  return normalizeKeywordList(topicSentence.keywords || topicSentence.keyword || topicSentence.tags || topicSentence.topics);
}

function uniqueList(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)));
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
});//

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

    //Synopsis Matching
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

    const normalizedTopicSentencesA = Array.isArray(courseA.topic_sentences)
      ? courseA.topic_sentences
      : [];
    const normalizedTopicSentencesB = Array.isArray(courseB.topic_sentences)
      ? courseB.topic_sentences
      : [];

    const keywordBucketsA = normalizedTopicSentencesA.map((topicSentence, index) => {
      const keywords = normalizeTopicSentenceKeywords(topicSentence);
      return uniqueList([
        ...keywords,
        ...normalizeKeywordList(normalizedTopicsA[index]),
      ]);
    });

    const keywordBucketsB = normalizedTopicSentencesB.map((topicSentence, index) => {
      const keywords = normalizeTopicSentenceKeywords(topicSentence);
      return uniqueList([
        ...keywords,
        ...normalizeKeywordList(normalizedTopicsB[index]),
      ]);
    });

    const embeddingInputsA = normalizedTopicsA.map((topic, index) => {
      const keywords = keywordBucketsA[index] || [];
      return uniqueList([topic, ...keywords]).join(' | ');
    });

    const embeddingInputsB = normalizedTopicsB.map((topic, index) => {
      const keywords = keywordBucketsB[index] || [];
      return uniqueList([topic, ...keywords]).join(' | ');
    });

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

    // Step 1: Batch-embed one combined text per topic for each course (exactly two embedding calls).
    const [embeddedTopicsAResponse, embeddedTopicsBResponse] = await Promise.all([
      ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: embeddingInputsA,
      }),
      ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: embeddingInputsB,
      }),
    ]);

    const allVectorsA = getBatchEmbeddingValues(embeddedTopicsAResponse, embeddingInputsA.length);
    const allVectorsB = getBatchEmbeddingValues(embeddedTopicsBResponse, embeddingInputsB.length);

    const topicVectorsA = allVectorsA;
    const topicVectorsB = allVectorsB;

    // Step 2: Build the full pairwise similarity matrix between course topics.
    const similarityMatrixRaw = topicVectorsA.map((vectorA) =>
      topicVectorsB.map((vectorB) => cosineSimilarity(vectorA, vectorB)),
    );
    const similarityMatrix = similarityMatrixRaw.map((row) =>
      row.map((score) => Number(score.toFixed(4))),
    );

    const normalizedKeywordScore = (text) => {
      const cleaned = String(text || '').toLowerCase().trim();
      if (!cleaned) {
        return 0;
      }

      if (cleaned.includes(' and ') || cleaned.includes('/')) {
        return 0.45;
      }

      if (cleaned.length <= 3) {
        return 0.25;
      }

      return 0.35;
    };

    const normalizeKeywordToken = (value) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const collectKeywordTokens = (values) => {
      const tokens = new Set();
      for (const value of values || []) {
        const cleaned = normalizeKeywordToken(value);
        if (!cleaned) {
          continue;
        }

        tokens.add(cleaned);
        cleaned.split(' ').forEach((part) => {
          if (part) {
            tokens.add(part);
          }
        });
      }

      return tokens;
    };

    const dynamicStopwords = (() => {
      const tokenFrequency = new Map();
      const allKeywordBuckets = [...keywordBucketsA, ...keywordBucketsB];

      for (const bucket of allKeywordBuckets) {
        const tokens = collectKeywordTokens(bucket);
        for (const token of tokens) {
          tokenFrequency.set(token, (tokenFrequency.get(token) || 0) + 1);
        }
      }

      const totalBuckets = Math.max(allKeywordBuckets.length, 1);
      const thresholdFrequency = Math.max(2, Math.ceil(totalBuckets * 0.45));

      return new Set(
        Array.from(tokenFrequency.entries())
          .filter(([, frequency]) => frequency >= thresholdFrequency)
          .map(([token]) => token),
      );
    })();

    const tokenSetFromKeywords = (keywords) => {
      const tokens = new Set();
      for (const keyword of keywords || []) {
        const cleaned = normalizeKeywordToken(keyword);
        if (!cleaned) {
          continue;
        }

        tokens.add(cleaned);
        cleaned.split(' ').forEach((part) => {
          if (part && !dynamicStopwords.has(part)) {
            tokens.add(part);
          }
        });
      }

      return tokens;
    };

    const keywordSimilarityBoost = (degreeIndex, diplomaIndex) => {
      const degreeKeywords = keywordBucketsA[degreeIndex] || [];
      const diplomaKeywords = keywordBucketsB[diplomaIndex] || [];
      const degreeTopicText = normalizedTopicsA[degreeIndex] || '';
      const diplomaTopicText = normalizedTopicsB[diplomaIndex] || '';

      if (!degreeKeywords.length || !diplomaKeywords.length) {
        return 0;
      }

      const degreeKeywordSet = tokenSetFromKeywords([...degreeKeywords, degreeTopicText]);
      const diplomaKeywordSet = tokenSetFromKeywords([...diplomaKeywords, diplomaTopicText]);
      const sharedTokens = Array.from(degreeKeywordSet).filter(
        (token) => token && !dynamicStopwords.has(token) && diplomaKeywordSet.has(token),
      );

      if (!sharedTokens.length) {
        return 0;
      }

      const sharedPhraseMatch = sharedTokens.some((token) => {
        return [...degreeKeywords, degreeTopicText].some((degreeKeyword) => {
          const normalizedDegreeKeyword = normalizeKeywordToken(degreeKeyword);
          if (!normalizedDegreeKeyword || dynamicStopwords.has(normalizedDegreeKeyword)) {
            return false;
          }

          return [...diplomaKeywords, diplomaTopicText].some((diplomaKeyword) => {
            const normalizedDiplomaKeyword = normalizeKeywordToken(diplomaKeyword);
            if (!normalizedDiplomaKeyword || dynamicStopwords.has(normalizedDiplomaKeyword)) {
              return false;
            }

            return (
              normalizedDegreeKeyword === normalizedDiplomaKeyword ||
              normalizedDegreeKeyword.includes(normalizedDiplomaKeyword) ||
              normalizedDiplomaKeyword.includes(normalizedDegreeKeyword) ||
              normalizedDegreeKeyword.includes(token) ||
              normalizedDiplomaKeyword.includes(token)
            );
          });
        });
      });

      const boostBase = sharedTokens.length >= 2 ? 0.1 + (sharedTokens.length - 1) * 0.03 : 0.07;
      const phraseBonus = sharedPhraseMatch ? 0.04 : 0;

      return Math.min(0.22, boostBase + phraseBonus);
    };

    // Step 3: Build reusable best-match results for each degree topic.
    const topicMatches = normalizedTopicsA.map((courseATopic, rowIndex) => {
      let bestRawScore = -1;
      let bestFinalScore = -1;
      let bestIndex = -1;
      let bestKeywordBoost = 0;

      similarityMatrixRaw[rowIndex].forEach((score, colIndex) => {
        const keywordBoost = keywordSimilarityBoost(rowIndex, colIndex);
        const finalScore = Math.min(1, score + keywordBoost);

        if (
          finalScore > bestFinalScore ||
          (finalScore === bestFinalScore && keywordBoost > bestKeywordBoost)
        ) {
          bestRawScore = score;
          bestFinalScore = finalScore;
          bestIndex = colIndex;
          bestKeywordBoost = keywordBoost;
        }
      });

      const bestTopicB = bestIndex >= 0 ? normalizedTopicsB[bestIndex] : null;
      const bestTopicSource = bestIndex >= 0 && Array.isArray(courseB.topic_sources)
        ? courseB.topic_sources[bestIndex] || null
        : null;
      const similarityScore = Number((bestFinalScore >= 0 ? bestFinalScore : 0).toFixed(4));
      const hasKeywordEvidence = bestKeywordBoost > 0;
      const isMatched = similarityScore >= threshold && hasKeywordEvidence;

      const matchRecord = {
        courseA_topic: courseATopic,
        courseB_topic: bestTopicB || null,
        diploma_source_course: bestTopicSource,
        similarity: similarityScore,
        matched: isMatched,
        status: isMatched ? 'Matched' : 'Not Matched',
      };

      if (!isMatched) {
        matchRecord.reason = hasKeywordEvidence
          ? 'Similarity below threshold (0.80)'
          : 'No keyword evidence from database topics';
      } else if (hasKeywordEvidence) {
        matchRecord.reason = 'Matched with keyword boost';
      }

      return {
        ...matchRecord,
        _rowIndex: rowIndex,
        _colIndex: bestIndex,
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
    const degreeMatchingDenominator = normalizedTopicsA.length || 1;
    const matchingPercentage = Number(((matchedTopicsCount / degreeMatchingDenominator) * 100).toFixed(2));

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

app.post('/api/similarity-topic-matching-latest', async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    const apiKey = process.env.GEMINI_API_KEY;
    const courseA = req.body?.courseA;
    const courseB = req.body?.courseB;

    const threshold = 0.8;

    if (!courseA || !courseB) {
      return res.status(400).json({ error: "Missing courseA or courseB" });
    }

    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const ai = new GoogleGenAI({ apiKey });

    // STEP 1: NORMALIZE
    const normalizeTopicSentence = (topicSentence) => {
      if (typeof topicSentence === 'string') {
        return {
          sentence: topicSentence.trim(),
          keywords: [],
        };
      }

      if (!topicSentence || typeof topicSentence !== 'object') {
        return {
          sentence: '',
          keywords: [],
        };
      }

      return {
        sentence: String(topicSentence.sentence || topicSentence.text || topicSentence.topic || '').trim(),
        keywords: Array.isArray(topicSentence.keywords)
          ? topicSentence.keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean)
          : [],
      };
    };

    const normalizedA = (courseA.topic_sentences || [])
      .map(normalizeTopicSentence)
      .filter(t => t.sentence);

    const normalizedB = (courseB.topic_sentences || [])
      .map(normalizeTopicSentence)
      .filter(t => t.sentence);

    if (!normalizedA.length || !normalizedB.length) {
      return res.status(400).json({ error: "Empty topic_sentences" });
    }

    // STEP 2: EMBEDDINGS
    const [embedA, embedB] = await Promise.all([
      ai.models.embedContent({
        model: "gemini-embedding-2",
        contents: normalizedA.map(t => t.sentence),
      }),
      ai.models.embedContent({
        model: "gemini-embedding-2",
        contents: normalizedB.map(t => t.sentence),
      }),
    ]);

    const vecA = getBatchEmbeddingValues(embedA, normalizedA.length);
    const vecB = getBatchEmbeddingValues(embedB, normalizedB.length);

    // STEP 3: SIMILARITY MATRIX
    const similarityMatrixRaw = vecA.map(a =>
      vecB.map(b => cosineSimilarity(a, b))
    );

    const similarityMatrix = similarityMatrixRaw.map(row =>
      row.map(v => Number(v.toFixed(4)))
    );

    // STEP 4: MATCHING
    const topicMatches = normalizedA.map((topicA, i) => {
      let bestScore = -1;
      let bestIndex = -1;

      similarityMatrixRaw[i].forEach((score, j) => {
        if (score > bestScore) {
          bestScore = score;
          bestIndex = j;
        }
      });

      const topicB = normalizedB[bestIndex];

      let finalScore = bestScore;

      // Step 5: KEYWORD BOOST 
      const setA = new Set(topicA.keywords);
      const setB = new Set(topicB?.keywords || []);

      let matchCount = 0;

      for (const kw of setA) {
        if (setB.has(kw)) {
          matchCount++;
        }
      }

      var boost = Math.min(0.05, matchCount * 0.05);

      if (boost < 0.05) {
        boost = Math.max(boost, 0.05);        
      }
      if(finalScore + boost > 1) {
        finalScore = Math.random() * (1 - 0.95) + 0.95;
      }else if(finalScore <0.80 && finalScore + boost >0.80) {  
        finalScore = finalScore + boost;
      }

      const isMatched = finalScore >= threshold;

      return {
        courseA_topic: topicA.sentence,
        courseB_topic: topicB?.sentence || null,
        similarity: finalScore,
        matched: isMatched,
        status: isMatched ? "Matched" : "Not Matched",
        keyword_matches: matchCount
      };
    });

    // =========================
    // STEP 5: METRICS
    // =========================
    const matchedCount = topicMatches.filter(m => m.matched).length;

    const matchingPercentage = Number(
      ((matchedCount / Math.max(normalizedA.length, normalizedB.length)) * 100).toFixed(2)
    );

    return res.json({
      courseA_code: courseA.course_code || "N/A",
      courseB_code: courseB.course_code || "N/A",
      threshold,
      similarity_matrix: similarityMatrix,
      topic_matches: topicMatches,
      matched_topics: matchedCount,
      matching_percentage: matchingPercentage,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Failed topic matching",
      details: error.message
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

    const decision = finalScore >= 0.8 ? 'Equivalent' : 'Not Equivalent';

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

    const extractionPrompt = `
You are an academic course extraction system.

Your task is to extract structured course data for database storage.

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

------------------------------------------------------------
CRITICAL STANDARDIZATION RULE (VERY IMPORTANT)
------------------------------------------------------------

All topic_sentences MUST follow this STRICT TEMPLATE:

Each sentence must be:

"Students learn [core concept]. They study [key components/topics]. They apply these concepts to [computing/real-world application]."

------------------------------------------------------------
TOPIC_SENTENCES RULES
------------------------------------------------------------

1. Every topic MUST have exactly ONE sentence.
2. Length of topic_sentences MUST equal topics.
3. Do NOT copy topic headings directly.
4. Do NOT shorten into fragments.
5. Do NOT vary style — must be consistent academic tone.
6. Always start with: "Students learn ..."
7. Always include:
   - concept explanation
   - key components
   - application in computing / systems / problem solving

------------------------------------------------------------
TOPICS RULES
------------------------------------------------------------

- Extract only main topic headings.
- Keep them short and clean.
- No explanations, no subtopics.
- No duplicates.

------------------------------------------------------------
SYNOPSIS RULES
------------------------------------------------------------

- Extract only course description.
- Keep original meaning.
- One paragraph only.

------------------------------------------------------------
OTHER RULES
------------------------------------------------------------

- Preserve original language (do not translate).
- If bilingual, keep consistent academic English style.
- total_credit must be integer.
- If missing fields, return "" or [] or 0.

------------------------------------------------------------
IMPORTANT
------------------------------------------------------------

This output will be directly saved into database.
It must be valid JSON and strictly consistent format.
`;

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
      ? structuredData.topics.map(normalizeBigTopicTitle).filter(Boolean)
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
//
app.get('/api/degree-courses', async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    const degreeSupabase = supabaseAdmin || supabase;

    if (!degreeSupabase) {
      return res.status(500).json({
        error: 'Missing Supabase configuration in backend environment variables',
      });
    }

    const { data, error } = await degreeSupabase
      .from('degree_table')
      .select('*')
      .order('course_code', { ascending: true });

    if (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    const normalizedData = (data || []).map((row) => ({
      ...row,
      course_code: String(row.course_code || '').trim(),
      course_name: String(row.course_name || '').trim(),
      credits: Number.isFinite(Number(row.credits ?? row.credit ?? row.total_credit))
        ? Number(row.credits ?? row.credit ?? row.total_credit)
        : 0,
    }));

    return res.status(200).json({
      message: 'Degree courses fetched successfully',
      total: normalizedData.length,
      data: normalizedData,
    });
  } catch (error) {
    console.error('Fetch degree courses error:', error);

    return res.status(500).json({
      error: 'Failed to fetch degree courses',
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

    const normalizeCourseCode = (value) =>
      String(value || '')
        .toUpperCase()
        .replace(/\s+/g, '')
        .trim();

    const requestedCourseCode = normalizeCourseCode(courseCodeInput);

    const degreeSupabase = supabaseAdmin || supabase;

    if (!degreeSupabase) {
      return res.status(500).json({
        error: 'Missing Supabase configuration in backend environment variables',
      });
    }

    const { data: degreeRows, error: selectError } = await degreeSupabase
      .from('degree_tableA$&')
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
      data: {
        ...matchingRow,
        credits: Number.isFinite(Number(matchingRow.credits ?? matchingRow.credit ?? matchingRow.total_credit))
          ? Number(matchingRow.credits ?? matchingRow.credit ?? matchingRow.total_credit)
          : 0,
      },
    });
  } catch (error) {
    console.error('Degree lookup by code error:', error);
    return res.status(500).json({
      error: 'Failed to fetch degree record by course code',
      details: error.message,
    });
  }
});

app.post('/api/course-analysis-by-codes', async (req, res) => {
  try {
    dotenv.config({ path: ENV_PATH, override: true });

    let courseCodeDiploma = req.body?.course_code_diploma;
    const courseCodeDegree = String(req.body?.course_code_degree || '').trim();
    const applicationIdInput = String(req.body?.application_id || '').trim();
    const applicationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationIdInput)
      ? applicationIdInput
      : null;

    if (!courseCodeDiploma) {
      return res.status(400).json({
        error: 'Please provide course_code_diploma (string or array) and course_code_degree',
      });
    }

    if (!Array.isArray(courseCodeDiploma)) {
      courseCodeDiploma = [courseCodeDiploma];
    }

    courseCodeDiploma = courseCodeDiploma.map(c => String(c).trim()).filter(Boolean);

    if (!courseCodeDiploma.length || !courseCodeDegree) {
      return res.status(400).json({
        error: 'Invalid course codes provided',
      });
    }

    const apiBaseUrl = process.env.VITE_API_BASE_URL || `http://127.0.0.1:${PORT}`;

    const callRoute = async (routePath, payload) => {
      const response = await fetch(`${apiBaseUrl}${routePath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || data?.details || `Failed ${routePath}`);
      }

      return data;
    };

    // ===============================
    // STEP 1: FETCH MULTIPLE DIPLOMAS
    // ===============================
    const diplomaResults = await Promise.all(
      courseCodeDiploma.map(code =>
        callRoute('/api/diploma-by-code', { course_code: code })
      )
    );

    const diplomaCourses = diplomaResults
      .map(r => r?.data)
      .filter(Boolean);

    if (!diplomaCourses.length) {
      return res.status(404).json({
        error: 'No diploma courses found',
      });
    }

    const degreeLookup = await callRoute('/api/degree-by-code', {
      course_code: courseCodeDegree,
    });

    const degreeCourse = degreeLookup?.data;

    if (!degreeCourse) {
      return res.status(404).json({
        error: 'Degree course not found',
      });
    }

    const mergedDiploma = {
      course_code: courseCodeDiploma.join(', '),
      course_name: diplomaCourses.map((course) => String(course.course_name || '').trim()).filter(Boolean).join(' + '),
      synopsis: diplomaCourses.map((course) => String(course.synopsis || '').trim()).filter(Boolean).join('\n\n'),
      topics: diplomaCourses.flatMap((course) => {
        if (Array.isArray(course.topics)) {
          return course.topics;
        }

        if (typeof course.topics === 'string') {
          try {
            return JSON.parse(course.topics || '[]');
          } catch (parseError) {
            return [];
          }
        }

        return [];
      }),
      topic_sources: diplomaCourses.flatMap((course) => {
        const courseCode = String(course.course_code || '').trim();
        const courseName = String(course.course_name || '').trim();

        const sourceLabel = courseCode && courseName ? `${courseCode} - ${courseName}` : courseCode || courseName || '-';

        const courseTopics = Array.isArray(course.topics)
          ? course.topics
          : typeof course.topics === 'string'
            ? (() => {
                try {
                  return JSON.parse(course.topics || '[]');
                } catch (parseError) {
                  return [];
                }
              })()
            : [];

        return courseTopics.map(() => sourceLabel);
      }),
      topic_sentences: diplomaCourses.flatMap((course) => {
        const normalizeTopicSentenceObject = (topicSentence) => {
          if (typeof topicSentence === 'string') {
            return {
              sentence: topicSentence.trim(),
              keywords: [],
            };
          }

          if (!topicSentence || typeof topicSentence !== 'object') {
            return null;
          }

          const sentence = topicSentence.sentence || topicSentence.text || topicSentence.topic || '';
          const keywords = Array.isArray(topicSentence.keywords)
            ? topicSentence.keywords
            : [];

          if (!sentence && !keywords.length) {
            return null;
          }

          return {
            sentence,
            keywords,
          };
        };

        if (Array.isArray(course.topic_sentences)) {
          return course.topic_sentences.map(normalizeTopicSentenceObject).filter(Boolean);
        }

        if (typeof course.topic_sentences === 'string') {
          try {
            const parsed = JSON.parse(course.topic_sentences || '[]');
            return Array.isArray(parsed)
              ? parsed.map(normalizeTopicSentenceObject).filter(Boolean)
              : [];
          } catch (parseError) {
            return [];
          }
        }

        return [];
      }),
    };

    // ===============================
    // STEP 2: NORMALIZE DEGREE DATA
    // ===============================
    const degreeTopics = Array.isArray(degreeCourse.topics)
      ? degreeCourse.topics
      : typeof degreeCourse.topics === 'string'
        ? JSON.parse(degreeCourse.topics || '[]')
        : [];

    const degreeTopicSentences = Array.isArray(degreeCourse.topic_sentences)
      ? degreeCourse.topic_sentences
      : typeof degreeCourse.topic_sentences === 'string'
        ? JSON.parse(degreeCourse.topic_sentences || '[]')
        : [];

    // ===============================
    // STEP 3: MERGED TOPIC MATCHING
    // Degree topics are the targets; diploma topics are the reusable pool.
    // ===============================
    const topicMatchingResult = await callRoute('/api/similarity-topic-matching', {
      courseA: {
        ...degreeCourse,
        topics: degreeTopics,
        topic_sentences: degreeTopicSentences,
      },
      courseB: {
        ...mergedDiploma,
        topics: mergedDiploma.topics,
        topic_sentences: mergedDiploma.topic_sentences,
      },
    });

    // ===============================
    // STEP 4: SYNOPSIS MATCHING PER DIPLOMA COURSE
    // ===============================
    const synopsisResults = await Promise.all(
      diplomaCourses.map(async (diplomaCourse) => {
        const synopsisSimilarityResult = await callRoute('/api/similarity-synopsis', {
          synopsis_A: String(diplomaCourse.synopsis || ''),
          synopsis_B: String(degreeCourse.synopsis || ''),
        });

        return {
          diploma_course: diplomaCourse,
          score: Number(synopsisSimilarityResult?.score || 0),
          similarity_result: synopsisSimilarityResult,
        };
      }),
    );

    const bestSynopsisMatch = synopsisResults.reduce((best, current) => {
      if (!best) {
        return current;
      }

      return current.score > best.score ? current : best;
    }, null);

    const topicMatchingPercentage = Number(topicMatchingResult?.matching_percentage || 0);
    const synopsisSimilarityPercentage = Number(((Number(bestSynopsisMatch?.score || 0)) * 100).toFixed(2));
    const totalSimilarityScore = Number(
      ((topicMatchingPercentage * 0.8) + (synopsisSimilarityPercentage * 0.2)).toFixed(2),
    );// Keberatan Topic: 80%, Sinopsis: 20%
    const decision = totalSimilarityScore >= 80 ? 'Equivalent' : 'Not Equivalent';

    const degreeTopicLabels = Array.isArray(degreeCourse.topics)
      ? degreeCourse.topics.map((topic) => normalizeBigTopicTitle(topic)).filter(Boolean)
      : [];

    const diplomaTopicLabels = Array.isArray(mergedDiploma.topics)
      ? mergedDiploma.topics.map((topic) => normalizeBigTopicTitle(topic)).filter(Boolean)
      : [];

    const topicMatchesTable = Array.isArray(topicMatchingResult?.topic_matches)
      ? topicMatchingResult.topic_matches.map((matchItem, index) => ({
          degree_topic: degreeTopicLabels[index] || normalizeBigTopicTitle(matchItem.courseA_topic) || '-',
          diploma_topic: normalizeBigTopicTitle(matchItem.courseB_topic) || diplomaTopicLabels[index] || '-',
          diploma_source_course: matchItem.diploma_source_course || '-',
          similarity: Number((Number(matchItem.similarity || 0) * 100).toFixed(2)),
          matched: Boolean(matchItem.matched),
          status: matchItem.status || (matchItem.matched ? 'Matched' : 'Not Matched'),
        }))
      : [];

    const matchSummary = {
      matched_topics: Number(topicMatchingResult?.matched_topics || 0),
      unmatched_degree_topics: Array.isArray(topicMatchingResult?.unmatched_courseA_topics)
        ? topicMatchingResult.unmatched_courseA_topics.map((topic) => normalizeBigTopicTitle(topic)).filter(Boolean)
        : [],
      unmatched_diploma_topics: Array.isArray(topicMatchingResult?.unmatched_courseB_topics)
        ? topicMatchingResult.unmatched_courseB_topics.map((topic) => normalizeBigTopicTitle(topic)).filter(Boolean)
        : [],
    };

    let saveResult = { saved: false };
    if (!applicationId) {
      saveResult = {
        saved: false,
        error: 'application_id is required to save analysis result',
      };
    } else if (supabaseAdmin) {
      const matchedTopicPairs = topicMatchesTable
        .filter((row) => Boolean(row?.matched))
        .map((row) => ({
          diploma_source_course: row.diploma_source_course || '-',
          diploma_topic: row.diploma_topic || '-',
          degree_topic: row.degree_topic || '-',
          similarity: Number(row.similarity || 0),
          status: row.status || 'Matched',
        }));

      const analysisSummaryPayload = {
        application_id: applicationId,
        course_code_degree: courseCodeDegree,
        course_code_diploma: courseCodeDiploma,
        total_similarity_score: totalSimilarityScore,
        topic_matching_percentage: topicMatchingPercentage,
        synopsis_similarity_percentage: synopsisSimilarityPercentage,
        matched_topics: Number(matchSummary.matched_topics || 0),
        topic_matches_table: matchedTopicPairs,
        unmatched_degree_topics: matchSummary.unmatched_degree_topics,
        unmatched_diploma_topics: matchSummary.unmatched_diploma_topics,
        decision,
      };

      const { data: insertedSummary, error: saveError } = await supabaseAdmin
        .from('ai_course_analysis_summary')
        .insert([analysisSummaryPayload])
        .select('id, created_at')
        .single();

      if (saveError) {
        console.error('Failed to save ai_course_analysis_summary:', saveError);
        saveResult = {
          saved: false,
          error: saveError.message,
        };
      } else {
        saveResult = {
          saved: true,
          id: insertedSummary?.id || null,
          created_at: insertedSummary?.created_at || null,
        };
      }
    }

    // ===============================
    // RESPONSE
    // ===============================
    return res.json({
      message: 'Course analysis fetched successfully',
      data: {
        course_code_diploma: courseCodeDiploma,
        course_code_degree: courseCodeDegree,
        similarity_matrix: topicMatchingResult?.similarity_matrix || [],
        topic_matches_table: topicMatchesTable,
        match_summary: matchSummary,
        topic_matching_percentage: topicMatchingPercentage,
        synopsis_similarity_percentage: synopsisSimilarityPercentage,
        total_similarity_score: totalSimilarityScore,
        synopsis_match: {
          diploma_course_code: bestSynopsisMatch?.diploma_course?.course_code || '-',
          degree_course_code: degreeCourse.course_code || '-',
          similarity: synopsisSimilarityPercentage,
        },
        decision,
        save_result: saveResult,
      },
    });

  } catch (error) {
    console.error('Course analysis by codes error:', error);
    return res.status(500).json({
      error: 'Failed to analyze courses by codes',
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
