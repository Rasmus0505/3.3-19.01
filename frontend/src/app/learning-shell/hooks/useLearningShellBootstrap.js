import { useEffect } from "react";

export function useLearningShellBootstrap({ accessToken, loadCatalog, loadWallet, loadBillingRates, detectAdmin }) {
  useEffect(() => {
    if (!accessToken) {
      void loadCatalog();
      return;
    }
    void loadCatalog();
    void loadWallet();
    void loadBillingRates();
    void detectAdmin();
  }, [accessToken, detectAdmin, loadBillingRates, loadCatalog, loadWallet]);
}
