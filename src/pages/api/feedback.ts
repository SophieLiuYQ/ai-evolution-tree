import type { APIRoute } from "astro";
import { Resend } from "resend";

export const prerender = false;

const TO = process.env.FEEDBACK_TO_EMAIL ?? "aievolutiontree@gmail.com";
const FROM = process.env.FEEDBACK_FROM_EMAIL ?? "onboarding@resend.dev";

export const POST: APIRoute = async ({ request }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "feedback service not configured" }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  let body: { message?: string; contact?: string; category?: string; page?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const message = (body.message ?? "").trim();
  const contact = (body.contact ?? "").trim().slice(0, 200);
  const page = (body.page ?? "").trim().slice(0, 500);
  const ALLOWED_CATEGORIES = new Set([
    "general",
    "bug",
    "correction",
    "new-node",
    "other",
  ]);
  const category = ALLOWED_CATEGORIES.has(body.category ?? "")
    ? (body.category as string)
    : "general";

  if (message.length < 3 || message.length > 5000) {
    return new Response(JSON.stringify({ error: "message length 3–5000" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `AI Evolution Tree <${FROM}>`,
    to: TO,
    replyTo: contact || undefined,
    subject: `[feedback:${category}] ${message.slice(0, 60).replace(/\s+/g, " ")}`,
    text: `${message}\n\n---\ncategory: ${category}\nfrom: ${contact || "anon"}\npage: ${page || "unknown"}`,
  });

  if (error) {
    console.error("[feedback] Resend error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(null, { status: 204 });
};
