import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from dggcrm.contacts.models import Contact, TagAssignments
from dggcrm.events.models import CommitmentStatus, Event, EventParticipation, EventStatus


@pytest.fixture
def client(admin_user):
    c = APIClient()
    c.force_authenticate(admin_user)
    return c


@pytest.fixture
def tagged_contacts(contact, contact_b, contact_c, tag, tag_b, tag_c):
    """
    contact  → tag, tag_b
    contact_b → tag
    contact_c → tag_b, tag_c
    """
    TagAssignments.objects.create(contact=contact, tag=tag)
    TagAssignments.objects.create(contact=contact, tag=tag_b)
    TagAssignments.objects.create(contact=contact_b, tag=tag)
    TagAssignments.objects.create(contact=contact_c, tag=tag_b)
    TagAssignments.objects.create(contact=contact_c, tag=tag_c)
    return contact, contact_b, contact_c


@pytest.mark.django_db
class TestContactTagFiltering:
    def test_no_tag_filter_returns_all(self, client, tagged_contacts):
        resp = client.get("/api/contacts/")
        assert resp.status_code == 200
        assert resp.data["count"] == 3

    def test_single_tag(self, client, tagged_contacts, tag):
        resp = client.get(f"/api/contacts/?tag_ids={tag.id}")
        assert resp.status_code == 200
        ids = {c["id"] for c in resp.data["results"]}
        contact, contact_b, _ = tagged_contacts
        assert ids == {contact.id, contact_b.id}

    def test_multiple_tags_any_mode(self, client, tagged_contacts, tag, tag_c):
        resp = client.get(f"/api/contacts/?tag_ids={tag.id},{tag_c.id}&tag_mode=any")
        assert resp.status_code == 200
        ids = {c["id"] for c in resp.data["results"]}
        contact, contact_b, contact_c = tagged_contacts
        assert ids == {contact.id, contact_b.id, contact_c.id}

    def test_multiple_tags_all_mode(self, client, tagged_contacts, tag, tag_b):
        resp = client.get(f"/api/contacts/?tag_ids={tag.id},{tag_b.id}&tag_mode=all")
        assert resp.status_code == 200
        ids = {c["id"] for c in resp.data["results"]}
        contact, _, _ = tagged_contacts
        assert ids == {contact.id}

    def test_default_mode_is_any(self, client, tagged_contacts, tag, tag_c):
        resp = client.get(f"/api/contacts/?tag_ids={tag.id},{tag_c.id}")
        assert resp.status_code == 200
        ids = {c["id"] for c in resp.data["results"]}
        contact, contact_b, contact_c = tagged_contacts
        assert ids == {contact.id, contact_b.id, contact_c.id}

    def test_all_mode_no_overlap_returns_empty(self, client, tagged_contacts, tag, tag_c):
        resp = client.get(f"/api/contacts/?tag_ids={tag.id},{tag_c.id}&tag_mode=all")
        assert resp.status_code == 200
        assert resp.data["count"] == 0

    def test_invalid_tag_ids_ignored(self, client, tagged_contacts, tag):
        resp = client.get(f"/api/contacts/?tag_ids=abc,{tag.id},,xyz")
        assert resp.status_code == 200
        ids = {c["id"] for c in resp.data["results"]}
        contact, contact_b, _ = tagged_contacts
        assert ids == {contact.id, contact_b.id}


@pytest.fixture
def contact_with_event_attendance(db, contact, tag):
    attended_events = [
        Event.objects.create(
            name=f"Attended Event {index}",
            description="Sample event",
            starts_at=timezone.now() + timezone.timedelta(days=index),
            ends_at=timezone.now() + timezone.timedelta(days=index, hours=2),
            event_status=EventStatus.COMPLETED,
            location_name="Test Hall",
            location_address="123 Test Street",
        )
        for index in range(3)
    ]
    not_attended_event = Event.objects.create(
        name="Committed Event",
        description="Sample event",
        starts_at=timezone.now() + timezone.timedelta(days=4),
        ends_at=timezone.now() + timezone.timedelta(days=4, hours=2),
        event_status=EventStatus.COMPLETED,
        location_name="Test Hall",
        location_address="123 Test Street",
    )
    TagAssignments.objects.create(contact=contact, tag=tag)
    for event in attended_events:
        EventParticipation.objects.create(contact=contact, event=event, status=CommitmentStatus.ATTENDED)
        for attendee_index in range(10):
            other_contact = Contact.objects.create(
                full_name=f"Other Attendee {event.id}-{attendee_index}",
                email=f"other-{event.id}-{attendee_index}@example.com",
            )
            EventParticipation.objects.create(
                contact=other_contact,
                event=event,
                status=CommitmentStatus.ATTENDED,
            )

    EventParticipation.objects.create(contact=contact, event=not_attended_event, status=CommitmentStatus.COMMITTED)
    return contact


@pytest.mark.django_db
class TestContactEventAttendanceFiltering:
    def test_min_events_counts_only_contacts_own_attended_events(self, client, contact_with_event_attendance):
        resp = client.get("/api/contacts/?min_events=3")
        assert resp.status_code == 200
        ids = {c["id"] for c in resp.data["results"]}
        assert contact_with_event_attendance.id in ids

        resp = client.get("/api/contacts/?min_events=4")
        assert resp.status_code == 200
        ids = {c["id"] for c in resp.data["results"]}
        assert contact_with_event_attendance.id not in ids

    def test_events_count_is_not_inflated_by_tags(self, client, contact_with_event_attendance, tag_b):
        TagAssignments.objects.create(contact=contact_with_event_attendance, tag=tag_b)

        resp = client.get(f"/api/contacts/?tag_ids={tag_b.id}&min_events=4")
        assert resp.status_code == 200
        ids = {c["id"] for c in resp.data["results"]}
        assert contact_with_event_attendance.id not in ids

    def test_max_events_uses_attended_count_without_requiring_min_events(self, client, contact_with_event_attendance):
        resp = client.get("/api/contacts/?search=Alice&max_events=2")
        assert resp.status_code == 200
        ids = {c["id"] for c in resp.data["results"]}
        assert contact_with_event_attendance.id not in ids

        resp = client.get("/api/contacts/?search=Alice&max_events=3")
        assert resp.status_code == 200
        ids = {c["id"] for c in resp.data["results"]}
        assert contact_with_event_attendance.id in ids
