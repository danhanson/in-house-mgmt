import { AnonymousAttendeesModal } from "@/app/events/[id]/components/AnonymousAttendeesModal";
import { Contact } from "@/app/components/ContactSearch";
import Link from "next/link";
import PaginatedTable from "@/app/components/pagination/PaginatedTable";
import PaginationBar, {
  decrementPageSearchParam,
  incrementPageSearchParam,
} from "@/app/components/pagination/PaginationBar";
import { formatContactInfo } from "@/app/components/contact-utils";
import { User } from "@/app/components/provider/types";
import { useUser } from "@/app/components/provider/UserContext";
import { type Ticket } from "@/app/components/tickets/ticket-utils";
import {
  Event,
  EventCategory,
  EventParticipation,
  getStatusColor,
  getEventParticipationStatusColor,
  UsersInEvent,
} from "@/app/components/event-utils";
import { BackendPaginatedResults, useBackend, useBackendMutation } from "@/app/lib/api";
import { apiClient } from "@/app/lib/apiClient";
import { DateTimePicker } from "@/app/components/datetime";
import { type UseFormReturnType, useForm } from "@mantine/form";
import {
  Text,
  Paper,
  Container,
  Stack,
  Divider,
  Title,
  Grid,
  GridCol,
  Box,
  Badge,
  LoadingOverlay,
  Table,
  TextInput,
  Group,
  MultiSelect,
  Button,
  Modal,
  Select,
  Combobox,
  useCombobox,
  Tabs,
  Textarea,
  ActionIcon,
  Tooltip,
  Alert,
} from "@mantine/core";
import {
  IconPencil,
  IconSearch,
  IconTicket,
  IconUpload,
  IconUserPlus,
  IconUserQuestion,
  IconUsersGroup,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDisclosure } from "@mantine/hooks";
import getCookie from "@/app/utils/cookie";
import { formatBackendProvidedDateTime } from "@/app/utils/datetime";
import { BulkUploadModal } from "./BulkUploadModal";
import { ParticipationStatusBadge } from "./ParticipationStatusBadge";
const EVENT_PARTICIPATION_STATUSES = [
  "UNKNOWN",
  "MAYBE",
  "COMMITTED",
  "REJECTED",
  "ATTENDED",
  "NO_SHOW",
] as const;
type EventParticipationStatus = (typeof EVENT_PARTICIPATION_STATUSES)[number];
const FINAL_EVENT_STATUSES = new Set(["completed", "canceled"]);
const INVALID_FINAL_ATTENDANCE_STATUSES = new Set<EventParticipationStatus>([
  "UNKNOWN",
  "MAYBE",
  "COMMITTED",
]);

function isFinalEventStatus(status: string) {
  return FINAL_EVENT_STATUSES.has(status);
}

function hasInvalidFinalAttendanceStatus(status: string) {
  return INVALID_FINAL_ATTENDANCE_STATUSES.has(status as EventParticipationStatus);
}

interface EventEditFormValues {
  name: string;
  description: string;
  status: string;
  locationName: string;
  locationAddress: string;
  startsAt: string;
  endsAt: string;
  categoryId: string | null;
}

function getEventFormValues(event: Event): EventEditFormValues {
  return {
    name: event.name,
    description: event.description ?? "",
    status: event.event_status,
    locationName: event.location_name ?? "",
    locationAddress: event.location_address ?? "",
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    categoryId: event.category ? String(event.category.id) : null,
  };
}

export default function EventView({ event }: { event: Event | undefined }) {
  return (
    <Container py="xl" size="xl">
      <LoadingOverlay visible={!event} />
      {event && <EventViewMain event={event} />}
    </Container>
  );
}

