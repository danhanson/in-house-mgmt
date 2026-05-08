from importlib import import_module

import pytest
from allauth.account.models import EmailAddress
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.models import SocialAccount, SocialLogin
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import RequestFactory

from dggcrm.accounts.adapters import SocialAccountAdapter
from dggcrm.accounts.models import DiscordID

User = get_user_model()


def make_sociallogin(provider, uid, *, email=None, mfa_enabled=None, linked_user=None):
    extra_data = {}
    if email is not None:
        extra_data["email"] = email
    if mfa_enabled is not None:
        extra_data["mfa_enabled"] = mfa_enabled

    account = SocialAccount(provider=provider, uid=str(uid), extra_data=extra_data)
    user = linked_user if linked_user is not None else User()
    return SocialLogin(account=account, user=user)


def make_request():
    request = RequestFactory().get("/")
    engine = import_module(settings.SESSION_ENGINE)
    request.session = engine.SessionStore()
    return request


@pytest.fixture
def request_with_session():
    return make_request()


@pytest.fixture
def adapter():
    return SocialAccountAdapter()


@pytest.fixture(autouse=True)
def stub_sociallogin_connect(monkeypatch):
    """connect() needs a SocialApp configured for the provider, which isn't set up in test settings.
    Replace it with a recorder so tests can assert which user the adapter would have connected.
    """
    calls = []

    def fake_connect(self, request, user):
        self.user = user
        calls.append(user)

    monkeypatch.setattr(SocialLogin, "connect", fake_connect)
    return calls


def assert_redirect_contains(exc_info, fragment):
    response = exc_info.value.response
    assert fragment in response["Location"]


