import { useEffect } from "react";

export function useLearningShellBootstrap({ accessToken, loadCatalog, loadWallet, loadBillingRates }) {
  useEffect(() => {
    if (!accessToken) {
      void loadCatalog();
      return;
    }
    void loadCatalog();
    void loadWallet();
    void loadBillingRates();
  }, [accessToken, loadBillingRates, loadCatalog, loadWallet]);
}
