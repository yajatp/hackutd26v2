import { DATA_ROOT, listFolders, readDataFile } from "@/lib/eog/folders";

export const dynamic = "force-dynamic";

// GET /api/eog                                  -> { root, folders }
// GET /api/eog?folder=history/full_week&file=ops.json -> the file's text
export async function GET(req: Request) {
  const url = new URL(req.url);
  const folder = url.searchParams.get("folder");
  const file = url.searchParams.get("file");
  if (!folder || !file) return Response.json({ root: DATA_ROOT, folders: listFolders() });
  const text = readDataFile(folder, file);
  if (text === null) return new Response(`not found: ${folder}/${file}`, { status: 404 });
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
