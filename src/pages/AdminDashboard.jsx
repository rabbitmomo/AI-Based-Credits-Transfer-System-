import React, { useState } from 'react';
import { Container, Row, Col, Card, Button, Badge, Modal, Form, Nav, Tab } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([
    {
      idPengguna: 'USR001',
      namaPengguna: 'Ahmad',
      emel: 'pelajar@demo.com',
      peranan: 'Pelajar',
      statusAkaun: 'Aktif',
    },
    {
      idPengguna: 'USR002',
      namaPengguna: 'Siti',
      emel: 'kp@demo.com',
      peranan: 'Ketua Program',
      statusAkaun: 'Aktif',
    },
  ]);

  const [courses, setCourses] = useState([
    {
      idKursus: 'CRS001',
      kodKursus: 'DIP-CS101',
      namaKursus: 'Asas Pengaturcaraan',
      tahapKursus: 'Diploma',
      jamKredit: 3,
    },
  ]);

  const [showUserModal, setShowUserModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [formData, setFormData] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleAddUser = () => {
    setFormData({});
    setShowUserModal(true);
  };

  const handleSaveUser = () => {
    if (formData.idPengguna) {
      setUsers(
        users.map((u) =>
          u.idPengguna === formData.idPengguna ? formData : u
        )
      );
    } else {
      setUsers([...users, { ...formData, idPengguna: 'USR' + Date.now() }]);
    }
    setShowUserModal(false);
  };

  const handleDeleteUser = (idPengguna) => {
    setUsers(users.filter((u) => u.idPengguna !== idPengguna));
  };

  const handleAddCourse = () => {
    setFormData({});
    setShowCourseModal(true);
  };

  const handleSaveCourse = () => {
    if (formData.idKursus) {
      setCourses(
        courses.map((c) =>
          c.idKursus === formData.idKursus ? formData : c
        )
      );
    } else {
      setCourses([...courses, { ...formData, idKursus: 'CRS' + Date.now() }]);
    }
    setShowCourseModal(false);
  };

  const handleDeleteCourse = (idKursus) => {
    setCourses(courses.filter((c) => c.idKursus !== idKursus));
  };

  const getStatusBadge = (status) => {
    return (
      <Badge bg={status === 'Aktif' ? 'success' : 'danger'}>
        {status}
      </Badge>
    );
  };

  return (
    <Container fluid className="py-5">
      <Row className="mb-4">
        <Col>
          <h1>Papan Pemuka Pentadbir Sistem</h1>
          <p className="text-muted">Selamat datang, {user?.namaPengguna}</p>
        </Col>
      </Row>
      <Row className="mb-4">
        <Col md={3}>
          <Card className="text-center p-4">
            <h3 className="text-primary">{users.length}</h3>
            <p className="text-muted">Jumlah Pengguna</p>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center p-4">
            <h3 className="text-success">{courses.length}</h3>
            <p className="text-muted">Jumlah Kursus</p>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center p-4">
            <h3 className="text-warning">5</h3>
            <p className="text-muted">Permohonan Pending</p>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center p-4">
            <h3 className="text-info">12</h3>
            <p className="text-muted">Keputusan Hari Ini</p>
          </Card>
        </Col>
      </Row>
      <Tab.Container defaultActiveKey="users">
        <Nav variant="pills" className="mb-4">
          <Nav.Item>
            <Nav.Link eventKey="users">Pengurusan Pengguna</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="courses">Pengurusan Kursus</Nav.Link>
          </Nav.Item>
          {/* <Nav.Item>
            <Nav.Link eventKey="system">Tetapan Sistem</Nav.Link>
          </Nav.Item> */}
        </Nav>

        <Tab.Content>
          <Tab.Pane eventKey="users">
            <Card>
              <Card.Header className="d-flex justify-content-between align-items-center">
                <Card.Title className="mb-0">Pengguna Sistem</Card.Title>
                <Button variant="success" size="sm" onClick={handleAddUser}>
                  <i className="bi bi-plus-lg"></i> Tambah Pengguna
                </Button>
              </Card.Header>
              <Card.Body>
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Nama</th>
                        <th>Emel</th>
                        <th>Peranan</th>
                        <th>Status</th>
                        <th>Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.idPengguna}>
                          <td>{user.idPengguna}</td>
                          <td>{user.namaPengguna}</td>
                          <td>{user.emel}</td>
                          <td>{user.peranan}</td>
                          <td>{getStatusBadge(user.statusAkaun)}</td>
                          <td>
                            <Button
                              variant="info"
                              size="sm"
                              className="me-2"
                              onClick={() => {
                                setFormData(user);
                                setShowUserModal(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                handleDeleteUser(user.idPengguna)
                              }
                            >
                              Padam
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card.Body>
            </Card>
          </Tab.Pane>
          <Tab.Pane eventKey="courses">
            <Card>
              <Card.Header className="d-flex justify-content-between align-items-center">
                <Card.Title className="mb-0">Kursus Sistem</Card.Title>
                <Button variant="success" size="sm" onClick={handleAddCourse}>
                  <i className="bi bi-plus-lg"></i> Tambah Kursus
                </Button>
              </Card.Header>
              <Card.Body>
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Kod</th>
                        <th>Nama Kursus</th>
                        <th>Tahap</th>
                        <th>Jam Kredit</th>
                        <th>Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((course) => (
                        <tr key={course.idKursus}>
                          <td>{course.idKursus}</td>
                          <td>{course.kodKursus}</td>
                          <td>{course.namaKursus}</td>
                          <td>{course.tahapKursus}</td>
                          <td>{course.jamKredit}</td>
                          <td>
                            <Button
                              variant="info"
                              size="sm"
                              className="me-2"
                              onClick={() => {
                                setFormData(course);
                                setShowCourseModal(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                handleDeleteCourse(course.idKursus)
                              }
                            >
                              Padam
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card.Body>
            </Card>
          </Tab.Pane>
          {/* <Tab.Pane eventKey="system">
            <Card>
              <Card.Header>
                <Card.Title>Tetapan Sistem</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form>
                  <Form.Group className="mb-3">
                    <Form.Label>Nama Institusi</Form.Label>
                    <Form.Control
                      type="text"
                      defaultValue="Fakulti Teknologi dan Sains Maklumat (FTSM)"
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Email Pentadbir</Form.Label>
                    <Form.Control
                      type="email"
                      defaultValue="admin@ftsm.edu.my"
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Masa Tunggu Analisis AI (Hari)</Form.Label>
                    <Form.Control type="number" defaultValue="3" />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Check
                      type="checkbox"
                      label="Aktifkan Pemberitahuan Email"
                      defaultChecked
                    />
                  </Form.Group>

                  <Button variant="primary">Simpan Tetapan</Button>
                </Form>
              </Card.Body>
            </Card>
          </Tab.Pane> */}
        </Tab.Content>
      </Tab.Container>
      <Modal show={showUserModal} onHide={() => setShowUserModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            {formData.idPengguna ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Nama Pengguna</Form.Label>
              <Form.Control
                type="text"
                name="namaPengguna"
                value={formData.namaPengguna || ''}
                onChange={handleInputChange}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Emel</Form.Label>
              <Form.Control
                type="email"
                name="emel"
                value={formData.emel || ''}
                onChange={handleInputChange}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Peranan</Form.Label>
              <Form.Select
                name="peranan"
                value={formData.peranan || ''}
                onChange={handleInputChange}
              >
                <option value="">Pilih Peranan</option>
                <option value="Pelajar">Pelajar</option>
                <option value="Ketua Program">Ketua Program</option>
                <option value="Pentadbir">Pentadbir</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Status Akaun</Form.Label>
              <Form.Select
                name="statusAkaun"
                value={formData.statusAkaun || ''}
                onChange={handleInputChange}
              >
                <option value="Aktif">Aktif</option>
                <option value="Tidak Aktif">Tidak Aktif</option>
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowUserModal(false)}
          >
            Batal
          </Button>
          <Button variant="primary" onClick={handleSaveUser}>
            Simpan
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal show={showCourseModal} onHide={() => setShowCourseModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            {formData.idKursus ? 'Edit Kursus' : 'Tambah Kursus Baru'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Kod Kursus</Form.Label>
              <Form.Control
                type="text"
                name="kodKursus"
                value={formData.kodKursus || ''}
                onChange={handleInputChange}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Nama Kursus</Form.Label>
              <Form.Control
                type="text"
                name="namaKursus"
                value={formData.namaKursus || ''}
                onChange={handleInputChange}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Tahap Kursus</Form.Label>
              <Form.Select
                name="tahapKursus"
                value={formData.tahapKursus || ''}
                onChange={handleInputChange}
              >
                <option value="">Pilih Tahap</option>
                <option value="Diploma">Diploma</option>
                <option value="Ijazah">Ijazah</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Jam Kredit</Form.Label>
              <Form.Control
                type="number"
                name="jamKredit"
                value={formData.jamKredit || ''}
                onChange={handleInputChange}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowCourseModal(false)}
          >
            Batal
          </Button>
          <Button variant="primary" onClick={handleSaveCourse}>
            Simpan
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default AdminDashboard;
