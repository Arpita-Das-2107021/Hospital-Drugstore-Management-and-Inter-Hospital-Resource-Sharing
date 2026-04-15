"""
Root URL configuration for HRSP backend.
"""
from django.conf import settings
from django.contrib import admin
from django.conf.urls.static import static
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    # Django admin
    path("admin/", admin.site.urls),
    # OpenAPI schema & Swagger UI
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    # Authentication (not versioned — infrastructure layer)
    path("api/auth/", include("apps.authentication.urls")),
    # Versioned domain APIs
    path("api/v1/hospitals/", include("apps.hospitals.urls")),
    # Two-step hospital onboarding
    path("api/v1/hospital-registration/", include("apps.hospitals.registration_urls")),
    path("api/v1/admin/hospital-registrations/", include("apps.hospitals.admin_registration_urls")),
    path("api/v1/admin/hospital-update-requests/", include("apps.hospitals.admin_update_urls")),
    path("api/v1/admin/hospital-offboarding-requests/", include("apps.hospitals.admin_offboarding_urls")),
    path("api/v1/staff/", include("apps.staff.urls")),
    path("api/v1/invitations/", include("apps.staff.invitation_urls")),
    path("api/v1/permissions/", include("apps.staff.permission_urls")),
    path("api/v1/roles/", include("apps.staff.role_urls")),
    path("api/v1/rbac/", include("apps.staff.rbac_urls")),
    path("api/v1/catalog/", include("apps.resources.catalog_urls")),
    path("api/v1/inventory/", include("apps.resources.inventory_urls")),
    path("api/v1/inventory-module/", include("apps.inventory_module.urls")),
    path("api/v1/pharmacy-csv/", include("apps.pharmacy_csv.urls")),
    path("api/v1/sales/", include("apps.sales.urls")),
    path("api/v1/retail-sales/", include("apps.sales.retail_urls")),
    path("api/csv/", include("apps.inventory_module.chat_urls")),
    path("api/v1/resource-shares/", include("apps.resources.share_urls")),
    path("api/v1/my-resource-shares/", include("apps.resources.my_share_urls")),
    path("api/v1/ml/", include("apps.ml.urls")),
    path("api/v1/requests/", include("apps.requests.urls")),
    path("api/v1/shipments/", include("apps.shipments.urls")),
    path("api/v1/healthcare/", include("apps.badges.healthcare_urls")),
    path("api/v1/platform/", include("apps.badges.platform_urls")),
    path("api/v1/broadcasts/", include("apps.notifications.broadcast_urls")),
    path("api/v1/emergency-broadcasts/", include("apps.notifications.broadcast_urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/conversations/", include("apps.communications.urls")),
    path("api/v1/templates/", include("apps.communications.template_urls")),
    path("api/v1/chat/", include("apps.chat.urls")),
    path("api/v1/analytics/", include("apps.analytics.urls")),
    path("api/v1/credits/", include("apps.analytics.credit_urls")),
    path("api/v1/audit-logs/", include("apps.audit.urls")),
    path("api/v1/integrations/", include("apps.hospitals.integration_urls")),
    # Public (unauthenticated)
    path("api/v1/public/", include("apps.public.urls")),
    # Health check
    path("api/health/", include("apps.public.health_urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
