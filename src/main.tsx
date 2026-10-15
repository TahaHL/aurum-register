import ViewSwitcher from "./components/view-switcher";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MarketsProvider } from "./components/metal-markets";
import App from "./App";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <MarketsProvider>
    <StrictMode>
      <ViewSwitcher />
      <App />
    </StrictMode>
  </MarketsProvider>,
);
