import React, { createContext, useContext } from "react";

const AuthContext = createContext({
  user: { name: "Demo Merchant", role: "Merchant Ops" },
  isLoadingAuth: false,
  isLoadingPublicSettings: false,
  authError: null,
  navigateToLogin: () => {},
  logout: () => {},
});

export function AuthProvider({ children }) {
  return <AuthContext.Provider value={useAuth()}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
