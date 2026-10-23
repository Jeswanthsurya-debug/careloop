import { NextResponse } from "next/server";
import { careTools, ensureSeedData, runTool } from "@/lib/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const PROTOCOL_VERSION = "2024-11-05";

const toolDescriptors = careTools.map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
}));

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function result(id: string | number | null | undefined, payload: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: payload });
}

function failure(id: string | number | null | undefined, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

export async function GET() {
  return NextResponse.json({
    name: "careloop-mcp",
    version: "1.0.0",
    protocolVersion: PROTOCOL_VERSION,
    transport: "http-jsonrpc",
    toolCount: toolDescriptors.length,
    tools: toolDescriptors,
  });
}

export async function POST(request: Request) {
  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return failure(null, -32700, "Parse error");
  }

  const { id, method, params } = body;

  try {
    switch (method) {
      case "initialize":
        return result(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "careloop-mcp", version: "1.0.0" },
        });

      case "ping":
        return result(id, {});

      case "tools/list":
        return result(id, { tools: toolDescriptors });

      case "tools/call": {
        const name = String(params?.name ?? "");
        const args = (params?.arguments ?? {}) as Record<string, unknown>;
        if (!careTools.some((tool) => tool.name === name)) {
          return failure(id, -32602, `Unknown tool: ${name}`);
        }
        await ensureSeedData();
        const toolResult = await runTool(name, args);
        return result(id, {
          isError: !toolResult.ok,
          content: [{ type: "text", text: toolResult.summary }],
          structuredContent: toolResult.data ?? {},
        });
      }

      default:
        return failure(id, -32601, `Method not found: ${method ?? "unknown"}`);
    }
  } catch (error) {
    console.error("mcp route failed", error);
    return failure(id, -32603, error instanceof Error ? error.message : "Internal error");
  }
}
