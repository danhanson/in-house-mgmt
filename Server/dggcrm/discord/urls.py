from django.urls import path

from .views import (
    CheckAttendancePermissionView,
    RecordAttendanceView,
    StagedEventsView,
    StagedImportExecuteView,
    StagedImportPreviewView,
    SyncMembershipTagsView,
)

urlpatterns = [
    path("sync-membership/", SyncMembershipTagsView.as_view(), name="sync-membership"),
    path("staged-event-participations/", RecordAttendanceView.as_view(), name="staged-event-participations"),
    path(
        "can-record-attendance/",
        CheckAttendancePermissionView.as_view(),
        name="can-record-attendance",
    ),
    path("staged-events/", StagedEventsView.as_view(), name="staged-events-list"),
    path(
        "staged-events/<int:staged_id>/preview/",
        StagedImportPreviewView.as_view(),
        name="staged-import-preview",
    ),
    path(
        "staged-events/<int:staged_id>/import/",
        StagedImportExecuteView.as_view(),
        name="staged-import-execute",
    ),
]
