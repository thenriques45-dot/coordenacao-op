import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { hidratarEstadoUi, iniciarEspelhamentoEstadoUi } from "./features/persistentState";
import "./styles.css";

async function iniciar() {
  await hidratarEstadoUi();
  iniciarEspelhamentoEstadoUi();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void iniciar();
