import { redirect } from "next/navigation";

// /analyze теперь режим внутри творческой студии (/studio).
export default function AnalyzePage() {
  redirect("/studio?mode=analyze");
}
