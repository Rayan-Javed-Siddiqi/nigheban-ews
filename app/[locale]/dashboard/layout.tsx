import { ReplayProvider } from "@/lib/replay/ReplayContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ReplayProvider>{children}</ReplayProvider>;
}