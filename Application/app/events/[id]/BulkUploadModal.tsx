import {
  Badge,
  Button,
  Group,
  LoadingOverlay,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";

import { useBackend } from "@/app/lib/api";
import { apiClient } from "@/app/lib/apiClient";

import { ParticipationStatusBadge } from "./ParticipationStatusBadge";

interface StagedEventListItem {
  id: number;
  discord_event_id: string;
  event_name: string;
  modified_at: string;
  importable_count: number;
  no_contact_count: number;
}

interface PreviewParticipant {
  staged_participation_id: number;
  discord_id: string;
  discord_name: string;
  status: string;
  current_status: string | null;
  has_contact: boolean;
  already_on_event: boolean;
}

interface PreviewResponse {
  staged_event_id: number;
  event_name: string;
  participants: PreviewParticipant[];
}

const PARTICIPANT_STATES = {
  noContact: {
    color: "red",
    label: "Not a CRM contact",
    tooltip:
      "No CRM contact for this Discord ID — they won't be imported. Create the contact first to include them next time.",
  },
  alreadyOnEvent: {
    color: "yellow",
    label: "Already on event",
    tooltip: "This person is already on this event — submitting won't create a duplicate.",
  },
  valid: {
    color: "green",
    label: "Valid",
    tooltip: "Has a CRM contact and isn't on the event yet — will be added on submit.",
  },
} as const;

function ParticipantStateBadge({
  hasContact,
  alreadyOnEvent,
}: {
  hasContact: boolean;
  alreadyOnEvent: boolean;
}) {
  const state = !hasContact
    ? PARTICIPANT_STATES.noContact
    : alreadyOnEvent
      ? PARTICIPANT_STATES.alreadyOnEvent
      : PARTICIPANT_STATES.valid;

  return (
    <Tooltip label={state.tooltip}>
      <Badge color={state.color} variant="light">
        {state.label}
      </Badge>
    </Tooltip>
  );
}

export function BulkUploadModal({
  opened,
  close,
  refresh,
  eventId,
}: {
  opened: boolean;
  close: () => void;
  refresh: () => void;
  eventId: number;
}) {
  const [selectedStagedId, setSelectedStagedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: stagedList, loading: listLoading } = useBackend<StagedEventListItem[]>(
    "/api/discord/staged-events/"
  );

  useEffect(() => {
    if (!selectedStagedId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    apiClient
      .get<PreviewResponse>(
        `/discord/staged-events/${selectedStagedId}/preview/?target_event_id=${eventId}`
      )
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setPreview(null);
          notifications.show({
            title: "Couldn't load preview",
            message: err.message,
            color: "red",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStagedId, eventId]);

  let willAddCount = 0;
  let alreadyOnEventCount = 0;
  let noContactCount = 0;
  let willChangeStatusCount = 0;
  for (const p of preview?.participants ?? []) {
    if (!p.has_contact) noContactCount++;
    if (p.has_contact) {
      if (p.already_on_event) {
        alreadyOnEventCount++;
        if (p.current_status && p.current_status !== p.status) {
          willChangeStatusCount++;
        }
      } else {
        willAddCount++;
      }
    }
  }
  const importableCount = willAddCount + alreadyOnEventCount;
  const hasChanges = willAddCount > 0 || willChangeStatusCount > 0;

  const handleSubmit = async () => {
    if (!selectedStagedId) return;
    setSubmitting(true);
    try {
      const result = await apiClient.post<{
        imported: number;
        already_on_event: number;
        skipped_no_contact: number;
      }>(`/discord/staged-events/${selectedStagedId}/import/`, {
        target_event_id: eventId,
      });
      notifications.show({
        title: "Import complete",
        message: `${result.imported} imported. ${result.already_on_event} already on event. ${result.skipped_no_contact} skipped (no CRM contact).`,
        color: "green",
      });
      close();
      refresh();
    } catch (err) {
      notifications.show({
        title: "Import failed",
        message: err instanceof Error ? err.message : String(err),
        color: "red",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={close} title="Import Attendance" size="xl">
      <LoadingOverlay visible={listLoading || submitting} />
      <Stack>
        <Select
          label="Source: staged event you tracked in Discord"
          placeholder={
            stagedList && stagedList.length === 0
              ? "You haven't tracked any events yet"
              : "Pick a staged event"
          }
          data={
            stagedList?.map((s) => ({
              value: s.id.toString(),
              label: `${s.event_name} — ${s.importable_count} ready, ${s.no_contact_count} no contact`,
            })) ?? []
          }
          value={selectedStagedId}
          onChange={setSelectedStagedId}
          disabled={!stagedList || stagedList.length === 0}
        />

        {loadingPreview && <Text>Loading participants…</Text>}

        {preview && !loadingPreview && (
          <>
            <Text size="sm">
              <strong>{willAddCount}</strong> will be imported.{" "}
              {alreadyOnEventCount > 0 && (
                <>
                  <strong>{alreadyOnEventCount}</strong> already on this event (no duplicates will
                  be created).{" "}
                </>
              )}
              {noContactCount > 0 && (
                <>
                  <strong>{noContactCount}</strong> have no CRM contact and will be skipped.
                </>
              )}
            </Text>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Discord Name</Table.Th>
                  <Table.Th>Discord ID</Table.Th>
                  <Table.Th ta="center">Status</Table.Th>
                  <Table.Th ta="center">State</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {preview.participants.map((p) => (
                  <Table.Tr
                    key={p.staged_participation_id}
                    c={!p.has_contact ? "dimmed" : undefined}
                  >
                    <Table.Td>{p.discord_name}</Table.Td>
                    <Table.Td>{p.discord_id}</Table.Td>
                    <Table.Td ta="center">
                      <Group gap="xs" justify="center" wrap="nowrap">
                        {p.current_status && p.current_status !== p.status && (
                          <>
                            <ParticipationStatusBadge
                              status={p.current_status}
                              label={p.current_status}
                            />
                            <Text size="sm">→</Text>
                          </>
                        )}
                        <ParticipationStatusBadge status={p.status} label={p.status} />
                      </Group>
                    </Table.Td>
                    <Table.Td ta="center">
                      <ParticipantStateBadge
                        hasContact={p.has_contact}
                        alreadyOnEvent={p.already_on_event}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </>
        )}

        <Tooltip
          label={
            importableCount === 0
              ? "Nothing to import — none of the participants have a CRM contact."
              : "Nothing to update — all importable participants are already on this event with matching statuses."
          }
          disabled={hasChanges || !selectedStagedId}
        >
          <Button onClick={handleSubmit} disabled={!selectedStagedId || !hasChanges || submitting}>
            Submit
          </Button>
        </Tooltip>
      </Stack>
    </Modal>
  );
}
