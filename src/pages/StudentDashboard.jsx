import React, { useRef, useState } from 'react';
import { Container, Row, Col, Card, Button, Badge, Modal, ListGroup, Tabs, Tab, Table } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import CourseRequestForm from '../components/CourseRequestForm';
import DocumentUpload from '../components/DocumentUpload';
import ChatBot from '../components/ChatBot';
import OfficialApplicationForm from '../components/OfficialApplicationForm';
import ErrorBoundary from '../components/ErrorBoundary';

const StudentDashboard = () => {
  const { user } = useAuth();
  const [applications] = useState([
    {
      idPermohonan: 'REQ001',
      courses: [
        {
          kursusDiploma: 'DIP-CS101',
          kodDiploma: 'DIP-CS101',
          namaDiploma: 'Asas Pengaturcaraan',
          kursusSasaran: 'DEG-CS201',
          kodSasaran: 'DEG-CS201',
          namaSasaran: 'Pengaturcaraan Lanjutan',
        },
        {
          kursusDiploma: 'DIP-CS102',
          kodDiploma: 'DIP-CS102',
          namaDiploma: 'Struktur Data',
          kursusSasaran: 'DEG-CS202',
          kodSasaran: 'DEG-CS202',
          namaSasaran: 'Algoritma & Kerumitan',
        },
      ],
      statusPermohonan: 'Menunggu Analisis',
      tarikhHantar: '2024-01-15',
      skorAI: 0.85,
    },
  ]);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [showChatBot, setShowChatBot] = useState(false);
  const [showTransferCreditForm, setShowTransferCreditForm] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const transferCreditRef = useRef(null);

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

  const totalApplications = applications.length;
  const successfulApps = applications.filter(a => a.statusPermohonan === 'Lulus').length;
  const pendingApps = applications.filter(a => a.statusPermohonan === 'Menunggu Analisis' || a.statusPermohonan === 'Menunggu Kelulusan KP').length;

  return (
    <Container className="py-4 py-md-5">
      <Row className="mb-4">
        <Col>
          <h1>Papan Pemuka Pelajar</h1>
          <p className="text-muted">Selamat datang, {user?.namaPengguna}</p>
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
              onClick={() => {
                setShowTransferCreditForm(true);
                setTimeout(() => {
                  transferCreditRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 0);
              }}
              className="mt-2"
            >
              Buka Borang
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

      {showTransferCreditForm && (
        <Row className="mt-4 mb-4 pt-2" ref={transferCreditRef}>
          <Col>
            <Card className="shadow-sm border-primary">
              <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                <Card.Title className="mb-0">Borang Permohonan Pemindahan Kredit Secara Menegak</Card.Title>
                <Button
                  variant="light"
                  size="sm"
                  onClick={() => setShowTransferCreditForm(false)}
                >
                  Tutup
                </Button>
              </Card.Header>
              <Card.Body style={{ 
                maxHeight: '75vh', 
                overflowY: 'scroll',
                overflowX: 'hidden',
                scrollBehavior: 'smooth'
              }}>
                <ErrorBoundary>
                  <OfficialApplicationForm />
                </ErrorBoundary>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Header>
              <Card.Title className="mb-0">Senarai Permohonan Saya</Card.Title>
            </Card.Header>
            <Card.Body className="p-0">
              {applications.length === 0 ? (
                <div className="p-3 text-muted">Tiada permohonan</div>
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
                        <tr key={app.idPermohonan}>
                          <td className="fw-bold">{app.idPermohonan}</td>
                          <td>
                            <Badge bg="info">{app.courses.length} Kursus</Badge>
                          </td>
                          <td>{getStatusBadge(app.statusPermohonan)}</td>
                          <td>{app.tarikhHantar}</td>
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
                      {selectedApplication.tarikhHantar}
                    </p>
                  </Col>
                  <Col md={6}>
                    <p className="mb-0">
                      <strong>Bilangan Kursus:</strong>
                      <br />
                      {selectedApplication.courses.length} kursus
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
                      {selectedApplication.courses.map((course, idx) => (
                        <tr key={idx}>
                          <td className="text-center fw-bold">{idx + 1}</td>
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
                          <td>
                            <div>
                              <strong>{course.kodSasaran}</strong>
                              <br />
                              <small className="text-muted">{course.namaSasaran}</small>
                            </div>
                          </td>
                          <td className="text-center">
                            <Badge bg="success">{course.kreditSetara || 0}</Badge>
                          </td>
                        </tr>
                      ))}
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
                          {selectedApplication.courses.reduce((sum, c) => sum + (c.kreditSetara || 0), 0)} Kredit
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
