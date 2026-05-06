import { IconAlertTriangle } from "@tabler/icons-react";

export const ENVIRONMENTS = {
  staging: {
    label: "Staging Environment",
    titlePrefix: "[STAGING]",
    color: "#4f46e5",
    borderColor: "rgba(79, 70, 229, 0.8)",
  },
  dev: {
    label: "Dev Environment",
    titlePrefix: "[DEV]",
    color: "#0891b2",
    borderColor: "rgba(8, 145, 178, 0.8)",
  },
} as const;

type EnvironmentKey = keyof typeof ENVIRONMENTS;

export function getEnvironment() {
  const env = process.env.NEXT_PUBLIC_ENVIRONMENT as EnvironmentKey | undefined;
  return env ? ENVIRONMENTS[env] : undefined;
}

export default function EnvironmentBanner() {
  const config = getEnvironment();

  if (!config) {
    return null;
  }

  return (
    <>
      <div
        role="status"
        aria-label={config.label}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          backgroundColor: config.color,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.12em",
          padding: "6px 12px",
          textTransform: "uppercase",
          borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)",
        }}
      >
        <IconAlertTriangle size={14} stroke={2.5} aria-hidden="true" />
        <span>{config.label}</span>
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          border: `4px solid ${config.borderColor}`,
          zIndex: 999,
        }}
      />
    </>
  );
}
