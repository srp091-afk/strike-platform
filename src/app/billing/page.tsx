import { redirect } from "next/navigation";

export default function BillingShortcut() {
  redirect("/dashboard/billing");
}
