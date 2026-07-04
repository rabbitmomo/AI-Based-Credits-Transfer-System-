import React, { useEffect, useMemo, useState } from 'react';
import { Container, Row, Col, Card, Button, Badge, Modal, Table, Spinner, Alert } from 'react-bootstrap';
import { jsPDF } from 'jspdf';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const STATUS_LABELS = {
  draft: 'Draf',
  submitted: 'Menunggu Kelulusan KP',
  pending_analysis: 'Belum Dianalisis',
  approved: 'Diluluskan',
  rejected: 'Ditolak',
};

const STATUS_BADGES = {
  draft: 'secondary',
  submitted: 'warning',
  pending_analysis: 'secondary',
  approved: 'success',
  rejected: 'danger',
};

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('ms-MY');
};

const formatScore = (value) => {
  if (value === null || value === undefined) {
    return '-';
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return '-';
  }

  return `${numericValue.toFixed(2)}%`;
};

const STATUS_LABELS_BY_VALUE = {
  approved: 'Diluluskan',
  rejected: 'Ditolak',
  submitted: 'Menunggu Kelulusan KP',
  pending_analysis: 'Belum Dianalisis',
  draft: 'Draf',
};

const getReportDate = () => new Date().toLocaleString('ms-MY');

const ensurePdfSpace = (doc, cursorY, requiredSpace, margin = 15) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + requiredSpace <= pageHeight - margin) {
    return cursorY;
  }

  doc.addPage();
  return margin;
};

const addReportHeader = (doc, title, subtitle) => {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(102, 126, 234);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 15, 15);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 15, 22);
  doc.setTextColor(0, 0, 0);
};

const addSectionTitle = (doc, title, cursorY) => {
  const nextY = ensurePdfSpace(doc, cursorY, 12);
  doc.setFillColor(243, 244, 246);
  doc.rect(15, nextY - 4, 180, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, 17, nextY + 1);
  doc.setFont('helvetica', 'normal');
  return nextY + 8;
};

const addKeyValueRows = (doc, rows, cursorY) => {
  const leftX = 15;
  const valueX = 70;
  const maxValueWidth = 125;

  rows.forEach(([label, value]) => {
    const text = value === null || value === undefined || value === '' ? '-' : String(value);
    const wrapped = doc.splitTextToSize(text, maxValueWidth);
    const rowHeight = Math.max(6, wrapped.length * 5);
    cursorY = ensurePdfSpace(doc, cursorY, rowHeight + 2);
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, leftX, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.text(wrapped, valueX, cursorY);
    cursorY += rowHeight;
  });

  return cursorY;
};

const createPdfLinkCell = (text, url) => ({
  text,
  url,
});

const addSimpleTable = (doc, headers, rows, cursorY, options = {}) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const usableWidth = pageWidth - margin * 2;
  const columnWidths = options.columnWidths || headers.map(() => usableWidth / headers.length);
  const fontSize = options.fontSize || 9;
  const lineHeight = options.lineHeight || 4.5;

  const totalHeaderHeight = 8;
  const estimatedRowsHeight = rows.reduce((total, row) => {
    const rowHeight = row.reduce((maxHeight, cell, index) => {
      const cellText = cell === null || cell === undefined ? '-' : String(cell);
      const wrapped = doc.splitTextToSize(cellText, Math.max(10, columnWidths[index] - 3));
      return Math.max(maxHeight, Math.max(8, wrapped.length * lineHeight + 2));
    }, 8);
    return total + rowHeight;
  }, totalHeaderHeight);

  cursorY = ensurePdfSpace(doc, cursorY, estimatedRowsHeight + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);

  headers.forEach((header, index) => {
    const x = margin + columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
    const columnWidth = columnWidths[index];
    doc.rect(x, cursorY, columnWidth, 8);
    doc.text(String(header), x + 1.5, cursorY + 5.5, { maxWidth: columnWidth - 3 });
  });

  cursorY += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  rows.forEach((row) => {
    const cellInfos = row.map((cell, index) => {
      const columnWidth = columnWidths[index];
      const cellText = cell && typeof cell === 'object' && 'text' in cell ? cell.text : cell === null || cell === undefined || cell === '' ? '-' : String(cell);
      const wrappedText = doc.splitTextToSize(cellText, Math.max(10, columnWidth - 3));
      return {
        columnWidth,
        wrappedText,
        cellHeight: Math.max(8, wrappedText.length * lineHeight + 2),
        linkUrl: cell && typeof cell === 'object' && 'url' in cell ? cell.url : null,
      };
    });

    const rowHeight = cellInfos.reduce((maxHeight, info) => Math.max(maxHeight, info.cellHeight), 8);
    cursorY = ensurePdfSpace(doc, cursorY, rowHeight + 2);

    let cellX = margin;
    row.forEach((cell, index) => {
      const info = cellInfos[index];
      doc.rect(cellX, cursorY, info.columnWidth, rowHeight);
      if (info.linkUrl) {
        doc.setTextColor(17, 85, 204);
        doc.setFont('helvetica', 'underline');
      }
      const textY = cursorY + 5.5;
      doc.text(info.wrappedText, cellX + 1.5, textY);
      if (info.linkUrl) {
        doc.link(cellX, cursorY, info.columnWidth, rowHeight, { url: info.linkUrl });
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
      }
      cellX += info.columnWidth;
    });
    cursorY += rowHeight;
  });

  return cursorY + 2;
};

const getApiBaseUrl = () => import.meta.env.VITE_API_BASE_URL || 'https://ai-based-credits-transfer-system-production.up.railway.app';

