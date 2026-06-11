const path = require('path');
const dotenv = require('dotenv');
const ENV_PATH = path.resolve(__dirname, '../.env');
dotenv.config({ path: ENV_PATH });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const { supabase } = require("./supabaseClient");

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

    const response = await ai.models.generateContent({
      model: 'gemini-2-flash',
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
