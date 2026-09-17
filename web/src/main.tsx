import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell, HomeRedirect } from "./App";
import { AdminPage } from "./pages/Admin";
import { DispatchPage } from "./pages/Dispatch";
import { LoginPage } from "./pages/Login";
import { RadioPage } from "./pages/Radio";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/radio" element={<RadioPage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/dispatch" element={<DispatchPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </>,
);
