/* Clerk owns browser session cookies. No explicit bearer tokens or passwords are stored. */
(async function () {
  const element = document.getElementById("clerk-config");
  if (!element) return;
  const config = JSON.parse(element.textContent);
  if (!config.key) return;
  try {
    const script = document.createElement("script");
    script.src = config.script;
    script.crossOrigin = "anonymous";
    script.dataset.clerkPublishableKey = config.key;
    if (config.proxy) script.dataset.clerkProxyUrl = config.proxy;
    await new Promise((resolve, reject) => {
      script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
    await window.Clerk.load({
      signInUrl: "/sign-in", signInFallbackRedirectUrl: "/dashboard",
      ...(config.proxy ? { proxyUrl: config.proxy } : {}),
      appearance: { variables: { colorPrimary: "#a342e8", colorBackground: "#141e32", colorText: "#edf1fa", colorInputBackground: "#0e1728", colorInputText: "#edf1fa" } }
    });
    const mount = document.getElementById("clerk-sign-in");
    if (mount) window.Clerk.mountSignIn(mount, { routing: "hash", fallbackRedirectUrl: "/dashboard" });
    const logout = document.getElementById("sign-out");
    if (logout) logout.addEventListener("click", () => window.Clerk.signOut({ redirectUrl: "/sign-in" }));
    // Refresh the server-rendered page once after Clerk renews an expired cookie.
    if (window.Clerk.user && !config.signedIn && !mount && !sessionStorage.getItem("clerk-page-retry")) {
      sessionStorage.setItem("clerk-page-retry", "1");
      location.reload();
    } else if (config.signedIn) sessionStorage.removeItem("clerk-page-retry");
  } catch (_) {
    const status = document.getElementById("auth-status");
    if (status) status.textContent = "Unable to load sign-in. Refresh the page to try again.";
  }
})();
