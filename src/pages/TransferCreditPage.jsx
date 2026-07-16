import React from 'react';
import { Container, Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import OfficialApplicationForm from '../components/OfficialApplicationForm';

const TransferCreditPage = () => {
  const navigate = useNavigate();

  return (
    <Container className="py-4 py-md-5">
      <div aria-hidden="true" style={{ width: '100%', height: '5rem' }} />
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
        <div>
          <h2 className="mb-1">Borang Permohonan Pemindahan Kredit Secara Menegak</h2>
          <p className="text-muted mb-0">Halaman khas untuk semakan, pengisian, dan analisis kursus.</p>
        </div>
        <Button variant="outline-secondary" onClick={() => navigate('/student-dashboard')}>
          Kembali ke Papan Pemuka
        </Button>
      </div>

      <Card className="shadow-sm border-0">
        <Card.Body>
          <OfficialApplicationForm />
        </Card.Body>
      </Card>
    </Container>
  );
};

export default TransferCreditPage;