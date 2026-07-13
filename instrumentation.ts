/**
 * Runs once when the server starts.
 *
 * Binds the SMPP session at boot rather than lazily on the first send, so the first message of
 * a campaign does not pay for the bind handshake, and bad credentials surface in the startup
 * log instead of halfway through a send.
 *
 * A failed bind is logged and ignored: SMS should degrade, not stop the app from starting.
 */
export async function register() {
  // Only the Node.js runtime can open a TCP socket; the edge runtime cannot.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if ((process.env.SMS_PROVIDER ?? "mock") !== "smpp") return;

  const { warmSmppSession } = await import("@/lib/sms");
  const bound = await warmSmppSession();
  console.log(bound ? "[SMPP] bound at startup" : "[SMPP] not bound at startup (see errors above)");
}