const KPDashboard = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [selectedCourseAnalysis, setSelectedCourseAnalysis] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisArtifacts, setAnalysisArtifacts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [includeAIInReport, setIncludeAIInReport] = useState(false);

  const loadApplications = async () => {
    setLoading(true);
    setError('');

    try {
      await supabase.auth.refreshSession().catch(() => null);

      const { data: appRows, error: appError } = await supabase
        .from('transfer_credit_applications')
        .select('id, student_id, semester, session, total_diploma_credits, total_degree_credits, status, submitted_at, created_at, updated_at')
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (appError) {
        throw new Error(appError.message);
      }

      if (!appRows || appRows.length === 0) {
        setApplications([]);
        return;
      }

      const applicationIds = appRows.map((app) => app.id);
      const studentIds = [...new Set(appRows.map((app) => app.student_id).filter(Boolean))];

      const [studentsResult, diplomaResult, degreeResult, applicationDocsResult, courseDocsResult, analysisResult] = await Promise.all([
        supabase
          .from('students')
          .select('id, matric_no, full_name, faculty, program, email')
          .in('id', studentIds),
        supabase
          .from('diploma_courses')
          .select('id, application_id, course_no, course_code, course_name, grade, credit, created_at')
          .in('application_id', applicationIds),
        supabase
          .from('degree_courses')
          .select('id, application_id, course_no, course_code, course_name, credit, created_at')
          .in('application_id', applicationIds),
        supabase
          .from('application_documents')
          .select('id, application_id, document_type, file_name, file_url, mime_type, file_size, created_at')
          .in('application_id', applicationIds),
        supabase
          .from('course_documents')
          .select('id, application_id, course_no, document_side, course_code, file_name, file_url, mime_type, file_size, created_at')
          .in('application_id', applicationIds),
        supabase
          .from('ai_analysis_results')
          .select('id, application_id, diploma_course_id, degree_course_id, similarity_score, confidence_score, decision, created_at')
          .in('application_id', applicationIds),
      ]);

      const loadError = [studentsResult, diplomaResult, degreeResult, applicationDocsResult, courseDocsResult, analysisResult].find((result) => result.error);
      if (loadError?.error) {
        throw new Error(loadError.error.message);
      }

      const studentMap = new Map((studentsResult.data || []).map((student) => [student.id, student]));
      const diplomaMap = new Map();
      const degreeMap = new Map();
      const applicationDocsMap = new Map();
      const courseDocsMap = new Map();
      const analysisMap = new Map();

      for (const diplomaCourse of diplomaResult.data || []) {
        if (!diplomaMap.has(diplomaCourse.application_id)) {
          diplomaMap.set(diplomaCourse.application_id, []);
        }
        diplomaMap.get(diplomaCourse.application_id).push(diplomaCourse);
      }

      for (const degreeCourse of degreeResult.data || []) {
        if (!degreeMap.has(degreeCourse.application_id)) {
          degreeMap.set(degreeCourse.application_id, []);
        }
        degreeMap.get(degreeCourse.application_id).push(degreeCourse);
      }

      for (const doc of applicationDocsResult.data || []) {
        if (!applicationDocsMap.has(doc.application_id)) {
          applicationDocsMap.set(doc.application_id, []);
        }
        applicationDocsMap.get(doc.application_id).push(doc);
      }

      for (const doc of courseDocsResult.data || []) {
        if (!courseDocsMap.has(doc.application_id)) {
          courseDocsMap.set(doc.application_id, []);
        }
        courseDocsMap.get(doc.application_id).push(doc);
      }

      for (const analysis of analysisResult.data || []) {
        if (!analysisMap.has(analysis.application_id)) {
          analysisMap.set(analysis.application_id, []);
        }
        analysisMap.get(analysis.application_id).push(analysis);
      }

      const formattedApplications = appRows.map((app, index) => {
        const student = studentMap.get(app.student_id) || {};
        const diplomaCourses = [...(diplomaMap.get(app.id) || [])].sort((a, b) => a.course_no - b.course_no);
        const degreeCourses = [...(degreeMap.get(app.id) || [])].sort((a, b) => a.course_no - b.course_no);
        const supportDocuments = applicationDocsMap.get(app.id) || [];
        const courseDocuments = courseDocsMap.get(app.id) || [];
        const analyses = [...(analysisMap.get(app.id) || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const courseNos = [...new Set([
          ...diplomaCourses.map((course) => course.course_no),
          ...degreeCourses.map((course) => course.course_no),
        ])].sort((a, b) => a - b);

        const courses = courseNos.map((courseNo, courseIndex) => {
          const diploma = diplomaCourses.find((course) => course.course_no === courseNo) || null;
          const degree = degreeCourses.find((course) => course.course_no === courseNo) || null;
          const diplomaPdf = courseDocuments.find((doc) => doc.course_no === courseNo && doc.document_side === 'diploma') || null;
          const degreePdf = courseDocuments.find((doc) => doc.course_no === courseNo && doc.document_side === 'degree') || null;
          const analysis = analyses[courseIndex] || null;

          return {
            courseNo,
            diploma,
            degree,
            diplomaPdf,
            degreePdf,
            skorKesamaan: analysis?.similarity_score ?? diploma?.skorKesamaan ?? null,
            confidenceScore: analysis?.confidence_score ?? null,
            decision: analysis?.decision || null,
          };
        });

        const pendingStatuses = ['submitted', 'pending_analysis', 'draft'];

        return {
          idPermohonan: `REQ${String(index + 1).padStart(3, '0')}`,
          idPermohonanAsal: app.id,
          idPelajar: student.matric_no || app.student_id,
          namaPelajar: student.full_name || '-',
          fakulti: student.faculty || '-',
          program: student.program || '-',
          email: student.email || '-',
          semester: app.semester || '-',
          session: app.session || '-',
          courses,
          supportDocuments,
          courseDocuments,
          statusPermohonan: STATUS_LABELS[app.status] || app.status || 'Tidak Diketahui',
          statusRaw: app.status,
          tarikhHantar: formatDate(app.submitted_at || app.created_at),
          tarikhHantarRaw: app.submitted_at || app.created_at,
          dokumentStatus: {
            transkrip: supportDocuments.some((doc) => doc.document_type === 'transkrip'),
            sinopsis: supportDocuments.some((doc) => doc.document_type === 'sinopsis'),
            bayaran: supportDocuments.some((doc) => doc.document_type === 'bayaran'),
          },
          isWaiting: pendingStatuses.includes(app.status),
        };
      });

      setApplications(formattedApplications);
    } catch (fetchError) {
      setError(fetchError.message || 'Gagal memuatkan data permohonan pelajar');
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, [user?.id]);

  const stats = useMemo(() => {
    return {
      total: applications.length,
      approved: applications.filter((app) => app.statusRaw === 'approved').length,
      waiting: applications.filter((app) => ['submitted', 'pending_analysis', 'draft'].includes(app.statusRaw)).length,
    };
  }, [applications]);

  const getStatusBadge = (status) => {
    return <Badge bg={STATUS_BADGES[status] || 'info'}>{status}</Badge>;
  };

  const handleViewDetail = (app) => {
    setSelectedApp(app);
    setShowDetailModal(true);
  };

  const handleViewAnalysis = (app, course) => {
    setSelectedApp(app);
    setSelectedCourseAnalysis(course);
    setAnalysisError('');
    setAnalysisResult(null);
    setAnalysisArtifacts(null);
    setShowAnalysisModal(true);
  };

  const fetchPdfAsFile = async (fileUrl, fileName) => {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Gagal memuat turun fail PDF: ${fileName}`);
    }

    const blob = await response.blob();
    return new File([blob], fileName || 'document.pdf', { type: blob.type || 'application/pdf' });
  };

  const runCourseAnalysis = async (course) => {
    if (!course?.diplomaPdf || !course?.degreePdf) {
      return null;
    }

    const apiBaseUrl = getApiBaseUrl();
    const diplomaFile = await fetchPdfAsFile(course.diplomaPdf.file_url, course.diplomaPdf.file_name);
    const degreeFile = await fetchPdfAsFile(course.degreePdf.file_url, course.degreePdf.file_name);

    const diplomaFormData = new FormData();
    diplomaFormData.append('file', diplomaFile);

    const degreeFormData = new FormData();
    degreeFormData.append('file', degreeFile);

    const [ocrDiplomaResponse, ocrDegreeResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/api/pdf-ocr-structured`, {
        method: 'POST',
        body: diplomaFormData,
      }),
      fetch(`${apiBaseUrl}/api/pdf-ocr-structured`, {
        method: 'POST',
        body: degreeFormData,
      }),
    ]);

    if (!ocrDiplomaResponse.ok || !ocrDegreeResponse.ok) {
      throw new Error('Gagal mengekstrak OCR berstruktur bagi PDF kursus');
    }

    const ocrDiplomaData = await ocrDiplomaResponse.json();
    const ocrDegreeData = await ocrDegreeResponse.json();

    const similarityResponse = await fetch(`${apiBaseUrl}/api/similarity-embedding-structured`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseA: ocrDiplomaData.data,
        courseB: ocrDegreeData.data,
      }),
    });

    if (!similarityResponse.ok) {
      const similarityError = await similarityResponse.json().catch(() => ({}));
      throw new Error(similarityError.error || similarityError.details || 'Gagal menjalankan analisis AI');
    }

    const similarityData = await similarityResponse.json();
    const score = (similarityData.evaluation?.final_score || 0) * 100;
    const confidence = (similarityData.evaluation?.confidence || 0) * 100;
    const decision = similarityData.evaluation?.decision || '-';

    return {
      courseNo: course.courseNo,
      score,
      confidence,
      decision,
      analysisResult: similarityData,
      analysisArtifacts: {
        diploma: ocrDiplomaData.data,
        degree: ocrDegreeData.data,
      },
    };
  };

  const buildReportAnalysisRows = async (app) => {
    const rows = [];

    for (const course of app.courses || []) {
      const analysisRow = await runCourseAnalysis(course);
      if (analysisRow) {
        rows.push(analysisRow);
      }
    }

    return rows;
  };

  const generateOfficialReport = async (app, decision, analysisRows = []) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const analysisMap = new Map(analysisRows.map((row) => [row.courseNo, row]));

    addReportHeader(
      doc,
      'LAPORAN RASMI PERMOHONAN PEMINDAHAN KREDIT',
      `Permohonan ID: ${app.idPermohonan} | Tarikh laporan: ${getReportDate()}`
    );

    let cursorY = 38;

    cursorY = addSectionTitle(doc, 'Maklumat Keputusan', cursorY);
    cursorY = addKeyValueRows(doc, [
      ['Permohonan ID', app.idPermohonan],
      ['No. Matrik', app.idPelajar],
      ['Nama Pelajar', app.namaPelajar],
      ['Status Keputusan', STATUS_LABELS_BY_VALUE[decision] || decision],
      ['Tarikh Hantar', app.tarikhHantar],
    ], cursorY + 2);

    cursorY = addSectionTitle(doc, 'A. Maklumat Peribadi Pelajar', cursorY + 4);
    cursorY = addKeyValueRows(doc, [
      ['No. Matrik', app.idPelajar],
      ['Nama Pelajar', app.namaPelajar],
      ['Fakulti', app.fakulti],
      ['Program', app.program],
      ['Semester / Sesi', `Semester ${app.semester} / ${app.session}`],
      ['Emel Pelajar', app.email],
    ], cursorY + 2);

    cursorY = addSectionTitle(doc, 'B. Senarai Kursus Yang Dimohon', cursorY + 4);
    const courseRows = (app.courses || []).map((course) => {
      const freshAnalysis = analysisMap.get(course.courseNo);
      const score = freshAnalysis ? freshAnalysis.score : course.skorKesamaan;
      const finalDecision = freshAnalysis ? freshAnalysis.decision : course.decision;

      return [
        course.courseNo,
        course.diploma?.course_code || '-',
        course.diploma?.course_name || '-',
        course.degree?.course_code || '-',
        course.degree?.course_name || '-',
        formatScore(score),
        finalDecision || '-',
      ];
    });
    cursorY = addSimpleTable(
      doc,
      ['No.', 'Kod Diploma', 'Nama Diploma', 'Kod Degree', 'Nama Degree', 'Skor', 'Keputusan'],
      courseRows,
      cursorY + 2,
      {
        columnWidths: [10, 22, 40, 22, 40, 18, 23],
        fontSize: 8.5,
        lineHeight: 4.2,
      }
    );

    cursorY = addSectionTitle(doc, 'C. Dokumen Sokongan', cursorY + 4);
    const supportDocumentRows = [
      ['Transkrip Akademik', app.supportDocuments.find((docItem) => docItem.document_type === 'transkrip')],
      ['Sinopsis Kursus', app.supportDocuments.find((docItem) => docItem.document_type === 'sinopsis')],
      ['Resit Bayaran', app.supportDocuments.find((docItem) => docItem.document_type === 'bayaran')],
    ].map(([label, docItem]) => [
      label,
      docItem?.file_url ? createPdfLinkCell(docItem.file_name || '-', docItem.file_url) : (docItem?.file_name || '-'),
    ]);
    cursorY = addSimpleTable(
      doc,
      ['Jenis Dokumen', 'Nama Fail'],
      supportDocumentRows,
      cursorY + 2,
      {
        columnWidths: [52, 128],
        fontSize: 8.5,
        lineHeight: 4.2,
      }
    );

    cursorY = addSectionTitle(doc, 'D. Dokumen Kursus Yang Dimuat Naik', cursorY + 4);
    const uploadedCourseRows = (app.courseDocuments || []).map((docItem) => [
      docItem.course_no,
      docItem.document_side,
      docItem.course_code || '-',
      docItem.file_url ? createPdfLinkCell(docItem.file_name || '-', docItem.file_url) : (docItem.file_name || '-'),
    ]);
    cursorY = addSimpleTable(
      doc,
      ['No.', 'Jenis', 'Kod Kursus', 'Nama Fail'],
      uploadedCourseRows.length > 0 ? uploadedCourseRows : [['-', '-', '-', '-']],
      cursorY + 2,
      {
        columnWidths: [12, 22, 28, 118],
        fontSize: 8.5,
        lineHeight: 4.2,
      }
    );

    if (analysisRows.length > 0) {
      cursorY = addSectionTitle(doc, 'E. Hasil Analisis AI', cursorY + 4);

      for (const row of analysisRows) {
        cursorY = ensurePdfSpace(doc, cursorY, 45);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`Kursus No. ${row.courseNo}`, 15, cursorY);
        cursorY += 5;

        cursorY = addKeyValueRows(doc, [
          ['Skor Kesamaan', formatScore(row.score)],
          ['Keyakinan AI', `${Number(row.confidence || 0).toFixed(2)}%`],
          ['Keputusan', row.decision || '-'],
          ['Kod Diploma', row.analysisArtifacts?.diploma?.course_code || '-'],
          ['Nama Diploma', row.analysisArtifacts?.diploma?.course_name || '-'],
          ['Kod Degree', row.analysisArtifacts?.degree?.course_code || '-'],
          ['Nama Degree', row.analysisArtifacts?.degree?.course_name || '-'],
          ['Kredit Diploma', row.analysisArtifacts?.diploma?.credits ?? '-'],
          ['Kredit Degree', row.analysisArtifacts?.degree?.credits ?? '-'],
        ], cursorY + 1);

        const synopsisText = row.analysisArtifacts?.diploma?.synopsis || '-';
        const degreeSynopsisText = row.analysisArtifacts?.degree?.synopsis || '-';
        cursorY = addKeyValueRows(doc, [
          ['Synopsis Diploma', synopsisText],
          ['Synopsis Degree', degreeSynopsisText],
        ], cursorY + 1);

        const fieldsAvailable = row.analysisResult?.fields_available || [];
        cursorY = addKeyValueRows(doc, [
          ['Bidang Dibandingkan', fieldsAvailable.length > 0 ? fieldsAvailable.join(', ') : '-'],
        ], cursorY + 1);

        cursorY = ensurePdfSpace(doc, cursorY, 18);
      }
    }

    cursorY = ensurePdfSpace(doc, cursorY, 18);
    doc.setDrawColor(180, 180, 180);
    doc.line(15, cursorY, pageWidth - 15, cursorY);
    cursorY += 8;
    doc.setFontSize(10);
    doc.text(`Status permohonan: ${app.statusPermohonan}`, 15, cursorY);
    cursorY += 5;
    doc.text(`Dijana oleh Ketua Program: ${user?.namaPengguna || 'Sistem'}`, 15, cursorY);

    const safeName = String(app.idPermohonan || 'laporan').replace(/[^a-z0-9_-]/gi, '_');
    doc.save(`laporan-permohonan-${safeName}-${decision}.pdf`);
  };

  const handleRunAnalysis = async () => {
    if (!selectedCourseAnalysis?.diplomaPdf || !selectedCourseAnalysis?.degreePdf) {
      setAnalysisError('PDF diploma dan PDF degree mesti wujud sebelum analisis boleh dijalankan.');
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError('');
    setAnalysisResult(null);
    setAnalysisArtifacts(null);

    try {
      const courseAnalysis = await runCourseAnalysis(selectedCourseAnalysis);
      const similarityData = courseAnalysis.analysisResult;

      setAnalysisArtifacts({
        diploma: courseAnalysis.analysisArtifacts.diploma,
        degree: courseAnalysis.analysisArtifacts.degree,
      });
      setAnalysisResult(similarityData);

      // Update the course analysis with the fresh results
      const newScore = courseAnalysis.score;
      const newConfidence = courseAnalysis.confidence;
      const newDecision = courseAnalysis.decision;

      setSelectedCourseAnalysis(prev => ({
        ...prev,
        skorKesamaan: newScore,
        confidenceScore: newConfidence,
        decision: newDecision,
      }));

      // Update the courses list in selectedApp to reflect the new score
      setSelectedApp(prevApp => ({
        ...prevApp,
        courses: prevApp.courses.map(course =>
          course.courseNo === selectedCourseAnalysis.courseNo
            ? {
                ...course,
                skorKesamaan: newScore,
                confidenceScore: newConfidence,
                decision: newDecision,
              }
            : course
        ),
      }));
    } catch (runError) {
      setAnalysisError(runError.message || 'Ralat semasa menjalankan analisis AI');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const renderFileLink = (file) => {
    if (!file) {
      return '-';
    }

    return (
      <a href={file.file_url} target="_blank" rel="noreferrer" className="text-decoration-none">
        {file.file_name}
      </a>
    );
  };

  const handleApproval = async (decision) => {
    if (!selectedApp) {
      return;
    }

    setApprovalLoading(true);
    setApprovalError('');

    try {
      const newStatus = decision === 'approved' ? 'approved' : 'rejected';
      const reportApp = {
        ...selectedApp,
        statusRaw: newStatus,
        statusPermohonan: STATUS_LABELS[newStatus] || newStatus,
      };

      const { error: updateError } = await supabase
        .from('transfer_credit_applications')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', selectedApp.idPermohonanAsal);

      if (updateError) {
        throw new Error(updateError.message);
      }

      let reportAnalysisRows = [];
      if (includeAIInReport) {
        reportAnalysisRows = await buildReportAnalysisRows(reportApp);
      }

      await generateOfficialReport(reportApp, newStatus, reportAnalysisRows);

      // Reload applications to reflect the update
      await loadApplications();

      // Close the detail modal
      setShowDetailModal(false);
      setSelectedApp(null);
    } catch (approvalErr) {
      setApprovalError(approvalErr.message || 'Gagal mengemas kini status permohonan');
    } finally {
      setApprovalLoading(false);
    }
  };

  return (
    <Container fluid className="kp-dashboard" style={{ marginTop: '80px', paddingBottom: '30px' }}>
      <Row className="mb-4">
        <Col>
          <h2 className="dashboard-title">
            <i className="bi bi-clipboard-check" style={{ marginRight: '10px' }} />
            Papan Maklumat Ketua Program
          </h2>
          <p className="text-muted">Semua Permohonan Pemindahan Kredit dari Pelajar</p>
        </Col>
      </Row>

      {error && (
        <Alert variant="danger" className="mb-4">
          <i className="bi bi-exclamation-circle me-2" />
          {error}
        </Alert>
      )}

      <Row className="mb-4" style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
        <Col xs={12} md={4}>
          <Card className="stat-card" style={{ textAlign: 'center' }}>
            <Card.Body>
              <h3 style={{ color: '#667eea', marginBottom: '5px' }}>{stats.total}</h3>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Jumlah Permohonan</p>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="stat-card" style={{ textAlign: 'center' }}>
            <Card.Body>
              <h3 style={{ color: '#10b981', marginBottom: '5px' }}>{stats.approved}</h3>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Diluluskan</p>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="stat-card" style={{ textAlign: 'center' }}>
            <Card.Body>
              <h3 style={{ color: '#f59e0b', marginBottom: '5px' }}>{stats.waiting}</h3>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Menunggu Kelulusan</p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Header style={{ background: '#667eea', color: 'white', fontWeight: 'bold' }}>
              <i className="bi bi-list-check" style={{ marginRight: '10px' }} />
              Senarai Permohonan Pelajar
            </Card.Header>
            <Card.Body style={{ padding: 0 }}>
              {loading ? (
                <div className="py-5 text-center">
                  <Spinner animation="border" role="status" />
                  <div className="mt-3 text-muted">Memuatkan permohonan pelajar...</div>
                </div>
              ) : (
                <Table hover responsive style={{ margin: 0 }}>
                  <thead style={{ backgroundColor: '#f3f4f6' }}>
                    <tr>
                      <th>ID Permohonan</th>
                      <th>No. Matrik</th>
                      <th>Nama Pelajar</th>
                      <th>Bilangan Kursus</th>
                      <th>Status</th>
                      <th>Tarikh Hantar</th>
                      <th>Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center text-muted py-4">
                          Tiada permohonan ditemui.
                        </td>
                      </tr>
                    ) : (
                      applications.map((app) => (
                        <tr key={app.idPermohonanAsal}>
                          <td style={{ fontWeight: 'bold', color: '#667eea' }}>{app.idPermohonan}</td>
                          <td>{app.idPelajar}</td>
                          <td>{app.namaPelajar}</td>
                          <td>
                            <Badge bg="info">{app.courses.length}</Badge>
                          </td>
                          <td>{getStatusBadge(app.statusPermohonan)}</td>
                          <td>{app.tarikhHantar}</td>
                          <td>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleViewDetail(app)}
                              style={{ padding: '5px 12px', fontSize: '12px' }}
                            >
                              <i className="bi bi-eye" style={{ marginRight: '5px' }} />
                              Lihat Detail
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Modal size="xl" scrollable show={showDetailModal} onHide={() => setShowDetailModal(false)}>
        <Modal.Header closeButton style={{ backgroundColor: '#667eea', color: 'white' }}>
          <Modal.Title>
            <i className="bi bi-file-text" style={{ marginRight: '10px' }} />
            Borang Permohonan Pemindahan Kredit Secara Menegak
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ paddingBottom: '120px' }}>
          {selectedApp && (
            <>
              <div style={{ textAlign: 'center', marginBottom: '25px', paddingBottom: '15px', borderBottom: '2px solid #667eea' }}>
                <h5 style={{ color: '#667eea', fontWeight: 'bold' }}>
                  BORANG PERMOHONAN PEMINDAHAN KREDIT SECARA MENEGAK
                </h5>
                <p style={{ fontSize: '12px', color: '#999' }}>Permohonan ID: {selectedApp.idPermohonan}</p>
              </div>

              <div style={{ marginBottom: '25px' }}>
                <h6 style={{ color: '#667eea', fontWeight: 'bold', marginBottom: '12px' }}>
                  <i className="bi bi-files" style={{ marginRight: '8px' }} />
                  DOKUMEN SOKONGAN
                </h6>
                <Row>
                  <Col xs={12} sm={6} md={4} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {selectedApp.dokumentStatus.transkrip ? (
                        <Badge bg="success" style={{ marginRight: '8px' }}>✓</Badge>
                      ) : (
                        <Badge bg="danger" style={{ marginRight: '8px' }}>✗</Badge>
                      )}
                      <span>
                        Transkrip Akademik {renderFileLink(selectedApp.supportDocuments.find((doc) => doc.document_type === 'transkrip'))}
                      </span>
                    </div>
                  </Col>
                  <Col xs={12} sm={6} md={4} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {selectedApp.dokumentStatus.sinopsis ? (
                        <Badge bg="success" style={{ marginRight: '8px' }}>✓</Badge>
                      ) : (
                        <Badge bg="danger" style={{ marginRight: '8px' }}>✗</Badge>
                      )}
                      <span>
                        Sinopsis Kursus {renderFileLink(selectedApp.supportDocuments.find((doc) => doc.document_type === 'sinopsis'))}
                      </span>
                    </div>
                  </Col>
                  <Col xs={12} sm={6} md={4} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {selectedApp.dokumentStatus.bayaran ? (
                        <Badge bg="success" style={{ marginRight: '8px' }}>✓</Badge>
                      ) : (
                        <Badge bg="danger" style={{ marginRight: '8px' }}>✗</Badge>
                      )}
                      <span>
                        Resit Bayaran {renderFileLink(selectedApp.supportDocuments.find((doc) => doc.document_type === 'bayaran'))}
                      </span>
                    </div>
                  </Col>
                </Row>
              </div>

              <div style={{ marginBottom: '25px' }}>
                <h6 style={{ color: '#667eea', fontWeight: 'bold', marginBottom: '12px' }}>
                  <i className="bi bi-person" style={{ marginRight: '8px' }} />
                  A: MAKLUMAT PERIBADI PELAJAR
                </h6>
                <Row>
                  <Col md={6} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#999', fontWeight: 'bold' }}>No. Matrik</label>
                    <p style={{ margin: 0, fontSize: '14px' }}>{selectedApp.idPelajar}</p>
                  </Col>
                  <Col md={6} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#999', fontWeight: 'bold' }}>Nama Pelajar</label>
                    <p style={{ margin: 0, fontSize: '14px' }}>{selectedApp.namaPelajar}</p>
                  </Col>
                  <Col md={6} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#999', fontWeight: 'bold' }}>Fakulti</label>
                    <p style={{ margin: 0, fontSize: '14px' }}>{selectedApp.fakulti}</p>
                  </Col>
                  <Col md={6} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#999', fontWeight: 'bold' }}>Program</label>
                    <p style={{ margin: 0, fontSize: '14px' }}>{selectedApp.program}</p>
                  </Col>
                  <Col md={6} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#999', fontWeight: 'bold' }}>Semester / Sesi</label>
                    <p style={{ margin: 0, fontSize: '14px' }}>
                      Semester {selectedApp.semester} / {selectedApp.session}
                    </p>
                  </Col>
                  <Col md={6} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#999', fontWeight: 'bold' }}>Emel Pelajar</label>
                    <p style={{ margin: 0, fontSize: '14px' }}>{selectedApp.email}</p>
                  </Col>
                </Row>
              </div>

              <div style={{ marginBottom: '25px' }}>
                <h6 style={{ color: '#667eea', fontWeight: 'bold', marginBottom: '12px' }}>
                  <i className="bi bi-book" style={{ marginRight: '8px' }} />
                  B: SENARAI KURSUS YANG DIMOHON
                </h6>
                <div style={{ overflowX: 'auto' }}>
                  <Table bordered hover size="sm" style={{ marginBottom: 0 }}>
                    <thead style={{ backgroundColor: '#f3f4f6' }}>
                      <tr>
                        <th>No.</th>
                        <th>Kursus Diploma</th>
                        <th>Nama Diploma</th>
                        <th>PDF Diploma</th>
                        <th>Gred</th>
                        <th>Kredit Diploma</th>
                        <th>Kursus Degree</th>
                        <th>Nama Degree</th>
                        <th>PDF Degree</th>
                        <th>Kredit Degree</th>
                        <th>Skor Kesamaan</th>
                        <th>Analisis AI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedApp.courses.map((course, idx) => (
                        <tr key={`${selectedApp.idPermohonanAsal}-${course.courseNo}`}>
                          <td style={{ textAlign: 'center' }}>{course.courseNo}</td>
                          <td style={{ fontWeight: 'bold' }}>{course.diploma?.course_code || '-'}</td>
                          <td>{course.diploma?.course_name || '-'}</td>
                          <td>{renderFileLink(course.diplomaPdf)}</td>
                          <td>{course.diploma?.grade || '-'}</td>
                          <td style={{ textAlign: 'center' }}>{course.diploma?.credit ?? '-'}</td>
                          <td style={{ fontWeight: 'bold' }}>{course.degree?.course_code || '-'}</td>
                          <td>{course.degree?.course_name || '-'}</td>
                          <td>{renderFileLink(course.degreePdf)}</td>
                          <td style={{ textAlign: 'center' }}>{course.degree?.credit ?? '-'}</td>
                          <td style={{ textAlign: 'center' }}>
                            <Badge bg={(course.skorKesamaan || 0) >= 80 ? 'success' : 'warning'} style={{ fontSize: '12px' }}>
                              {formatScore(course.skorKesamaan)}
                            </Badge>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => handleViewAnalysis(selectedApp, course)}
                            >
                              Lihat Analisis
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: '#999', fontWeight: 'bold' }}>
                      Jumlah Kredit Diploma
                    </label>
                    <p style={{ margin: 0 }}>
                      <Badge bg="primary" style={{ fontSize: '14px', padding: '6px 10px' }}>
                        {selectedApp.courses.reduce((sum, c) => sum + Number(c.diploma?.credit || 0), 0)} Kredit
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#999', fontWeight: 'bold' }}>
                      Jumlah Kredit Degree
                    </label>
                    <p style={{ margin: 0 }}>
                      <Badge bg="success" style={{ fontSize: '14px', padding: '6px 10px' }}>
                        {selectedApp.courses.reduce((sum, c) => sum + Number(c.degree?.credit || 0), 0)} Kredit
                      </Badge>
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '25px' }}>
                <h6 style={{ color: '#667eea', fontWeight: 'bold', marginBottom: '12px' }}>
                  <i className="bi bi-folder2-open" style={{ marginRight: '8px' }} />
                  C: DOKUMEN KURSUS YANG DIMUAT NAIK
                </h6>
                <Table bordered hover size="sm" style={{ marginBottom: 0 }}>
                  <thead style={{ backgroundColor: '#f3f4f6' }}>
                    <tr>
                      <th>No. Kursus</th>
                      <th>Jenis Dokumen</th>
                      <th>Kod Kursus</th>
                      <th>Nama Fail</th>
                      <th>Pautan Fail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedApp.courseDocuments.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center text-muted py-3">
                          Tiada dokumen kursus ditemui.
                        </td>
                      </tr>
                    ) : (
                      selectedApp.courseDocuments.map((doc) => (
                        <tr key={doc.id}>
                          <td style={{ textAlign: 'center' }}>{doc.course_no}</td>
                          <td style={{ textTransform: 'capitalize' }}>{doc.document_side}</td>
                          <td>{doc.course_code || '-'}</td>
                          <td>{doc.file_name}</td>
                          <td>
                            <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-decoration-none">
                              Buka fail
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>

              <div style={{ marginBottom: '25px', padding: '15px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                <Row>
                  <Col md={6}>
                    <label style={{ fontSize: '12px', color: '#999', fontWeight: 'bold' }}>Status Permohonan</label>
                    <p style={{ margin: 0, marginTop: '5px' }}>
                      {getStatusBadge(selectedApp.statusPermohonan)}
                    </p>
                  </Col>
                  <Col md={6}>
                    <label style={{ fontSize: '12px', color: '#999', fontWeight: 'bold' }}>Tarikh Hantar</label>
                    <p style={{ margin: 0, marginTop: '5px', fontSize: '14px' }}>
                      {selectedApp.tarikhHantar}
                    </p>
                  </Col>
                </Row>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer style={{ 
          borderTop: '2px solid #dee2e6', 
          padding: '15px 20px', 
          backgroundColor: '#f8f9fa',
          position: 'sticky',
          bottom: 0,
          zIndex: 1000
        }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                id="includeAI"
                checked={includeAIInReport}
                onChange={(e) => setIncludeAIInReport(e.target.checked)}
                style={{ cursor: 'pointer', width: '18px', height: '18px' }}
              />
              <label htmlFor="includeAI" style={{ margin: 0, cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                Sertakan Hasil AI dalam Laporan
              </label>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                variant="success"
                onClick={() => handleApproval('approved')}
                disabled={approvalLoading}
                size="sm"
              >
                {approvalLoading ? 'Sedang memproses...' : '✓ Lulus'}
              </Button>
              <Button
                variant="danger"
                onClick={() => handleApproval('rejected')}
                disabled={approvalLoading}
                size="sm"
              >
                {approvalLoading ? 'Sedang memproses...' : '✕ Tolak'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowDetailModal(false)}
                size="sm"
              >
                Tutup
              </Button>
            </div>
          </div>
          {approvalError && (
            <Alert variant="danger" className="mt-2 mb-0" style={{ width: '100%' }}>
              {approvalError}
            </Alert>
          )}
        </Modal.Footer>
      </Modal>

      <Modal size="lg" show={showAnalysisModal} onHide={() => setShowAnalysisModal(false)}>
        <Modal.Header closeButton style={{ backgroundColor: '#10b981', color: 'white' }}>
          <Modal.Title>
            <i className="bi bi-clipboard2-data" style={{ marginRight: '10px' }} />
            Analisis AI Kursus
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedApp && selectedCourseAnalysis && (
            <>
              <div className="mb-3 p-3 rounded" style={{ background: '#f8fafc' }}>
                <h6 className="fw-bold mb-2">Pasangan Kursus</h6>
                <div className="mb-2">
                  <strong>Kursus Diploma:</strong> {selectedCourseAnalysis.diploma?.course_code || '-'} - {selectedCourseAnalysis.diploma?.course_name || '-'}
                </div>
                <div>
                  <strong>Kursus Degree:</strong> {selectedCourseAnalysis.degree?.course_code || '-'} - {selectedCourseAnalysis.degree?.course_name || '-'}
                </div>
              </div>

              <div className="mb-3">
                <h6 className="fw-bold mb-2">Pautan PDF</h6>
                <div className="d-flex flex-column gap-2">
                  <div>
                    <strong>PDF Diploma:</strong> {renderFileLink(selectedCourseAnalysis.diplomaPdf)}
                  </div>
                  <div>
                    <strong>PDF Degree:</strong> {renderFileLink(selectedCourseAnalysis.degreePdf)}
                  </div>
                </div>
              </div>

              <div className="mb-3">
                <Button variant="primary" onClick={handleRunAnalysis} disabled={analysisLoading}>
                  {analysisLoading ? 'Sedang menjalankan analisis...' : 'Jalankan Analisis AI'}
                </Button>
                {analysisError && (
                  <Alert variant="danger" className="mt-3 mb-0">
                    {analysisError}
                  </Alert>
                )}
              </div>

              {analysisResult && analysisArtifacts && (
                <>
                  <div className="mb-3">
                    <h6 className="fw-bold mb-2">Ringkasan Analisis</h6>
                    <Table bordered hover responsive size="sm" className="align-middle mb-0">
                      <tbody>
                        <tr>
                          <th style={{ width: '25%' }}>Skor Kesamaan</th>
                          <td>{Number((analysisResult.evaluation?.final_score || 0) * 100).toFixed(2)}%</td>
                          <th style={{ width: '25%' }}>Keyakinan AI</th>
                          <td>{Number((analysisResult.evaluation?.confidence || 0) * 100).toFixed(2)}%</td>
                        </tr>
                        <tr>
                          <th>Keputusan</th>
                          <td colSpan="3">
                            <Badge bg={analysisResult.evaluation?.decision === 'Equivalent' ? 'success' : 'warning'}>
                              {analysisResult.evaluation?.decision || '-'}
                            </Badge>
                          </td>
                        </tr>
                      </tbody>
                    </Table>
                  </div>

                  <div className="mb-3">
                    <h6 className="fw-bold mb-2">Bidang Dibandingkan</h6>
                    <Table bordered hover responsive size="sm" className="align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th style={{ width: '70%' }}>Bidang</th>
                          <th style={{ width: '30%' }}>Berat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analysisResult.fields_available || []).length > 0 ? (
                          analysisResult.fields_available.map((field) => (
                            <tr key={field}>
                              <td>{field}</td>
                              <td>{analysisResult.redistributed_weights?.[field] ?? '-'}%</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="2" className="text-center text-muted">
                              Tiada bidang ditemui.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>

                  <div className="mb-3">
                    <h6 className="fw-bold mb-2">Skor Setiap Bidang</h6>
                    <Table bordered hover responsive size="sm" className="align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Bidang</th>
                          <th>Skor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResult.evaluation?.scores && Object.keys(analysisResult.evaluation.scores).length > 0 ? (
                          Object.entries(analysisResult.evaluation.scores).map(([field, score]) => (
                            <tr key={field}>
                              <td>{field}</td>
                              <td>{score === null || score === undefined ? '-' : score}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="2" className="text-center text-muted">
                              Tiada skor tersedia.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>

                  <div className="mb-3">
                    <h6 className="fw-bold mb-2">OCR Kursus Diploma</h6>
                    <Table bordered hover responsive size="sm" className="align-middle mb-0">
                      <tbody>
                        <tr>
                          <th style={{ width: '22%' }}>Kod</th>
                          <td>{analysisArtifacts.diploma.course_code || '-'}</td>
                          <th style={{ width: '22%' }}>Nama</th>
                          <td>{analysisArtifacts.diploma.course_name || '-'}</td>
                        </tr>
                        <tr>
                          <th>Kredit</th>
                          <td>{analysisArtifacts.diploma.credits ?? '-'}</td>
                          <th>Bahasa</th>
                          <td>{analysisArtifacts.diploma.language_detected || '-'}</td>
                        </tr>
                        <tr>
                          <th>Synopsis</th>
                          <td colSpan="3">{analysisArtifacts.diploma.synopsis || '-'}</td>
                        </tr>
                        <tr>
                          <th>Learning Outcomes</th>
                          <td colSpan="3">
                            {(analysisArtifacts.diploma.learning_outcomes || []).length > 0 ? (
                              <ul className="mb-0 ps-3">
                                {analysisArtifacts.diploma.learning_outcomes.map((item, index) => (
                                  <li key={index}>{item}</li>
                                ))}
                              </ul>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                        <tr>
                          <th>Topics</th>
                          <td colSpan="3">{(analysisArtifacts.diploma.topics || []).join(' | ') || '-'}</td>
                        </tr>
                        <tr>
                          <th>Assessments</th>
                          <td colSpan="3">{(analysisArtifacts.diploma.assessments || []).join(' | ') || '-'}</td>
                        </tr>
                      </tbody>
                    </Table>
                  </div>

                  <div className="mb-3">
                    <h6 className="fw-bold mb-2">OCR Kursus Degree</h6>
                    <Table bordered hover responsive size="sm" className="align-middle mb-0">
                      <tbody>
                        <tr>
                          <th style={{ width: '22%' }}>Kod</th>
                          <td>{analysisArtifacts.degree.course_code || '-'}</td>
                          <th style={{ width: '22%' }}>Nama</th>
                          <td>{analysisArtifacts.degree.course_name || '-'}</td>
                        </tr>
                        <tr>
                          <th>Kredit</th>
                          <td>{analysisArtifacts.degree.credits ?? '-'}</td>
                          <th>Bahasa</th>
                          <td>{analysisArtifacts.degree.language_detected || '-'}</td>
                        </tr>
                        <tr>
                          <th>Synopsis</th>
                          <td colSpan="3">{analysisArtifacts.degree.synopsis || '-'}</td>
                        </tr>
                        <tr>
                          <th>Learning Outcomes</th>
                          <td colSpan="3">
                            {(analysisArtifacts.degree.learning_outcomes || []).length > 0 ? (
                              <ul className="mb-0 ps-3">
                                {analysisArtifacts.degree.learning_outcomes.map((item, index) => (
                                  <li key={index}>{item}</li>
                                ))}
                              </ul>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                        <tr>
                          <th>Topics</th>
                          <td colSpan="3">{(analysisArtifacts.degree.topics || []).join(' | ') || '-'}</td>
                        </tr>
                        <tr>
                          <th>Assessments</th>
                          <td colSpan="3">{(analysisArtifacts.degree.assessments || []).join(' | ') || '-'}</td>
                        </tr>
                      </tbody>
                    </Table>
                  </div>
                </>
              )}
              {!analysisResult && (
                <div className="mb-3">
                  <h6 className="fw-bold mb-2">Ringkasan Kursus</h6>
                  <Table bordered hover responsive size="sm" className="align-middle mb-0">
                    <tbody>
                      <tr>
                        <th style={{ width: '25%' }}>Kursus Diploma</th>
                        <td>{selectedCourseAnalysis.diploma?.course_code || '-'} - {selectedCourseAnalysis.diploma?.course_name || '-'}</td>
                        <th style={{ width: '25%' }}>Kursus Degree</th>
                        <td>{selectedCourseAnalysis.degree?.course_code || '-'} - {selectedCourseAnalysis.degree?.course_name || '-'}</td>
                      </tr>
                      <tr>
                        <th>Skor Kesamaan</th>
                        <td>{formatScore(selectedCourseAnalysis.skorKesamaan)}</td>
                        <th>Keyakinan AI</th>
                        <td>{selectedCourseAnalysis.confidenceScore !== null && selectedCourseAnalysis.confidenceScore !== undefined
                          ? `${Number(selectedCourseAnalysis.confidenceScore).toFixed(2)}%`
                          : '-'}</td>
                      </tr>
                      <tr>
                        <th>Keputusan</th>
                        <td colSpan="3">
                          <Badge bg={selectedCourseAnalysis.decision === 'Equivalent' ? 'success' : 'warning'}>
                            {selectedCourseAnalysis.decision || '-'}
                          </Badge>
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAnalysisModal(false)}>
            Tutup
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default KPDashboard;
