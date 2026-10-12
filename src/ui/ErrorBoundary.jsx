import React from "react";
export default class ErrorBoundary extends React.Component {
  state={error:null};
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error){console.error("Rink GM screen error",error);}
  render(){return this.state.error?<div className="panel stack"><h2>This screen could not load</h2><p>Your league is still available. Return to the dashboard, then export a backup in Settings.</p><p className="muted small">{this.state.error.message}</p><button onClick={this.props.onHome}>Return to dashboard</button></div>:this.props.children;}
}
