import React, { useState } from 'react';
import { Form, Button, Alert, ProgressBar } from 'react-bootstrap';

const DocumentUpload = () => {
  const [selectedApplication, setSelectedApplication] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [success, setSuccess] = useState(false);

  const handleApplicationChange = (e) => {
    setSelectedApplication(e.target.value);
  };

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    setFiles([...files, ...newFiles]);
  };

  const handleRemoveFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    if (!selectedApplication || files.length === 0) {
      alert('Sila pilih permohonan dan muat naik sekurang-kurangnya satu dokumen');
      return;
    }

    setUploading(true);
    for (let i = 0; i <= 100; i += 10) {
      setUploadProgress(i);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setUploading(false);
    setSuccess(true);
    setFiles([]);
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <Form onSubmit={handleUpload}>
      {success && (
        <Alert variant="success">
          Dokumen berjaya dimuat naik! Tim anda akan dimaklumkan.
        </Alert>
      )}

      <Form.Group className="mb-3">
        <Form.Label>Pilih Permohonan</Form.Label>
        <Form.Select
          value={selectedApplication}
          onChange={handleApplicationChange}
          required
        >
          <option value="">Pilih Permohonan</option>
          <option value="REQ001">REQ001 - Asas Pengaturcaraan</option>
          <option value="REQ002">REQ002 - Struktur Data</option>
        </Form.Select>
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Muat Naik Dokumen</Form.Label>
        <Form.Control
          type="file"
          multiple
          onChange={handleFileChange}
          disabled={uploading}
          accept=".pdf,.doc,.docx"
        />
        <Form.Text>Terima: PDF, DOC, DOCX (Maksimum 5MB setiap fail)</Form.Text>
      </Form.Group>

      {files.length > 0 && (
        <div className="mb-3">
          <h6>Fail yang dipilih:</h6>
          <ul className="list-group">
            {files.map((file, index) => (
              <li
                key={index}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <span>
                  <i className="bi bi-file-pdf me-2"></i>
                  {file.name}
                </span>
                <Button
                  variant="sm"
                  size="sm"
                  onClick={() => handleRemoveFile(index)}
                  disabled={uploading}
                >
                  Buang
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {uploading && (
        <div className="mb-3">
          <p>Sedang memuat naik... {uploadProgress}%</p>
          <ProgressBar now={uploadProgress} />
        </div>
      )}

      <div className="d-flex gap-2">
        <Button
          variant="primary"
          type="submit"
          disabled={uploading || files.length === 0}
        >
          {uploading ? 'Sedang Memuat Naik...' : 'Muat Naik Dokumen'}
        </Button>
        <Button
          variant="secondary"
          disabled={uploading}
          onClick={() => setFiles([])}
        >
          Kosongkan
        </Button>
      </div>
    </Form>
  );
};

export default DocumentUpload;
