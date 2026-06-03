export function safeRedirect(path: string, status = 303) {
  return new Response(null, {
    status,
    headers: {
      Location: path
    }
  });
}
