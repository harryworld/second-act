// Sites dispatch supplies these headers after ChatGPT authentication.
export function chatGPTAccount(headers: Headers) {
  const id = headers.get("oai-authenticated-user-id")?.trim();
  if (!id) return null;
  const value = headers.get("oai-authenticated-user-full-name");
  let name = value?.trim() || "";
  if (
    name &&
    headers.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
  ) {
    try {
      name = decodeURIComponent(name).trim();
    } catch {
      name = "";
    }
  }
  return {
    id,
    details: {
      provider: "ChatGPT",
      name: name.slice(0, 200),
      email:
        headers.get("oai-authenticated-user-email")?.trim().slice(0, 320) || "",
    },
  };
}
