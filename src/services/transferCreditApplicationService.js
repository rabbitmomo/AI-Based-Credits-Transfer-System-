import { supabase } from '../lib/supabaseClient';

const DOCUMENT_BUCKET = 'credit-transfer-documents';

const toNullableText = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const sanitizeFileName = (value) => String(value || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_');

const buildStoragePath = ({ userId, applicationId, documentType, fileName }) => {
  const safeFileName = sanitizeFileName(fileName);
  return `${userId}/${applicationId}/${documentType}/${Date.now()}-${safeFileName}`;
};

const uploadSupportingDocument = async ({ userId, applicationId, documentType, file }) => {
  const storagePath = buildStoragePath({
    userId,
    applicationId,
    documentType,
    fileName: file.name,
  });

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      `Gagal memuat naik dokumen "${documentType}" ke Supabase Storage. Pastikan bucket "${DOCUMENT_BUCKET}" sudah wujud dan boleh diakses.`,
    );
  }

  const { data } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(storagePath);

  return {
    file_name: file.name,
    file_url: data.publicUrl,
    mime_type: file.type || null,
    file_size: file.size || null,
  };
};

const uploadCourseDocument = async ({ userId, applicationId, courseNo, documentSide, courseCode, file }) => {
  const storagePath = buildStoragePath({
    userId,
    applicationId,
    documentType: `course-${documentSide}-course-${courseNo}`,
    fileName: file.name,
  });

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      `Gagal memuat naik PDF kursus "${documentSide}" untuk kursus ${courseNo} ke Supabase Storage. Pastikan bucket "${DOCUMENT_BUCKET}" sudah wujud dan boleh diakses.`,
    );
  }

  const { data } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(storagePath);

  return {
    application_id: applicationId,
    course_no: courseNo,
    document_side: documentSide,
    course_code: toNullableText(courseCode),
    file_name: file.name,
    file_url: data.publicUrl,
    mime_type: file.type || null,
    file_size: file.size || null,
  };
};

const inferDecisionFromScore = (score) => {
  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) {
    return null;
  }

  if (numericScore >= 80) {
    return 'Equivalent';
  }

  if (numericScore >= 60) {
    return 'Partially Equivalent';
  }

  return 'Not Equivalent';
};

const mapAnalysisResult = (analysis, course) => {
  const legacyScore = course.skorKesamaan === null || course.skorKesamaan === undefined
    ? null
    : Number(course.skorKesamaan);

  const payloadScore = Number(
    analysis?.total_similarity_score
      ?? analysis?.best_match?.total_similarity_score
      ?? analysis?.evaluation?.final_score
      ?? analysis?.score
      ?? legacyScore
      ?? 0,
  );

  const confidenceSource = analysis?.best_match?.confidence_score
    ?? analysis?.evaluation?.confidence
    ?? analysis?.confidence_score
    ?? null;

  const decisionSource = analysis?.best_match?.decision
    ?? analysis?.evaluation?.decision
    ?? analysis?.decision
    ?? inferDecisionFromScore(payloadScore);

  return {
    similarity_score: Number.isFinite(payloadScore)
      ? Number(payloadScore.toFixed(2))
      : 0,
    confidence_score: confidenceSource === null || confidenceSource === undefined
      ? null
      : Number(confidenceSource),
    decision: decisionSource || null,
    analysis_payload: analysis || null,
  };
};

