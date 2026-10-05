import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { httpApi } from "./api";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing");
createRoot(root).render(
    <StrictMode>
        <App api={httpApi(import.meta.env.VITE_API_URL ?? "http://localhost:3000")} />
    </StrictMode>,
);
