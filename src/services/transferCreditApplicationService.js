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

const mapAnalysisResult = (analysis, course) => ({
  similarity_score: course.skorKesamaan === null || course.skorKesamaan === undefined
    ? 0
    : Number(course.skorKesamaan),
  confidence_score: analysis?.evaluation?.confidence === null || analysis?.evaluation?.confidence === undefined
    ? null
    : Number((Number(analysis.evaluation.confidence) * 100).toFixed(2)),
  decision: analysis?.evaluation?.decision || null,
  analysis_payload: analysis || null,
});

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
