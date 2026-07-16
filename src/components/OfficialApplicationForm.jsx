import React, { useEffect, useState } from 'react';
import { Form, Button, Alert, Row, Col, Card, Badge, Table, Modal } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { saveTransferCreditApplication } from '../services/transferCreditApplicationService';

const OfficialApplicationForm = ({ onSubmit }) => {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://ai-based-credits-transfer-system-production.up.railway.app';
  const { user } = useAuth();

  const mapDiplomaCourseFields = (structuredData) => ({
    kursus: String(structuredData?.course_code || '').trim(),
    nama: String(structuredData?.course_name || '').trim(),
    kredit: Number.isFinite(Number(structuredData?.total_credit)) ? Number(structuredData.total_credit) : 0,
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
      },
    ],
  });

  const [documents, setDocuments] = useState({
    transkrip: null,
    sinopsis: null,
    bayaran: null,
  });
  const [degreeCourses, setDegreeCourses] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadDegreeCourses = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/degree-courses`);
        if (!response.ok) return;
        const payload = await response.json();
        setDegreeCourses(Array.isArray(payload?.data) ? payload.data : []);
      } catch (fetchError) {
        console.error('Failed to fetch degree courses:', fetchError);
      }
    };

    loadDegreeCourses();
  }, [API_BASE_URL]);

  const getDegreeCourseByCode = (courseCode) =>
    degreeCourses.find((course) => String(course.course_code || '').trim() === String(courseCode || '').trim());

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleDocumentChange = (doc, file) => {
    setDocuments((prev) => ({
      ...prev,
      [doc]: file,
    }));
  };

  const handleCourseChange = (courseId, field, value) => {
    if (field === 'kursusSetara') {
      const selectedDegreeCourse = getDegreeCourseByCode(value);

      setFormData((prev) => ({
        ...prev,
        courses: prev.courses.map((course) =>
          course.id === courseId
            ? {
                ...course,
                kursusSetara: value,
                namaSetara: selectedDegreeCourse?.course_name || '',
                kreditSetara: selectedDegreeCourse?.credits ?? 0,
              }
            : course,
        ),
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      courses: prev.courses.map((course) =>
        course.id === courseId ? { ...course, [field]: value } : course,
      ),
    }));
  };

  const handleCoursePdfSelect = (courseId, file) => {
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Hanya fail PDF dibenarkan untuk Kursus Diploma');
      return;
    }

    setError('');
    setFormData((prev) => ({
      ...prev,
      courses: prev.courses.map((course) =>
        course.id === courseId ? { ...course, pdfDiploma: file } : course,
      ),
    }));
  };

  const handleDiplomaPdfUpload = async (courseId) => {
    const targetCourse = formData.courses.find((course) => course.id === courseId);

    if (!targetCourse?.pdfDiploma) {
      setError('Sila pilih PDF Diploma terlebih dahulu');
      return;
    }

    setError('');

    const uploadFormData = new FormData();
    uploadFormData.append('file', targetCourse.pdfDiploma);

    try {
      const response = await fetch(`${API_BASE_URL}/api/pdf-diploma-structured-save`, {
        method: 'POST',
        body: uploadFormData,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || payload?.details || 'Gagal memproses PDF Diploma');
      }

      const diplomaFields = mapDiplomaCourseFields(payload?.data || payload?.extracted);

      setFormData((prev) => ({
        ...prev,
        courses: prev.courses.map((course) =>
          course.id === courseId
            ? {
                ...course,
                kursusDiploma: diplomaFields.kursus,
                namaDiploma: diplomaFields.nama,
                kreditDiploma: diplomaFields.kredit,
              }
            : course,
        ),
      }));
    } catch (uploadError) {
      console.error('Failed to process diploma PDF:', uploadError);
      setError(uploadError.message || 'Gagal memproses PDF Diploma');
    }
  };

  const handleAddCourse = () => {
    setFormData((prev) => ({
      ...prev,
      courses: [
        ...prev.courses,
        {
          id: Math.max(...prev.courses.map((c) => c.id), 0) + 1,
          kursusDiploma: '',
          namaDiploma: '',
          gred: '',
          kreditDiploma: 0,
          kursusSetara: '',
          namaSetara: '',
          kreditSetara: 0,
          pdfDiploma: null,
        },
      ],
    }));
  };

  const handleRemoveCourse = (courseId) => {
    setFormData((prev) => ({
      ...prev,
      courses: prev.courses.filter((course) => course.id !== courseId),
    }));
  };

  const totalKreditDiploma = formData.courses.reduce(
    (sum, course) => sum + parseInt(course.kreditDiploma || 0, 10),
    0,
  );
  const totalKreditSetara = formData.courses.reduce(
    (sum, course) => sum + parseInt(course.kreditSetara || 0, 10),
    0,
  );
  const allDocumentsChecked = documents.transkrip && documents.sinopsis && documents.bayaran;

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

    const incompleteCourse = formData.courses.some(
      (course) =>
        !course.kursusDiploma ||
        !course.namaDiploma ||
        !course.gred ||
        !course.kreditDiploma ||
        !course.kursusSetara ||
        !course.namaSetara ||
        !course.kreditSetara,
    );

    if (incompleteCourse) {
      setError('Sila lengkapkan maklumat semua kursus');
      setIsSubmitting(false);
      return;
    }

    const invalidKredit = formData.courses.some((course) => {
      const kreditDiploma = parseInt(course.kreditDiploma, 10);
      const kreditSetara = parseInt(course.kreditSetara, 10);
      return Number.isNaN(kreditDiploma) || kreditDiploma <= 0 || Number.isNaN(kreditSetara) || kreditSetara <= 0;
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

  return (
    <div className="official-application-form" style={{ paddingTop: '80px' }}>
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
                ⚠️ <strong>PENTING:</strong> Muat naik sinopsis untuk semakan dokumen.
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
                    <th className="text-center" style={{ width: '6%' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.courses.map((course, index) => (
                    <React.Fragment key={course.id}>
                      <tr>
                        <td className="text-center">{index + 1}</td>
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
                          <Form.Select
                            size="sm"
                            value={course.kursusSetara}
                            onChange={(e) => handleCourseChange(course.id, 'kursusSetara', e.target.value)}
                            required
                          >
                            <option value="">Pilih kod kursus</option>
                            {degreeCourses.map((degreeCourse) => (
                              <option key={degreeCourse.id || degreeCourse.course_code} value={degreeCourse.course_code}>
                                {degreeCourse.course_code}
                              </option>
                            ))}
                          </Form.Select>
                          <div className="small text-muted mt-1">
                            Kod degree yang sama boleh dipilih semula untuk baris diploma lain jika padanan diperlukan.
                          </div>
                        </td>
                        <td>
                          <Form.Control
                            size="sm"
                            type="text"
                            value={course.namaSetara}
                            onChange={(e) => handleCourseChange(course.id, 'namaSetara', e.target.value)}
                            placeholder="Nama"
                            style={{ minWidth: '220px' }}
                            readOnly
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
                            readOnly
                            required
                          />
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
                        <td colSpan={9}>
                          <Row className="g-2 align-items-end">
                            <Col md={6}>
                              <Form.Label className="small fw-semibold mb-1">PDF Diploma</Form.Label>
                              <Form.Control
                                size="sm"
                                type="file"
                                accept=".pdf"
                                onChange={(e) => handleCoursePdfSelect(course.id, e.target.files?.[0])}
                              />
                              {course.pdfDiploma && (
                                <small className="text-success d-block mt-1">{course.pdfDiploma.name}</small>
                              )}
                              <Button
                                className="mt-2"
                                size="sm"
                                variant="primary"
                                onClick={() => handleDiplomaPdfUpload(course.id)}
                                disabled={!course.pdfDiploma}
                              >
                                Proses PDF Diploma
                              </Button>
                            </Col>
                            <Col md={6}>
                              <div style={{ minHeight: '58px' }} />
                            </Col>
                          </Row>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </Table>
            </div>

            <Button variant="outline-primary" size="sm" onClick={handleAddCourse} className="mb-3">
              <i className="bi bi-plus-circle me-2"></i>Tambah Baris Kursus
            </Button>

            <div className="border-top pt-3 mb-3">
              <Row>
                <Col md={4}>
                  <p className="mb-0"><strong>Jumlah Kredit Diploma:</strong></p>
                </Col>
                <Col md={2}>
                  <p className="mb-0"><Badge bg="primary">{totalKreditDiploma} Kredit</Badge></p>
                </Col>
                <Col md={4}>
                  <p className="mb-0"><strong>Jumlah Kredit Setara:</strong></p>
                </Col>
                <Col md={2}>
                  <p className="mb-0"><Badge bg="success">{totalKreditSetara} Kredit</Badge></p>
                </Col>
              </Row>
            </div>
          </Card.Body>
        </Card>

        <div className="d-grid gap-2 d-md-flex justify-content-md-end mb-4">
          <Button type="button" variant="outline-secondary" onClick={() => setShowPreview(true)}>
            <i className="bi bi-eye me-2"></i>Pratonton
          </Button>
          <Button variant="primary" type="submit" disabled={!allDocumentsChecked || isSubmitting} size="lg">
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