export const saveTransferCreditApplication = async ({
  user,
  formData,
  documents,
  totalKreditDiploma,
  totalKreditSetara,
  analysisResults = {},
}) => {
  if (!user?.id && !user?.idPengguna) {
    throw new Error('Sila log masuk semula sebelum menghantar borang');
  }

  const userId = user.id || user.idPengguna;
  const userEmail = user.emel || user.email || '';

  if (!userEmail) {
    throw new Error('Emel pengguna tidak ditemui. Sila log masuk semula.');
  }

  const studentPayload = {
    id: userId,
    matric_no: toNullableText(formData.noMatrik),
    full_name: toNullableText(formData.nama),
    email: toNullableText(userEmail),
    faculty: toNullableText(formData.fakulti),
    program: toNullableText(formData.program),
    previous_qualification: toNullableText(formData.kelayakanAkademik),
    previous_institution: toNullableText(formData.institusiAsal),
    muet_level: toNullableText(formData.muet),
    phone: toNullableText(formData.telefon),
    current_address: toNullableText(formData.alamatSemasa),
    updated_at: new Date().toISOString(),
  };

  const { error: studentError } = await supabase
    .from('students')
    .upsert(studentPayload, { onConflict: 'id' });

  if (studentError) {
    throw new Error(studentError.message);
  }

  const applicationPayload = {
    student_id: userId,
    semester: toNullableText(formData.semester),
    session: toNullableText(formData.sesi),
    total_diploma_credits: Number(totalKreditDiploma || 0),
    total_degree_credits: Number(totalKreditSetara || 0),
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  };

  const { data: application, error: applicationError } = await supabase
    .from('transfer_credit_applications')
    .insert(applicationPayload)
    .select()
    .single();

  if (applicationError) {
    throw new Error(applicationError.message);
  }

  try {
    for (const [index, course] of formData.courses.entries()) {
      const diplomaCoursePayload = {
        application_id: application.id,
        course_no: index + 1,
        course_code: toNullableText(course.kursusDiploma),
        course_name: toNullableText(course.namaDiploma),
        grade: toNullableText(course.gred),
        credit: Number(course.kreditDiploma || 0),
      };

      const { data: diplomaCourse, error: diplomaCourseError } = await supabase
        .from('diploma_courses')
        .insert(diplomaCoursePayload)
        .select()
        .single();

      if (diplomaCourseError) {
        throw new Error(diplomaCourseError.message);
      }

      const degreeCoursePayload = {
        application_id: application.id,
        course_no: index + 1,
        course_code: toNullableText(course.kursusSetara),
        course_name: toNullableText(course.namaSetara),
        credit: Number(course.kreditSetara || 0),
      };

      const { data: degreeCourse, error: degreeCourseError } = await supabase
        .from('degree_courses')
        .insert(degreeCoursePayload)
        .select()
        .single();

      if (degreeCourseError) {
        throw new Error(degreeCourseError.message);
      }

      const analysis = analysisResults[course.id] || null;
      const analysisPayload = {
        application_id: application.id,
        diploma_course_id: diplomaCourse.id,
        degree_course_id: degreeCourse.id,
        ...mapAnalysisResult(analysis, course),
      };

      const { error: analysisError } = await supabase
        .from('ai_analysis_results')
        .insert(analysisPayload);

      if (analysisError) {
        throw new Error(analysisError.message);
      }

      const courseDocumentEntries = [];
      const courseFiles = [
        ['diploma', course.pdfDiploma],
        ['degree', course.pdfSetara],
      ];

      for (const [documentSide, file] of courseFiles) {
        if (!file) {
          continue;
        }

        const uploadedCourseDocument = await uploadCourseDocument({
          userId,
          applicationId: application.id,
          courseNo: index + 1,
          documentSide,
          courseCode: documentSide === 'diploma' ? course.kursusDiploma : course.kursusSetara,
          file,
        });

        courseDocumentEntries.push(uploadedCourseDocument);
      }

      if (courseDocumentEntries.length > 0) {
        const { error: courseDocumentError } = await supabase
          .from('course_documents')
          .insert(courseDocumentEntries);

        if (courseDocumentError) {
          throw new Error(courseDocumentError.message);
        }
      }
    }

    const documentEntries = [];
    const documentFiles = [
      ['transkrip', documents.transkrip],
      ['sinopsis', documents.sinopsis],
      ['bayaran', documents.bayaran],
    ];

    for (const [documentType, file] of documentFiles) {
      if (!file) {
        continue;
      }

      const uploadedDocument = await uploadSupportingDocument({
        userId,
        applicationId: application.id,
        documentType,
        file,
      });

      documentEntries.push({
        application_id: application.id,
        document_type: documentType,
        ...uploadedDocument,
      });
    }

    if (documentEntries.length > 0) {
      const { error: documentError } = await supabase
        .from('application_documents')
        .insert(documentEntries);

      if (documentError) {
        throw new Error(documentError.message);
      }
    }

    return application;
  } catch (error) {
    await supabase.from('transfer_credit_applications').delete().eq('id', application.id);
    throw error;
  }
};
