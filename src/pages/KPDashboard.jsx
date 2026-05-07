import React, { useState } from 'react';
import { Container, Row, Col, Card, Button, Badge, Modal, Table } from 'react-bootstrap';

const KPDashboard = () => {
  const [applications] = useState([
    {
      idPermohonan: 'REQ001',
      idPelajar: 'A201001',
      namaPelajar: 'Ahmad bin Hassan',
      fakulti: 'FTSM',
      program: 'Kejuruteraan Perisian',
      courses: [
        {
          kursusDiploma: 'DIP-CS101',
          namaDiploma: 'Asas Pengaturcaraan',
          gred: 'A',
          kreditDiploma: 2,
          kursusSetara: 'CSC3105',
          namaSetara: 'Programming Fundamentals',
          kreditSetara: 3,
          skorKesamaan: 85,
        },
        {
          kursusDiploma: 'DIP-CS102',
          namaDiploma: 'Struktur Data',
          gred: 'B',
          kreditDiploma: 3,
          kursusSetara: 'CSC3106',
          namaSetara: 'Data Structures',
          kreditSetara: 3,
          skorKesamaan: 78,
        },
      ],
      statusPermohonan: 'Menunggu Kelulusan KP',
      tarikhHantar: '2024-01-15',
      dokumentStatus: {
        transkrip: true,
        sinopsis: true,
        bayaran: true,
      },
    },
    {
      idPermohonan: 'REQ002',
      idPelajar: 'A201002',
      namaPelajar: 'Fatimah binti Ali',
      fakulti: 'FTSM',
      program: 'Rangkaian Komputer',
      courses: [
        {
          kursusDiploma: 'DIP-NET101',
          namaDiploma: 'Asas Rangkaian',
          gred: 'A',
          kreditDiploma: 3,
          kursusSetara: 'CSN3104',
          namaSetara: 'Network Fundamentals',
          kreditSetara: 3,
          skorKesamaan: 92,
        },
      ],
      statusPermohonan: 'Belum Dianalisis',
      tarikhHantar: '2024-01-20',
      dokumentStatus: {
        transkrip: true,
        sinopsis: false,
        bayaran: true,
      },
    },
    {
      idPermohonan: 'REQ003',
      idPelajar: 'A201003',
      namaPelajar: 'Muhammad Rizal bin Osman',
      fakulti: 'FTSM',
      program: 'Teknologi Maklumat',
      courses: [
        {
          kursusDiploma: 'DIP-IT201',
          namaDiploma: 'Pengurusan Basis Data',
          gred: 'B',
          kreditDiploma: 2,
          kursusSetara: 'CSC4107',
          namaSetara: 'Database Management',
          kreditSetara: 3,
          skorKesamaan: 72,
        },
      ],
      statusPermohonan: 'Diluluskan',
      tarikhHantar: '2024-01-10',
      dokumentStatus: {
        transkrip: true,
        sinopsis: true,
        bayaran: true,
      },
    },
  ]);

  const [selectedApp, setSelectedApp] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const getStatusBadge = (status) => {
    const variants = {
      'Menunggu Kelulusan KP': 'warning',
      'Belum Dianalisis': 'secondary',
      'Diluluskan': 'success',
      'Ditolak': 'danger',
    };
    return <Badge bg={variants[status] || 'info'}>{status}</Badge>;
  };

  const handleViewDetail = (app) => {
    setSelectedApp(app);
    setShowDetailModal(true);
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
      <Row className="mb-4" style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
        <Col xs={12} md={4}>
          <Card className="stat-card" style={{ textAlign: 'center' }}>
            <Card.Body>
              <h3 style={{ color: '#667eea', marginBottom: '5px' }}>{applications.length}</h3>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Jumlah Permohonan</p>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="stat-card" style={{ textAlign: 'center' }}>
            <Card.Body>
              <h3 style={{ color: '#10b981', marginBottom: '5px' }}>
                {applications.filter((app) => app.statusPermohonan === 'Diluluskan').length}
              </h3>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Diluluskan</p>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="stat-card" style={{ textAlign: 'center' }}>
            <Card.Body>
              <h3 style={{ color: '#f59e0b', marginBottom: '5px' }}>
                {applications.filter((app) => app.statusPermohonan === 'Menunggu Kelulusan KP' || app.statusPermohonan === 'Belum Dianalisis').length}
              </h3>
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
                  {applications.map((app) => (
                    <tr key={app.idPermohonan}>
                      <td style={{ fontWeight: 'bold', color: '#667eea' }}>{app.idPermohonan}</td>
                      <td>{app.idPelajar}</td>
                      <td>{app.namaPelajar}</td>
                      <td>
                        <Badge bg="info">{app.courses.length}</Badge>
                      </td>
                      <td>{getStatusBadge(app.statusPermohonan)}</td>
                      <td>{new Date(app.tarikhHantar).toLocaleDateString('ms-MY')}</td>
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
                  ))}
                </tbody>
              </Table>
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
        <Modal.Body>
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
                      <span>Transkrip Akademik</span>
                    </div>
                  </Col>
                  <Col xs={12} sm={6} md={4} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {selectedApp.dokumentStatus.sinopsis ? (
                        <Badge bg="success" style={{ marginRight: '8px' }}>✓</Badge>
                      ) : (
                        <Badge bg="danger" style={{ marginRight: '8px' }}>✗</Badge>
                      )}
                      <span>Sinopsis Kursus</span>
                    </div>
                  </Col>
                  <Col xs={12} sm={6} md={4} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {selectedApp.dokumentStatus.bayaran ? (
                        <Badge bg="success" style={{ marginRight: '8px' }}>✓</Badge>
                      ) : (
                        <Badge bg="danger" style={{ marginRight: '8px' }}>✗</Badge>
                      )}
                      <span>Resit Bayaran</span>
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
                        <th>Kursus Diploma</th>
                        <th>Nama</th>
                        <th>Gred</th>
                        <th>Kredit</th>
                        <th>Kursus Setara</th>
                        <th>Nama</th>
                        <th>Kredit Setara</th>
                        <th>Skor Kesamaan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedApp.courses.map((course, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 'bold' }}>{course.kursusDiploma}</td>
                          <td>{course.namaDiploma}</td>
                          <td>{course.gred}</td>
                          <td style={{ textAlign: 'center' }}>{course.kreditDiploma}</td>
                          <td style={{ fontWeight: 'bold' }}>{course.kursusSetara}</td>
                          <td>{course.namaSetara}</td>
                          <td style={{ textAlign: 'center' }}>{course.kreditSetara}</td>
                          <td style={{ textAlign: 'center' }}>
                            <Badge
                              bg={course.skorKesamaan >= 80 ? 'success' : 'danger'}
                              style={{ fontSize: '12px' }}
                            >
                              {course.skorKesamaan}%
                            </Badge>
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
                        {selectedApp.courses.reduce((sum, c) => sum + c.kreditDiploma, 0)} Kredit
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#999', fontWeight: 'bold' }}>
                      Jumlah Kredit Setara
                    </label>
                    <p style={{ margin: 0 }}>
                      <Badge bg="success" style={{ fontSize: '14px', padding: '6px 10px' }}>
                        {selectedApp.courses.reduce((sum, c) => sum + c.kreditSetara, 0)} Kredit
                      </Badge>
                    </p>
                  </div>
                </div>
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
                      {new Date(selectedApp.tarikhHantar).toLocaleDateString('ms-MY')}
                    </p>
                  </Col>
                </Row>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDetailModal(false)}>
            Tutup
          </Button>
          {selectedApp && (selectedApp.statusPermohonan === 'Menunggu Kelulusan KP' || selectedApp.statusPermohonan === 'Belum Dianalisis') && (
            <>
              <Button variant="danger" style={{ marginLeft: '10px' }}>
                <i className="bi bi-x-circle" style={{ marginRight: '5px' }} />
                Tolak
              </Button>
              <Button variant="success">
                <i className="bi bi-check-circle" style={{ marginRight: '5px' }} />
                Luluskan
              </Button>
            </>
          )}
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default KPDashboard;
