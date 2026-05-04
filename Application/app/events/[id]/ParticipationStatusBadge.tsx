import { Badge } from "@mantine/core";

import { getEventParticipationStatusColor } from "@/app/components/event-utils";

export function ParticipationStatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <Badge
      color={getEventParticipationStatusColor(status)}
      variant="light"
      styles={{
        root: {
          whiteSpace: "nowrap",
          width: "max-content",
          minWidth: "max-content",
        },
      }}
    >
      {label}
    </Badge>
  );
}
