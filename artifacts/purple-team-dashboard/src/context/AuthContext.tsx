import { createContext, useContext, type ReactNode } from "react";
import { useUser } from "@clerk/react";

const ADMIN_EMAIL = "sfiliaggi@box.com";

type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
  email: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress
    ?? user?.emailAddresses[0]?.emailAddress
    ?? null;
  const isAdmin = Boolean(
    isSignedIn
    && user?.emailAddresses.some(
      ({ emailAddress }) => emailAddress.toLowerCase() === ADMIN_EMAIL,
    ),
  );

  return (
    <AuthContext.Provider
      value={{
        isLoaded,
        isSignedIn: Boolean(isSignedIn),
        isAdmin,
        email,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthorization() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuthorization must be used inside AuthProvider");
  }
  return value;
}