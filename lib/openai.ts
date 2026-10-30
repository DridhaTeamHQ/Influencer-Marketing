import { missingEnv } from "@/lib/stores/shared";

/**
 * One call to ChatGPT through the OpenAI Responses API, answering in JSON that matches `schema`.
 * Needs `OPENAI_API_KEY`; `OPENAI_MODEL` picks the model (default gpt-5).
 */

export const openaiMissingEnv = () => missingEnv(["OPENAI_API_KEY"]);
export const openaiModel = () => process.env.OPENAI_MODEL?.trim() || "gpt-5";

type ResponseBody = {
  error?: { message?: string } | null;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
};

export async function askOpenAI<T>(params: {
  instructions: string;
  input: string;
  schema: object;
  /** How long the model thinks first; more is slower but steadier. */
  effort?: "low" | "medium";
}): Promise<T> {
  const missing = openaiMissingEnv();
  if (missing.length) throw new Error(`Add ${missing.join(", ")} to the environment to use the AI agent.`);

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: openaiModel(),
      instructions: params.instructions,
      input: params.input,
      reasoning: { effort: params.effort ?? "low" },
      text: { format: { type: "json_schema", name: "answer", strict: true, schema: params.schema } },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(280_000),
  });
  const body = (await res.json()) as ResponseBody;
  if (!res.ok) throw new Error(`OpenAI: ${body.error?.message ?? res.status}`);
  if (body.status === "incomplete") throw new Error(`OpenAI stopped early (${body.incomplete_details?.reason ?? "unknown reason"}). Try again.`);

  const text = (body.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .find((c) => c.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI sent no answer. Try again.");
  return JSON.parse(text) as T;
}
