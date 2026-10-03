import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const evidence = getDb().prepare("SELECT we.original_name, we.stored_name, we.mime_type, wu.user_id, owner.manager_id FROM work_evidence we JOIN work_updates wu ON wu.id = we.work_update_id JOIN users owner ON owner.id = wu.user_id WHERE we.id = ?").get(Number(id)) as { original_name: string; stored_name: string; mime_type: string; user_id: number; manager_id: number | null } | undefined;
  if (!evidence) return new Response("Not found", { status: 404 });
  const allowed = user.role === "admin" || user.id === evidence.user_id || (user.role === "manager" && evidence.manager_id === user.id);
  if (!allowed) return new Response("Forbidden", { status: 403 });
  const filePath = path.join(process.cwd(), "data", "evidence", path.basename(evidence.stored_name));
  if (!fs.existsSync(filePath)) return new Response("File not found", { status: 404 });
  return new Response(fs.readFileSync(filePath), { headers: { "Content-Type": evidence.mime_type, "Content-Disposition": "inline; filename=\"" + evidence.original_name.replace(/"/g, "") + "\"", "X-Content-Type-Options": "nosniff" } });
}
