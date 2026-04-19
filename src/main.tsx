import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* GitHub Pages 호환을 위해 HashRouter 사용 */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