function EventViewMain({ event }: { event: Event }) {
  const [currentEvent, setCurrentEvent] = useState(event);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEventEdits, setIsSavingEventEdits] = useState(false);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [attendanceValidationError, setAttendanceValidationError] = useState<string | null>(null);
  const form = useForm<EventEditFormValues>({
    initialValues: getEventFormValues(event),
  });

  useEffect(() => {
    apiClient
      .get<{ results: EventCategory[] }>("/event-categories/")
      .then((data) => setCategories(data.results || []))
      .catch(() => setCategories([]));
  }, []);

  const canEditEvent = (currentEvent.editable_fields?.length ?? 0) > 0;

  const updateEvent = async (
    payload: Partial<Event> & { category_id?: string | null }
  ): Promise<Event> => {
    const updated = await apiClient.patch<Event>(`/events/${currentEvent.id}`, payload);
    setCurrentEvent(updated);
    return updated;
  };

  const saveEventEdits = async () => {
    setIsSavingEventEdits(true);
    try {
      const updated = await updateEvent({
        name: form.values.name,
        description: form.values.description,
        event_status: form.values.status,
        location_name: form.values.locationName,
        location_address: form.values.locationAddress,
        starts_at: form.values.startsAt,
        ends_at: form.values.endsAt,
        category_id: form.values.categoryId,
      });
      const values = getEventFormValues(updated);
      form.setValues(values);
      form.resetDirty(values);
      setAttendanceValidationError(null);

      notifications.show({
        title: "Event updated",
        message: "Saved event changes.",
        color: "green",
      });
      setIsEditing(false);
    } catch (error) {
      setAttendanceValidationError(
        error instanceof Error ? error.message : "Could not update the event details."
      );
    } finally {
      setIsSavingEventEdits(false);
    }
  };

  const cancelEditing = () => {
    const values = getEventFormValues(currentEvent);
    form.setValues(values);
    form.resetDirty(values);
    setAttendanceValidationError(null);
    setIsEditing(false);
  };

  return (
    <Grid align="flex-start">
      <GridCol style={{ flex: 1, minWidth: 0 }}>
        {canEditEvent && (
          <Group justify="flex-end" mb="md">
            {!isEditing ? (
              <Tooltip label="Edit Event">
                <ActionIcon
                  size="md"
                  variant="filled"
                  onClick={() => setIsEditing(true)}
                  aria-label="Edit Event"
                >
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <>
                <Button
                  size="xs"
                  onClick={saveEventEdits}
                  loading={isSavingEventEdits}
                  disabled={!form.isDirty()}
                >
                  Save
                </Button>
                <Button size="xs" variant="outline" color="red" onClick={cancelEditing}>
                  Cancel
                </Button>
              </>
            )}
          </Group>
        )}
        {attendanceValidationError && (
          <Alert
            color="red"
            mb="md"
            withCloseButton
            onClose={() => setAttendanceValidationError(null)}
          >
            {attendanceValidationError} Participants with unresolved attendance statuses are
            highlighted below.
          </Alert>
        )}
        <EventSummaryCard event={currentEvent} isEditing={isEditing} form={form} />
        <Tabs defaultValue="participants" mt="md">
          <Tabs.List>
            <Tabs.Tab value="participants">Participants</Tabs.Tab>
            <Tabs.Tab value="users">Users</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="participants" style={{ minWidth: "432px" }}>
            <EventViewContactTable event={currentEvent} onEventUpdate={setCurrentEvent} />
          </Tabs.Panel>
          <Tabs.Panel value="users">
            <EventViewUsersTable event={currentEvent} />
          </Tabs.Panel>
        </Tabs>
      </GridCol>
      <GridCol style={{ flex: "0 0 239px", maxWidth: "239px", minWidth: "239px" }}>
        <Stack gap="md">
          <EventViewMetadata
            event={currentEvent}
            isEditing={isEditing}
            form={form}
            categories={categories}
          />
          <YourTicketCallout eventId={currentEvent.id} />
        </Stack>
      </GridCol>
    </Grid>
  );
}

