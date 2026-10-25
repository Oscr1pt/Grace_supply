import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, passwordSetupStatus } = useAuth();
  if (passwordSetupStatus !== "none" && passwordSetupStatus !== "complete") return <Navigate to="/reset-password" replace />;
  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}
