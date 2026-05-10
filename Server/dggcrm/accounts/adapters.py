from allauth.account.adapter import DefaultAccountAdapter
from allauth.account.models import EmailAddress
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.contrib.auth import get_user_model
from django.shortcuts import redirect

from .models import DiscordID

DISCORD_PROVIDERS = ("discord", "mock-discord")


class SocialLoginForbidden(Exception):
    """Raised when a social login is not allowed (non-existing user)."""

    def __init__(self, email=None):
        self.email = email
        super().__init__(f"Social login blocked for {email}")


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin):
        """
        Only allow social login for users that already exist.
        Primary check: DiscordID table (for Discord provider)
        Secondary check: verified email addresses
        Discord organizers/superusers must have 2FA enabled on Discord.
        """
        provider = sociallogin.account.provider
        user = self._resolve_user(sociallogin)

        if provider in DISCORD_PROVIDERS and user is not None and self._is_privileged(user):
            if sociallogin.account.extra_data.get("mfa_enabled") is not True:
                request.session.flush()
                raise ImmediateHttpResponse(redirect("/login?social_error=mfa_required"))

        if sociallogin.is_existing:
            return

        if user is None:
            email = sociallogin.account.extra_data.get("email")
            request.session.flush()
            if not email:
                raise ImmediateHttpResponse(redirect("/login?social_error=no_email"))
            raise ImmediateHttpResponse(redirect(f"/login?social_error=no_user&email={email}"))

        sociallogin.connect(request, user)

    def _resolve_user(self, sociallogin):
        if sociallogin.is_existing:
            return sociallogin.user

        provider = sociallogin.account.provider
        uid = str(sociallogin.account.uid)

        if provider in DISCORD_PROVIDERS:
            try:
                return (
                    DiscordID.objects.select_related("user")
                    .get(
                        discord_id=uid,
                        active=True,
                    )
                    .user
                )
            except DiscordID.DoesNotExist:
                pass

        email = sociallogin.account.extra_data.get("email")
        if not email:
            return None

        User = get_user_model()
        user = User.objects.filter(email=email).first()
        if user is not None:
            return user

        try:
            return (
                EmailAddress.objects.select_related("user")
                .get(
                    email__iexact=email,
                    verified=True,
                )
                .user
            )
        except EmailAddress.DoesNotExist:
            return None

    def _is_privileged(self, user):
        return user.is_superuser or user.groups.filter(name="ORGANIZER").exists()

    def is_open_for_signup(self, request, sociallogin):
        # No signups
        request.session.flush()
        return False

    def on_authentication_error(self, request, provider_id, error=None, exception=None, extra_context=None):
        # Always redirect failed logins to /login with params
        email = getattr(exception, "email", "")
        request.session.flush()
        return ImmediateHttpResponse(redirect(f"/login?social_error=no_user&email={email}"))


class NoNewUsersAccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        return False

    def on_authentication_error(self, request, provider_id, error=None, exception=None, extra_context=None):
        # Always redirect failed logins to /login with params
        email = getattr(exception, "email", "")
        return ImmediateHttpResponse(redirect(f"/login?social_error=no_user&email={email}"))
