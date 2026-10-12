const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

// Proxy an LLM analysis call to a user-configured OpenAI-compatible endpoint.
// Credentials (apiKey/baseUrl/model) are user-supplied via Settings (localStorage)
// and passed in the payload at call time. Running this server-side avoids browser CORS.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.49";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await db.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { apiKey, baseUrl, model, prompt, provider } = body || {};

    if (!apiKey || !apiKey.trim())
      return Response.json({ error: "Missing API key (Settings → LLM configuration)." }, { status: 400 });
    if (!baseUrl || !baseUrl.trim())
      return Response.json({ error: "Missing Base URL (Settings → LLM configuration)." }, { status: 400 });
    if (!model || !model.trim())
      return Response.json({ error: "Missing Model (Settings → LLM configuration)." }, { status: 400 });
    if (!prompt || !prompt.trim())
      return Response.json({ error: "No data provided for analysis." }, { status: 400 });

    const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
    const endpoint = trimmedBase.endsWith("/chat/completions")
      ? trimmedBase
      : `${trimmedBase}/chat/completions`;

    let resp: Response;
    try {
      resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: model.trim(),
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (netErr: any) {
      return Response.json(
        {
          error: `Could not reach ${provider || "the provider"} at ${endpoint}. ${netErr?.message || "Network error."}`,
        },
        { status: 502 }
      );
    }

    if (!resp.ok) {
      let detail = "";
      try {
        detail = await resp.text();
      } catch (_) {}
      return Response.json(
        { error: `Provider returned HTTP ${resp.status}. ${detail.slice(0, 500)}` },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      (typeof data === "string" ? data : "");

    if (!content)
      return Response.json({ error: "Provider returned an empty analysis." }, { status: 502 });

    return Response.json({ analysis: content, endpoint });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Analysis failed." }, { status: 500 });
  }
}