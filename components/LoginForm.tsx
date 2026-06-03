"use client";

import { useEffect, useState } from "react";

export function LoginForm() {
  const [action, setAction] = useState("/api/auth/login");
  const [showAddressNotice, setShowAddressNotice] = useState(false);

  useEffect(() => {
    if (window.location.hostname === "0.0.0.0") {
      setAction(`http://localhost:${window.location.port || "3000"}/api/auth/login`);
      setShowAddressNotice(true);
    }
  }, []);

  return (
    <>
      {showAddressNotice ? (
        <p className="status-warn">Use localhost or the host PC private IP in the browser. 0.0.0.0 is only a server bind address.</p>
      ) : null}
      <form className="stack" method="post" action={action}>
        <label>
          Username
          <input name="username" autoComplete="username" defaultValue="admin" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit">
          <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
          </svg>
          Login
        </button>
      </form>
    </>
  );
}
