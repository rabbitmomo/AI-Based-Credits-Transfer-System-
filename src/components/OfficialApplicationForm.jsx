import React, { useState } from 'react';
import { Form, Button, Alert, Row, Col, Card, Badge, Table, Modal, Accordion, Tabs, Tab } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { saveTransferCreditApplication } from '../services/transferCreditApplicationService';

const OfficialApplicationForm = ({ onSubmit }) => {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://ai-based-credits-transfer-system-production.up.railway.app';
  const { user } = useAuth();

  const mapOcrCourseFields = (structuredData) => ({
    kursus: String(structuredData?.course_code || '').trim(),
    nama: String(structuredData?.course_name || '').trim(),
    kredit: Number.isFinite(Number(structuredData?.credits)) ? Number(structuredData.credits) : 0,
  });

  const [formData, setFormData] = useState({
    noMatrik: '',
    nama: '',
    fakulti: '',
    program: '',
    kelayakanAkademik: '',
    institusiAsal: '',
    muet: '',
    alamatSemasa: '',
    telefon: '',
    semester: '',
    sesi: '',
    courses: [
      {
        id: 1,
        kursusDiploma: '',
        namaDiploma: '',
        gred: '',
        kreditDiploma: 0,
        kursusSetara: '',
        namaSetara: '',
        kreditSetara: 0,
        pdfDiploma: null,
        pdfSetara: null,
        skorKesamaan: null,
      },
    ],
  });

  const [documents, setDocuments] = useState({
    transkrip: null,
    sinopsis: null,
    bayaran: null,
  });

  const [showPreview, setShowPreview] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analyzingCourseIds, setAnalyzingCourseIds] = useState([]);
  const [analysisMessage, setAnalysisMessage] = useState({ type: '', text: '' });
  const [analysisResults, setAnalysisResults] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleDocumentChange = (doc, file) => {
    setDocuments(prev => ({
      ...prev,
      [doc]: file,
    }));
  };

  const handleAnalyzeAI = async (courseId) => {
    try {
      const targetCourse = formData.courses.find(c => c.id === courseId);

      if (!targetCourse?.pdfDiploma || !targetCourse?.pdfSetara) {
        setError('Sila muat naik PDF untuk Kursus Diploma dan Kursus Setara sebelum analisis');
        return;
      }

      console.log(`[Analysis Start] CourseID: ${courseId}, Diploma: ${targetCourse.pdfDiploma.name}, Setara: ${targetCourse.pdfSetara.name}`);
      setError('');
      setAnalysisMessage({ type: '', text: '' });
      setAnalyzingCourseIds(prev => [...prev, courseId]);

      const formDataDiploma = new FormData();
      formDataDiploma.append('file', targetCourse.pdfDiploma);

      console.log(`[Step 1/4] Calling OCR for Diploma PDF...`);
      const ocrDiplomaResponse = await fetch(`${API_BASE_URL}/api/pdf-ocr-structured`, {
        method: 'POST',
        body: formDataDiploma,
      });

      if (!ocrDiplomaResponse.ok) {
        const ocrDiplomaError = await ocrDiplomaResponse.json().catch(() => ({}));
        throw new Error(ocrDiplomaError.error || ocrDiplomaError.details || 'Gagal OCR PDF Kursus Diploma');
      }

      const ocrDiplomaData = await ocrDiplomaResponse.json();
      console.log(`[Step 2/4] OCR Diploma Success:`, ocrDiplomaData?.data?.course_code);

      const formDataSetara = new FormData();
      formDataSetara.append('file', targetCourse.pdfSetara);

      console.log(`[Step 3/4] Calling OCR for Setara PDF...`);
      const ocrSetaraResponse = await fetch(`${API_BASE_URL}/api/pdf-ocr-structured`, {
        method: 'POST',
        body: formDataSetara,
      });

      if (!ocrSetaraResponse.ok) {
        const ocrSetaraError = await ocrSetaraResponse.json().catch(() => ({}));
        throw new Error(ocrSetaraError.error || ocrSetaraError.details || 'Gagal OCR PDF Kursus Setara');
      }

      const ocrSetaraData = await ocrSetaraResponse.json();
      console.log(`[Step 4/4] OCR Setara Success:`, ocrSetaraData?.data?.course_code);

      const diplomaFields = mapOcrCourseFields(ocrDiplomaData?.data);
      const setaraFields = mapOcrCourseFields(ocrSetaraData?.data);

      setFormData(prev => ({
        ...prev,
        courses: prev.courses.map(course =>
          course.id === courseId
            ? {
                ...course,
                kursusDiploma: diplomaFields.kursus,
                namaDiploma: diplomaFields.nama,
                kreditDiploma: diplomaFields.kredit,
                kursusSetara: setaraFields.kursus,
                namaSetara: setaraFields.nama,
                kreditSetara: setaraFields.kredit,
              }
            : course,
        ),
      }));

      console.log(`[Similarity] Calling similarity analysis...`);
      const similarityResponse = await fetch(`${API_BASE_URL}/api/similarity-embedding-structured`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseA: ocrDiplomaData.data,
          courseB: ocrSetaraData.data,
        }),
      });

      if (!similarityResponse.ok) {
        const similarityError = await similarityResponse.json().catch(() => ({}));
        throw new Error(similarityError.error || similarityError.details || 'Gagal analisis skor kesamaan');
      }

      const similarityData = await similarityResponse.json();
      console.log(`[Similarity Success] Score:`, similarityData?.evaluation?.final_score);
      
      const scorePercent = Number(((similarityData.evaluation?.final_score || 0) * 100).toFixed(2));

      console.log(`[State Update 1] Updating skorKesamaan to ${scorePercent}%`);
      setFormData(prev => ({
        ...prev,
        courses: prev.courses.map(course =>
          course.id === courseId ? { ...course, skorKesamaan: scorePercent } : course
        ),
      }));

      console.log(`[State Update 2] Storing full analysis results in state`);
      const analysisData = {
        ...similarityData,
        requestBody: {
          courseA: ocrDiplomaData.data,
          courseB: ocrSetaraData.data,
        },
      };
      
      console.log(`[State Update 2] Analysis data size:`, JSON.stringify(analysisData).length, 'bytes');
      
      setAnalysisResults(prev => ({
        ...prev,
        [courseId]: analysisData,
      }));

      setAnalysisMessage({
        type: similarityData.evaluation?.decision === 'Equivalent' ? 'success' : 'warning',
        text: `Analisis berjaya untuk ${targetCourse.kursusDiploma || 'Kursus Diploma'} -> ${targetCourse.kursusSetara || 'Kursus Setara'}: ${scorePercent}%`,
      });
      console.log(`[Analysis Complete] CourseID: ${courseId}`);
    } catch (apiError) {
      console.error(`[Analysis Error] CourseID: ${courseId}`, apiError);
      setError(apiError.message || 'Ralat semasa analisis kesamaan');
      setAnalysisMessage({
        type: 'danger',
        text: `Analisis gagal: ${apiError.message || 'Ralat semasa analisis kesamaan'}`,
      });
    } finally {
      console.log(`[Cleanup] CourseID: ${courseId}`);
      setAnalyzingCourseIds(prev => prev.filter(id => id !== courseId));
    }
  };

  const handleCoursePdfChange = (courseId, field, file) => {
    if (!file) {
      return;
    }

    if (file.type !== 'application/pdf') {
      setError('Hanya fail PDF dibenarkan untuk analisis kesamaan');
      return;
    }

    setError('');
    setFormData(prev => ({
      ...prev,
      courses: prev.courses.map(course =>
        course.id === courseId ? { ...course, [field]: file } : course
      ),
    }));
  };

  const handleCourseChange = (id, field, value) => {
    setFormData(prev => ({
      ...prev,
      courses: prev.courses.map(course =>

        course.id === id ? { ...course, [field]: value } : course
      ),
    }));
  };

  const handleAddCourse = () => {
    setFormData(prev => ({
      ...prev,
      courses: [
        ...prev.courses,
        {
          id: Math.max(...prev.courses.map(c => c.id), 0) + 1,
          kursusDiploma: '',
          namaDiploma: '',
          gred: '',
          kreditDiploma: 0,
          kursusSetara: '',
          namaSetara: '',
          kreditSetara: 0,
          pdfDiploma: null,
          pdfSetara: null,
          skorKesamaan: null,
        },
      ],
    }));
  };

  const handleRemoveCourse = (id) => {
    setFormData(prev => ({
      ...prev,
      courses: prev.courses.filter(course => course.id !== id),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (!formData.noMatrik || !formData.nama || !formData.fakulti) {
      setError('Sila lengkapkan maklumat peribadi');
      setIsSubmitting(false);
      return;
    }

    if (!documents.transkrip || !documents.sinopsis || !documents.bayaran) {
      setError('Sila muat naik semua dokumen sokongan yang diperlukan');
      setIsSubmitting(false);
      return;
    }

    if (formData.courses.length === 0) {
      setError('Sila tambahkan sekurang-kurangnya satu kursus');
      setIsSubmitting(false);
      return;
    }
    const incompleteCourse = formData.courses.some(c =>
      !c.kursusDiploma || !c.namaDiploma || !c.gred || !c.kreditDiploma || !c.kursusSetara || !c.namaSetara || !c.kreditSetara
    );

    if (incompleteCourse) {
      setError('Sila lengkapkan maklumat semua kursus');
      setIsSubmitting(false);
      return;
    }

    const invalidKredit = formData.courses.some(c => {
      const kreditDip = parseInt(c.kreditDiploma, 10);
      const kreditSetara = parseInt(c.kreditSetara, 10);
      return isNaN(kreditDip) || kreditDip <= 0 || isNaN(kreditSetara) || kreditSetara <= 0;
    });

    if (invalidKredit) {
      setError('Kredit mestilah nombor yang lebih besar daripada 0');
      setIsSubmitting(false);
      return;
    }

    try {
      const savedApplication = await saveTransferCreditApplication({
        user,
        formData,
        documents,
        totalKreditDiploma,
        totalKreditSetara,
        analysisResults,
      });

      if (onSubmit) {
        onSubmit({
          ...formData,
          savedApplication,
        });
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (submitError) {
      setError(submitError.message || 'Gagal menghantar borang ke Supabase');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalKreditDiploma = formData.courses.reduce((sum, course) => sum + parseInt(course.kreditDiploma || 0), 0);
  const totalKreditSetara = formData.courses.reduce((sum, course) => sum + parseInt(course.kreditSetara || 0), 0);
  const allDocumentsChecked = documents.transkrip && documents.sinopsis && documents.bayaran;

  return (
    <div className="official-application-form">
      <div className="form-header mb-4 p-4 bg-light border">
        <h4 className="text-center fw-bold mb-3">BORANG PERMOHONAN PEMINDAHAN KREDIT SECARA MENEGAK</h4>
        <p className="text-center small text-muted mb-2">UNIVERSITI KEBANGSAAN MALAYSIA</p>
        <p className="text-center small">Untuk kegunaan pelajar Kemasukan Kategori Diploma dan Diploma Lanjutan Sahaja</p>
      </div>

      {success && (
        <Alert variant="success" className="mb-4">
          <i className="bi bi-check-circle me-2"></i>
          Permohonan berjaya dihantar! Sila tunggu proses perolehan.
        </Alert>
      )}

      {error && (
        <Alert variant="danger" className="mb-4">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
        </Alert>
      )}

      <Form onSubmit={handleSubmit}>
        <Card className="mb-4">
          <Card.Header className="bg-danger text-white">
            <Card.Title className="mb-0">DOKUMEN SOKONGAN</Card.Title>
          </Card.Header>
          <Card.Body>
            <p className="small mb-3">
              <strong>PERHATIAN:</strong> Permohonan yang tidak lengkap tidak akan diproses. Sila muat naik semua dokumen di bawah.
            </p>
            
            <Form.Group className="mb-3 p-3 bg-light rounded border">
              <Form.Label className="fw-bold mb-2">
                <i className="bi bi-file-earmark-pdf text-danger me-2"></i>
                1. Transkrip Rasmi / Keputusan Kelayakan Akademik Terdahulu
              </Form.Label>
              <Form.Control
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.png"
                onChange={(e) => handleDocumentChange('transkrip', e.target.files[0])}
                className="mb-2"
              />
              {documents.transkrip && (
                <div className="alert alert-success py-2 mb-0">
                  <i className="bi bi-check-circle me-2"></i>
                  <strong>Dipuat naik:</strong> {documents.transkrip.name}
                </div>
              )}
            </Form.Group>

            <Form.Group className="mb-3 p-3 bg-light rounded border">
              <Form.Label className="fw-bold mb-2">
                <i className="bi bi-file-earmark-text text-info me-2"></i>
                2. Sinopsis / Kandungan Kursus dari IPTA/IPTS Terdahulu
              </Form.Label>
              <p className="small text-muted mb-2">
                ⚠️ <strong>PENTING:</strong> Upload sinopsis terlebih dahulu untuk menggunakan fitur Analisis Kesamaan AI
              </p>
              <Form.Control
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => handleDocumentChange('sinopsis', e.target.files[0])}
                className="mb-2"
              />
              {documents.sinopsis && (
                <div className="alert alert-success py-2 mb-0">
                  <i className="bi bi-check-circle me-2"></i>
                  <strong>Dipuat naik:</strong> {documents.sinopsis.name}
                </div>
              )}
            </Form.Group>

            <Form.Group className="mb-0 p-3 bg-light rounded border">
              <Form.Label className="fw-bold mb-2">
                <i className="bi bi-receipt text-warning me-2"></i>
                3. Salinan Resit Bayaran / Bukti Pembayaran Wang Proses RM100
              </Form.Label>
              <Form.Control
                type="file"
                accept=".pdf,.jpg,.png"
                onChange={(e) => handleDocumentChange('bayaran', e.target.files[0])}
                className="mb-2"
              />
              {documents.bayaran && (
                <div className="alert alert-success py-2 mb-0">
                  <i className="bi bi-check-circle me-2"></i>
                  <strong>Dipuat naik:</strong> {documents.bayaran.name}
                </div>
              )}
            </Form.Group>
          </Card.Body>
        </Card>
        <Card className="mb-4">
          <Card.Header className="bg-primary text-white">
            <Card.Title className="mb-0">A: MAKLUMAT PERIBADI PELAJAR</Card.Title>
          </Card.Header>
          <Card.Body>
            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="fw-bold">No. Pendaftaran / Matrik</Form.Label>
                  <Form.Control
                    type="text"
                    name="noMatrik"
                    value={formData.noMatrik}
                    onChange={handleInputChange}
                    placeholder="Cth: A123456"
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="fw-bold">Semester / Sesi</Form.Label>
                  <Row>
                    <Col xs={6}>
                      <Form.Control
                        type="text"
                        name="semester"
                        value={formData.semester}
                        onChange={handleInputChange}
                        placeholder="Sem"
                        required
                      />
                    </Col>
                    <Col xs={6}>
                      <Form.Control
                        type="text"
                        name="sesi"
                        value={formData.sesi}
                        onChange={handleInputChange}
                        placeholder="Sesi"
                        required
                      />
                    </Col>
                  </Row>
                </Form.Group>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col md={12}>
                <Form.Group>
                  <Form.Label className="fw-bold">Nama Pelajar</Form.Label>
                  <Form.Control
                    type="text"
                    name="nama"
                    value={formData.nama}
                    onChange={handleInputChange}
                    placeholder="Nama penuh"
                    required
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="fw-bold">Fakulti</Form.Label>
                  <Form.Control
                    type="text"
                    name="fakulti"
                    value={formData.fakulti}
                    onChange={handleInputChange}
                    placeholder="FTSM / FEP / dll"
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="fw-bold">Program</Form.Label>
                  <Form.Control
                    type="text"
                    name="program"
                    value={formData.program}
                    onChange={handleInputChange}
                    placeholder="Nama Program"
                    required
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="fw-bold">Kelayakan Akademik Terdahulu</Form.Label>
                  <Form.Control
                    type="text"
                    name="kelayakanAkademik"
                    value={formData.kelayakanAkademik}
                    onChange={handleInputChange}
                    placeholder="Cth: Diploma Kejuruteraan Perisian"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="fw-bold">Nama IPTA/IPTS Terdahulu</Form.Label>
                  <Form.Control
                    type="text"
                    name="institusiAsal"
                    value={formData.institusiAsal}
                    onChange={handleInputChange}
                    placeholder="Nama Institusi"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="fw-bold">Tahap MUET</Form.Label>
                  <Form.Control
                    type="text"
                    name="muet"
                    value={formData.muet}
                    onChange={handleInputChange}
                    placeholder="Band 1-6"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="fw-bold">No. Telefon / Emel</Form.Label>
                  <Form.Control
                    type="text"
                    name="telefon"
                    value={formData.telefon}
                    onChange={handleInputChange}
                    placeholder="Emel / Telefon"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Form.Group>
              <Form.Label className="fw-bold">Alamat Semasa (Surat-menyurat)</Form.Label>
              <Form.Control
                as="textarea"
                name="alamatSemasa"
                value={formData.alamatSemasa}
                onChange={handleInputChange}
                placeholder="Alamat lengkap"
                rows={3}
              />
            </Form.Group>
          </Card.Body>
        </Card>
        <Card className="mb-4">
          <Card.Header className="bg-success text-white">
            <Card.Title className="mb-0">B: SENARAI KURSUS YANG DIPOHON</Card.Title>
          </Card.Header>
          <Card.Body>
            <div className="table-responsive mb-3" style={{ overflowX: 'auto' }}>
              <Table bordered hover size="sm" style={{ minWidth: '1500px' }}>
                <thead className="table-light">
                  <tr>
                    <th className="text-center" style={{ width: '4%' }}>No.</th>
                    <th style={{ width: '10%' }}>Kursus Diploma</th>
                    <th style={{ width: '22%' }}>Nama Kursus</th>
                    <th className="text-center" style={{ width: '5%' }}>Gred</th>
                    <th className="text-center" style={{ width: '5%' }}>Kredit</th>
                    <th style={{ width: '10%' }}>Kursus Setara</th>
                    <th style={{ width: '22%' }}>Nama Setara</th>
                    <th className="text-center" style={{ width: '5%' }}>Kredit</th>
                    <th className="text-center" style={{ width: '8%' }}>Skor Kesamaan</th>
                    <th className="text-center" style={{ width: '6%' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.courses.map((course, idx) => (
                    <React.Fragment key={course.id}>
                      <tr>
                        <td className="text-center">{idx + 1}</td>
                        <td>
                          <Form.Control
                            size="sm"
                            type="text"
                            value={course.kursusDiploma}
                            onChange={(e) => handleCourseChange(course.id, 'kursusDiploma', e.target.value)}
                            placeholder="Kod"
                            required
                          />
                        </td>
                        <td>
                          <Form.Control
                            size="sm"
                            type="text"
                            value={course.namaDiploma}
                            onChange={(e) => handleCourseChange(course.id, 'namaDiploma', e.target.value)}
                            placeholder="Nama"
                            style={{ minWidth: '220px' }}
                            required
                          />
                        </td>
                        <td>
                          <Form.Control
                            size="sm"
                            type="text"
                            value={course.gred}
                            onChange={(e) => handleCourseChange(course.id, 'gred', e.target.value)}
                            placeholder="A"
                            maxLength={1}
                            className="text-center"
                            required
                          />
                        </td>
                        <td>
                          <Form.Control
                            size="sm"
                            type="text"
                            value={course.kreditDiploma}
                            onChange={(e) => handleCourseChange(course.id, 'kreditDiploma', e.target.value)}
                            placeholder="0"
                            className="text-center"
                            required
                          />
                        </td>
                        <td>
                          <Form.Control
                            size="sm"
                            type="text"
                            value={course.kursusSetara}
                            onChange={(e) => handleCourseChange(course.id, 'kursusSetara', e.target.value)}
                            placeholder="Kod"
                            required
                          />
                        </td>
                        <td>
                          <Form.Control
                            size="sm"
                            type="text"
                            value={course.namaSetara}
                            onChange={(e) => handleCourseChange(course.id, 'namaSetara', e.target.value)}
                            placeholder="Nama"
                            style={{ minWidth: '220px' }}
                            required
                          />
                        </td>
                        <td>
                          <Form.Control
                            size="sm"
                            type="text"
                            value={course.kreditSetara}
                            onChange={(e) => handleCourseChange(course.id, 'kreditSetara', e.target.value)}
                            placeholder="0"
                            className="text-center"
                            required
                          />
                        </td>
                        <td className="align-middle">
                          {course.skorKesamaan !== null ? (
                            <div className="d-flex flex-column align-items-end gap-1">
                              <Badge bg={course.skorKesamaan >= 80 ? 'success' : 'danger'}>
                                {course.skorKesamaan}%
                              </Badge>
                              <Button
                                variant="outline-secondary"
                                size="sm"
                                className="py-0 px-1"
                                style={{ fontSize: '0.7rem', lineHeight: 1.1 }}
                                onClick={() => handleAnalyzeAI(course.id)}
                                disabled={analyzingCourseIds.includes(course.id) || !course.pdfDiploma || !course.pdfSetara}
                                title="Muat semula skor kesamaan"
                              >
                                {analyzingCourseIds.includes(course.id) ? (
                                  '...'
                                ) : (
                                  <i className="bi bi-arrow-clockwise"></i>
                                )}
                              </Button>
                            </div>
                          ) : (
                            <div className="d-flex justify-content-end">
                              <Button
                                variant="outline-primary"
                                size="sm"
                                onClick={() => handleAnalyzeAI(course.id)}
                                disabled={analyzingCourseIds.includes(course.id) || !course.pdfDiploma || !course.pdfSetara}
                                title={!course.pdfDiploma || !course.pdfSetara ? 'Sila upload kedua-dua PDF terlebih dahulu' : ''}
                              >
                                {analyzingCourseIds.includes(course.id) ? 'Menganalisis...' : (
                                  <>
                                    <i className="bi bi-cpu me-1"></i>Analisis
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </td>
                        <td className="text-center align-middle">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleRemoveCourse(course.id)}
                            disabled={formData.courses.length === 1}
                          >
                            <i className="bi bi-trash"></i>
                          </Button>
                        </td>
                      </tr>
                      <tr className="bg-light">
                        <td colSpan={10}>
                          <Row className="g-2 align-items-end">
                            <Col md={6}>
                              <Form.Label className="small fw-semibold mb-1">PDF Diploma</Form.Label>
                              <Form.Control
                                size="sm"
                                type="file"
                                accept=".pdf"
                                onChange={(e) => handleCoursePdfChange(course.id, 'pdfDiploma', e.target.files?.[0])}
                              />
                              {course.pdfDiploma && (
                                <small className="text-success d-block mt-1">{course.pdfDiploma.name}</small>
                              )}
                            </Col>
                            <Col md={6}>
                              <Form.Label className="small fw-semibold mb-1">PDF Setara</Form.Label>
                              <Form.Control
                                size="sm"
                                type="file"
                                accept=".pdf"
                                onChange={(e) => handleCoursePdfChange(course.id, 'pdfSetara', e.target.files?.[0])}
                              />
                              {course.pdfSetara && (
                                <small className="text-success d-block mt-1">{course.pdfSetara.name}</small>
                              )}
                            </Col>
                          </Row>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </Table>
            </div>

            <Button
              variant="outline-primary"
              size="sm"
              onClick={handleAddCourse}
              className="mb-3"
            >
              <i className="bi bi-plus-circle me-2"></i>Tambah Baris Kursus
            </Button>

            <div className="border-top pt-3 mb-3">
              <Row>
                <Col md={4}>
                  <p className="mb-0">
                    <strong>Jumlah Kredit Diploma:</strong>
                  </p>
                </Col>
                <Col md={2}>
                  <p className="mb-0">
                    <Badge bg="primary">{totalKreditDiploma} Kredit</Badge>
                  </p>
                </Col>
                <Col md={4}>
                  <p className="mb-0">
                    <strong>Jumlah Kredit Setara:</strong>
                  </p>
                </Col>
                <Col md={2}>
                  <p className="mb-0">
                    <Badge bg="success">{totalKreditSetara} Kredit</Badge>
                  </p>
                </Col>
              </Row>
            </div>

              <div className="pt-3 border-top">
                {analysisMessage.text && (
                  <Alert variant={analysisMessage.type} className="py-2 mb-3">
                    {analysisMessage.text}
                  </Alert>
                )}
                <Row className="g-3">
                  {formData.courses.map((course) => {
                    const analysis = analysisResults[course.id];

                    return (
                      <Col md={12} key={course.id} className="mb-3">
                        <Card className="border-light">
                          <Card.Body className="p-2">
                            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                              <small>
                                <strong>{course.kursusDiploma}</strong> → <strong>{course.kursusSetara}</strong>
                              </small>
                              <Button
                                type="button"
                                variant={course.skorKesamaan !== null ? 'outline-secondary' : 'outline-primary'}
                                size="sm"
                                onClick={() => handleAnalyzeAI(course.id)}
                                disabled={analyzingCourseIds.includes(course.id) || !course.pdfDiploma || !course.pdfSetara}
                                title={!course.pdfDiploma || !course.pdfSetara ? 'Sila upload kedua-dua PDF terlebih dahulu' : ''}
                              >
                                {analyzingCourseIds.includes(course.id) ? 'Menganalisis...' : (
                                  <>
                                    <i className="bi bi-cpu me-1"></i>
                                    {course.skorKesamaan !== null ? 'Analisis Ulang' : 'Analisis'}
                                  </>
                                )}
                              </Button>
                            </div>

                            {course.skorKesamaan !== null && (
                              <div className="mb-2">
                                <Badge
                                  bg={course.skorKesamaan >= 80 ? 'success' : 'danger'}
                                  className="me-2"
                                >
                                  {course.skorKesamaan}% Kesamaan
                                </Badge>
                                <small className="text-muted d-block mt-1">
                                  {analysis?.evaluation?.decision || '-'}
                                </small>
                              </div>
                            )}

                            {analysis && (
                              <>
                                <div className="table-responsive mt-3">
                                  <Table bordered size="sm" className="mb-0 align-middle">
                                    <tbody>
                                      <tr>
                                        <th style={{ width: '34%' }}>Kursus A</th>
                                        <td>{analysis.courseA_code || '-'}</td>
                                      </tr>
                                      <tr>
                                        <th>Kursus B</th>
                                        <td>{analysis.courseB_code || '-'}</td>
                                      </tr>
                                      <tr>
                                        <th>Bidang dibandingkan</th>
                                        <td>{analysis.fields_available?.join(', ') || '-'}</td>
                                      </tr>
                                      <tr>
                                        <th>Berat diagih semula</th>
                                        <td>
                                          {analysis.redistributed_weights
                                            ? Object.entries(analysis.redistributed_weights)
                                                .map(([field, weight]) => `${field}: ${weight}%`)
                                                .join(' | ')
                                            : '-'}
                                        </td>
                                      </tr>
                                      <tr>
                                        <th>Skor akhir</th>
                                        <td>{((analysis.evaluation?.final_score || 0) * 100).toFixed(2)}%</td>
                                      </tr>
                                      <tr>
                                        <th>Keyakinan</th>
                                        <td>{((analysis.evaluation?.confidence || 0) * 100).toFixed(0)}%</td>
                                      </tr>
                                      <tr>
                                        <th>Learning Outcomes</th>
                                        <td>{analysis.evaluation?.scores?.learning_outcomes ?? '-'}</td>
                                      </tr>
                                      <tr>
                                        <th>Synopsis</th>
                                        <td>{analysis.evaluation?.scores?.synopsis ?? '-'}</td>
                                      </tr>
                                      <tr>
                                        <th>Assessments</th>
                                        <td>{analysis.evaluation?.scores?.assessments ?? '-'}</td>
                                      </tr>
                                      <tr>
                                        <th>Topics</th>
                                        <td>{analysis.evaluation?.scores?.topics ?? '-'}</td>
                                      </tr>
                                    </tbody>
                                  </Table>
                                </div>

                                <div className="table-responsive mt-3">
                                  <Table bordered size="sm" className="mb-0 align-middle">
                                    <thead className="table-light">
                                      <tr>
                                        <th style={{ width: '28%' }}>Medan</th>
                                        <th>Course A</th>
                                        <th>Course B</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        <th>Kod Kursus</th>
                                        <td>{analysis.requestBody?.courseA?.course_code || '-'}</td>
                                        <td>{analysis.requestBody?.courseB?.course_code || '-'}</td>
                                      </tr>
                                      <tr>
                                        <th>Nama Kursus</th>
                                        <td>{analysis.requestBody?.courseA?.course_name || '-'}</td>
                                        <td>{analysis.requestBody?.courseB?.course_name || '-'}</td>
                                      </tr>
                                      <tr>
                                        <th>Learning Outcomes</th>
                                        <td>
                                          {Array.isArray(analysis.requestBody?.courseA?.learning_outcomes) && analysis.requestBody.courseA.learning_outcomes.length > 0
                                            ? analysis.requestBody.courseA.learning_outcomes.map((item, index) => (
                                                <div key={index}>{String(item || '').trim()}</div>
                                              ))
                                            : '-'}
                                        </td>
                                        <td>
                                          {Array.isArray(analysis.requestBody?.courseB?.learning_outcomes) && analysis.requestBody.courseB.learning_outcomes.length > 0
                                            ? analysis.requestBody.courseB.learning_outcomes.map((item, index) => (
                                                <div key={index}>{String(item || '').trim()}</div>
                                              ))
                                            : '-'}
                                        </td>
                                      </tr>
                                      <tr>
                                        <th>Topics</th>
                                        <td>
                                          {Array.isArray(analysis.requestBody?.courseA?.topics) && analysis.requestBody.courseA.topics.length > 0
                                            ? analysis.requestBody.courseA.topics.map((item, index) => (
                                                <div key={index}>{String(item || '').trim()}</div>
                                              ))
                                            : '-'}
                                        </td>
                                        <td>
                                          {Array.isArray(analysis.requestBody?.courseB?.topics) && analysis.requestBody.courseB.topics.length > 0
                                            ? analysis.requestBody.courseB.topics.map((item, index) => (
                                                <div key={index}>{String(item || '').trim()}</div>
                                              ))
                                            : '-'}
                                        </td>
                                      </tr>
                                      <tr>
                                        <th>Synopsis</th>
                                        <td>{analysis.requestBody?.courseA?.synopsis || '-'}</td>
                                        <td>{analysis.requestBody?.courseB?.synopsis || '-'}</td>
                                      </tr>
                                      <tr>
                                        <th>Assessments</th>
                                        <td>
                                          {Array.isArray(analysis.requestBody?.courseA?.assessments) && analysis.requestBody.courseA.assessments.length > 0
                                            ? analysis.requestBody.courseA.assessments.map((item, index) => (
                                                <div key={index}>{String(item || '').trim()}</div>
                                              ))
                                            : '-'}
                                        </td>
                                        <td>
                                          {Array.isArray(analysis.requestBody?.courseB?.assessments) && analysis.requestBody.courseB.assessments.length > 0
                                            ? analysis.requestBody.courseB.assessments.map((item, index) => (
                                                <div key={index}>{String(item || '').trim()}</div>
                                              ))
                                            : '-'}
                                        </td>
                                      </tr>
                                      <tr>
                                        <th>Kredit</th>
                                        <td>{analysis.requestBody?.courseA?.credits ?? '-'}</td>
                                        <td>{analysis.requestBody?.courseB?.credits ?? '-'}</td>
                                      </tr>
                                      <tr>
                                        <th>Language Detected</th>
                                        <td>{analysis.requestBody?.courseA?.language_detected || '-'}</td>
                                        <td>{analysis.requestBody?.courseB?.language_detected || '-'}</td>
                                      </tr>
                                    </tbody>
                                  </Table>
                                </div>
                              </>
                            )}
                          </Card.Body>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              </div>
          </Card.Body>
        </Card>
        <div className="d-grid gap-2 d-md-flex justify-content-md-end mb-4">
          <Button
            type="button"
            variant="outline-secondary"
            onClick={() => setShowPreview(true)}
          >
            <i className="bi bi-eye me-2"></i>Pratonton
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={!allDocumentsChecked || isSubmitting}
            size="lg"
          >
            <i className="bi bi-send me-2"></i>
            {isSubmitting ? 'Menyimpan...' : 'Hantar Borang'}
          </Button>
        </div>
      </Form>
      <Modal show={showPreview} onHide={() => setShowPreview(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Pratonton Borang</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="bg-light p-4 border">
            <h5 className="text-center fw-bold mb-3">BORANG PERMOHONAN PEMINDAHAN KREDIT SECARA MENEGAK</h5>
            
            <h6 className="fw-bold mt-4 mb-2">MAKLUMAT PERIBADI</h6>
            <p className="mb-1"><strong>No. Matrik:</strong> {formData.noMatrik}</p>
            <p className="mb-1"><strong>Nama:</strong> {formData.nama}</p>
            <p className="mb-1"><strong>Fakulti:</strong> {formData.fakulti}</p>
            <p className="mb-1"><strong>Program:</strong> {formData.program}</p>
            <p className="mb-1"><strong>Institusi Asal:</strong> {formData.institusiAsal}</p>

            <h6 className="fw-bold mt-4 mb-2">SENARAI KURSUS</h6>
            <Table bordered size="sm">
              <thead className="table-light">
                <tr>
                  <th>Diploma</th>
                  <th className="text-center">Gred</th>
                  <th className="text-center">Kredit</th>
                  <th>Setara</th>
                  <th className="text-center">Kredit</th>
                  <th className="text-center">Kesamaan</th>
                </tr>
              </thead>
              <tbody>
                {formData.courses.map((course, idx) => (
                  <tr key={idx}>
                    <td>{course.kursusDiploma} - {course.namaDiploma}</td>
                    <td className="text-center">{course.gred}</td>
                    <td className="text-center">{course.kreditDiploma}</td>
                    <td>{course.kursusSetara} - {course.namaSetara}</td>
                    <td className="text-center">{course.kreditSetara}</td>
                    <td className="text-center">
                      {course.skorKesamaan !== null ? (
                        <Badge bg={course.skorKesamaan >= 80 ? 'success' : 'danger'}>
                          {course.skorKesamaan}%
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="text-end"><strong>Jumlah Kredit Diploma: {totalKreditDiploma} | Jumlah Kredit Setara: {totalKreditSetara}</strong></p>
          </div>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default OfficialApplicationForm;
