import React, { useState, useRef, useEffect } from 'react';
import { Form, Button, Card, Row, Col } from 'react-bootstrap';

const ChatBot = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: 'Assalamualaikum! Saya AI Chatbot Sistem Penilaian Kesetaraan Kursus. Bagaimana saya boleh membantu anda?',
      sender: 'bot',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();

    if (!inputValue.trim()) return;
    const userMessage = {
      id: messages.length + 1,
      text: inputValue,
      sender: 'user',
    };

    setMessages([...messages, userMessage]);
    setInputValue('');
    setLoading(true);
    setTimeout(() => {
      const responses = [
        'Untuk memohon kursus, sila ke bahagian "Mohon Kursus" di papan pemuka anda.',
        'Status kesetaraan kursus anda sedang dianalisis oleh sistem AI kami. Sila tunggu beberapa hari untuk keputusan.',
        'Anda boleh memuat naik dokumen kursus melalui fungsi "Muat Naik Dokumen" di halaman permohonan anda.',
        'Jika permohonan anda ditolak, anda boleh membuat permohonan baharu dengan maklumat yang lebih lengkap.',
      ];

      const randomResponse = responses[Math.floor(Math.random() * responses.length)];

      const botMessage = {
        id: messages.length + 2,
        text: randomResponse,
        sender: 'bot',
      };

      setMessages((prevMessages) => [...prevMessages, botMessage]);
      setLoading(false);
    }, 1000);
  };

  const suggestedQuestions = [
    'Bagaimana cara memohon kursus?',
    'Berapa lama proses analisis?',
    'Dokumen apa yang diperlukan?',
    'Bagaimana jika permohonan ditolak?',
  ];

  return (
    <div>
      <Card className="mb-3" style={{ height: '400px', overflowY: 'auto' }}>
        <Card.Body>
          {messages.map((message) => (
            <Row key={message.id} className="mb-3">
              <Col md={10} className={message.sender === 'user' ? 'ms-auto' : ''}>
                <div
                  className={`p-2 rounded ${
                    message.sender === 'user'
                      ? 'bg-primary text-white'
                      : 'bg-light text-dark'
                  }`}
                >
                  {message.text}
                </div>
              </Col>
            </Row>
          ))}
          {loading && (
            <Row className="mb-3">
              <Col md={10}>
                <div className="p-2 rounded bg-light text-dark">
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Sedang menjawab...
                </div>
              </Col>
            </Row>
          )}
          <div ref={messagesEndRef} />
        </Card.Body>
      </Card>

      <Form onSubmit={handleSendMessage} className="mb-3">
        <Form.Group>
          <div className="input-group">
            <Form.Control
              type="text"
              placeholder="Ketik soalan anda..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={loading}
            />
            <Button
              variant="primary"
              type="submit"
              disabled={loading || !inputValue.trim()}
            >
              <i className="bi bi-send"></i>
            </Button>
          </div>
        </Form.Group>
      </Form>

      <div className="mb-3">
        <p className="small text-muted mb-2">Soalan yang sering ditanya:</p>
        <div className="d-flex flex-wrap gap-2">
          {suggestedQuestions.map((q, idx) => (
            <Button
              key={idx}
              variant="outline-secondary"
              size="sm"
              onClick={() => {
                setInputValue(q);
              }}
            >
              {q}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatBot;