function YourTicketCallout({ eventId }: { eventId: number }) {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userLoading || !userId) {
      setTickets([]);
      return;
    }

    let cancelled = false;

    async function fetchYourTicket() {
      setLoading(true);
      try {
        const data = await apiClient.get<BackendPaginatedResults<Ticket>>(
          `/tickets/?event=${eventId}&assigned_to=${userId}`
        );
        if (!cancelled) {
          setTickets(data.results);
        }
      } catch (error) {
        console.error("Failed to fetch current user's event ticket", error);
        if (!cancelled) {
          setTickets([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchYourTicket();

    return () => {
      cancelled = true;
    };
  }, [eventId, userId, userLoading]);

  if (loading || tickets.length === 0) {
    return null;
  }

  const title =
    tickets.length === 1
      ? "You have a ticket for this event"
      : `You have ${tickets.length} tickets for this event`;

  return (
    <Alert
      color="blue"
      variant="light"
      styles={{
        root: { overflow: "hidden" },
        body: { minWidth: 0 },
        message: { minWidth: 0 },
      }}
    >
      <Stack gap="sm">
        <Group gap="sm" align="flex-start" wrap="nowrap">
          <IconTicket size={18} style={{ flex: "0 0 auto", marginTop: 1 }} />
          <Text fw={700} size="sm" style={{ overflowWrap: "anywhere", lineHeight: 1.3 }}>
            {title}
          </Text>
        </Group>
        {tickets.map((ticket) => (
          <Button
            key={ticket.id}
            component={Link}
            href={`/tickets/${ticket.id}`}
            size="xs"
            variant="default"
            fullWidth
            styles={{
              root: {
                backgroundColor: "var(--mantine-color-white)",
                height: "auto",
                minHeight: 32,
                paddingTop: 8,
                paddingBottom: 8,
              },
              label: {
                color: "var(--mantine-color-black)",
                whiteSpace: "normal",
                textAlign: "left",
                overflowWrap: "anywhere",
                lineHeight: 1.3,
              },
            }}
          >
            {ticket.title}
          </Button>
        ))}
      </Stack>
    </Alert>
  );
}

function EventSummaryCard({
  event,
  isEditing,
  form,
}: {
  event: Event;
  isEditing: boolean;
  form: UseFormReturnType<EventEditFormValues>;
}) {
  const canEditName = event.editable_fields?.includes("name") ?? false;
  const canEditDescription = event.editable_fields?.includes("description") ?? false;
  const descriptionText = event.description?.trim() ?? "";
  const hasDescription = descriptionText.length > 0;

  return (
    <Box>
      <Stack gap="sm">
        {canEditName && isEditing ? (
          <TextInput
            {...form.getInputProps("name")}
            variant="unstyled"
            size="xl"
            styles={{
              input: {
                fontSize: "var(--mantine-h1-font-size)",
                fontWeight: 700,
                lineHeight: "var(--mantine-h1-line-height)",
                padding: 0,
              },
            }}
          />
        ) : (
          <Title>{event.name}</Title>
        )}
        {canEditDescription && isEditing ? (
          <>
            <Divider />
            <Textarea
              {...form.getInputProps("description")}
              autosize
              minRows={5}
              variant="unstyled"
              styles={{
                input: {
                  fontSize: "var(--mantine-font-size-md)",
                  lineHeight: "var(--mantine-line-height)",
                  padding: 0,
                },
              }}
            />
          </>
        ) : hasDescription ? (
          <>
            <Divider />
            <Text style={{ whiteSpace: "pre-wrap" }}>{descriptionText}</Text>
          </>
        ) : null}
      </Stack>
    </Box>
  );
}

function EventViewMetadata({
  event,
  isEditing,
  form,
  categories,
}: {
  event: Event;
  isEditing: boolean;
  form: UseFormReturnType<EventEditFormValues>;
  categories: EventCategory[];
}) {
  const canEditCategory = event.editable_fields?.includes("category") ?? false;
  const canEditStatus = event.editable_fields?.includes("event_status") ?? false;
  const canEditLocation =
    (event.editable_fields?.includes("location_name") ?? false) ||
    (event.editable_fields?.includes("location_address") ?? false);
  const canEditDates =
    (event.editable_fields?.includes("starts_at") ?? false) ||
    (event.editable_fields?.includes("ends_at") ?? false);
  const metadataInputStyles = {
    input: {
      fontSize: "var(--mantine-font-size-md)",
      fontWeight: 400,
      lineHeight: "var(--mantine-line-height)",
      fontFamily: "var(--mantine-font-family)",
      color: "var(--mantine-color-text)",
      padding: 0,
    },
  } as const;

  return (
    <Paper withBorder p="sm">
      <Box mt={4} mb={4}>
        <Text c="dimmed" size="sm">
          Event Status
        </Text>
        {canEditStatus && isEditing ? (
          <Select
            data={[
              { value: "draft", label: "Draft" },
              { value: "scheduled", label: "Scheduled" },
              { value: "completed", label: "Completed" },
              { value: "canceled", label: "Canceled" },
            ]}
            value={form.values.status}
            onChange={(value) => form.setFieldValue("status", value ?? event.event_status)}
            variant="unstyled"
            size="md"
            styles={metadataInputStyles}
          />
        ) : (
          <Badge color={getStatusColor(event.status_display)}>{event.status_display}</Badge>
        )}
      </Box>
      <Box mt={4} mb={4}>
        <Text c="dimmed" size="sm">
          Event Category
        </Text>
        {canEditCategory && isEditing ? (
          <Select
            data={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            value={form.values.categoryId}
            onChange={(value) => form.setFieldValue("categoryId", value)}
            variant="unstyled"
            size="md"
            styles={metadataInputStyles}
            placeholder="None"
            clearable
          />
        ) : (
          <Text>{event.category?.name ?? "None"}</Text>
        )}
      </Box>
      <Box mt={4} mb={4}>
        {canEditLocation && isEditing ? (
          <>
            <Text c="dimmed" size="sm">
              Location Name
            </Text>
            <TextInput
              {...form.getInputProps("locationName")}
              placeholder="Location name"
              variant="unstyled"
              size="md"
              styles={metadataInputStyles}
            />
          </>
        ) : (
          <>
            <Text c="dimmed" size="sm">
              Location Display
            </Text>
            <Text>{event.location_display}</Text>
          </>
        )}
      </Box>
      {canEditLocation && isEditing && (
        <Box mt={4} mb={4}>
          <Text c="dimmed" size="sm">
            Address
          </Text>
          <Textarea
            {...form.getInputProps("locationAddress")}
            autosize
            minRows={2}
            placeholder="Address"
            variant="unstyled"
            size="md"
            styles={metadataInputStyles}
          />
        </Box>
      )}
      <Box mt={4} mb={4}>
        <Text c="dimmed" size="sm">
          Start Date
        </Text>
        {canEditDates && isEditing ? (
          <DateTimePicker
            value={form.values.startsAt}
            valueFormat="MM/DD/YY, hh:mm A"
            timePickerProps={{ format: "12h" }}
            variant="unstyled"
            size="md"
            styles={metadataInputStyles}
            onChange={(value) => form.setFieldValue("startsAt", value ?? form.values.startsAt)}
          />
        ) : (
          <Text>{formatBackendProvidedDateTime(event.starts_at)}</Text>
        )}
      </Box>
      <Box mt={4} mb={4}>
        <Text c="dimmed" size="sm">
          End Date
        </Text>
        {canEditDates && isEditing ? (
          <DateTimePicker
            value={form.values.endsAt}
            valueFormat="MM/DD/YY, hh:mm A"
            timePickerProps={{ format: "12h" }}
            variant="unstyled"
            size="md"
            styles={metadataInputStyles}
            onChange={(value) => form.setFieldValue("endsAt", value ?? form.values.endsAt)}
          />
        ) : (
          <Text>{formatBackendProvidedDateTime(event.ends_at)}</Text>
        )}
      </Box>
    </Paper>
  );
}

function AddParticipantModal({
  event,
  selected,
  opened,
  close,
  refresh,
  mode,
}: {
  event: Event;
  selected?: EventParticipation[];
  opened: boolean;
  close: () => void;
  refresh: () => void;
  mode: "add" | "modify";
}) {
  const [contactSearchQuery, setContactSearchQuery] = useState<string>("");
  const [selectedContacts, setSelectedContacts] = useState<Set<Contact>>(
    new Set(selected?.map((ep) => ep.contact))
  );
  const [removedContactIds, setRemovedContactIds] = useState<Set<number>>(new Set());
  const [eventStatus, setEventStatus] = useState<EventParticipationStatus>();
  const [submitting, setSubmitting] = useState(false);
  const apiParams = new URLSearchParams();
  if (contactSearchQuery) apiParams.append("search", contactSearchQuery);
  const participationStatusOptions = isFinalEventStatus(event.event_status)
    ? EVENT_PARTICIPATION_STATUSES.filter((status) => !hasInvalidFinalAttendanceStatus(status))
    : EVENT_PARTICIPATION_STATUSES;

  const contactToParticipationMap = new Map<number, number>();
  if (mode === "modify" && selected) {
    for (const ep of selected) {
      contactToParticipationMap.set(ep.contact.id, ep.id);
    }
  }

  const contactsSearch = useBackend<BackendPaginatedResults<Contact>>(
    `/api/contacts/?${apiParams}`
  );
  const { mutate: createMutate, loading: createLoading } = useBackendMutation(
    `/api/participants/`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken") ?? "",
      },
    }
  );
  const selectedContactIds: number[] = [];
  selectedContacts.forEach((c) => selectedContactIds.push(c.id));
  const contacts =
    mode === "add"
      ? contactsSearch.data?.results.filter((c) => !selectedContactIds.includes(c.id))
      : undefined;
  const combobox = useCombobox();
  const removeContact = (c: Contact) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      next.delete(c);
      return next;
    });
    setRemovedContactIds((prev) => new Set(prev).add(c.id));
  };

  const handleSubmit = async () => {
    if (!eventStatus) return;

    setSubmitting(true);

    try {
      if (mode === "add") {
        await Promise.all(
          Array.from(selectedContacts).map((c) =>
            createMutate({
              event_id: event.id,
              status: eventStatus,
              contact_id: c.id,
            })
          )
        );
      } else {
        for (const c of selectedContacts) {
          const participationId = contactToParticipationMap.get(c.id);
          if (participationId) {
            if (removedContactIds.has(c.id)) {
              const response = await fetch(`/api/participants/${participationId}/`, {
                method: "DELETE",
                credentials: "include",
                headers: {
                  "X-CSRFToken": getCookie("csrftoken") ?? "",
                },
              });
              if (!response.ok) {
                notifications.show({
                  title: "Error",
                  message: "Failed to remove participant. Please try again.",
                  color: "red",
                });
                return;
              }
            } else {
              const response = await fetch(`/api/participants/${participationId}/`, {
                method: "PATCH",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  "X-CSRFToken": getCookie("csrftoken") ?? "",
                },
                body: JSON.stringify({ status: eventStatus }),
              });
              if (!response.ok) {
                notifications.show({
                  title: "Error",
                  message: "Failed to update participant. Please try again.",
                  color: "red",
                });
                return;
              }
            }
          }
        }
      }
      setSelectedContacts(new Set());
      setRemovedContactIds(new Set());
      close();
      refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={mode === "add" ? "Add Participant" : "Modify Selected"}
    >
      <LoadingOverlay visible={submitting || createLoading} />
      <Stack>
        {mode === "add" && (
          <Combobox
            store={combobox}
            onOptionSubmit={(value) => {
              const contact = contacts?.find((c) => c.id.toString() === value);
              if (!contact) return;

              setSelectedContacts((prev) => {
                const next = new Set(prev);
                next.add(contact);
                return next;
              });
              setContactSearchQuery("");
              combobox.closeDropdown();
            }}
          >
            <Combobox.Target>
              <TextInput
                label="Contact"
                placeholder="Search contacts..."
                value={contactSearchQuery}
                onChange={(event) => {
                  setContactSearchQuery(event.currentTarget.value);
                  combobox.openDropdown();
                }}
                onFocus={() => combobox.openDropdown()}
                onClick={() => combobox.openDropdown()}
                onBlur={() => combobox.closeDropdown()}
              />
            </Combobox.Target>

            <Combobox.Dropdown hidden={contacts === undefined || contacts.length === 0}>
              <Combobox.Options>
                {contacts?.map((contact) => (
                  <Combobox.Option key={contact.id} value={contact.id.toString()}>
                    {contact.full_name}
                  </Combobox.Option>
                ))}

                {contacts?.length === 0 && <Combobox.Empty>No contacts found</Combobox.Empty>}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        )}
        <Select
          data={participationStatusOptions}
          label="Participation Status"
          onChange={(s) => setEventStatus(s as EventParticipationStatus)}
          placeholder="Participation Status"
          required
          value={eventStatus}
        />
        <PaginatedTable<Contact>
          columns={["Full Name", "Discord ID", "Action"]}
          data={
            mode === "add"
              ? Array.from(selectedContacts)
              : Array.from(selectedContacts).filter((c) => !removedContactIds.has(c.id))
          }
          transforms={[
            (c) => <Table.Td key="name">{c.full_name}</Table.Td>,
            (c) => <Table.Td key="discord">{c.discord_id}</Table.Td>,
            (c) => (
              <Table.Td key="action">
                <Button color="red" onClick={() => removeContact(c)}>
                  Deselect
                </Button>
              </Table.Td>
            ),
          ]}
          loading={false}
          noDataText="Select a participant to proceed"
        />
        <Button onClick={handleSubmit} disabled={!eventStatus || submitting}>
          Submit
        </Button>
      </Stack>
    </Modal>
  );
}

