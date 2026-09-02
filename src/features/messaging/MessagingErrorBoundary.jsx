import { Component } from 'react';

export default class MessagingErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return this.props.fallback || (
      <section className="panel messaging-error" role="alert">
        <h2>Messagerie temporairement indisponible</h2>
        <p>Le budget continue de fonctionner normalement.</p>
        <button className="secondary-button" type="button" onClick={this.reset}>
          Réessayer la messagerie
        </button>
      </section>
    );
  }
}
