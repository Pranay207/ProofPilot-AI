import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";

const AuthContext = createContext({
  user: { name: "Merchant", role: "Merchant Ops" },
  isAuthenticated: false,
  isLoadingAuth: false,
  isLoadingPublicSettings: false,
  authChecked: false,
  authError: null,
  navigateToLogin: () => {},
  logout: () => {},
  checkUserAuth: async () => {},
});

export function AuthProvider({ children }) {
  const auth0 = useAuth0();
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  const checkUserAuth = useCallback(async () => {
    if (auth0.isLoading) {
      return;
    }

    if (!auth0.isAuthenticated) {
      window.localStorage.removeItem("proofpilot_access_token");
      delete window.__PROOFPILOT_AUTH_TOKEN__;
      setAuthError({ type: "unauthenticated", message: "Authentication required" });
      setAuthChecked(true);
      return;
    }

    try {
      const audience = import.meta.env.VITE_AUTH0_AUDIENCE || "proofpilot-api";
      const token = await auth0.getAccessTokenSilently({ authorizationParams: { audience } });
      window.__PROOFPILOT_AUTH_TOKEN__ = token;
      window.localStorage.setItem("proofpilot_access_token", token);
      setAuthError(null);
    } catch (error) {
      setAuthError({ type: "token_error", message: error.message || "Unable to validate token" });
    } finally {
      setAuthChecked(true);
    }
  }, [auth0]);

  useEffect(() => {
    if (!auth0.isLoading) {
      checkUserAuth();
    }
  }, [auth0.isLoading, auth0.isAuthenticated, checkUserAuth]);

  const value = {
    user: auth0.user || { name: "Merchant", role: "Merchant Ops" },
    isAuthenticated: !!auth0.isAuthenticated,
    isLoadingAuth: auth0.isLoading || !authChecked,
    isLoadingPublicSettings: false,
    authChecked,
    authError,
    navigateToLogin: () => auth0.loginWithRedirect(),
    logout: () => auth0.logout({ logoutParams: { returnTo: window.location.origin } }),
    checkUserAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
