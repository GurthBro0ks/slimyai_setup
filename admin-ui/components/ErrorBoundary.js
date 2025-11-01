import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError: false, err: null }; }
  static getDerivedStateFromError(err){ return { hasError: true, err }; }
  componentDidCatch(err, info){ console.error("ErrorBoundary:", err, info); }
  render(){
    if (this.state.hasError) {
      return (
        <div style={{ padding:"1rem", border:"1px solid rgba(255,255,255,.2)", borderRadius:12 }}>
          <div style={{ fontWeight:700, marginBottom: ".5rem" }}>Something went wrong.</div>
          <div style={{ opacity:.8, fontSize: ".9rem" }}>
            The section failed to render. Try reloading. If this persists, check API logs.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
