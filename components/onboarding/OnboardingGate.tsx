"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../AuthContext";

// Redirige al onboarding mientras el usuario no lo haya completado. Desacoplado
// del login: vive en el layout y observa el perfil.
export default function OnboardingGate() {
  const { user, profile, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready || !user || !profile) return;
    // /cuenta/reset queda exenta: se entra con una sesión temporal de recovery
    // (desde el link del mail). Si el gate la pateara al onboarding, quien no lo
    // haya completado nunca podría cambiar la contraseña.
    if (pathname === "/cuenta/reset") return;
    if (!profile.onboarding_completed && pathname !== "/onboarding") {
      router.replace("/onboarding");
    } else if (profile.onboarding_completed && pathname === "/onboarding") {
      router.replace("/");
    }
  }, [ready, user, profile, pathname, router]);

  return null;
}
