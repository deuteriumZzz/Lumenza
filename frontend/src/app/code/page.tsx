import { redirect } from "next/navigation";

export default function CodePage() {
  redirect("/studio?mode=code");
}