function EventViewContactTable({
  event,
  onEventUpdate,
}: {
  event: Event;
  onEventUpdate: (updated: Event) => void;
}) {
  const currentParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusArray, setStatusArray] = useState<string[]>();
  const [opened, { open, close }] = useDisclosure(false);
  const [bulkOpened, { open: openBulk, close: closeBulk }] = useDisclosure(false);
  const [anonymousOpened, { open: openAnonymous, close: closeAnonymous }] = useDisclosure(false);
  const [modalMode, setModalMode] = useState<"add" | "modify">("add");

  const canEditAnonymous = event.editable_fields?.includes("anonymous_attendee_count") ?? false;
  const hasAnonymousContent =
    event.anonymous_attendee_count > 0 || event.anonymous_attendees_detail.length > 0;
  const showAnonymousButton = canEditAnonymous || hasAnonymousContent;

  const pageNum = currentParams.get("page");
  const apiParams = new URLSearchParams();

  if (pageNum) apiParams.append("page", pageNum);
  if (searchQuery) apiParams.append("search", searchQuery);
  if (statusArray) {
    for (const status of statusArray) {
      apiParams.append("status", status);
    }
  }

  apiParams.append("event", event.id.toString());

  const {
    data,
    loading,
    refresh: refetch,
  } = useBackend<BackendPaginatedResults<EventParticipation>>(`/api/participants/?${apiParams}`);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const router = useRouter();

  const updateParam = (key: string, value?: string) => {
    const params = new URLSearchParams(currentParams.toString());

    if (!value || value === "all") params.delete(key);
    else params.set(key, value);

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const selectedData = data?.results.filter((participation) => selected.has(participation.id));
  const sortedParticipations = useMemo(() => {
    return [...(data?.results ?? [])].sort((a, b) => {
      const aInvalid = hasInvalidFinalAttendanceStatus(a.status);
      const bInvalid = hasInvalidFinalAttendanceStatus(b.status);

      if (aInvalid === bInvalid) return 0;
      return aInvalid ? -1 : 1;
    });
  }, [data?.results]);

  return (
    <>
      {opened && (
        <AddParticipantModal
          event={event}
          selected={modalMode === "add" ? undefined : selectedData}
          opened={opened}
          close={close}
          refresh={refetch}
          mode={modalMode}
        />
      )}
      {bulkOpened && (
        <BulkUploadModal
          opened={bulkOpened}
          close={closeBulk}
          refresh={refetch}
          eventId={event.id}
        />
      )}
      {anonymousOpened && (
        <AnonymousAttendeesModal
          event={event}
          opened={anonymousOpened}
          close={closeAnonymous}
          onUpdate={onEventUpdate}
        />
      )}
      <Paper p="md" mt="sm" withBorder style={{ position: "relative" }}>
        <Stack>
          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
            <Title order={4}>
              {data ? `${data.count} ` : ""}Participants
              {data && event.anonymous_attendee_count > 0
                ? ` (+${event.anonymous_attendee_count} anonymous)`
                : ""}
            </Title>
            <Group gap="xs">
              {selected.size === 0 ? (
                <>
                  <Button
                    size="xs"
                    radius="xl"
                    variant="light"
                    leftSection={<IconUserPlus size={13} />}
                    onClick={() => {
                      setModalMode("add");
                      open();
                    }}
                  >
                    Add Participant
                  </Button>
                  <Button
                    size="xs"
                    radius="xl"
                    variant="light"
                    leftSection={<IconUpload size={13} />}
                    onClick={openBulk}
                  >
                    Discord Import
                  </Button>
                  {showAnonymousButton && (
                    <Button
                      size="xs"
                      radius="xl"
                      variant="light"
                      leftSection={<IconUserQuestion size={13} />}
                      onClick={openAnonymous}
                    >
                      Anonymous Participants
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  size="xs"
                  radius="xl"
                  variant="light"
                  color="green"
                  leftSection={<IconUsersGroup size={13} />}
                  onClick={() => {
                    setModalMode("modify");
                    open();
                  }}
                >
                  Modify Selected
                </Button>
              )}
            </Group>
          </Group>
          <Group gap="xs" wrap="wrap">
            <TextInput
              size="xs"
              placeholder="Search by name, Discord ID, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftSection={<IconSearch size={14} />}
              style={{ flex: "2 1 180px" }}
            />
            <MultiSelect
              size="xs"
              placeholder="Status"
              data={EVENT_PARTICIPATION_STATUSES}
              onChange={setStatusArray}
              value={statusArray}
              style={{ flex: "1 1 140px" }}
            />
          </Group>
          {data && (
            <PaginatedTable
              data={sortedParticipations}
              onRowClick={(ep: EventParticipation) => router.push(`/contacts/${ep.contact.id}`)}
              columns={["Name", "Contact", "Status"]}
              transforms={[
                (ep) => <Table.Td key={ep.contact.full_name}>{ep.contact.full_name}</Table.Td>,
                (ep) => (
                  <Table.Td key={ep.contact.phone}>
                    {formatContactInfo(ep.contact.full_name, ep.contact.phone)}
                  </Table.Td>
                ),
                (ep) => (
                  <Table.Td
                    key={ep.status}
                    style={{
                      whiteSpace: "nowrap",
                      width: "1%",
                    }}
                  >
                    <ParticipationStatusBadge status={ep.status} label={ep.status_display} />
                  </Table.Td>
                ),
              ]}
              loading={loading}
              useCheckboxes={true}
              onSelectionChange={setSelected}
              selected={selected}
              keyFn={(ep: EventParticipation) => ep.id}
              getRowBg={(ep: EventParticipation) =>
                hasInvalidFinalAttendanceStatus(ep.status)
                  ? "var(--mantine-color-red-light)"
                  : undefined
              }
            />
          )}
          {data && (
            <PaginationBar
              entityName="Participant(s)"
              totalCount={data?.count}
              previousUrl={data?.previous}
              nextUrl={data.next}
              handleNext={() =>
                data.next && updateParam("page", incrementPageSearchParam(currentParams))
              }
              handlePrevious={() =>
                data.previous && updateParam("page", decrementPageSearchParam(currentParams))
              }
            />
          )}
        </Stack>
      </Paper>
      {data && event.anonymous_attendee_count > 0 && (
        <Text size="sm" c="dimmed" mt="xs" ta="right">
          Total attendance: {data.count + event.anonymous_attendee_count} ({data.count} tracked +{" "}
          {event.anonymous_attendee_count} anonymous)
        </Text>
      )}
    </>
  );
}

function EventViewUsersTable({ event }: { event: Event }) {
  const currentParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);

  const pageNum = currentParams.get("page");
  const apiParams = new URLSearchParams();

  if (pageNum) apiParams.append("page", pageNum);
  if (searchQuery) apiParams.append("search", searchQuery);

  apiParams.append("event", event.id.toString());

  const {
    data,
    loading,
    refresh: refetch,
  } = useBackend<BackendPaginatedResults<UsersInEvent>>(`/api/assignments/?${apiParams}`);
  const router = useRouter();

  const updateParam = (key: string, value?: string) => {
    const params = new URLSearchParams(currentParams.toString());

    if (!value || value === "all") params.delete(key);
    else params.set(key, value);

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleDelete = async (userId: number) => {
    setDeletingId(userId);
    try {
      const response = await fetch(`/api/assignments/${userId}/`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "X-CSRFToken": getCookie("csrftoken") ?? "",
        },
      });
      if (response.ok) {
        refetch();
      } else if (response.status === 403) {
        notifications.show({
          title: "Permission Denied",
          message: "You do not have permission to remove this user from the event.",
          color: "red",
        });
      } else {
        notifications.show({
          title: "Error",
          message: "Failed to remove user. Please try again.",
          color: "red",
        });
      }
    } catch {
      notifications.show({
        title: "Error",
        message: "Failed to remove user. Please try again.",
        color: "red",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {addModalOpened && (
        <AddUserModal
          event={event}
          opened={addModalOpened}
          close={closeAddModal}
          refresh={refetch}
          currentUsers={data?.results ?? []}
        />
      )}
      <Paper p="md" mt="sm" withBorder style={{ position: "relative" }}>
        <Stack>
          <Group grow align="flex-end">
            <TextInput
              label="Search"
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftSection={<IconSearch size={16} />}
            />
            <Button onClick={openAddModal}>Add User</Button>
          </Group>
          {data && (
            <PaginatedTable
              title="Users"
              showTitle={true}
              data={data.results}
              columns={["Username", "Joined At"]}
              selected={new Set()}
              transforms={[
                (user: UsersInEvent) => (
                  <Table.Td key={user.user_username}>{user.user_username}</Table.Td>
                ),
                (user: UsersInEvent) => (
                  <Table.Td key={user.joined_at}>
                    {formatBackendProvidedDateTime(user.joined_at)}
                  </Table.Td>
                ),
                (user: UsersInEvent) => (
                  <Table.Td key={user.id}>
                    <Button
                      color="red"
                      size="xs"
                      loading={deletingId === user.id}
                      onClick={() => handleDelete(user.id)}
                    >
                      Remove
                    </Button>
                  </Table.Td>
                ),
              ]}
              loading={loading}
              keyFn={(user: UsersInEvent) => user.id}
            />
          )}
          {data && (
            <PaginationBar
              entityName="User(s)"
              totalCount={data?.count}
              previousUrl={data?.previous}
              nextUrl={data.next}
              handleNext={() =>
                data.next && updateParam("page", incrementPageSearchParam(currentParams))
              }
              handlePrevious={() =>
                data.previous && updateParam("page", decrementPageSearchParam(currentParams))
              }
            />
          )}
        </Stack>
      </Paper>
    </>
  );
}

function AddUserModal({
  event,
  opened,
  close,
  refresh,
  currentUsers,
}: {
  event: Event;
  opened: boolean;
  close: () => void;
  refresh: () => void;
  currentUsers: UsersInEvent[];
}) {
  const [userSearchQuery, setUserSearchQuery] = useState<string>("");
  const [selectedUsers, setSelectedUsers] = useState<Set<User>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const apiParams = new URLSearchParams();
  if (userSearchQuery) apiParams.append("search", userSearchQuery);

  const usersSearch = useBackend<BackendPaginatedResults<User>>(`/api/users/?${apiParams}`);
  const { mutate: addMutate } = useBackendMutation(`/api/assignments/`, {
    method: "POST",
  });

  const currentUserIds = new Set(currentUsers.map((u) => u.user));

  const availableUsers = usersSearch.data?.results.filter((u) => !currentUserIds.has(u.id)) ?? [];
  const combobox = useCombobox();

  const removeUser = (u: User) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      next.delete(u);
      return next;
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await Promise.all(
        Array.from(selectedUsers).map((u) =>
          addMutate({
            event: event.id,
            user: u.id,
          })
        )
      );
      setSelectedUsers(new Set());
      close();
      refresh();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (errorMessage.includes("403")) {
        notifications.show({
          title: "Permission Denied",
          message: "You do not have permission to add users to this event.",
          color: "red",
        });
      } else {
        notifications.show({
          title: "Error",
          message: "Failed to add users. Please try again.",
          color: "red",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={close} title="Add User">
      <LoadingOverlay visible={submitting} />
      <Stack>
        <Combobox
          store={combobox}
          onOptionSubmit={(value) => {
            const user = availableUsers.find((u) => u.id.toString() === value);
            if (!user) return;

            setSelectedUsers((prev) => {
              const next = new Set(prev);
              next.add(user);
              return next;
            });
            setUserSearchQuery("");
            combobox.closeDropdown();
          }}
        >
          <Combobox.Target>
            <TextInput
              label="User"
              placeholder="Search users..."
              value={userSearchQuery}
              onChange={(event) => {
                setUserSearchQuery(event.currentTarget.value);
                combobox.openDropdown();
              }}
              onFocus={() => combobox.openDropdown()}
              onClick={() => combobox.openDropdown()}
              onBlur={() => combobox.closeDropdown()}
              rightSection={usersSearch.loading ? <LoadingOverlay visible /> : null}
            />
          </Combobox.Target>

          <Combobox.Dropdown hidden={availableUsers.length === 0}>
            <Combobox.Options>
              {availableUsers.map((user) => (
                <Combobox.Option key={user.id} value={user.id.toString()}>
                  {user.username}
                </Combobox.Option>
              ))}

              {availableUsers.length === 0 && <Combobox.Empty>No users found</Combobox.Empty>}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
        <PaginatedTable
          columns={["Username", "Email"]}
          data={Array.from(selectedUsers)}
          transforms={[
            (u: User) => <Table.Td key="username">{u.username}</Table.Td>,
            (u: User) => <Table.Td key="email">{u.email}</Table.Td>,
            (u: User) => (
              <Table.Td key="actions">
                <Button color="red" onClick={() => removeUser(u)}>
                  Remove
                </Button>
              </Table.Td>
            ),
          ]}
          loading={false}
          noDataText="Select a user to proceed"
        />
        <Button onClick={handleSubmit} disabled={selectedUsers.size === 0}>
          Submit
        </Button>
      </Stack>
    </Modal>
  );
}