@pytest.mark.django_db
class TestDiscordMfaEnforcement:
    """Discord 2FA must be enabled for organizers and superusers."""

    def test_organizer_no_mfa_existing_link_rejected(self, adapter, regular_user, sample_group, request_with_session):
        regular_user.groups.add(sample_group)
        sociallogin = make_sociallogin(
            "discord", "111", email="o@example.com", mfa_enabled=False, linked_user=regular_user
        )

        with pytest.raises(ImmediateHttpResponse) as exc:
            adapter.pre_social_login(request_with_session, sociallogin)
        assert_redirect_contains(exc, "social_error=mfa_required")

    def test_organizer_no_mfa_via_discord_id_rejected(self, adapter, regular_user, sample_group, request_with_session):
        regular_user.groups.add(sample_group)
        DiscordID.objects.create(user=regular_user, discord_id="222", active=True)
        sociallogin = make_sociallogin("discord", "222", email="o@example.com", mfa_enabled=False)

        with pytest.raises(ImmediateHttpResponse) as exc:
            adapter.pre_social_login(request_with_session, sociallogin)
        assert_redirect_contains(exc, "social_error=mfa_required")

    def test_organizer_no_mfa_via_email_rejected(self, adapter, regular_user, sample_group, request_with_session):
        regular_user.email = "o@example.com"
        regular_user.save()
        regular_user.groups.add(sample_group)
        sociallogin = make_sociallogin("discord", "333", email="o@example.com", mfa_enabled=False)

        with pytest.raises(ImmediateHttpResponse) as exc:
            adapter.pre_social_login(request_with_session, sociallogin)
        assert_redirect_contains(exc, "social_error=mfa_required")

    def test_organizer_with_mfa_allowed(
        self, adapter, regular_user, sample_group, request_with_session, stub_sociallogin_connect
    ):
        regular_user.groups.add(sample_group)
        DiscordID.objects.create(user=regular_user, discord_id="444", active=True)
        sociallogin = make_sociallogin("discord", "444", email="o@example.com", mfa_enabled=True)

        adapter.pre_social_login(request_with_session, sociallogin)

        assert stub_sociallogin_connect == [regular_user]

    def test_organizer_mfa_field_missing_rejected(self, adapter, regular_user, sample_group, request_with_session):
        """Fail closed: missing mfa_enabled is treated as not enabled."""
        regular_user.groups.add(sample_group)
        sociallogin = make_sociallogin("discord", "555", email="o@example.com", linked_user=regular_user)

        with pytest.raises(ImmediateHttpResponse) as exc:
            adapter.pre_social_login(request_with_session, sociallogin)
        assert_redirect_contains(exc, "social_error=mfa_required")

    def test_superuser_no_mfa_rejected(self, adapter, admin_user, request_with_session):
        sociallogin = make_sociallogin(
            "discord", "666", email="a@example.com", mfa_enabled=False, linked_user=admin_user
        )

        with pytest.raises(ImmediateHttpResponse) as exc:
            adapter.pre_social_login(request_with_session, sociallogin)
        assert_redirect_contains(exc, "social_error=mfa_required")

    def test_staff_only_user_no_mfa_allowed(self, adapter, regular_user, request_with_session):
        """is_staff alone is intentionally NOT in scope; only superuser + ORGANIZER trigger 2FA."""
        regular_user.is_staff = True
        regular_user.save()
        sociallogin = make_sociallogin(
            "discord", "777", email="s@example.com", mfa_enabled=False, linked_user=regular_user
        )

        adapter.pre_social_login(request_with_session, sociallogin)

    def test_non_organizer_no_mfa_allowed(self, adapter, regular_user, request_with_session):
        sociallogin = make_sociallogin(
            "discord", "888", email="r@example.com", mfa_enabled=False, linked_user=regular_user
        )

        adapter.pre_social_login(request_with_session, sociallogin)

    def test_organizer_google_no_mfa_allowed(self, adapter, regular_user, sample_group, request_with_session):
        """2FA check is Discord-only; Google login for organizers is unaffected."""
        regular_user.groups.add(sample_group)
        sociallogin = make_sociallogin("google", "g-1", email="o@example.com", linked_user=regular_user)

        adapter.pre_social_login(request_with_session, sociallogin)

    def test_mock_discord_provider_enforces_mfa(self, adapter, regular_user, sample_group, request_with_session):
        """The mock-discord provider used in dev must enforce the same check as discord."""
        regular_user.groups.add(sample_group)
        sociallogin = make_sociallogin(
            "mock-discord", "999", email="o@example.com", mfa_enabled=False, linked_user=regular_user
        )

        with pytest.raises(ImmediateHttpResponse) as exc:
            adapter.pre_social_login(request_with_session, sociallogin)
        assert_redirect_contains(exc, "social_error=mfa_required")


@pytest.mark.django_db
class TestExistingRedirectsPreserved:
    """Ensure refactor of pre_social_login did not break the prior reject paths."""

    def test_unmatched_discord_with_email_redirects_no_user(self, adapter, request_with_session):
        sociallogin = make_sociallogin("discord", "unknown", email="ghost@example.com", mfa_enabled=True)

        with pytest.raises(ImmediateHttpResponse) as exc:
            adapter.pre_social_login(request_with_session, sociallogin)
        assert_redirect_contains(exc, "social_error=no_user")
        assert_redirect_contains(exc, "email=ghost@example.com")

    def test_unmatched_discord_no_email_redirects_no_email(self, adapter, request_with_session):
        sociallogin = make_sociallogin("discord", "unknown2", mfa_enabled=True)

        with pytest.raises(ImmediateHttpResponse) as exc:
            adapter.pre_social_login(request_with_session, sociallogin)
        assert_redirect_contains(exc, "social_error=no_email")

    def test_match_via_verified_email_address(
        self, adapter, regular_user, request_with_session, stub_sociallogin_connect
    ):
        EmailAddress.objects.create(user=regular_user, email="alt@example.com", primary=True, verified=True)
        sociallogin = make_sociallogin("discord", "email-uid", email="alt@example.com", mfa_enabled=True)

        adapter.pre_social_login(request_with_session, sociallogin)

        assert stub_sociallogin_connect == [regular_user]
