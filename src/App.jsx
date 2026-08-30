import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import Dashboard from "@/pages/Dashboard";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/lib/AuthContext";

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN || "dev-h31ykoqrcek68awc.us.auth0.com";
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID || "IxY0NwEYI4Mha7QkKhPRfTm77vxfMo2m";
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE || "proofpilot-api";
const auth0RedirectUri = import.meta.env.VITE_AUTH0_REDIRECT_URI || "http://localhost:5173";

function AppShell() {
  const { isLoading, isAuthenticated, loginWithRedirect } = useAuth0();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          <span className="text-sm font-medium">Loading ProofPilot...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-lg font-semibold text-white">P</div>
            <h1 className="text-2xl font-semibold text-slate-900">ProofPilot AI</h1>
            <p className="mt-2 text-sm text-slate-500">Sign in with Auth0 to access the merchant workspace.</p>
          </div>
          <button
            onClick={() => loginWithRedirect()}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Log in with Auth0
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Dashboard />
      <Toaster />
    </>
  );
}

export default function App() {
  return (
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      authorizationParams={{
        redirect_uri: auth0RedirectUri,
        audience: auth0Audience,
      }}
      cacheLocation="localstorage"
    >
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </Auth0Provider>
  );
}
