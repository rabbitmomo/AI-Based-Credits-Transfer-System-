import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Container, Row, Col, Card, Button, Badge, Modal, ListGroup, Tabs, Tab, Table, Alert, Spinner } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import CourseRequestForm from '../components/CourseRequestForm';
import DocumentUpload from '../components/DocumentUpload';
import ChatBot from '../components/ChatBot';
import OfficialApplicationForm from '../components/OfficialApplicationForm';

const StudentDashboard = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [showChatBot, setShowChatBot] = useState(false);
  const [showOfficialForm, setShowOfficialForm] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const formatMalaysiaDateTime = (value) => {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleString('ms-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const loadApplications = useCallback(async () => {
    if (!user?.id) {
      setApplications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      await supabase.auth.refreshSession().catch(() => null);

      const { data: studentRow, error: studentError } = await supabase
        .from('students')
        .select('id, matric_no, full_name, faculty, program')
        .eq('id', user.id)
        .maybeSingle();

      if (studentError) {
        throw new Error(studentError.message);
      }

      const { data: appRows, error: appError } = await supabase
        .from('transfer_credit_applications')
        .select('id, student_id, semester, session, total_diploma_credits, total_degree_credits, status, submitted_at, created_at')
        .eq('student_id', user.id)
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (appError) {
        throw new Error(appError.message);
      }

      const applicationIds = (appRows || []).map((app) => app.id);

      const [diplomaResult, degreeResult, supportDocsResult, courseDocsResult, analysisResult] = applicationIds.length
        ? await Promise.all([
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
          ])
        : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

      const loadError = [diplomaResult, degreeResult, supportDocsResult, courseDocsResult, analysisResult].find((result) => result?.error);
      if (loadError?.error) {
        throw new Error(loadError.error.message);
      }

      const diplomaMap = new Map();
      const degreeMap = new Map();
      const supportDocsMap = new Map();
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

      for (const doc of supportDocsResult.data || []) {
        if (!supportDocsMap.has(doc.application_id)) {
          supportDocsMap.set(doc.application_id, []);
        }
        supportDocsMap.get(doc.application_id).push(doc);
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

        const totalAppCount = (appRows || []).length;
        const formattedApplications = (appRows || []).map((app, index) => {
        const diplomaCourses = [...(diplomaMap.get(app.id) || [])].sort((a, b) => a.course_no - b.course_no);
        const degreeCourses = [...(degreeMap.get(app.id) || [])].sort((a, b) => a.course_no - b.course_no);
        const supportDocuments = supportDocsMap.get(app.id) || [];
        const courseDocuments = courseDocsMap.get(app.id) || [];
        const analyses = [...(analysisMap.get(app.id) || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const courseNos = [...new Set([
          ...diplomaCourses.map((course) => course.course_no),
          ...degreeCourses.map((course) => course.course_no),
        ])].sort((a, b) => a - b);

        return {
          idPermohonan: `REQ${String(totalAppCount - index).padStart(3, '0')}`,
          idPermohonanAsal: app.id,
          courses: courseNos.map((courseNo, courseIndex) => {
            const diploma = diplomaCourses.find((course) => course.course_no === courseNo) || null;
            const degree = degreeCourses.find((course) => course.course_no === courseNo) || null;
            const analysis = analyses[courseIndex] || null;

            return {
              kursusDiploma: diploma?.course_code || '',
              kodDiploma: diploma?.course_code || '',
              namaDiploma: diploma?.course_name || '',
              kursusSasaran: degree?.course_code || '',
              kodSasaran: degree?.course_code || '',
              namaSasaran: degree?.course_name || '',
              gred: diploma?.grade || '',
              kreditDiploma: Number(diploma?.credit || 0),
              kreditSetara: Number(degree?.credit || 0),
              skorAI: analysis?.similarity_score ?? 0,
            };
          }),
          statusPermohonan: app.status === 'approved'
            ? 'Lulus'
            : app.status === 'rejected'
              ? 'Tolak'
              : app.status === 'submitted'
                ? 'Menunggu Kelulusan KP'
                : 'Menunggu Analisis',
          tarikhHantar: app.submitted_at || app.created_at,
          skorAI: analyses[0]?.similarity_score ?? 0,
          maklumatPeibadi: {
            noMatrik: studentRow?.matric_no || user?.namaPengguna || '-',
            nama: studentRow?.full_name || user?.namaPengguna || '-',
            fakulti: studentRow?.faculty || '-',
            program: studentRow?.program || '-',
          },
          supportDocuments,
          courseDocuments,
        };
      });

      setApplications(formattedApplications);
    } catch (fetchError) {
      setError(fetchError.message || 'Gagal memuatkan permohonan pelajar');
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.namaPengguna]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const totalApplications = applications.length;
  const successfulApps = applications.filter(a => a.statusPermohonan === 'Lulus').length;
  const pendingApps = applications.filter(a => a.statusPermohonan === 'Menunggu Analisis' || a.statusPermohonan === 'Menunggu Kelulusan KP').length;

  const summaryText = useMemo(() => {
    if (loading) {
      return 'Memuatkan permohonan...';
    }

    if (error) {
      return error;
    }

    return applications.length > 0 ? '' : 'Tiada permohonan ditemui. Hantar borang pemindahan kredit untuk melihat rekod di sini.';
  }, [loading, error, applications.length]);

  const groupedCoursePairs = useMemo(() => {
    if (!selectedApplication?.courses?.length) {
      return [];
    }

    const groupMap = new Map();

    selectedApplication.courses.forEach((course) => {
      const degreeCode = String(course.kodSasaran || '').trim();
      const degreeName = String(course.namaSasaran || '').trim();
      const groupKey = degreeCode || degreeName || `group-${course.kodDiploma || Math.random()}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          key: groupKey,
          degreeCode,
          degreeName,
          degreeCredit: course.kreditSetara || 0,
          rows: [],
        });
      }

      groupMap.get(groupKey).rows.push(course);
    });

    return Array.from(groupMap.values()).map((group) => ({
      ...group,
      rows: [...group.rows],
    }));
  }, [selectedApplication]);

  const getRequestedDegreeCourseCount = (courses = []) => {
    const seenDegreeKeys = new Set();

    return courses.reduce((count, course) => {
      const degreeCode = String(course?.kodSasaran || '').trim();
      const degreeName = String(course?.namaSasaran || '').trim();
      const degreeKey = degreeCode || degreeName;

      if (!degreeKey || seenDegreeKeys.has(degreeKey)) {
        return count;
      }

      seenDegreeKeys.add(degreeKey);
      return count + 1;
    }, 0);
  };

  const totalKreditSetaraUnique = useMemo(
    () => groupedCoursePairs.reduce((sum, group) => sum + Number(group.degreeCredit || 0), 0),
    [groupedCoursePairs],
  );

  const getStatusBadge = (status) => {
    const variants = {
      'Menunggu Analisis': 'warning',
      'Lulus': 'success',
      'Tolak': 'danger',
      'Setara Bersyarat': 'info',
      'Menunggu Kelulusan KP': 'info',
    };
    return <Badge bg={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const handleViewDetail = (app) => {
    setSelectedApplication(app);
    setShowDetailModal(true);
  };

  const handleOfficialFormSubmit = () => {
    loadApplications();
    setShowOfficialForm(false);
  };

  return (
    <Container className="py-4 py-md-5" style={{ marginTop: '25rem' }}>
      <Row className="mb-4">
        <Col>
          <h1>Papan Pemuka Pelajar</h1>
          <p className="text-muted">Selamat datang, {user?.namaPengguna}</p>
          {summaryText && <Alert variant={error ? 'danger' : 'info'} className="mt-3 mb-0">{summaryText}</Alert>}
        </Col>
      </Row>
      <Row className="mb-4 g-2 g-md-3">
        <Col xs={12} md={4}>
          <Card className="text-center p-3 p-md-4 cursor-pointer hover-shadow h-100">
            <i className="bi bi-file-text text-secondary" style={{ fontSize: '2rem' }}></i>
            <Card.Title className="mt-2 mt-md-3 fs-6">Permohonan Pemindahan Kredit</Card.Title>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowOfficialForm(true)}
              className="mt-2"
            >
              Isi
            </Button>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="text-center p-3 p-md-4 cursor-pointer hover-shadow h-100">
            <i className="bi bi-chat-dots text-success" style={{ fontSize: '2rem' }}></i>
            <Card.Title className="mt-2 mt-md-3 fs-6">AI Chatbot</Card.Title>
            <Button
              variant="success"
              size="sm"
              onClick={() => setShowChatBot(true)}
              className="mt-2"
            >
              Tanya
            </Button>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="text-center p-3 p-md-4 cursor-pointer hover-shadow h-100">
            <i className="bi bi-graph-up text-warning" style={{ fontSize: '2rem' }}></i>
            <Card.Title className="mt-2 mt-md-3 fs-6">Statistik</Card.Title>
            <div className="mt-2">
              <Badge bg="success">{successfulApps} Lulus</Badge>
              <Badge bg="warning" className="ms-1">{pendingApps} Proses</Badge>
            </div>
          </Card>
        </Col>
      </Row>
      <Row className="mb-4 g-2 g-md-3">
        <Col xs={12} md={4}>
          <Card className="border-0 bg-primary bg-opacity-10">
            <Card.Body>
              <h5 className="text-primary">Jumlah Permohonan</h5>
              <h2 className="text-primary">{totalApplications}</h2>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="border-0 bg-warning bg-opacity-10">
            <Card.Body>
              <h5 className="text-warning">Dalam Proses</h5>
              <h2 className="text-warning">{pendingApps}</h2>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="border-0 bg-success bg-opacity-10">
            <Card.Body>
              <h5 className="text-success">Diluluskan</h5>
              <h2 className="text-success">{successfulApps}</h2>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Header>
              <Card.Title className="mb-0">Senarai Permohonan Saya</Card.Title>
            </Card.Header>
            <Card.Body className="p-0">
              {loading ? (
                <div className="p-4 text-center text-muted">
                  <Spinner animation="border" size="sm" className="me-2" />
                  Memuatkan permohonan saya...
                </div>
              ) : applications.length === 0 ? (
                <div className="p-3 text-muted">Tiada permohonan ditemui</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>ID Permohonan</th>
                        <th>Bilangan Kursus</th>
                        <th>Status</th>
                        <th>Tarikh Hantar</th>
                        <th>Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((app) => (
                        <tr key={app.idPermohonanAsal}>
                          <td className="fw-bold">{app.idPermohonan}</td>
                          <td>
                            <Badge bg="info">{getRequestedDegreeCourseCount(app.courses)} Kursus Degree</Badge>
                          </td>
                          <td>{getStatusBadge(app.statusPermohonan)}</td>
                          <td>{formatMalaysiaDateTime(app.tarikhHantar)}</td>
                          <td>
                            <Button 
                              variant="outline-primary" 
                              size="sm"
                              onClick={() => handleViewDetail(app)}
                            >
                              Detail
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <Modal show={showDetailModal} onHide={() => setShowDetailModal(false)} size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Detail Permohonan {selectedApplication?.idPermohonan}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedApplication && (
            <>
              <div className="mb-4 p-3 bg-light rounded">
                <h6 className="text-primary fw-bold mb-3">📋 Maklumat Permohonan</h6>
                <Row>
                  <Col md={6}>
                    <p className="mb-2">
                      <strong>ID Permohonan:</strong>
                      <br />
                      <span className="badge bg-primary">{selectedApplication.idPermohonan}</span>
                    </p>
                  </Col>
                  <Col md={6}>
                    <p className="mb-2">
                      <strong>Status:</strong>
                      <br />
                      {getStatusBadge(selectedApplication.statusPermohonan)}
                    </p>
                  </Col>
                </Row>
                <Row>
                  <Col md={6}>
                    <p className="mb-2">
                      <strong>Tarikh Hantar:</strong>
                      <br />
                      {formatMalaysiaDateTime(selectedApplication.tarikhHantar)}
                    </p>
                  </Col>
                  <Col md={6}>
                    <p className="mb-0">
                      <strong>Bilangan Kursus:</strong>
                      <br />
                      {getRequestedDegreeCourseCount(selectedApplication.courses)} kursus degree
                    </p>
                  </Col>
                </Row>
              </div>

              <div className="mb-4">
                <h6 className="text-success fw-bold mb-3">📚 Senarai Pasangan Kursus</h6>
                <div className="table-responsive">
                  <Table hover bordered size="sm">
                    <thead className="table-light">
                      <tr>
                        <th className="text-center">No.</th>
                        <th>Kursus Diploma</th>
                        <th className="text-center">Gred</th>
                        <th className="text-center">Kredit</th>
                        <th>Kursus Setara</th>
                        <th className="text-center">Kredit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedCoursePairs.length > 0 ? (
                        groupedCoursePairs.flatMap((group) =>
                          group.rows.map((course, rowIndex) => (
                            <tr key={`${group.key}-${course.kodDiploma || rowIndex}`}>
                              <td className="text-center fw-bold">{rowIndex + 1}</td>
                              <td>
                                <div>
                                  <strong>{course.kodDiploma}</strong>
                                  <br />
                                  <small className="text-muted">{course.namaDiploma}</small>
                                </div>
                              </td>
                              <td className="text-center">{course.gred || '-'}</td>
                              <td className="text-center">
                                <Badge bg="info">{course.kreditDiploma || 0}</Badge>
                              </td>
                              {rowIndex === 0 && (
                                <>
                                  <td rowSpan={group.rows.length} className="align-middle">
                                    <div>
                                      <strong>{group.degreeCode || '-'}</strong>
                                      <br />
                                      <small className="text-muted">{group.degreeName || '-'}</small>
                                    </div>
                                  </td>
                                  <td rowSpan={group.rows.length} className="text-center align-middle">
                                    <Badge bg="success">{group.degreeCredit || 0}</Badge>
                                  </td>
                                </>
                              )}
                            </tr>
                          )),
                        )
                      ) : (
                        <tr>
                          <td colSpan="6" className="text-center text-muted">
                            Tiada data kursus ditemui.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </div>
                <div className="border-top pt-3">
                  <Row>
                    <Col md={6}>
                      <p className="mb-0">
                        <strong>Total Kredit Diploma:</strong>
                        <br />
                        <Badge bg="info">
                          {selectedApplication.courses.reduce((sum, c) => sum + (c.kreditDiploma || 0), 0)} Kredit
                        </Badge>
                      </p>
                    </Col>
                    <Col md={6}>
                      <p className="mb-0">
                        <strong>Total Kredit Setara:</strong>
                        <br />
                        <Badge bg="success">
                          {totalKreditSetaraUnique} Kredit
                        </Badge>
                      </p>
                    </Col>
                  </Row>
                </div>
              </div>

              {selectedApplication.maklumatPeibadi && (
                <div className="p-3 bg-info bg-opacity-10 rounded">
                  <h6 className="text-info fw-bold mb-3">👤 Maklumat Peribadi Pelajar</h6>
                  <Row>
                    <Col md={6}>
                      <p className="mb-2">
                        <strong>No. Matrik:</strong> {selectedApplication.maklumatPeibadi.noMatrik}
                      </p>
                    </Col>
                    <Col md={6}>
                      <p className="mb-2">
                        <strong>Nama:</strong> {selectedApplication.maklumatPeibadi.nama}
                      </p>
                    </Col>
                  </Row>
                  <Row>
                    <Col md={6}>
                      <p className="mb-2">
                        <strong>Fakulti:</strong> {selectedApplication.maklumatPeibadi.fakulti}
                      </p>
                    </Col>
                    <Col md={6}>
                      <p className="mb-0">
                        <strong>Program:</strong> {selectedApplication.maklumatPeibadi.program}
                      </p>
                    </Col>
                  </Row>
                </div>
              )}
            </>
          )}
        </Modal.Body>
      </Modal>
      
      <Modal show={showCourseForm} onHide={() => setShowCourseForm(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Buat Permohonan Kursus (Berbilang)</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <CourseRequestForm />
        </Modal.Body>
      </Modal>

      <Modal show={showDocUpload} onHide={() => setShowDocUpload(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Muat Naik Dokumen Kursus</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <DocumentUpload />
        </Modal.Body>
      </Modal>

      <Modal show={showOfficialForm} onHide={() => setShowOfficialForm(false)} size="xl" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Borang Permohonan Pemindahan Kredit Secara Menegak</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <OfficialApplicationForm onSubmit={handleOfficialFormSubmit} />
        </Modal.Body>
      </Modal>

      <Modal show={showChatBot} onHide={() => setShowChatBot(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>AI Chatbot - Pertanyaan</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ChatBot />
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default StudentDashboard;
