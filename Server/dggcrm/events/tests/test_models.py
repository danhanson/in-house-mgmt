from django.utils import timezone

from dggcrm.events.models import Event


def make_event(location_name="", location_address=""):
    return Event(
        name="Test Event",
        location_name=location_name,
        location_address=location_address,
        starts_at=timezone.now(),
        ends_at=timezone.now() + timezone.timedelta(hours=1),
    )


def test_location_display_combines_name_and_address():
    event = make_event(
        location_name="Town Hall",
        location_address="123 Main Street",
    )

    assert event.location_display == "Town Hall (123 Main Street)"


def test_location_display_uses_name_when_address_missing():
    event = make_event(location_name="Town Hall")

    assert event.location_display == "Town Hall"


def test_location_display_uses_address_when_name_missing():
    event = make_event(location_address="123 Main Street")

    assert event.location_display == "123 Main Street"


def test_location_display_uses_none_when_location_missing():
    event = make_event()

    assert event.location_display == "None"
