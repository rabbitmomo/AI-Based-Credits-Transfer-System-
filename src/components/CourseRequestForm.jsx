import React, { useState } from 'react';
import { Form, Button, Alert, Row, Col, Card, Badge, ListGroup } from 'react-bootstrap';

const CourseRequestForm = () => {
  const diplomaCourses = [
    { code: 'DIP-CS101', name: 'Asas Pengaturcaraan', credits: 3 },
    { code: 'DIP-CS102', name: 'Struktur Data', credits: 3 },
    { code: 'DIP-CS103', name: 'Pangkalan Data', credits: 4 },
    { code: 'DIP-CS104', name: 'Rangkaian Komputer', credits: 3 },
    { code: 'DIP-CS105', name: 'Sistem Operasi', credits: 3 },
  ];

  const degreeCourses = [
    { code: 'DEG-CS201', name: 'Pengaturcaraan Lanjutan', credits: 3 },
    { code: 'DEG-CS202', name: 'Algoritma & Kerumitan', credits: 4 },
    { code: 'DEG-CS203', name: 'Sistem Pangkalan Data', credits: 4 },
    { code: 'DEG-CS204', name: 'Keamanan Siber', credits: 3 },
    { code: 'DEG-CS205', name: 'Pembelajaran Mesin', credits: 3 },
  ];

  const [selectedDiplomaCourse, setSelectedDiplomaCourse] = useState(null);
  const [selectedDegreeCourses, setSelectedDegreeCourses] = useState([]);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [pdfCourseA, setPdfCourseA] = useState(null);
  const [pdfCourseB, setPdfCourseB] = useState(null);
  const [similarityResult, setSimilarityResult] = useState(null);
  const [similarityLoading, setSimilarityLoading] = useState(false);
  const [similarityError, setSimilarityError] = useState('');

  const handleDiplomaChange = (courseCode) => {
    setSelectedDiplomaCourse(courseCode);
  };

  const handleDegreeChange = (courseCode) => {
    setSelectedDegreeCourses(prev =>
      prev.includes(courseCode)
        ? prev.filter(c => c !== courseCode)
        : [...prev, courseCode]
    );
  };

  const handlePdfChange = (e, setCourse) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setCourse(file);
    } else {
      setSimilarityError('Sila pilih fail PDF yang sah');
    }
  };

  const handleCheckSimilarity = async () => {
    setSimilarityError('');
    setSimilarityResult(null);

    if (!pdfCourseA || !pdfCourseB) {
      setSimilarityError('Sila muat naik kedua-dua fail PDF (Kursus A dan B)');
      return;
    }

    setSimilarityLoading(true);

    try {
      // Step 1: Extract structured JSON from both PDFs
      const formDataA = new FormData();
      formDataA.append('file', pdfCourseA);

      const formDataB = new FormData();
      formDataB.append('file', pdfCourseB);

      const [structuredResponseA, structuredResponseB] = await Promise.all([
        fetch('http://localhost:3000/api/pdf-ocr-structured', {
          method: 'POST',
          body: formDataA,
        }),
        fetch('http://localhost:3000/api/pdf-ocr-structured', {
          method: 'POST',
          body: formDataB,
        }),
      ]);

      if (!structuredResponseA.ok || !structuredResponseB.ok) {
        throw new Error('Gagal mengekstrak data berstruktur daripada PDF');
      }

      const structuredDataA = await structuredResponseA.json();
      const structuredDataB = await structuredResponseB.json();

      // Step 2: Call structured similarity API with extracted course JSON
      const similarityResponse = await fetch('http://localhost:3000/api/similarity-embedding-structured', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseA: structuredDataA.data,
          courseB: structuredDataB.data,
        }),
      });

      if (!similarityResponse.ok) {
        throw new Error('Gagal membandingkan data kursus berstruktur');
      }

      const similarityData = await similarityResponse.json();
      setSimilarityResult(similarityData);
    } catch (err) {
      setSimilarityError(err.message || 'Ralat semasa memproses fail PDF');
    } finally {
      setSimilarityLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!selectedDiplomaCourse || selectedDegreeCourses.length === 0) {
      setError('Sila pilih sekurang-kurangnya satu kursus Diploma dan satu kursus Ijazah');
      return;
    }
    setSuccess(true);
    setSelectedDiplomaCourse(null);
    setSelectedDegreeCourses([]);
    setTimeout(() => setSuccess(false), 3000);
  };

  const selectedDiplomaInfo = diplomaCourses.find(c => c.code === selectedDiplomaCourse);
  const selectedDegreeInfo = selectedDegreeCourses.map(code =>
    degreeCourses.find(c => c.code === code)
  );

  const totalDiplomaCredits = selectedDiplomaInfo?.credits || 0;
  const totalDegreeCredits = selectedDegreeInfo.reduce((sum, course) => sum + (course?.credits || 0), 0);

  return (
    <Form onSubmit={handleSubmit}>
      {success && (
        <Alert variant="success" className="mb-4">
          <i className="bi bi-check-circle me-2"></i>
          Permohonan {selectedDegreeInfo.length} kursus berjaya dihantar! Sila tunggu proses analisis.
        </Alert>
      )}

      {error && (
        <Alert variant="danger" className="mb-4">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
        </Alert>
      )}
      
      <Card className="mb-4 border-info">
        <Card.Header className="bg-info text-white">
          <Card.Title className="mb-0">
            <i className="bi bi-file-pdf me-2"></i>Semak Persamaan Kurikulum
          </Card.Title>
        </Card.Header>
        <Card.Body>
          <Row className="mb-3 g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label className="fw-bold">Muat Naik PDF Kursus A:</Form.Label>
                <Form.Control
                  type="file"
                  accept=".pdf"
                  onChange={(e) => handlePdfChange(e, setPdfCourseA)}
                  disabled={similarityLoading}
                />
                {pdfCourseA && (
                  <small className="text-success d-block mt-2">
                    <i className="bi bi-check-circle me-1"></i>
                    {pdfCourseA.name}
                  </small>
                )}
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label className="fw-bold">Muat Naik PDF Kursus B:</Form.Label>
                <Form.Control
                  type="file"
                  accept=".pdf"
                  onChange={(e) => handlePdfChange(e, setPdfCourseB)}
                  disabled={similarityLoading}
                />
                {pdfCourseB && (
                  <small className="text-success d-block mt-2">
                    <i className="bi bi-check-circle me-1"></i>
                    {pdfCourseB.name}
                  </small>
                )}
              </Form.Group>
            </Col>
          </Row>

          {similarityError && (
            <Alert variant="danger" className="mb-3">
              <i className="bi bi-exclamation-triangle me-2"></i>
              {similarityError}
            </Alert>
          )}

          {similarityResult && (
            <Alert
              variant={similarityResult.evaluation?.decision === 'Equivalent' ? 'success' : 'warning'}
              className="mb-3"
            >
              <div className="mb-2">
                <i
                  className={`bi ${similarityResult.evaluation?.decision === 'Equivalent' ? 'bi-check-circle' : 'bi-info-circle'} me-2`}
                ></i>
                <strong>
                  {similarityResult.evaluation?.decision || 'Keputusan tidak tersedia'}
                </strong>
              </div>
              <div className="small mb-2">
                <strong>Kursus A:</strong> {similarityResult.courseA_code || '-'}
                <br />
                <strong>Kursus B:</strong> {similarityResult.courseB_code || '-'}
              </div>
              <Row className="mt-3 small">
                <Col md={6}>
                  <p className="mb-2">
                    <strong>Skor Akhir:</strong>
                    <br />
                    {((similarityResult.evaluation?.final_score || 0) * 100).toFixed(2)}%
                  </p>
                </Col>
                <Col md={6}>
                  <p className="mb-2">
                    <strong>Keyakinan:</strong>
                    <br />
                    {((similarityResult.evaluation?.confidence || 0) * 100).toFixed(0)}%
                  </p>
                </Col>
              </Row>
              <div className="small mt-2">
                <strong>Bidang dibandingkan:</strong> {similarityResult.fields_available?.join(', ') || '-'}
              </div>
              <div className="small mt-2">
                <strong>Berat diagih semula:</strong>
                <br />
                {similarityResult.redistributed_weights
                  ? Object.entries(similarityResult.redistributed_weights)
                      .map(([field, weight]) => `${field}: ${weight}%`)
                      .join(' | ')
                  : '-'}
              </div>
              <div className="small mt-2">
                <strong>Skor setiap bidang:</strong>
                <br />
                {similarityResult.evaluation?.scores
                  ? Object.entries(similarityResult.evaluation.scores)
                      .map(([field, score]) => `${field}: ${score === null ? '-' : score}`)
                      .join(' | ')
                  : '-'}
              </div>
            </Alert>
          )}

          <Button
            variant="info"
            onClick={handleCheckSimilarity}
            disabled={!pdfCourseA || !pdfCourseB || similarityLoading}
            className="w-100"
          >
            {similarityLoading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Sedang memproses...
              </>
            ) : (
              <>
                <i className="bi bi-search me-2"></i>
                Semak Persamaan Kurikulum Berstruktur
              </>
            )}
          </Button>
        </Card.Body>
      </Card>

      <Row className="mb-4 g-3">
        <Col lg={6}>
          <Card className="h-100">
            <Card.Header className="bg-primary text-white">
              <Card.Title className="mb-0">
                <i className="bi bi-mortarboard me-2"></i>Kursus Diploma
              </Card.Title>
            </Card.Header>
            <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <p className="small text-muted mb-3">Pilih SATU kursus Diploma (Radio Button):</p>
              {diplomaCourses.map((course, idx) => (
                <div key={idx} className="mb-3 pb-3 border-bottom">
                  <Form.Check
                    type="radio"
                    id={`diploma-${idx}`}
                    name="diplomaCourse"
                    label={
                      <span>
                        <strong className="text-dark">{course.code}</strong>
                        <br />
                        <span className="text-muted">{course.name}</span>
                        <br />
                        <Badge bg="info" className="mt-1" style={{ fontSize: '1.125rem', padding: '0.5rem 1.5rem' }}>{course.credits} Kredit</Badge>
                      </span>
                    }
                    value={course.code}
                    checked={selectedDiplomaCourse === course.code}
                    onChange={() => handleDiplomaChange(course.code)}
                  />
                </div>
              ))}
            </Card.Body>
          </Card>
        </Col>
        <Col lg={6}>
          <Card className="h-100">
            <Card.Header className="bg-success text-white">
              <Card.Title className="mb-0">
                <i className="bi bi-book me-2"></i>Kursus Ijazah Sarjana Muda
              </Card.Title>
            </Card.Header>
            <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <p className="small text-muted mb-3">Pilih SATU atau LEBIH kursus Ijazah (Checkboxes):</p>
              {degreeCourses.map((course, idx) => (
                <div key={idx} className="mb-3 pb-3 border-bottom">
                  <Form.Check
                    type="checkbox"
                    id={`degree-${idx}`}
                    label={
                      <span>
                        <strong className="text-dark">{course.code}</strong>
                        <br />
                        <span className="text-muted">{course.name}</span>
                        <br />
                        <Badge bg="success" className="mt-1" style={{ fontSize: '1.125rem', padding: '0.5rem 1.5rem' }}>{course.credits} Kredit</Badge>
                      </span>
                    }
                    value={course.code}
                    checked={selectedDegreeCourses.includes(course.code)}
                    onChange={() => handleDegreeChange(course.code)}
                  />
                </div>
              ))}
            </Card.Body>
          </Card>
        </Col>
      </Row>
      {(selectedDiplomaCourse || selectedDegreeCourses.length > 0) && (
        <Card className="mb-4 border-primary">
          <Card.Header className="bg-light border-primary">
            <Card.Title className="mb-0 text-primary">
              <i className="bi bi-list-check me-2"></i>Ringkasan Permohonan
            </Card.Title>
          </Card.Header>
          <Card.Body>
            <Row className="mb-3">
              <Col md={6}>
                <h6 className="text-primary fw-bold mb-2">Kursus Diploma Dipilih:</h6>
                {selectedDiplomaInfo ? (
                  <ListGroup>
                    <ListGroup.Item>
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <strong>{selectedDiplomaInfo.code}</strong>
                          <br />
                          <small className="text-muted">{selectedDiplomaInfo.name}</small>
                        </div>
                        <Badge bg="info" style={{ fontSize: '1.125rem', padding: '0.5rem 1.5rem' }}>{selectedDiplomaInfo.credits} kredit</Badge>
                      </div>
                    </ListGroup.Item>
                  </ListGroup>
                ) : (
                  <p className="text-muted small">Tiada dipilih</p>
                )}
              </Col>
              <Col md={6}>
                <h6 className="text-success fw-bold mb-2">Kursus Ijazah Dipilih ({selectedDegreeCourses.length}):</h6>
                {selectedDegreeInfo.length > 0 ? (
                  <ListGroup>
                    {selectedDegreeInfo.map((course, idx) => (
                      <ListGroup.Item key={idx}>
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <strong>{course?.code}</strong>
                            <br />
                            <small className="text-muted">{course?.name}</small>
                          </div>
                          <Badge bg="success" style={{ fontSize: '1.125rem', padding: '0.5rem 1.5rem' }}>{course?.credits} kredit</Badge>
                        </div>
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                ) : (
                  <p className="text-muted small">Tiada dipilih</p>
                )}
              </Col>
            </Row>
            {selectedDiplomaCourse && selectedDegreeCourses.length > 0 && (
              <Row className="pt-3 border-top">
                <Col md={6}>
                  <p className="mb-1">
                    <strong>Jumlah Kredit Diploma:</strong>
                    <Badge bg="info" className="ms-2" style={{ fontSize: '1.125rem', padding: '0.5rem 1.5rem' }}>{totalDiplomaCredits} kredit</Badge>
                  </p>
                </Col>
                <Col md={6}>
                  <p className="mb-1">
                    <strong>Jumlah Kredit Ijazah:</strong>
                    <Badge bg="success" className="ms-2" style={{ fontSize: '1.125rem', padding: '0.5rem 1.5rem' }}>{totalDegreeCredits} kredit</Badge>
                  </p>
                </Col>
              </Row>
            )}
          </Card.Body>
        </Card>
      )}
      <div className="d-grid gap-2 d-md-flex justify-content-md-end">
        <Button
          variant="secondary"
          onClick={() => {
            setSelectedDiplomaCourse(null);
            setSelectedDegreeCourses([]);
            setError('');
          }}
        >
          <i className="bi bi-arrow-counterclockwise me-2"></i>Kosongkan Semua
        </Button>
        <Button
          variant="primary"
          type="submit"
          disabled={!selectedDiplomaCourse || selectedDegreeCourses.length === 0}
          size="lg"
        >
          <i className="bi bi-send me-2"></i>
          Hantar Permohonan ({selectedDegreeCourses.length} Kursus)
        </Button>
      </div>
    </Form>
  );
};

export default CourseRequestForm;
