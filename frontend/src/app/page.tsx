/**
 * # page.tsx (/) - sends visitors straight to the lead list
 */
import { redirect } from "next/navigation";

// The app has one real screen, so the home page just forwards to it.
export default function Home() {
  redirect("/leads");
}
