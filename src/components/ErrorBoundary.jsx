import React from 'react';
import { Alert, Container } from 'react-bootstrap';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container className="py-4">
          <Alert variant="danger">
            <h4>Ralat Semasa Memuatkan Halaman</h4>
            <p>
              {this.state.error && this.state.error.toString()}
            </p>
            {process.env.NODE_ENV === 'development' && (
              <details style={{ whiteSpace: 'pre-wrap', marginTop: '1rem', fontSize: '0.85rem' }}>
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </details>
            )}
            <button 
              onClick={() => window.location.reload()} 
              className="btn btn-primary mt-2"
            >
              Muat Semula Halaman
            </button>
          </Alert>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
