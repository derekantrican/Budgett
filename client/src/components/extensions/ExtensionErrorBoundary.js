import React from 'react';

// Extensions are arbitrary, self-authored code — a render error in one shouldn't take down the
// whole Extensions tab. Must be a class component; error boundaries have no hooks equivalent.
class ExtensionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Extension render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="text-center text-muted" style={{ padding: '64px 16px' }}>
          <p>This extension failed to render: {this.state.error.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ExtensionErrorBoundary;
