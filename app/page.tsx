import { redirect } from "next/navigation";

// The judges' README says "open http://localhost:3000": land them on the console.
export default function Home() {
  redirect("/console");
}
